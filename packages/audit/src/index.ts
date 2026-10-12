import type { z } from 'zod';
import { auditEventSchema } from '../../contracts/src/index.js';
import type { TrustedRequestContext } from '../../security/src/index.js';

export type AuditEvent = Readonly<z.infer<typeof auditEventSchema>>;

export type GatewayAuditStage =
  | 'payload_size'
  | 'endpoint'
  | 'authentication'
  | 'tenant_context'
  | 'payload_schema'
  | 'entitlement'
  | 'rate_limit'
  | 'authorization'
  | 'audit'
  | 'platform'
  | 'response_schema'
  | 'response';

export interface GatewaySecurityAuditEvent {
  readonly schema_version: '1.0';
  readonly event_type: 'gateway.request.outcome';
  readonly timestamp: string;
  readonly trace_id: string;
  readonly service: string;
  readonly environment: string;
  readonly outcome: 'accepted' | 'rejected' | 'error';
  readonly stage: GatewayAuditStage;
  readonly error_code?: string;
  readonly context_status: 'trusted' | 'unavailable';
  readonly request_id?: string;
  readonly correlation_id?: string;
  readonly tenant_id?: string;
  readonly user_id?: string;
  readonly role?: string;
  readonly session_id?: string;
  readonly permission_refs?: readonly string[];
  readonly entitlement_refs?: readonly string[];
  readonly agent?: string;
  readonly sources_used?: readonly Readonly<{ source_id: string; version: string }>[];
  readonly tools_used?: readonly Readonly<{ tool_id: string; version: string }>[];
  readonly approval_state?: 'not_required' | 'required_not_executed';
  readonly response_status?: 'success' | 'partial' | 'rejected' | 'error';
  readonly latency_ms?: number;
  readonly trusted_context?: Readonly<{
    tenant_id: string;
    user_id: string;
    session_id: string;
    request_id: string;
    correlation_id: string;
  }>;
}

export type OrchestratorAuditStage =
  | 'boundary_context'
  | 'boundary_trace'
  | 'input_budget'
  | 'intent_classification'
  | 'agent_selection'
  | 'authorization'
  | 'prompt_hierarchy'
  | 'rag_planning'
  | 'tool_planning'
  | 'model_policy'
  | 'output_validation'
  | 'audit';

export interface PromptAuditReference {
  readonly prompt_id: string;
  readonly prompt_version: string;
  readonly content_hash: string;
}

export interface PromptHierarchyAuditEvidence {
  readonly master_policy: PromptAuditReference;
  readonly orchestrator_prompt: PromptAuditReference;
  readonly domain_prompt: PromptAuditReference;
}

interface OrchestratorAuditEventBase {
  readonly schema_version: '1.0';
  readonly event_type: 'orchestrator.routing.outcome';
  readonly timestamp: string;
  readonly trace_id: string;
  readonly service: string;
  readonly environment: string;
  readonly outcome: 'routed' | 'fallback' | 'rejected' | 'error';
  readonly stage: OrchestratorAuditStage;
  readonly intent?: string;
  readonly domain?: string;
  readonly selected_agent?: string;
  readonly agent_version?: string;
  readonly prompt_hierarchy?: PromptHierarchyAuditEvidence;
  readonly error_code?: string;
  readonly sources_used?: readonly Readonly<{
    source_id: string;
    version: string;
    reference: string;
  }>[];
  readonly tools_used?: readonly Readonly<{
    tool_id: string;
    version: string;
    reference: string;
  }>[];
  readonly evidence_status?: 'sufficient' | 'insufficient';
  readonly response_status?: 'success' | 'rejected';
  readonly approval_state?: 'not_required' | 'required_not_executed';
}

export interface TrustedOrchestratorAuditEvent extends OrchestratorAuditEventBase {
  readonly context_status: 'trusted';
  readonly request_id: string;
  readonly correlation_id: string;
  readonly tenant_id: string;
  readonly user_id: string;
  readonly role: string;
  readonly session_id: string;
  readonly permission_refs: readonly string[];
  readonly entitlement_refs: readonly string[];
}

export interface UntrustedOrchestratorBoundaryAuditEvent extends OrchestratorAuditEventBase {
  readonly context_status: 'unavailable';
  readonly outcome: 'rejected' | 'error';
  readonly stage: 'boundary_context' | 'boundary_trace';
  readonly boundary_request_id?: string;
  readonly boundary_correlation_id?: string;
}

export type OrchestratorAuditEvent =
  TrustedOrchestratorAuditEvent | UntrustedOrchestratorBoundaryAuditEvent;

export type ModelGatewayAuditStage =
  | 'boundary_context'
  | 'boundary_trace'
  | 'request_validation'
  | 'policy'
  | 'accounting'
  | 'provider_invocation'
  | 'response_validation'
  | 'metrics';

