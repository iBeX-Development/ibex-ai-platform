import {
  ApprovalActionRegistry,
  ApprovalRuntime,
  approvalDecisionEvidenceSchema,
  approvalRecordSchema,
  type ApprovalActionDefinition,
  type ApprovalDecisionSource,
  type ApprovalExecutionAdapter,
  type ApprovalProposalRequest,
  type ApprovalRecord,
  type ApprovalRecordStore,
  type ApprovalTargetStateResolver
} from '../../packages/approval-runtime/src/index.js';
import {
  AuditTelemetryPipeline,
  InMemoryAuditEvidenceStore,
  type AuditMetric,
  type CanonicalAuditEvent,
  type SecurityObservation
} from '../../packages/audit/src/index.js';
import { createTrustedRequestContext } from '../../packages/security/src/index.js';
import { enabledTestFeatureControls } from '../../packages/testing/src/index.js';
import type { FeatureControls } from '../../packages/configuration/src/index.js';

export const approvalValidationTime = new Date('2026-09-24T04:00:00.000Z');
export const approvalBoundaryIdentity = Object.freeze({
  trace_id: 'server-p9-trace-1',
  request_id: 'server-p9-request-1',
  correlation_id: 'server-p9-correlation-1'
});

export const testApprovalAction: ApprovalActionDefinition = Object.freeze({
  action_type: 'maintenance.work-order.create',
  action_version: '1.0.0',
  tool_id: 'WORK_ORDER_CREATE_PROPOSAL',
  tool_version: '1.0.0',
  target_type: 'asset',
  allowed_agents: Object.freeze([
    Object.freeze({ agent_id: 'maintenance-agent', agent_version: '1.0.0' })
  ]),
  approval_policy: 'workflow_approval',
  required_proposal_permissions: Object.freeze(['maintenance:proposal']),
  required_proposal_entitlements: Object.freeze(['approval:test']),
  required_approval_permissions: Object.freeze(['maintenance:approve']),
  required_approval_entitlements: Object.freeze(['approval:test']),
  required_execution_permissions: Object.freeze(['maintenance:execute']),
  required_execution_entitlements: Object.freeze(['approval:test']),
  max_approval_ttl_ms: 60 * 60 * 1000,
  retry_policy: Object.freeze({ max_attempts: 1 }),
  safe_idempotent_execution: false,
  execution_mode: 'deterministic_test',
  integration_status: 'deterministic_test_only',
  enabled: true,
  environments: Object.freeze(['test'])
});

export const blockedLiveAction: ApprovalActionDefinition = Object.freeze({
  ...testApprovalAction,
  action_type: 'maintenance.work-order.create.live',
  execution_mode: 'live_core',
  integration_status: 'blocked_pending_approved_core_contract',
  enabled: false,
  environments: Object.freeze(['staging', 'production'])
});

export function approvalContext(overrides: Record<string, unknown> = {}) {
  return createTrustedRequestContext({
    tenant_id: 'tenant-a',
    user_id: 'user-a',
    role: 'maintenance-operator-test',
    permissions: ['maintenance:proposal', 'maintenance:approve', 'maintenance:execute'],
    entitlements: ['approval:test'],
    session_id: 'session-p9-1',
    request_id: 'request-p9-1',
    correlation_id: 'correlation-p9-1',
    channel: 'web',
    locale: 'mn',
    ...overrides
  });
}

export function approvalProposalRequest(
  overrides: Partial<ApprovalProposalRequest> = {}
): ApprovalProposalRequest {
  return {
    context: approvalContext(),
    trace_id: 'trace-p9-1',
    agent_id: 'maintenance-agent',
    agent_version: '1.0.0',
    action_type: testApprovalAction.action_type,
    action_version: testApprovalAction.action_version,
    target: { type: 'asset', id: 'asset-a' },
    proposed_changes: { summary: 'Synthetic work order proposal', priority: 'normal' },
    reason: 'Deterministic Phase 9 validation',
    expires_at: new Date(approvalValidationTime.getTime() + 30 * 60 * 1000).toISOString(),
    ...overrides
  };
}

export class InMemoryApprovalRecordStore implements ApprovalRecordStore {
  readonly records = new Map<string, ApprovalRecord>();

  get(approvalId: string): Promise<ApprovalRecord | undefined> {
    const value = this.records.get(approvalId);
    return Promise.resolve(value ? structuredClone(value) : undefined);
  }

  save(record: ApprovalRecord, expectedRevision: number | null): Promise<boolean> {
    const current = this.records.get(record.approval_id);
    if (
      (expectedRevision === null && current !== undefined) ||
      (expectedRevision !== null && current?.revision !== expectedRevision)
    ) {
      return Promise.resolve(false);
    }
    this.records.set(record.approval_id, structuredClone(record));
    return Promise.resolve(true);
  }

  tamper(approvalId: string, change: (record: ApprovalRecord) => ApprovalRecord): void {
    const current = this.records.get(approvalId);
    if (!current) throw new Error('Approval fixture is missing');
    this.records.set(approvalId, structuredClone(change(current)));
  }
}

export class DeterministicDecisionSource implements ApprovalDecisionSource {
  readonly mode = 'deterministic_test' as const;
  decision: 'approve' | 'reject' | 'cancel' | 'revoke' | 'expire' = 'approve';
  overrides: Record<string, unknown> = {};
  unavailable = false;
  calls = 0;

