import { randomUUID } from 'node:crypto';
import { SpanStatusCode } from '@opentelemetry/api';
import type { Span } from '@opentelemetry/api';
import type { z } from 'zod';
import {
  AuditDeliveryError,
  createApprovalRuntimeAuditEvent,
  type ApprovalRuntimeAuditStage,
  type ApprovalRuntimeAuditEvent,
  type AuditEventSink
} from '../../audit/src/index.js';
import { PlatformError, type ErrorCode } from '../../errors/src/index.js';
import type { FeatureControls } from '../../configuration/src/index.js';
import { tracer } from '../../observability/src/index.js';
import {
  createTrustedRequestContext,
  enforceAuthorization,
  enforceResourceOwnership,
  type ResourceOwnershipResolver,
  type ServerAuthorizationPolicy,
  type TrustedRequestContext
} from '../../security/src/index.js';
import {
  actionExecutionReceiptSchema,
  approvalDecisionEvidenceSchema,
  approvalDecisionResponseSchema,
  approvalExecutionResponseSchema,
  approvalProposalRequestSchema,
  approvalProposalResponseSchema,
  approvalRecordSchema,
  approvalReferenceRequestSchema,
  targetStateEvidenceSchema,
  type ApprovalActionDefinition,
  type ApprovalDecisionEvidence,
  type ApprovalDecisionResponse,
  type ApprovalExecutionResponse,
  type ApprovalProposalRequest,
  type ApprovalProposalResponse,
  type ApprovalRecord,
  type ApprovalReferenceRequest
} from './contracts.js';
import { approvalEvidenceHash, proposalIntegrityHash, proposedChangeHash } from './integrity.js';
import type {
  ApprovalDecisionSource,
  ApprovalExecutionAdapter,
  ApprovalRecordStore,
  ApprovalTargetStateResolver
} from './ports.js';
import type { ApprovalActionRegistry } from './registry.js';

interface BoundaryIdentity {
  readonly trace_id: string;
  readonly request_id: string;
  readonly correlation_id: string;
}

interface EstablishedBoundary {
  readonly context: TrustedRequestContext;
  readonly traceId: string;
}

export interface ApprovalRuntimeOptions {
  readonly service: string;
  readonly environment: string;
  readonly allowDeterministicTestAdapters?: boolean;
  readonly idFactory?: () => string;
  readonly boundaryIdentityFactory?: () => BoundaryIdentity;
  /** Trusted server clock, sampled again at execution admission (injectable for tests). */
  readonly clock?: () => Date;
}

export interface ApprovalRuntimeDependencies {
  readonly featureControls: FeatureControls;
  readonly registry: ApprovalActionRegistry;
  readonly store: ApprovalRecordStore;
  readonly decisionSource: ApprovalDecisionSource;
  readonly targetState: ApprovalTargetStateResolver;
  readonly authorization: ServerAuthorizationPolicy;
  readonly ownership: ResourceOwnershipResolver;
  readonly executionAdapters: readonly ApprovalExecutionAdapter[];
  readonly audit: AuditEventSink;
}

function validCorrelationIdentifier(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 256) return false;
  if (value.trim() !== value) return false;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit <= 31 || codeUnit === 127) return false;
  }
  return true;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function immutable<T>(value: T): T {
  const copy = structuredClone(value);
  const freeze = (item: unknown): void => {
    if (!item || typeof item !== 'object' || Object.isFrozen(item)) return;
    for (const child of Object.values(item)) freeze(child);
    Object.freeze(item);
  };
  freeze(copy);
  return copy;
}

function safeError(error: unknown, traceId: string, requestId: string): PlatformError {
  if (error instanceof PlatformError) {
    return new PlatformError(
      error.code,
      error.publicMessage,
      error.statusCode,
      undefined,
      traceId,
      requestId
    );
  }
  return new PlatformError(
    'INTERNAL_ERROR',
    'Approval operation could not be completed',
    500,
    undefined,
    traceId,
    requestId
  );
}

function errorCode(error: unknown): ErrorCode {
  return error instanceof PlatformError ? error.code : 'INTERNAL_ERROR';
}

function statusForDecision(
  recordValue: ApprovalRecord
): 'approved' | 'rejected' | 'cancelled' | 'expired' {
  if (
    recordValue.status === 'approved' ||
    recordValue.status === 'rejected' ||
    recordValue.status === 'cancelled'
  ) {
    return recordValue.status;
  }
  return 'expired';
}

function statusForAuthoritativeDecision(
  decision: ApprovalDecisionEvidence['decision']
): 'approved' | 'rejected' | 'cancelled' | 'expired' {
  if (decision === 'approve') return 'approved';
  if (decision === 'reject') return 'rejected';
  if (decision === 'expire') return 'expired';
  return 'cancelled';
}