export interface ModelAccountingAuditEvidence {
  readonly command_hash: string;
  readonly attempt_id: string;
  readonly policy_version: string;
  readonly period_id: string;
  readonly state: 'unresolved' | 'settled';
  readonly warnings: readonly string[];
}

interface ModelGatewayAuditEventBase {
  readonly schema_version: '1.0';
  readonly event_type: 'model_gateway.invocation.outcome';
  readonly accounting?: ModelAccountingAuditEvidence;
  readonly timestamp: string;
  readonly trace_id: string;
  readonly service: string;
  readonly environment: string;
  readonly outcome: 'succeeded' | 'rejected' | 'error';
  readonly stage: ModelGatewayAuditStage;
  readonly agent_id?: string;
  readonly capability?: string;
  readonly confidentiality_class?: string;
  readonly prompt_version?: string;
  readonly policy_version?: string;
  readonly provider_id?: string;
  readonly model_id?: string;
  readonly model_version?: string;
  readonly attempt?: number;
  readonly fallback_used?: boolean;
  readonly input_tokens?: number;
  readonly output_tokens?: number;
  readonly estimated_cost?: number;
  readonly latency_ms?: number;
  readonly error_code?: string;
}

export interface TrustedModelGatewayAuditEvent extends ModelGatewayAuditEventBase {
  readonly context_status: 'trusted';
  readonly request_id: string;
  readonly correlation_id: string;
  readonly tenant_id: string;
  readonly user_id: string;
  readonly role: string;
  readonly session_id: string;
  readonly permission_refs: readonly string[];
  readonly entitlement_refs: readonly string[];
}

export interface UntrustedModelGatewayBoundaryAuditEvent extends ModelGatewayAuditEventBase {
  readonly context_status: 'unavailable';
  readonly outcome: 'rejected' | 'error';
  readonly stage: 'boundary_context' | 'boundary_trace';
}

export type ModelGatewayAuditEvent =
  TrustedModelGatewayAuditEvent | UntrustedModelGatewayBoundaryAuditEvent;

export type ToolRuntimeAuditStage =
  | 'boundary_context'
  | 'boundary_trace'
  | 'request_validation'
  | 'registry'
  | 'input_schema'
  | 'authorization'
  | 'tenant_ownership'
  | 'execution'
  | 'response_schema'
  | 'audit';

interface ToolRuntimeAuditEventBase {
  readonly schema_version: '1.0';
  readonly event_type: 'tool_runtime.execution.outcome';
  readonly timestamp: string;
  readonly trace_id: string;
  readonly service: string;
  readonly environment: string;
  readonly outcome: 'started' | 'succeeded' | 'proposed' | 'rejected' | 'error';
  readonly stage: ToolRuntimeAuditStage;
  readonly tool_id?: string;
  readonly tool_version?: string;
  readonly agent_id?: string;
  readonly prompt_version?: string;
  readonly action_class?: 'read' | 'proposal';
  readonly requested_operation?: 'read' | 'propose';
  readonly permission_decision?: 'allowed' | 'denied';
  readonly approval_policy?: string;
  readonly approval_state?: 'not_required' | 'required_not_executed';
  readonly attempt?: number;
  readonly latency_ms?: number;
  readonly error_code?: string;
}

export interface TrustedToolRuntimeAuditEvent extends ToolRuntimeAuditEventBase {
  readonly context_status: 'trusted';
  readonly request_id: string;
  readonly correlation_id: string;
  readonly tenant_id: string;
  readonly user_id: string;
  readonly role: string;
  readonly session_id: string;
  readonly permission_refs: readonly string[];
  readonly entitlement_refs: readonly string[];
}

export interface UntrustedToolRuntimeBoundaryAuditEvent extends ToolRuntimeAuditEventBase {
  readonly context_status: 'unavailable';
  readonly outcome: 'rejected' | 'error';
  readonly stage: 'boundary_context' | 'boundary_trace';
}

export type ToolRuntimeAuditEvent =
  TrustedToolRuntimeAuditEvent | UntrustedToolRuntimeBoundaryAuditEvent;

export type RagRuntimeAuditStage =
  | 'boundary_context'
  | 'boundary_trace'
  | 'request_validation'
  | 'authorization'
  | 'scope_resolution'
  | 'governance'
  | 'integrity'
  | 'audit'
  | 'embedding'
  | 'security_filter'
  | 'semantic_search'
  | 'result_validation'
  | 'indexing';