  getDecision(input: Parameters<ApprovalDecisionSource['getDecision']>[0]): Promise<unknown> {
    this.calls += 1;
    if (this.unavailable) return Promise.reject(new Error('Synthetic authority unavailable'));
    return Promise.resolve(
      approvalDecisionEvidenceSchema.parse({
        approval_id: input.approval.approval_id,
        proposal_id: input.approval.proposal_id,
        action_id: input.approval.action_id,
        tenant_id: input.approval.tenant_id,
        decision: this.decision,
        approver_user_id: input.approval.approver_user_id ?? input.context.user_id,
        approver_role: input.approval.approver_role ?? input.context.role,
        request_id: input.approval.request_id,
        correlation_id: input.approval.correlation_id,
        target: input.approval.target,
        target_state_hash: input.approval.target_state_hash,
        proposed_change_hash: input.approval.proposed_change_hash,
        proposal_integrity_hash: input.approval.proposal_integrity_hash,
        authorization_decision_id: 'authorization-decision-p9-1',
        decision_at: approvalValidationTime.toISOString(),
        ...this.overrides
      })
    );
  }
}

export class DeterministicTargetState implements ApprovalTargetStateResolver {
  readonly mode = 'deterministic_test' as const;
  evidence: unknown = {
    tenant_id: 'tenant-a',
    state_hash: `sha256:${'a'.repeat(64)}`,
    executable: true
  };

  resolve(): Promise<unknown> {
    return Promise.resolve(this.evidence);
  }
}

export class DeterministicExecutionAdapter implements ApprovalExecutionAdapter {
  readonly action_type = testApprovalAction.action_type;
  readonly action_version = testApprovalAction.action_version;
  readonly mode = 'deterministic_test' as const;
  calls = 0;
  fail = false;

  execute(): Promise<unknown> {
    this.calls += 1;
    if (this.fail) return Promise.reject(new Error('Synthetic execution failure'));
    return Promise.resolve({
      execution_id: 'execution-p9-1',
      source_reference: 'deterministic://core/work-order-1',
      executed_at: approvalValidationTime.toISOString()
    });
  }
}

export function createApprovalHarness(
  options: {
    actions?: readonly unknown[];
    environment?: string;
    allowDeterministic?: boolean;
    ownershipTenant?: string | null;
    featureControls?: FeatureControls;
    clock?: () => Date;
  } = {}
) {
  const store = new InMemoryApprovalRecordStore();
  const decisionSource = new DeterministicDecisionSource();
  const targetState = new DeterministicTargetState();
  const adapter = new DeterministicExecutionAdapter();
  const ownership = {
    tenantId: options.ownershipTenant === undefined ? 'tenant-a' : options.ownershipTenant,
    resolveTenantId: () => Promise.resolve(ownership.tenantId)
  };
  const auditStore = new InMemoryAuditEvidenceStore();
  const exported: CanonicalAuditEvent[] = [];
  const metrics: AuditMetric[][] = [];
  const security: SecurityObservation[] = [];
  const auditControl: {
    fail: boolean;
    beforeExport?: (event: CanonicalAuditEvent) => Promise<void>;
  } = { fail: false };
  const pipeline = new AuditTelemetryPipeline({
    evidenceStore: auditStore,
    auditExporter: {
      export: async (event) => {
        await auditControl.beforeExport?.(event);
        if (auditControl.fail) throw new Error('Synthetic audit failure');
        exported.push(event);
      }
    },
    securityExporter: {
      export: (event) => {
        security.push(event);
        return Promise.resolve();
      }
    },
    metricsExporter: {
      export: (values) => {
        metrics.push([...values]);
        return Promise.resolve();
      }
    },
    healthExporter: { export: () => Promise.resolve() },
    metricLabelPolicy: { services: ['approval-runtime-test'], environments: ['test'] },
    environment: options.environment ?? 'test',
    eventIdFactory: () => `approval-audit-${(auditStore.audits.length + 1).toString()}`
  });
  let id = 0;
  const runtime = new ApprovalRuntime(
    {
      featureControls: options.featureControls ?? enabledTestFeatureControls,
      registry: new ApprovalActionRegistry(options.actions ?? [testApprovalAction]),
      store,
      decisionSource,
      targetState,
      authorization: {
        authorize: (_context, request) =>
          Promise.resolve({ allowed: true as const, decision_id: `auth-${request.action}` })
      },
      ownership,
      executionAdapters: [adapter],
      audit: pipeline
    },
    {
      service: 'approval-runtime-test',
      environment: options.environment ?? 'test',
      allowDeterministicTestAdapters: options.allowDeterministic ?? true,
      idFactory: () => `p9-id-${(++id).toString()}`,
      boundaryIdentityFactory: () => approvalBoundaryIdentity,
      clock: options.clock ?? (() => new Date(approvalValidationTime))
    }
  );
  return {
    runtime,
    store,
    decisionSource,
    targetState,
    ownership,
    adapter,
    audits: auditStore.audits,
    exported,
    metrics,
    security,
    auditControl
  };
}

export function storedApproval(store: InMemoryApprovalRecordStore, approvalId: string) {
  const value = store.records.get(approvalId);
  if (!value) throw new Error('Expected stored approval');
  return approvalRecordSchema.parse(value);
}