function auditApprovalState(
  recordValue: ApprovalRecord
):
  | 'required_not_executed'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'expired'
  | 'executing'
  | 'executed'
  | undefined {
  if (recordValue.status === 'pending') return 'required_not_executed';
  if (recordValue.status === 'execution_failed') return undefined;
  return recordValue.status;
}

class ApprovalExpiredError extends PlatformError {
  constructor() {
    super('CONFLICT', 'Approval has expired', 409);
  }
}

export class ApprovalRuntime {
  private readonly executionAdapters = new Map<string, ApprovalExecutionAdapter>();

  constructor(
    private readonly dependencies: ApprovalRuntimeDependencies,
    private readonly options: ApprovalRuntimeOptions
  ) {
    for (const adapter of dependencies.executionAdapters) {
      const key = this.actionKey(adapter.action_type, adapter.action_version);
      if (this.executionAdapters.has(key)) throw new Error('Duplicate approval execution adapter');
      this.executionAdapters.set(key, adapter);
    }
  }

  async propose(rawRequest: unknown, now = new Date()): Promise<ApprovalProposalResponse> {
    return this.withSpan('propose', async (span, boundary) => {
      const established = await this.establishBoundary(
        rawRequest,
        approvalProposalRequestSchema,
        'propose',
        boundary,
        now
      );
      const parsed = approvalProposalRequestSchema.parse(rawRequest);
      const request: ApprovalProposalRequest = {
        ...parsed,
        context: established.context,
        trace_id: established.traceId
      };
      span.setAttributes(this.trustedSpanAttributes(established.context, established.traceId));
      let stage: ApprovalRuntimeAuditStage = 'proposal_validation';
      try {
        const action = this.requireAvailableAction(request.action_type, request.action_version);
        if (request.target.type !== action.target_type) {
          throw new PlatformError('VALIDATION_ERROR', 'Action proposal is invalid', 400);
        }
        if (
          !action.allowed_agents.some(
            (agent) =>
              agent.agent_id === request.agent_id && agent.agent_version === request.agent_version
          )
        ) {
          throw new PlatformError('PERMISSION_DENIED', 'Action proposal is unavailable', 403);
        }
        const expiresAt = new Date(request.expires_at);
        if (
          expiresAt.getTime() <= now.getTime() ||
          expiresAt.getTime() - now.getTime() > action.max_approval_ttl_ms
        ) {
          throw new PlatformError('VALIDATION_ERROR', 'Action proposal is invalid', 400);
        }
        stage = 'authorization';
        await enforceAuthorization(this.dependencies.authorization, established.context, {
          capability: action.action_type,
          action: 'propose',
          required_permissions: action.required_proposal_permissions,
          required_entitlements: action.required_proposal_entitlements,
          resource: request.target
        });
        stage = 'tenant_ownership';
        await enforceResourceOwnership(
          this.dependencies.ownership,
          established.context,
          request.target
        );
        stage = 'target_state';
        this.assertTargetStateResolverAllowed();
        const targetState = targetStateEvidenceSchema.parse(
          await this.dependencies.targetState.resolve({
            context: established.context,
            target: request.target,
            action
          })
        );
        if (targetState.tenant_id !== established.context.tenant_id || !targetState.executable) {
          throw new PlatformError('PERMISSION_DENIED', 'Action target is unavailable', 403);
        }
        const ids = this.createIds();
        const changeHash = proposedChangeHash(request.proposed_changes);
        const requestedAt = now.toISOString();
        const integrityInput = {
          proposal_id: ids.proposal_id,
          approval_id: ids.approval_id,
          action_id: ids.action_id,
          tenant_id: established.context.tenant_id,
          action_type: action.action_type,
          action_version: action.action_version,
          target: request.target,
          target_state_hash: targetState.state_hash,
          proposed_change_hash: changeHash,
          approval_policy: action.approval_policy,
          requested_at: requestedAt,
          expires_at: request.expires_at
        } as const;
        const approval = immutable(
          approvalRecordSchema.parse({
            contract_version: '1.0',
            revision: 0,
            ...ids,
            tenant_id: established.context.tenant_id,
            requester_user_id: established.context.user_id,
            request_id: established.context.request_id,
            correlation_id: established.context.correlation_id,
            trace_id: established.traceId,
            agent_id: request.agent_id,
            agent_version: request.agent_version,
            action_type: action.action_type,
            action_version: action.action_version,
            tool_id: action.tool_id,
            tool_version: action.tool_version,
            target: request.target,
            target_state_hash: targetState.state_hash,
            proposed_changes: request.proposed_changes,
            proposed_change_hash: changeHash,
            proposal_integrity_hash: proposalIntegrityHash(integrityInput),
            reason: request.reason,
            approval_policy: action.approval_policy,
            status: 'pending',
            requested_at: requestedAt,
            expires_at: request.expires_at
          })
        );
        if (!(await this.dependencies.store.save(approval, null))) {
          throw new PlatformError('CONFLICT', 'Action proposal could not be created', 409);
        }
        await this.emitAudit({
          operation: 'propose',
          outcome: 'pending',
          stage: 'proposal_validation',
          context: established.context,
          traceId: established.traceId,
          now,
          approval,
          executionStatus: 'not_started'
        });
        return approvalProposalResponseSchema.parse({
          contract_version: '1.0',
          status: 'pending',
          proposal_id: approval.proposal_id,
          approval_id: approval.approval_id,
          action_id: approval.action_id,
          request_id: established.context.request_id,
          correlation_id: established.context.correlation_id,
          trace_id: established.traceId,
          action_type: approval.action_type,
          approval_policy: approval.approval_policy,
          proposed_change_hash: approval.proposed_change_hash,
          expires_at: approval.expires_at
        });
      } catch (error) {
        if (error instanceof AuditDeliveryError) throw error;
        await this.emitAudit({
          operation: 'propose',
          outcome: 'error',
          stage,
          context: established.context,
          traceId: established.traceId,
          now,
          errorCode: errorCode(error)
        });
        throw safeError(error, established.traceId, established.context.request_id);
      }
    });
  }