interface RagRuntimeAuditEventBase {
  readonly schema_version: '1.0';
  readonly event_type: 'rag_runtime.operation.outcome';
  readonly timestamp: string;
  readonly trace_id: string;
  readonly service: string;
  readonly environment: string;
  readonly operation: 'ingest' | 'retrieve';
  readonly outcome: 'started' | 'succeeded' | 'rejected' | 'error';
  readonly stage: RagRuntimeAuditStage;
  readonly agent_id?: string;
  readonly domain?: string;
  readonly knowledge_scopes?: readonly string[];
  readonly query_hash?: string;
  readonly document_ids?: readonly string[];
  readonly document_versions?: readonly string[];
  readonly chunk_ids?: readonly string[];
  readonly retrieval_scores?: readonly RagRetrievalScoreAuditEvidence[];
  readonly retrieval_results?: readonly RagRetrievalResultAuditEvidence[];
  readonly embedding_model?: string;
  readonly embedding_model_version?: string;
  readonly retrieval_version?: string;
  readonly result_count?: number;
  readonly latency_ms?: number;
  readonly error_code?: string;
}

export interface RagRetrievalScoreAuditEvidence {
  readonly chunk_id: string;
  readonly score: number;
  readonly semantic_score: number;
  readonly keyword_score: number;
}

export interface RagRetrievalResultAuditEvidence extends RagRetrievalScoreAuditEvidence {
  readonly document_id: string;
  readonly document_version: string;
  readonly citation_evidence_hash: string;
  readonly source_location: Readonly<{
    readonly section: string;
    readonly reference: string;
    readonly page?: number | undefined;
    readonly ordinal: number;
  }>;
}

export interface TrustedRagRuntimeAuditEvent extends RagRuntimeAuditEventBase {
  readonly context_status: 'trusted';
  readonly request_id: string;
  readonly correlation_id: string;
  readonly tenant_id: string;
  readonly user_id: string;
  readonly role: string;
  readonly session_id: string;
  readonly permission_refs: readonly string[];
  readonly entitlement_refs: readonly string[];
}

export interface UntrustedRagRuntimeBoundaryAuditEvent extends RagRuntimeAuditEventBase {
  readonly context_status: 'unavailable';
  readonly outcome: 'rejected' | 'error';
  readonly stage: 'boundary_context' | 'boundary_trace';
}

export type RagRuntimeAuditEvent =
  TrustedRagRuntimeAuditEvent | UntrustedRagRuntimeBoundaryAuditEvent;

export type ApprovalRuntimeAuditStage =
  | 'boundary_context'
  | 'boundary_trace'
  | 'request_validation'
  | 'proposal_validation'
  | 'authorization'
  | 'tenant_ownership'
  | 'target_state'
  | 'decision'
  | 'authoritative_revalidation'
  | 'integrity'
  | 'execution_revalidation'
  | 'execution'
  | 'audit';

interface ApprovalRuntimeAuditEventBase {
  readonly schema_version: '1.0';
  readonly event_type: 'approval_runtime.lifecycle.outcome';
  readonly timestamp: string;
  readonly trace_id: string;
  readonly service: string;
  readonly environment: string;
  readonly operation: 'propose' | 'synchronize_decision' | 'execute';
  readonly outcome:
    | 'pending'
    | 'approved'
    | 'rejected'
    | 'cancelled'
    | 'expired'
    | 'executing'
    | 'executed'
    | 'error';
  readonly stage: ApprovalRuntimeAuditStage;
  readonly approval_id?: string;
  readonly proposal_id?: string;
  readonly action_id?: string;
  readonly action_type?: string;
  readonly target_type?: string;
  readonly target_reference_hash?: string;
  readonly target_object?: Readonly<{ type: string; reference_hash: string }>;
  readonly proposed_change_hash?: string;
  readonly proposal_integrity_hash?: string;
  readonly approval_policy?: string;
  readonly approval_state?:
    | 'required_not_executed'
    | 'approved'
    | 'rejected'
    | 'cancelled'
    | 'expired'
    | 'executing'
    | 'executed';
  readonly approver_user_id?: string;
  readonly approver_role?: string;
  readonly decision?: 'approve' | 'reject' | 'cancel' | 'revoke' | 'expire';
  readonly requested_at?: string;
  readonly decision_at?: string;
  readonly execution_status?: 'not_started' | 'in_progress' | 'succeeded' | 'failed';
  readonly executed?: boolean;
  readonly idempotency_key_hash?: string;
  readonly error_code?: string;
}

export interface TrustedApprovalRuntimeAuditEvent extends ApprovalRuntimeAuditEventBase {
  readonly context_status: 'trusted';
  readonly request_id: string;
  readonly correlation_id: string;
  readonly tenant_id: string;
  readonly user_id: string;
  readonly role: string;
  readonly session_id: string;
  readonly permission_refs: readonly string[];
  readonly entitlement_refs: readonly string[];
}

export interface UntrustedApprovalRuntimeBoundaryAuditEvent extends ApprovalRuntimeAuditEventBase {
  readonly context_status: 'unavailable';
  readonly outcome: 'error';
  readonly stage: 'boundary_context' | 'boundary_trace' | 'request_validation';
  readonly boundary_request_id: string;
  readonly boundary_correlation_id: string;
}

