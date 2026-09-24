import { z } from 'zod';
import type { TrustedRequestContext } from '../../security/src/index.js';
import { toolApprovalPolicySchema } from '../../tool-runtime/src/index.js';

const nonEmpty = z.string().trim().min(1);
const evidenceHash = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const stringList = z.array(nonEmpty).readonly();
const resourceReferenceSchema = z.object({ type: nonEmpty, id: nonEmpty }).strict().readonly();

export const approvalActionDefinitionSchema = z
  .object({
    action_type: nonEmpty,
    action_version: nonEmpty,
    tool_id: nonEmpty,
    tool_version: nonEmpty,
    target_type: nonEmpty,
    allowed_agents: z
      .array(z.object({ agent_id: nonEmpty, agent_version: nonEmpty }).strict().readonly())
      .min(1)
      .readonly(),
    approval_policy: toolApprovalPolicySchema.exclude(['none']),
    required_proposal_permissions: z.array(nonEmpty).min(1).readonly(),
    required_proposal_entitlements: stringList,
    required_approval_permissions: z.array(nonEmpty).min(1).readonly(),
    required_approval_entitlements: stringList,
    required_execution_permissions: z.array(nonEmpty).min(1).readonly(),
    required_execution_entitlements: stringList,
    max_approval_ttl_ms: z.number().int().positive(),
    retry_policy: z
      .object({ max_attempts: z.literal(1) })
      .strict()
      .readonly(),
    safe_idempotent_execution: z.literal(false),
    execution_mode: z.enum(['deterministic_test', 'live_core']),
    integration_status: z.enum([
      'deterministic_test_only',
      'blocked_pending_approved_core_contract'
    ]),
    enabled: z.boolean(),
    environments: z.array(nonEmpty).min(1).readonly()
  })
  .strict()
  .readonly()
  .superRefine((value, context) => {
    if (
      value.execution_mode === 'live_core' &&
      (value.enabled || value.integration_status !== 'blocked_pending_approved_core_contract')
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['enabled'],
        message: 'Live Core approval execution remains disabled without an approved contract'
      });
    }
    const agentKeys = value.allowed_agents.map((agent) =>
      JSON.stringify([agent.agent_id, agent.agent_version])
    );
    if (new Set(agentKeys).size !== agentKeys.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['allowed_agents'],
        message: 'Approval action agent bindings must be unique'
      });
    }
    if (
      value.execution_mode === 'deterministic_test' &&
      (value.integration_status !== 'deterministic_test_only' ||
        value.environments.some((environment) => environment !== 'test'))
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['environments'],
        message: 'Deterministic approval execution is restricted to test environments'
      });
    }
  });
export type ApprovalActionDefinition = Readonly<z.infer<typeof approvalActionDefinitionSchema>>;

export const approvalProposalRequestSchema = z
  .object({
    context: z.unknown(),
    trace_id: nonEmpty.max(256),
    agent_id: nonEmpty,
    agent_version: nonEmpty,
    action_type: nonEmpty,
    action_version: nonEmpty,
    target: resourceReferenceSchema,
    proposed_changes: z.record(z.string(), z.unknown()),
    reason: nonEmpty,
    expires_at: z.string().datetime()
  })
  .strict()
  .readonly();

export interface ApprovalProposalRequest {
  readonly context: TrustedRequestContext;
  readonly trace_id: string;
  readonly agent_id: string;
  readonly agent_version: string;
  readonly action_type: string;
  readonly action_version: string;
  readonly target: Readonly<{ type: string; id: string }>;
  readonly proposed_changes: Readonly<Record<string, unknown>>;
  readonly reason: string;
  readonly expires_at: string;
}

export const approvalReferenceRequestSchema = z
  .object({
    context: z.unknown(),
    trace_id: nonEmpty.max(256),
    approval_id: nonEmpty
  })
  .strict()
  .readonly();

export interface ApprovalReferenceRequest {
  readonly context: TrustedRequestContext;
  readonly trace_id: string;
  readonly approval_id: string;
}

export const approvalDecisionEvidenceSchema = z
  .object({
    approval_id: nonEmpty,
    proposal_id: nonEmpty,
    action_id: nonEmpty,
    tenant_id: nonEmpty,
    decision: z.enum(['approve', 'reject']),
    approver_user_id: nonEmpty,
    approver_role: nonEmpty,
    proposed_change_hash: evidenceHash,
    proposal_integrity_hash: evidenceHash,
    authorization_decision_id: nonEmpty,
    decision_at: z.string().datetime()
  })
  .strict()
  .readonly();
export type ApprovalDecisionEvidence = Readonly<z.infer<typeof approvalDecisionEvidenceSchema>>;

export const targetStateEvidenceSchema = z
  .object({
    tenant_id: nonEmpty,
    state_hash: evidenceHash,
    executable: z.boolean()
  })
  .strict()
  .readonly();
export type TargetStateEvidence = Readonly<z.infer<typeof targetStateEvidenceSchema>>;

export const actionExecutionReceiptSchema = z
  .object({
    execution_id: nonEmpty,
    source_reference: nonEmpty,
    executed_at: z.string().datetime()
  })
  .strict()
  .readonly();