  async synchronizeDecision(
    rawRequest: unknown,
    now = new Date()
  ): Promise<ApprovalDecisionResponse> {
    return this.withSpan('synchronize_decision', async (span, boundary) => {
      const established = await this.establishBoundary(
        rawRequest,
        approvalReferenceRequestSchema,
        'synchronize_decision',
        boundary,
        now
      );
      const parsed = approvalReferenceRequestSchema.parse(rawRequest);
      const request: ApprovalReferenceRequest = {
        ...parsed,
        context: established.context,
        trace_id: established.traceId
      };
      span.setAttributes(this.trustedSpanAttributes(established.context, established.traceId));
      let stage: ApprovalRuntimeAuditStage = 'proposal_validation';
      let approval: ApprovalRecord | undefined;
      try {
        approval = await this.requireApproval(request.approval_id, established.context);
        const action = this.requireAvailableAction(approval.action_type, approval.action_version);
        this.verifyStoredIntegrity(approval);
        stage = 'authorization';
        await enforceAuthorization(this.dependencies.authorization, established.context, {
          capability: action.action_type,
          action: 'decide',
          required_permissions: action.required_approval_permissions,
          required_entitlements: action.required_approval_entitlements,
          resource: approval.target
        });
        stage = 'tenant_ownership';
        await enforceResourceOwnership(
          this.dependencies.ownership,
          established.context,
          approval.target
        );
        if (['rejected', 'cancelled', 'expired'].includes(approval.status)) {
          return this.decisionResponse(approval, established.context, established.traceId);
        }
        if (approval.status !== 'pending' && approval.status !== 'approved') {
          throw new PlatformError('CONFLICT', 'Approval is not pending', 409);
        }
        if (new Date(approval.expires_at).getTime() <= now.getTime()) {
          const expired = await this.transition(approval, { status: 'expired' });
          await this.emitAudit({
            operation: 'synchronize_decision',
            outcome: 'expired',
            stage: 'decision',
            context: established.context,
            traceId: established.traceId,
            now,
            approval: expired,
            executionStatus: 'not_started'
          });
          return this.decisionResponse(expired, established.context, established.traceId);
        }
        stage = approval.status === 'approved' ? 'authoritative_revalidation' : 'decision';
        const decision = await this.readAuthoritativeDecision(
          approval,
          established.context,
          now,
          approval.status === 'pending'
        );
        if (
          approval.status === 'approved' &&
          decision.decision === 'approve' &&
          approvalEvidenceHash(decision) === approval.decision_evidence_hash
        ) {
          await this.emitAudit({
            operation: 'synchronize_decision',
            outcome: 'approved',
            stage: 'authoritative_revalidation',
            context: established.context,
            traceId: established.traceId,
            now,
            approval,
            executionStatus: 'not_started'
          });
          return this.decisionResponse(approval, established.context, established.traceId);
        }
        const decided = await this.transition(approval, {
          status: statusForAuthoritativeDecision(decision.decision),
          approver_user_id: decision.approver_user_id,
          approver_role: decision.approver_role,
          authorization_decision_id: decision.authorization_decision_id,
          decision_at: decision.decision_at,
          decision: decision.decision,
          decision_evidence_hash: approvalEvidenceHash(decision)
        });
        await this.emitAudit({
          operation: 'synchronize_decision',
          outcome: statusForDecision(decided),
          stage,
          context: established.context,
          traceId: established.traceId,
          now,
          approval: decided,
          executionStatus: 'not_started'
        });
        return this.decisionResponse(decided, established.context, established.traceId);
      } catch (error) {
        if (error instanceof AuditDeliveryError) throw error;
        await this.emitAudit({
          operation: 'synchronize_decision',
          outcome: 'error',
          stage,
          context: established.context,
          traceId: established.traceId,
          now,
          ...(approval ? { approval } : {}),
          errorCode: errorCode(error)
        });
        throw safeError(error, established.traceId, established.context.request_id);
      }
    });
  }