export type ApprovalRuntimeAuditEvent =
  TrustedApprovalRuntimeAuditEvent | UntrustedApprovalRuntimeBoundaryAuditEvent;

export type AuditRecord =
  | AuditEvent
  | GatewaySecurityAuditEvent
  | OrchestratorAuditEvent
  | ModelGatewayAuditEvent
  | ToolRuntimeAuditEvent
  | RagRuntimeAuditEvent
  | ApprovalRuntimeAuditEvent;

export interface AuditEventSink {
  emit(event: AuditRecord): Promise<void>;
}

export class UnconfiguredAuditEventSink implements AuditEventSink {
  emit(event: AuditRecord): Promise<void> {
    return Promise.reject(
      new Error(`Audit event sink is not configured for event type: ${event.event_type}`)
    );
  }
}

export function createGatewaySecurityAuditEvent(input: {
  readonly traceId: string;
  readonly service: string;
  readonly environment: string;
  readonly outcome: GatewaySecurityAuditEvent['outcome'];
  readonly stage: GatewayAuditStage;
  readonly timestamp: Date;
  readonly errorCode?: string;
  readonly context?: TrustedRequestContext;
  readonly agent?: string;
  readonly sourcesUsed?: readonly Readonly<{ source_id: string; version: string }>[];
  readonly toolsUsed?: readonly Readonly<{ tool_id: string; version: string }>[];
  readonly approvalState?: 'not_required' | 'required_not_executed';
  readonly responseStatus?: 'success' | 'partial' | 'rejected' | 'error';
  readonly latencyMs?: number;
}): GatewaySecurityAuditEvent {
  const trustedContext = input.context
    ? Object.freeze({
        tenant_id: input.context.tenant_id,
        user_id: input.context.user_id,
        session_id: input.context.session_id,
        request_id: input.context.request_id,
        correlation_id: input.context.correlation_id
      })
    : undefined;

  return Object.freeze({
    schema_version: '1.0',
    event_type: 'gateway.request.outcome',
    timestamp: input.timestamp.toISOString(),
    trace_id: input.traceId,
    service: input.service,
    environment: input.environment,
    outcome: input.outcome,
    stage: input.stage,
    context_status: input.context ? 'trusted' : 'unavailable',
    ...(input.context
      ? {
          request_id: input.context.request_id,
          correlation_id: input.context.correlation_id,
          tenant_id: input.context.tenant_id,
          user_id: input.context.user_id,
          role: input.context.role,
          session_id: input.context.session_id,
          permission_refs: Object.freeze([...input.context.permissions]),
          entitlement_refs: Object.freeze([...input.context.entitlements])
        }
      : {}),
    ...(input.errorCode ? { error_code: input.errorCode } : {}),
    ...(input.agent ? { agent: input.agent } : {}),
    ...(input.sourcesUsed
      ? {
          sources_used: Object.freeze(
            input.sourcesUsed.map((source) => Object.freeze({ ...source }))
          )
        }
      : {}),
    ...(input.toolsUsed
      ? { tools_used: Object.freeze(input.toolsUsed.map((tool) => Object.freeze({ ...tool }))) }
      : {}),
    ...(input.approvalState ? { approval_state: input.approvalState } : {}),
    ...(input.responseStatus ? { response_status: input.responseStatus } : {}),
    ...(input.latencyMs !== undefined ? { latency_ms: input.latencyMs } : {}),
    ...(trustedContext ? { trusted_context: trustedContext } : {})
  });
}

export * from './pipeline.js';