export type ActionExecutionReceipt = Readonly<z.infer<typeof actionExecutionReceiptSchema>>;

export const approvalStatusSchema = z.enum([
  'pending',
  'approved',
  'rejected',
  'expired',
  'executing',
  'executed',
  'execution_failed'
]);
export type ApprovalStatus = z.infer<typeof approvalStatusSchema>;

export const approvalRecordSchema = z
  .object({
    contract_version: z.literal('1.0'),
    revision: z.number().int().nonnegative(),
    proposal_id: nonEmpty,
    approval_id: nonEmpty,
    action_id: nonEmpty,
    tenant_id: nonEmpty,
    requester_user_id: nonEmpty,
    request_id: nonEmpty,
    correlation_id: nonEmpty,
    trace_id: nonEmpty,
    agent_id: nonEmpty,
    agent_version: nonEmpty,
    action_type: nonEmpty,
    action_version: nonEmpty,
    tool_id: nonEmpty,
    tool_version: nonEmpty,
    target: resourceReferenceSchema,
    target_state_hash: evidenceHash,
    proposed_changes: z.record(z.string(), z.unknown()),
    proposed_change_hash: evidenceHash,
    proposal_integrity_hash: evidenceHash,
    reason: nonEmpty,
    approval_policy: toolApprovalPolicySchema.exclude(['none']),
    status: approvalStatusSchema,
    requested_at: z.string().datetime(),
    expires_at: z.string().datetime(),
    approver_user_id: nonEmpty.optional(),
    approver_role: nonEmpty.optional(),
    authorization_decision_id: nonEmpty.optional(),
    decision_at: z.string().datetime().optional(),
    decision: z.enum(['approve', 'reject']).optional(),
    decision_evidence_hash: evidenceHash.optional(),
    idempotency_key: nonEmpty.optional(),
    execution_receipt: actionExecutionReceiptSchema.optional()
  })
  .strict()
  .readonly()
  .superRefine((value, context) => {
    if (
      ['approved', 'rejected', 'executing', 'executed', 'execution_failed'].includes(
        value.status
      ) &&
      (!value.approver_user_id ||
        !value.approver_role ||
        !value.authorization_decision_id ||
        !value.decision_at ||
        !value.decision ||
        !value.decision_evidence_hash)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['status'],
        message: 'Decision evidence is required after an approval decision'
      });
    }
    if (value.status === 'rejected' && value.decision !== 'reject') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['decision'],
        message: 'Rejected state requires a reject decision'
      });
    }
    if (
      ['approved', 'executing', 'executed', 'execution_failed'].includes(value.status) &&
      value.decision !== 'approve'
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['decision'],
        message: 'Execution-capable state requires an approve decision'
      });
    }
    if (
      ['executing', 'executed', 'execution_failed'].includes(value.status) &&
      !value.idempotency_key
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['idempotency_key'],
        message: 'Execution states require an idempotency key'
      });
    }
    if (value.status === 'executed' && !value.execution_receipt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['execution_receipt'],
        message: 'Executed approval requires a receipt'
      });
    }
  });
export type ApprovalRecord = Readonly<z.infer<typeof approvalRecordSchema>>;

export const approvalProposalResponseSchema = z
  .object({
    contract_version: z.literal('1.0'),
    status: z.literal('pending'),
    proposal_id: nonEmpty,
    approval_id: nonEmpty,
    action_id: nonEmpty,
    request_id: nonEmpty,
    correlation_id: nonEmpty,
    trace_id: nonEmpty,
    action_type: nonEmpty,
    approval_policy: toolApprovalPolicySchema.exclude(['none']),
    proposed_change_hash: evidenceHash,
    expires_at: z.string().datetime()
  })
  .strict()
  .readonly();
export type ApprovalProposalResponse = Readonly<z.infer<typeof approvalProposalResponseSchema>>;

export const approvalDecisionResponseSchema = z
  .object({
    contract_version: z.literal('1.0'),
    approval_id: nonEmpty,
    proposal_id: nonEmpty,
    action_id: nonEmpty,
    request_id: nonEmpty,
    correlation_id: nonEmpty,
    trace_id: nonEmpty,
    status: z.enum(['approved', 'rejected', 'expired']),
    decision_at: z.string().datetime().optional()
  })
  .strict()
  .readonly();
export type ApprovalDecisionResponse = Readonly<z.infer<typeof approvalDecisionResponseSchema>>;

export const approvalExecutionResponseSchema = z
  .object({
    contract_version: z.literal('1.0'),
    approval_id: nonEmpty,
    proposal_id: nonEmpty,
    action_id: nonEmpty,
    request_id: nonEmpty,
    correlation_id: nonEmpty,
    trace_id: nonEmpty,
    status: z.literal('executed'),
    execution_id: nonEmpty,
    source_reference: nonEmpty,
    executed_at: z.string().datetime(),
    idempotency_key: nonEmpty,
    duplicate: z.boolean()
  })
  .strict()
  .readonly();
export type ApprovalExecutionResponse = Readonly<z.infer<typeof approvalExecutionResponseSchema>>;