  async execute(
    rawRequest: unknown,
    now = this.options.clock?.() ?? new Date()
  ): Promise<ApprovalExecutionResponse> {
    return this.withSpan('execute', async (span, boundary) => {
      const established = await this.establishBoundary(
        rawRequest,
        approvalReferenceRequestSchema,
        'execute',
        boundary,
        now
      );
      const parsed = approvalReferenceRequestSchema.parse(rawRequest);
      const request: ApprovalReferenceRequest = {
        ...parsed,
        context: established.context,
        trace_id: established.traceId
      };
      span.setAttributes(this.trustedSpanAttributes(established.context, established.traceId));
      let stage: ApprovalRuntimeAuditStage = 'execution_revalidation';
      let approval: ApprovalRecord | undefined;
      let dispatchStarted = false;
      let executionClaimed = false;
      try {
        if (
          !this.dependencies.featureControls.aiPlatform ||
          !this.dependencies.featureControls.actionTools
        ) {
          throw new PlatformError('SERVICE_UNAVAILABLE', 'Approved execution is unavailable', 503);
        }
        approval = await this.requireApproval(request.approval_id, established.context);
        const action = this.requireAvailableAction(approval.action_type, approval.action_version);
        this.verifyStoredIntegrity(approval);
        stage = 'authorization';
        await enforceAuthorization(this.dependencies.authorization, established.context, {
          capability: action.action_type,
          action: 'execute',
          required_permissions: action.required_execution_permissions,
          required_entitlements: action.required_execution_entitlements,
          resource: approval.target
        });
        stage = 'tenant_ownership';
        await enforceResourceOwnership(
          this.dependencies.ownership,
          established.context,
          approval.target
        );
        stage = 'execution_revalidation';
        if (
          approval.status === 'executed' &&
          approval.execution_receipt &&
          approval.idempotency_key
        ) {
          await this.emitAudit({
            operation: 'execute',
            outcome: 'executed',
            stage: 'execution_revalidation',
            context: established.context,
            traceId: established.traceId,
            now,
            approval,
            executionStatus: 'succeeded'
          });
          return this.executionResponse(approval, established.context, established.traceId, true);
        }
        if (approval.status === 'pending') {
          throw new PlatformError('APPROVAL_REQUIRED', 'Human approval is required', 409);
        }
        if (approval.status !== 'approved' || approval.decision !== 'approve') {
          throw new PlatformError('PERMISSION_DENIED', 'Approved execution is unavailable', 403);
        }
        now = this.executionTime(now);
        this.assertUnexpired(approval, now);
        stage = 'authoritative_revalidation';
        const authoritativeDecision = await this.readAuthoritativeDecision(
          approval,
          established.context,
          now,
          false
        );
        if (authoritativeDecision.decision !== 'approve') {
          approval = await this.transition(approval, {
            status: statusForAuthoritativeDecision(authoritativeDecision.decision),
            approver_user_id: authoritativeDecision.approver_user_id,
            approver_role: authoritativeDecision.approver_role,
            authorization_decision_id: authoritativeDecision.authorization_decision_id,
            decision_at: authoritativeDecision.decision_at,
            decision: authoritativeDecision.decision,
            decision_evidence_hash: approvalEvidenceHash(authoritativeDecision)
          });
          await this.emitAudit({
            operation: 'execute',
            outcome: statusForDecision(approval),
            stage: 'authoritative_revalidation',
            context: established.context,
            traceId: established.traceId,
            now,
            approval,
            executionStatus: 'not_started'
          });
          throw new PlatformError('PERMISSION_DENIED', 'Approved execution is unavailable', 403);
        }
        if (approvalEvidenceHash(authoritativeDecision) !== approval.decision_evidence_hash) {
          throw new PlatformError('POLICY_DENIED', 'Approval evidence is invalid', 403);
        }
        now = this.executionTime(now);
        this.assertUnexpired(approval, now);
        await this.emitAudit({
          operation: 'execute',
          outcome: 'approved',
          stage: 'authoritative_revalidation',
          context: established.context,
          traceId: established.traceId,
          now,
          approval,
          executionStatus: 'not_started'
        });
        now = this.executionTime(now);
        this.assertUnexpired(approval, now);
        stage = 'target_state';
        this.assertTargetStateResolverAllowed();
        const targetState = targetStateEvidenceSchema.parse(
          await this.dependencies.targetState.resolve({
            context: established.context,
            target: approval.target,
            action
          })
        );
        if (
          targetState.tenant_id !== approval.tenant_id ||
          !targetState.executable ||
          targetState.state_hash !== approval.target_state_hash
        ) {
          throw new PlatformError('CONFLICT', 'Action target state has changed', 409);
        }
        stage = 'execution_revalidation';
        const adapter = this.requireExecutionAdapter(action);
        const idempotencyKey = approvalEvidenceHash({
          tenant_id: approval.tenant_id,
          approval_id: approval.approval_id,
          action_id: approval.action_id,
          proposed_change_hash: approval.proposed_change_hash
        });
        now = this.executionTime(now);
        this.assertUnexpired(approval, now);
        const executing = await this.transition(approval, {
          status: 'executing',
          idempotency_key: idempotencyKey
        });
        approval = executing;
        executionClaimed = true;
        now = this.executionTime(now);
        this.assertUnexpired(executing, now);
        await this.emitAudit({
          operation: 'execute',
          outcome: 'executing',
          stage: 'execution_revalidation',
          context: established.context,
          traceId: established.traceId,
          now,
          approval: executing,
          executionStatus: 'in_progress'
        });
        // No await between this fresh admission check and invoking the adapter.
        now = this.executionTime(now);
        this.assertUnexpired(executing, now);
        stage = 'execution';
        let receipt;
        try {
          dispatchStarted = true;
          receipt = actionExecutionReceiptSchema.parse(
            await adapter.execute({
              context: established.context,
              approval: executing,
              action,
              idempotency_key: idempotencyKey
            })
          );
        } catch {
          const failed = await this.transition(executing, { status: 'execution_failed' });
          approval = failed;
          await this.emitAudit({
            operation: 'execute',
            outcome: 'error',
            stage: 'execution',
            context: established.context,
            traceId: established.traceId,
            now,
            approval: failed,
            executionStatus: 'failed',
            errorCode: 'DEPENDENCY_ERROR'
          });
          throw new PlatformError(
            'DEPENDENCY_ERROR',
            'Action execution could not be verified',
            503
          );
        }
        const executed = await this.transition(executing, {
          status: 'executed',
          execution_receipt: receipt
        });
        await this.emitAudit({
          operation: 'execute',
          outcome: 'executed',
          stage: 'execution',
          context: established.context,
          traceId: established.traceId,
          now,
          approval: executed,
          executionStatus: 'succeeded'
        });
        return this.executionResponse(executed, established.context, established.traceId, false);
      } catch (error) {
        let failure = error;
        if (
          !dispatchStarted &&
          approval &&
          ((executionClaimed && approval.status === 'executing') ||
            (approval.status === 'approved' && error instanceof ApprovalExpiredError))
        ) {
          try {
            // Keep the original authority evidence; this records local non-dispatch.
            // Never reopen an execution claim or overwrite a concurrent revision.
            approval = await this.transition(approval, {
              status: error instanceof ApprovalExpiredError ? 'expired' : 'execution_failed'
            });
          } catch (stateError) {
            failure = stateError;
          }
        }
        if (error instanceof AuditDeliveryError) throw error;
        if (
          dispatchStarted &&
          approval?.status === 'execution_failed' &&
          errorCode(failure) === 'DEPENDENCY_ERROR'
        ) {
          throw safeError(failure, established.traceId, established.context.request_id);
        }
        await this.emitAudit({
          operation: 'execute',
          outcome: 'error',
          stage,
          context: established.context,
          traceId: established.traceId,
          now,
          ...(approval ? { approval } : {}),
          errorCode: errorCode(failure)
        });
        throw safeError(failure, established.traceId, established.context.request_id);
      }
    });
  }