export function createOrchestratorAuditEvent(input: {
  readonly traceId: string;
  readonly service: string;
  readonly environment: string;
  readonly context?: TrustedRequestContext;
  readonly outcome: OrchestratorAuditEvent['outcome'];
  readonly stage: OrchestratorAuditStage;
  readonly timestamp: Date;
  readonly intent?: string;
  readonly domain?: string;
  readonly selectedAgent?: string;
  readonly agentVersion?: string;
  readonly promptHierarchy?: PromptHierarchyAuditEvidence;
  readonly errorCode?: string;
  readonly sourcesUsed?: readonly Readonly<{
    source_id: string;
    version: string;
    reference: string;
  }>[];
  readonly toolsUsed?: readonly Readonly<{ tool_id: string; version: string; reference: string }>[];
  readonly evidenceStatus?: 'sufficient' | 'insufficient';
  readonly responseStatus?: 'success' | 'rejected';
  readonly approvalState?: 'not_required' | 'required_not_executed';
  readonly boundaryRequestId?: string;
  readonly boundaryCorrelationId?: string;
}): OrchestratorAuditEvent {
  const base = {
    schema_version: '1.0',
    event_type: 'orchestrator.routing.outcome',
    timestamp: input.timestamp.toISOString(),
    trace_id: input.traceId,
    service: input.service,
    environment: input.environment,
    outcome: input.outcome,
    stage: input.stage,
    ...(input.intent ? { intent: input.intent } : {}),
    ...(input.domain ? { domain: input.domain } : {}),
    ...(input.selectedAgent ? { selected_agent: input.selectedAgent } : {}),
    ...(input.agentVersion ? { agent_version: input.agentVersion } : {}),
    ...(input.promptHierarchy
      ? {
          prompt_hierarchy: Object.freeze({
            master_policy: Object.freeze({ ...input.promptHierarchy.master_policy }),
            orchestrator_prompt: Object.freeze({ ...input.promptHierarchy.orchestrator_prompt }),
            domain_prompt: Object.freeze({ ...input.promptHierarchy.domain_prompt })
          })
        }
      : {}),
    ...(input.errorCode ? { error_code: input.errorCode } : {}),
    ...(input.sourcesUsed
      ? { sources_used: Object.freeze(input.sourcesUsed.map((item) => Object.freeze({ ...item }))) }
      : {}),
    ...(input.toolsUsed
      ? { tools_used: Object.freeze(input.toolsUsed.map((item) => Object.freeze({ ...item }))) }
      : {}),
    ...(input.evidenceStatus ? { evidence_status: input.evidenceStatus } : {}),
    ...(input.responseStatus ? { response_status: input.responseStatus } : {}),
    ...(input.approvalState ? { approval_state: input.approvalState } : {})
  } as const;

  if (!input.context) {
    if (input.outcome !== 'rejected' && input.outcome !== 'error') {
      throw new Error('Trusted context is required for orchestrator audit events');
    }
    if (input.stage !== 'boundary_context' && input.stage !== 'boundary_trace') {
      throw new Error('Trusted context is required for orchestrator audit events');
    }
    return Object.freeze({
      ...base,
      outcome: input.outcome,
      stage: input.stage,
      context_status: 'unavailable',
      ...(input.boundaryRequestId ? { boundary_request_id: input.boundaryRequestId } : {}),
      ...(input.boundaryCorrelationId
        ? { boundary_correlation_id: input.boundaryCorrelationId }
        : {})
    });
  }

  return Object.freeze({
    ...base,
    context_status: 'trusted',
    request_id: input.context.request_id,
    correlation_id: input.context.correlation_id,
    tenant_id: input.context.tenant_id,
    user_id: input.context.user_id,
    role: input.context.role,
    session_id: input.context.session_id,
    permission_refs: Object.freeze([...input.context.permissions]),
    entitlement_refs: Object.freeze([...input.context.entitlements])
  });
}

export function createModelGatewayAuditEvent(input: {
  readonly accounting?: ModelAccountingAuditEvidence;
  readonly traceId: string;
  readonly service: string;
  readonly environment: string;
  readonly context?: TrustedRequestContext;
  readonly outcome: ModelGatewayAuditEvent['outcome'];
  readonly stage: ModelGatewayAuditStage;
  readonly timestamp: Date;
  readonly agentId?: string;
  readonly capability?: string;
  readonly confidentialityClass?: string;
  readonly promptVersion?: string;
  readonly policyVersion?: string;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly modelVersion?: string;
  readonly attempt?: number;
  readonly fallbackUsed?: boolean;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly estimatedCost?: number;
  readonly latencyMs?: number;
  readonly errorCode?: string;
}): ModelGatewayAuditEvent {
  const base = {
    schema_version: '1.0',
    event_type: 'model_gateway.invocation.outcome',
    ...(input.accounting
      ? {
          accounting: Object.freeze({
            command_hash: input.accounting.command_hash,
            attempt_id: input.accounting.attempt_id,
            policy_version: input.accounting.policy_version,
            period_id: input.accounting.period_id,
            state: input.accounting.state,
            warnings: Object.freeze([...input.accounting.warnings])
          })
        }
      : {}),
    timestamp: input.timestamp.toISOString(),
    trace_id: input.traceId,
    service: input.service,
    environment: input.environment,
    outcome: input.outcome,
    stage: input.stage,
    ...(input.agentId ? { agent_id: input.agentId } : {}),
    ...(input.capability ? { capability: input.capability } : {}),
    ...(input.confidentialityClass ? { confidentiality_class: input.confidentialityClass } : {}),
    ...(input.promptVersion ? { prompt_version: input.promptVersion } : {}),
    ...(input.policyVersion ? { policy_version: input.policyVersion } : {}),
    ...(input.providerId ? { provider_id: input.providerId } : {}),
    ...(input.modelId ? { model_id: input.modelId } : {}),
    ...(input.modelVersion ? { model_version: input.modelVersion } : {}),
    ...(input.attempt !== undefined ? { attempt: input.attempt } : {}),
    ...(input.fallbackUsed !== undefined ? { fallback_used: input.fallbackUsed } : {}),
    ...(input.inputTokens !== undefined ? { input_tokens: input.inputTokens } : {}),
    ...(input.outputTokens !== undefined ? { output_tokens: input.outputTokens } : {}),
    ...(input.estimatedCost !== undefined ? { estimated_cost: input.estimatedCost } : {}),
    ...(input.latencyMs !== undefined ? { latency_ms: input.latencyMs } : {}),
    ...(input.errorCode ? { error_code: input.errorCode } : {})
  } as const;

  if (!input.context) {
    if (input.outcome !== 'rejected' && input.outcome !== 'error') {
      throw new Error('Trusted context is required for Model Gateway audit events');
    }
    if (input.stage !== 'boundary_context' && input.stage !== 'boundary_trace') {
      throw new Error('Trusted context is required for Model Gateway audit events');
    }
    return Object.freeze({
      ...base,
      outcome: input.outcome,
      stage: input.stage,
      context_status: 'unavailable'
    });
  }

  return Object.freeze({
    ...base,
    context_status: 'trusted',
    request_id: input.context.request_id,
    correlation_id: input.context.correlation_id,
    tenant_id: input.context.tenant_id,
    user_id: input.context.user_id,
    role: input.context.role,
    session_id: input.context.session_id,
    permission_refs: Object.freeze([...input.context.permissions]),
    entitlement_refs: Object.freeze([...input.context.entitlements])
  });
}

export function createToolRuntimeAuditEvent(input: {
  readonly traceId: string;
  readonly service: string;
  readonly environment: string;
  readonly context?: TrustedRequestContext;
  readonly outcome: ToolRuntimeAuditEvent['outcome'];
  readonly stage: ToolRuntimeAuditStage;
  readonly timestamp: Date;
  readonly toolId?: string;
  readonly toolVersion?: string;
  readonly agentId?: string;
  readonly promptVersion?: string;
  readonly actionClass?: 'read' | 'proposal';
  readonly requestedOperation?: 'read' | 'propose';
  readonly permissionDecision?: 'allowed' | 'denied';
  readonly approvalPolicy?: string;
  readonly approvalState?: 'not_required' | 'required_not_executed';
  readonly attempt?: number;
  readonly latencyMs?: number;
  readonly errorCode?: string;
}): ToolRuntimeAuditEvent {
  const base = {
    schema_version: '1.0',
    event_type: 'tool_runtime.execution.outcome',
    timestamp: input.timestamp.toISOString(),
    trace_id: input.traceId,
    service: input.service,
    environment: input.environment,
    outcome: input.outcome,
    stage: input.stage,
    ...(input.toolId ? { tool_id: input.toolId } : {}),
    ...(input.toolVersion ? { tool_version: input.toolVersion } : {}),
    ...(input.agentId ? { agent_id: input.agentId } : {}),
    ...(input.promptVersion ? { prompt_version: input.promptVersion } : {}),
    ...(input.actionClass ? { action_class: input.actionClass } : {}),
    ...(input.requestedOperation ? { requested_operation: input.requestedOperation } : {}),
    ...(input.permissionDecision ? { permission_decision: input.permissionDecision } : {}),
    ...(input.approvalPolicy ? { approval_policy: input.approvalPolicy } : {}),
    ...(input.approvalState ? { approval_state: input.approvalState } : {}),
    ...(input.attempt !== undefined ? { attempt: input.attempt } : {}),
    ...(input.latencyMs !== undefined ? { latency_ms: input.latencyMs } : {}),
    ...(input.errorCode ? { error_code: input.errorCode } : {})
  } as const;

  if (!input.context) {
    if (input.outcome !== 'rejected' && input.outcome !== 'error') {
      throw new Error('Trusted context is required for Tool Runtime audit events');
    }
    if (input.stage !== 'boundary_context' && input.stage !== 'boundary_trace') {
      throw new Error('Trusted context is required for Tool Runtime audit events');
    }
    return Object.freeze({
      ...base,
      outcome: input.outcome,
      stage: input.stage,
      context_status: 'unavailable'
    });
  }

  return Object.freeze({
    ...base,
    context_status: 'trusted',
    request_id: input.context.request_id,
    correlation_id: input.context.correlation_id,
    tenant_id: input.context.tenant_id,
    user_id: input.context.user_id,
    role: input.context.role,
    session_id: input.context.session_id,
    permission_refs: Object.freeze([...input.context.permissions]),
    entitlement_refs: Object.freeze([...input.context.entitlements])
  });
}