  private async establishBoundary(
    rawRequest: unknown,
    schema: z.ZodType<unknown>,
    operation: ApprovalRuntimeAuditEvent['operation'],
    boundary: BoundaryIdentity,
    now: Date
  ): Promise<EstablishedBoundary> {
    const parsed = schema.safeParse(rawRequest);
    if (!parsed.success) {
      await this.emitBoundaryRejection(operation, 'request_validation', boundary, now);
      throw new PlatformError(
        'VALIDATION_ERROR',
        'Approval request is invalid',
        400,
        undefined,
        boundary.trace_id,
        boundary.request_id
      );
    }
    const raw = record(rawRequest);
    const rawContext = record(raw.context);
    if (
      !validCorrelationIdentifier(raw.trace_id) ||
      !validCorrelationIdentifier(rawContext.request_id) ||
      !validCorrelationIdentifier(rawContext.correlation_id)
    ) {
      await this.emitBoundaryRejection(operation, 'boundary_trace', boundary, now);
      throw new PlatformError(
        'VALIDATION_ERROR',
        'Approval request is invalid',
        400,
        undefined,
        boundary.trace_id,
        boundary.request_id
      );
    }
    let context: TrustedRequestContext;
    try {
      context = createTrustedRequestContext(rawContext);
    } catch {
      await this.emitBoundaryRejection(operation, 'boundary_context', boundary, now);
      throw new PlatformError(
        'TENANT_CONTEXT_ERROR',
        'Request context is invalid',
        403,
        undefined,
        boundary.trace_id,
        boundary.request_id
      );
    }
    return Object.freeze({
      context,
      traceId: raw.trace_id
    });
  }

  private async emitBoundaryRejection(
    operation: ApprovalRuntimeAuditEvent['operation'],
    stage: 'boundary_context' | 'boundary_trace' | 'request_validation',
    boundary: BoundaryIdentity,
    now: Date
  ): Promise<void> {
    try {
      await this.dependencies.audit.emit(
        createApprovalRuntimeAuditEvent({
          traceId: boundary.trace_id,
          service: this.options.service,
          environment: this.options.environment,
          operation,
          outcome: 'error',
          stage,
          timestamp: now,
          boundaryRequestId: boundary.request_id,
          boundaryCorrelationId: boundary.correlation_id,
          errorCode: stage === 'boundary_context' ? 'TENANT_CONTEXT_ERROR' : 'VALIDATION_ERROR'
        })
      );
    } catch {
      throw new AuditDeliveryError(boundary.trace_id, boundary.request_id);
    }
  }

  private async emitAudit(input: {
    operation: ApprovalRuntimeAuditEvent['operation'];
    outcome: ApprovalRuntimeAuditEvent['outcome'];
    stage: ApprovalRuntimeAuditStage;
    context: TrustedRequestContext;
    traceId: string;
    now: Date;
    approval?: ApprovalRecord;
    executionStatus?: 'not_started' | 'in_progress' | 'succeeded' | 'failed';
    errorCode?: ErrorCode;
  }): Promise<void> {
    const approval = input.approval;
    const approvalState = approval ? auditApprovalState(approval) : undefined;
    const executionStatus =
      input.executionStatus ?? (input.operation === 'execute' ? 'not_started' : undefined);
    try {
      await this.dependencies.audit.emit(
        createApprovalRuntimeAuditEvent({
          traceId: input.traceId,
          service: this.options.service,
          environment: this.options.environment,
          context: input.context,
          operation: input.operation,
          outcome: input.outcome,
          stage: input.stage,
          timestamp: input.now,
          ...(approval
            ? {
                approvalId: approval.approval_id,
                proposalId: approval.proposal_id,
                actionId: approval.action_id,
                actionType: approval.action_type,
                targetType: approval.target.type,
                targetReferenceHash: approvalEvidenceHash(approval.target),
                proposedChangeHash: approval.proposed_change_hash,
                proposalIntegrityHash: approval.proposal_integrity_hash,
                approvalPolicy: approval.approval_policy,
                ...(approvalState ? { approvalState } : {}),
                requestedAt: approval.requested_at,
                ...(approval.approver_user_id ? { approverUserId: approval.approver_user_id } : {}),
                ...(approval.approver_role ? { approverRole: approval.approver_role } : {}),
                ...(approval.decision ? { decision: approval.decision } : {}),
                ...(approval.decision_at ? { decisionAt: approval.decision_at } : {}),
                ...(approval.idempotency_key
                  ? { idempotencyKeyHash: approvalEvidenceHash(approval.idempotency_key) }
                  : {})
              }
            : {}),
          ...(executionStatus ? { executionStatus } : {}),
          ...(executionStatus ? { executed: executionStatus === 'succeeded' } : {}),
          ...(input.errorCode ? { errorCode: input.errorCode } : {})
        })
      );
    } catch {
      throw new AuditDeliveryError(input.traceId, input.context.request_id);
    }
  }

  private async requireApproval(
    approvalId: string,
    context: TrustedRequestContext
  ): Promise<ApprovalRecord> {
    const raw = await this.dependencies.store.get(approvalId);
    const parsed = approvalRecordSchema.safeParse(raw);
    if (!parsed.success || parsed.data.tenant_id !== context.tenant_id) {
      throw new PlatformError('PERMISSION_DENIED', 'Approval is unavailable', 403);
    }
    return immutable(parsed.data);
  }

  private async readAuthoritativeDecision(
    approval: ApprovalRecord,
    context: TrustedRequestContext,
    now: Date,
    requireCurrentApprover: boolean
  ): Promise<ApprovalDecisionEvidence> {
    this.assertDecisionSourceAllowed();
    let rawDecision: unknown;
    try {
      rawDecision = await this.dependencies.decisionSource.getDecision({ context, approval });
    } catch {
      throw new PlatformError(
        'DEPENDENCY_ERROR',
        'Authoritative approval status is unavailable',
        503
      );
    }
    const parsed = approvalDecisionEvidenceSchema.safeParse(rawDecision);
    if (!parsed.success) {
      throw new PlatformError('POLICY_DENIED', 'Approval evidence is invalid', 403);
    }
    const decision = parsed.data;
    const invalidBinding =
      decision.approval_id !== approval.approval_id ||
      decision.proposal_id !== approval.proposal_id ||
      decision.action_id !== approval.action_id ||
      decision.tenant_id !== approval.tenant_id ||
      decision.request_id !== approval.request_id ||
      decision.correlation_id !== approval.correlation_id ||
      approvalEvidenceHash(decision.target) !== approvalEvidenceHash(approval.target) ||
      decision.target_state_hash !== approval.target_state_hash ||
      decision.proposed_change_hash !== approval.proposed_change_hash ||
      decision.proposal_integrity_hash !== approval.proposal_integrity_hash ||
      new Date(decision.decision_at).getTime() < new Date(approval.requested_at).getTime() ||
      new Date(decision.decision_at).getTime() > now.getTime() ||
      new Date(decision.decision_at).getTime() > new Date(approval.expires_at).getTime() ||
      (requireCurrentApprover &&
        (decision.approver_user_id !== context.user_id || decision.approver_role !== context.role));
    if (invalidBinding) {
      throw new PlatformError('POLICY_DENIED', 'Approval evidence is invalid', 403);
    }
    if (
      approval.status === 'approved' &&
      decision.decision === 'approve' &&
      (decision.approver_user_id !== approval.approver_user_id ||
        decision.approver_role !== approval.approver_role ||
        approvalEvidenceHash(decision) !== approval.decision_evidence_hash)
    ) {
      throw new PlatformError('POLICY_DENIED', 'Approval evidence is invalid', 403);
    }
    return decision;
  }