export function createApprovalRuntimeAuditEvent(input: {
  readonly traceId: string;
  readonly service: string;
  readonly environment: string;
  readonly context?: TrustedRequestContext;
  readonly operation: ApprovalRuntimeAuditEvent['operation'];
  readonly outcome: ApprovalRuntimeAuditEvent['outcome'];
  readonly stage: ApprovalRuntimeAuditStage;
  readonly timestamp: Date;
  readonly boundaryRequestId?: string;
  readonly boundaryCorrelationId?: string;
  readonly approvalId?: string;
  readonly proposalId?: string;
  readonly actionId?: string;
  readonly actionType?: string;
  readonly targetType?: string;
  readonly targetReferenceHash?: string;
  readonly proposedChangeHash?: string;
  readonly proposalIntegrityHash?: string;
  readonly approvalPolicy?: string;
  readonly approvalState?:
    | 'required_not_executed'
    | 'approved'
    | 'rejected'
    | 'cancelled'
    | 'expired'
    | 'executing'
    | 'executed';
  readonly approverUserId?: string;
  readonly approverRole?: string;
  readonly decision?: 'approve' | 'reject' | 'cancel' | 'revoke' | 'expire';
  readonly requestedAt?: string;
  readonly decisionAt?: string;
  readonly executionStatus?: 'not_started' | 'in_progress' | 'succeeded' | 'failed';
  readonly executed?: boolean;
  readonly idempotencyKeyHash?: string;
  readonly errorCode?: string;
}): ApprovalRuntimeAuditEvent {
  const approvalState: ApprovalRuntimeAuditEventBase['approval_state'] =
    input.approvalState ??
    (input.outcome === 'pending'
      ? 'required_not_executed'
      : input.outcome === 'approved' ||
          input.outcome === 'rejected' ||
          input.outcome === 'cancelled' ||
          input.outcome === 'expired' ||
          input.outcome === 'executing' ||
          input.outcome === 'executed'
        ? input.outcome
        : undefined);
  const base = {
    schema_version: '1.0',
    event_type: 'approval_runtime.lifecycle.outcome',
    timestamp: input.timestamp.toISOString(),
    trace_id: input.traceId,
    service: input.service,
    environment: input.environment,
    operation: input.operation,
    outcome: input.outcome,
    stage: input.stage,
    ...(input.approvalId ? { approval_id: input.approvalId } : {}),
    ...(input.proposalId ? { proposal_id: input.proposalId } : {}),
    ...(input.actionId ? { action_id: input.actionId } : {}),
    ...(input.actionType ? { action_type: input.actionType } : {}),
    ...(input.targetType ? { target_type: input.targetType } : {}),
    ...(input.targetReferenceHash ? { target_reference_hash: input.targetReferenceHash } : {}),
    ...(input.targetType && input.targetReferenceHash
      ? {
          target_object: Object.freeze({
            type: input.targetType,
            reference_hash: input.targetReferenceHash
          })
        }
      : {}),
    ...(input.proposedChangeHash ? { proposed_change_hash: input.proposedChangeHash } : {}),
    ...(input.proposalIntegrityHash
      ? { proposal_integrity_hash: input.proposalIntegrityHash }
      : {}),
    ...(input.approvalPolicy ? { approval_policy: input.approvalPolicy } : {}),
    ...(approvalState ? { approval_state: approvalState } : {}),
    ...(input.approverUserId ? { approver_user_id: input.approverUserId } : {}),
    ...(input.approverRole ? { approver_role: input.approverRole } : {}),
    ...(input.decision ? { decision: input.decision } : {}),
    ...(input.requestedAt ? { requested_at: input.requestedAt } : {}),
    ...(input.decisionAt ? { decision_at: input.decisionAt } : {}),
    ...(input.executionStatus ? { execution_status: input.executionStatus } : {}),
    ...(input.executed !== undefined ? { executed: input.executed } : {}),
    ...(input.idempotencyKeyHash ? { idempotency_key_hash: input.idempotencyKeyHash } : {}),
    ...(input.errorCode ? { error_code: input.errorCode } : {})
  } as const;

  if (!input.context) {
    if (
      input.outcome !== 'error' ||
      !['boundary_context', 'boundary_trace', 'request_validation'].includes(input.stage) ||
      !input.boundaryRequestId ||
      !input.boundaryCorrelationId
    ) {
      throw new Error('Trusted context is required for approval audit events');
    }
    return Object.freeze({
      ...base,
      outcome: 'error',
      stage: input.stage as 'boundary_context' | 'boundary_trace' | 'request_validation',
      context_status: 'unavailable',
      boundary_request_id: input.boundaryRequestId,
      boundary_correlation_id: input.boundaryCorrelationId
    });
  }

  return Object.freeze({
    ...base,
    context_status: 'trusted',
    request_id: input.context.request_id,
    correlation_id: input.context.correlation_id,
    tenant_id: input.context.tenant_id,
    user_id: input.context.user_id,
    role: input.context.role,
    session_id: input.context.session_id,
    permission_refs: Object.freeze([...input.context.permissions]),
    entitlement_refs: Object.freeze([...input.context.entitlements])
  });
}

export function createRagRuntimeAuditEvent(input: {
  readonly traceId: string;
  readonly service: string;
  readonly environment: string;
  readonly context?: TrustedRequestContext;
  readonly operation: RagRuntimeAuditEvent['operation'];
  readonly outcome: RagRuntimeAuditEvent['outcome'];
  readonly stage: RagRuntimeAuditStage;
  readonly timestamp: Date;
  readonly agentId?: string;
  readonly domain?: string;
  readonly knowledgeScopes?: readonly string[];
  readonly queryHash?: string;
  readonly documentIds?: readonly string[];
  readonly documentVersions?: readonly string[];
  readonly chunkIds?: readonly string[];
  readonly retrievalScores?: readonly RagRetrievalScoreAuditEvidence[];
  readonly retrievalResults?: readonly RagRetrievalResultAuditEvidence[];
  readonly embeddingModel?: string;
  readonly embeddingModelVersion?: string;
  readonly retrievalVersion?: string;
  readonly resultCount?: number;
  readonly latencyMs?: number;
  readonly errorCode?: string;
}): RagRuntimeAuditEvent {
  const base = {
    schema_version: '1.0',
    event_type: 'rag_runtime.operation.outcome',
    timestamp: input.timestamp.toISOString(),
    trace_id: input.traceId,
    service: input.service,
    environment: input.environment,
    operation: input.operation,
    outcome: input.outcome,
    stage: input.stage,
    ...(input.agentId ? { agent_id: input.agentId } : {}),
    ...(input.domain ? { domain: input.domain } : {}),
    ...(input.knowledgeScopes
      ? { knowledge_scopes: Object.freeze([...input.knowledgeScopes]) }
      : {}),
    ...(input.queryHash ? { query_hash: input.queryHash } : {}),
    ...(input.documentIds ? { document_ids: Object.freeze([...input.documentIds]) } : {}),
    ...(input.documentVersions
      ? { document_versions: Object.freeze([...input.documentVersions]) }
      : {}),
    ...(input.chunkIds ? { chunk_ids: Object.freeze([...input.chunkIds]) } : {}),
    ...(input.retrievalScores
      ? {
          retrieval_scores: Object.freeze(
            input.retrievalScores.map((score) => Object.freeze({ ...score }))
          )
        }
      : {}),
    ...(input.retrievalResults
      ? {
          retrieval_results: Object.freeze(
            input.retrievalResults.map((result) =>
              Object.freeze({
                ...result,
                source_location: Object.freeze({ ...result.source_location })
              })
            )
          )
        }
      : {}),
    ...(input.embeddingModel ? { embedding_model: input.embeddingModel } : {}),
    ...(input.embeddingModelVersion
      ? { embedding_model_version: input.embeddingModelVersion }
      : {}),
    ...(input.retrievalVersion ? { retrieval_version: input.retrievalVersion } : {}),
    ...(input.resultCount !== undefined ? { result_count: input.resultCount } : {}),
    ...(input.latencyMs !== undefined ? { latency_ms: input.latencyMs } : {}),
    ...(input.errorCode ? { error_code: input.errorCode } : {})
  } as const;

  if (!input.context) {
    if (input.outcome !== 'rejected' && input.outcome !== 'error') {
      throw new Error('Trusted context is required for RAG Runtime audit events');
    }
    if (input.stage !== 'boundary_context' && input.stage !== 'boundary_trace') {
      throw new Error('Trusted context is required for RAG Runtime audit events');
    }
    return Object.freeze({
      ...base,
      outcome: input.outcome,
      stage: input.stage,
      context_status: 'unavailable'
    });
  }

  return Object.freeze({
    ...base,
    context_status: 'trusted',
    request_id: input.context.request_id,
    correlation_id: input.context.correlation_id,
    tenant_id: input.context.tenant_id,
    user_id: input.context.user_id,
    role: input.context.role,
    session_id: input.context.session_id,
    permission_refs: Object.freeze([...input.context.permissions]),
    entitlement_refs: Object.freeze([...input.context.entitlements])
  });
}

export function createSecurityAuditEvent(
  context: TrustedRequestContext,
  service: string,
  environment: string,
  eventType: string,
  traceId: string,
  timestamp: Date = new Date()
): AuditEvent {
  return Object.freeze(
    auditEventSchema.parse({
      schema_version: '1.0',
      event_type: eventType,
      timestamp: timestamp.toISOString(),
      trace_id: traceId,
      request_id: context.request_id,
      correlation_id: context.correlation_id,
      tenant_id: context.tenant_id,
      user_id: context.user_id,
      role: context.role,
      session_id: context.session_id,
      permission_refs: context.permissions,
      entitlement_refs: context.entitlements,
      service,
      environment
    })
  );
}