  private verifyStoredIntegrity(approval: ApprovalRecord): void {
    let changeHash: string;
    try {
      changeHash = proposedChangeHash(approval.proposed_changes);
    } catch {
      throw new PlatformError('POLICY_DENIED', 'Approval evidence is invalid', 403);
    }
    if (
      changeHash !== approval.proposed_change_hash ||
      proposalIntegrityHash(approval) !== approval.proposal_integrity_hash
    ) {
      throw new PlatformError('POLICY_DENIED', 'Approval evidence is invalid', 403);
    }
    if (approval.decision) {
      const decisionEvidence = {
        approval_id: approval.approval_id,
        proposal_id: approval.proposal_id,
        action_id: approval.action_id,
        tenant_id: approval.tenant_id,
        decision: approval.decision,
        approver_user_id: approval.approver_user_id,
        approver_role: approval.approver_role,
        request_id: approval.request_id,
        correlation_id: approval.correlation_id,
        target: approval.target,
        target_state_hash: approval.target_state_hash,
        proposed_change_hash: approval.proposed_change_hash,
        proposal_integrity_hash: approval.proposal_integrity_hash,
        authorization_decision_id: approval.authorization_decision_id,
        decision_at: approval.decision_at
      };
      if (
        !approvalDecisionEvidenceSchema.safeParse(decisionEvidence).success ||
        approvalEvidenceHash(decisionEvidence) !== approval.decision_evidence_hash ||
        new Date(approval.decision_at ?? '').getTime() <
          new Date(approval.requested_at).getTime() ||
        new Date(approval.decision_at ?? '').getTime() > new Date(approval.expires_at).getTime()
      ) {
        throw new PlatformError('POLICY_DENIED', 'Approval evidence is invalid', 403);
      }
    }
  }

  private requireAvailableAction(
    actionType: string,
    actionVersion: string
  ): ApprovalActionDefinition {
    const action = this.dependencies.registry.require(actionType, actionVersion);
    const deterministicAllowed =
      action.execution_mode === 'deterministic_test' &&
      action.integration_status === 'deterministic_test_only' &&
      this.options.environment === 'test' &&
      this.options.allowDeterministicTestAdapters === true;
    if (!action.enabled || !action.environments.includes(this.options.environment)) {
      throw new PlatformError('TOOL_DISABLED', 'Requested action is unavailable', 403);
    }
    if (!deterministicAllowed) {
      throw new PlatformError(
        'TOOL_DISABLED',
        'Live Core approval integration is unavailable',
        503
      );
    }
    return action;
  }

  private assertDecisionSourceAllowed(): void {
    if (
      this.dependencies.decisionSource.mode !== 'deterministic_test' ||
      this.options.environment !== 'test' ||
      this.options.allowDeterministicTestAdapters !== true
    ) {
      throw new PlatformError(
        'TOOL_DISABLED',
        'Live Core approval integration is unavailable',
        503
      );
    }
  }

  private assertTargetStateResolverAllowed(): void {
    if (
      this.dependencies.targetState.mode !== 'deterministic_test' ||
      this.options.environment !== 'test' ||
      this.options.allowDeterministicTestAdapters !== true
    ) {
      throw new PlatformError(
        'TOOL_DISABLED',
        'Live Core target-state integration is unavailable',
        503
      );
    }
  }

  private requireExecutionAdapter(action: ApprovalActionDefinition): ApprovalExecutionAdapter {
    const adapter = this.executionAdapters.get(
      this.actionKey(action.action_type, action.action_version)
    );
    if (
      !adapter ||
      adapter.mode !== action.execution_mode ||
      adapter.mode !== 'deterministic_test' ||
      this.options.environment !== 'test' ||
      this.options.allowDeterministicTestAdapters !== true
    ) {
      throw new PlatformError('TOOL_DISABLED', 'Live Core action execution is unavailable', 503);
    }
    return adapter;
  }

  private async transition(
    current: ApprovalRecord,
    changes: Partial<ApprovalRecord>
  ): Promise<ApprovalRecord> {
    const next = immutable(
      approvalRecordSchema.parse({ ...current, ...changes, revision: current.revision + 1 })
    );
    if (!(await this.dependencies.store.save(next, current.revision))) {
      throw new PlatformError('CONFLICT', 'Approval state changed concurrently', 409);
    }
    return next;
  }

  private executionTime(previous: Date): Date {
    const sampled = (this.options.clock?.() ?? new Date()).getTime();
    if (!Number.isFinite(sampled) || !Number.isFinite(previous.getTime())) {
      throw new PlatformError('SERVICE_UNAVAILABLE', 'Approval execution time is unavailable', 503);
    }
    // An older explicit operation time or a backwards clock cannot extend validity.
    return new Date(Math.max(previous.getTime(), sampled));
  }

  private assertUnexpired(approval: ApprovalRecord, now: Date): void {
    if (new Date(approval.expires_at).getTime() <= now.getTime()) {
      throw new ApprovalExpiredError();
    }
  }

  private decisionResponse(
    approval: ApprovalRecord,
    context: TrustedRequestContext,
    traceId: string
  ): ApprovalDecisionResponse {
    return approvalDecisionResponseSchema.parse({
      contract_version: '1.0',
      approval_id: approval.approval_id,
      proposal_id: approval.proposal_id,
      action_id: approval.action_id,
      request_id: context.request_id,
      correlation_id: context.correlation_id,
      trace_id: traceId,
      status: statusForDecision(approval),
      ...(approval.decision_at ? { decision_at: approval.decision_at } : {})
    });
  }

  private executionResponse(
    approval: ApprovalRecord,
    context: TrustedRequestContext,
    traceId: string,
    duplicate: boolean
  ): ApprovalExecutionResponse {
    if (!approval.execution_receipt || !approval.idempotency_key) {
      throw new PlatformError('INTERNAL_ERROR', 'Execution evidence is unavailable', 500);
    }
    return approvalExecutionResponseSchema.parse({
      contract_version: '1.0',
      approval_id: approval.approval_id,
      proposal_id: approval.proposal_id,
      action_id: approval.action_id,
      request_id: context.request_id,
      correlation_id: context.correlation_id,
      trace_id: traceId,
      status: 'executed',
      execution_id: approval.execution_receipt.execution_id,
      source_reference: approval.execution_receipt.source_reference,
      executed_at: approval.execution_receipt.executed_at,
      idempotency_key: approval.idempotency_key,
      duplicate
    });
  }

  private createIds(): Readonly<{
    proposal_id: string;
    approval_id: string;
    action_id: string;
  }> {
    const create = this.options.idFactory ?? randomUUID;
    return Object.freeze({
      proposal_id: create(),
      approval_id: create(),
      action_id: create()
    });
  }

  private trustedSpanAttributes(context: TrustedRequestContext, traceId: string) {
    return {
      'ibex.trace_id': traceId,
      'ibex.request_id': context.request_id,
      'ibex.correlation_id': context.correlation_id,
      'ibex.tenant_id': context.tenant_id,
      'ibex.user_id': context.user_id
    };
  }

  private createBoundaryIdentity(): BoundaryIdentity {
    const fallback = (): BoundaryIdentity =>
      Object.freeze({
        trace_id: randomUUID(),
        request_id: randomUUID(),
        correlation_id: randomUUID()
      });
    if (!this.options.boundaryIdentityFactory) return fallback();
    try {
      const candidate = this.options.boundaryIdentityFactory();
      return validCorrelationIdentifier(candidate.trace_id) &&
        validCorrelationIdentifier(candidate.request_id) &&
        validCorrelationIdentifier(candidate.correlation_id)
        ? Object.freeze({ ...candidate })
        : fallback();
    } catch {
      return fallback();
    }
  }

  private async withSpan<T>(
    operation: ApprovalRuntimeAuditEvent['operation'],
    handler: (span: Span, boundary: BoundaryIdentity) => Promise<T>
  ): Promise<T> {
    const boundary = this.createBoundaryIdentity();
    return tracer.startActiveSpan(`approval-runtime.${operation}`, async (span) => {
      span.setAttributes({
        'ibex.approval.operation': operation,
        'ibex.approval.boundary_trace_id': boundary.trace_id,
        'ibex.approval.boundary_request_id': boundary.request_id,
        'ibex.approval.boundary_correlation_id': boundary.correlation_id
      });
      try {
        const result = await handler(span, boundary);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.recordException(new Error('Approval Runtime operation rejected'));
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw error;
      } finally {
        span.end();
      }
    });
  }

  private actionKey(actionType: string, actionVersion: string): string {
    return JSON.stringify([actionType, actionVersion]);
  }
}
