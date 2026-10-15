import { z } from 'zod';
import type { TrustedRequestContext } from '../../security/src/index.js';

const nonEmpty = z.string().trim().min(1);

export const toolApprovalPolicySchema = z.enum([
  'none',
  'user_confirmation',
  'role_approval',
  'workflow_approval',
  'multi_step_approval'
]);

export const toolMetadataSchema = z
  .object({
    registration_version: z.literal('2.0'),
    error_model: z.literal('ibex.tool-error.v1'),
    tool_id: nonEmpty,
    tool_name: nonEmpty,
    version: nonEmpty,
    domain: nonEmpty,
    description: nonEmpty,
    read_write_class: z.enum(['read', 'proposal']),
    risk_level: z.enum(['low', 'medium', 'high']),
    input_schema_id: nonEmpty,
    output_schema_id: nonEmpty,
    tenant_scope: z.literal('tenant'),
    required_permissions: z.array(nonEmpty).min(1).readonly(),
    required_entitlements: z.array(nonEmpty).readonly(),
    approval_policy: toolApprovalPolicySchema,
    timeout_policy: z.object({ timeout_ms: z.number().int().positive() }).strict().readonly(),
    retry_policy: z
      .object({
        max_attempts: z.number().int().min(1).max(3),
        backoff_ms: z.number().int().min(0).max(5_000)
      })
      .strict()
      .readonly(),
    audit_policy: z.literal('required'),
    data_sensitivity: z.enum(['internal', 'tenant_confidential', 'restricted']),
    ownership_validation: z.enum(['tenant_scope', 'resource']),
    execution_mode: z.enum(['deterministic_test', 'live_core']),
    safe_idempotent: z.boolean(),
    proposal_only: z.boolean(),
    enabled: z.boolean(),
    environments: z.array(nonEmpty).min(1).readonly()
  })
  .strict()
  .readonly()
  .superRefine((value, context) => {
    if (value.read_write_class === 'proposal') {
      if (!value.proposal_only || value.approval_policy === 'none') {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['proposal_only'],
          message: 'Action tools must remain approval-gated proposals'
        });
      }
      if (value.safe_idempotent || value.retry_policy.max_attempts !== 1) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['retry_policy'],
          message: 'Action proposals cannot be retried'
        });
      }
    } else {
      if (value.proposal_only || value.approval_policy !== 'none') {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['approval_policy'],
          message: 'Read tools cannot use action approval policy'
        });
      }
      if (!value.safe_idempotent && value.retry_policy.max_attempts !== 1) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['retry_policy'],
          message: 'Only safe idempotent reads may be retried'
        });
      }
    }
  });

export type ToolMetadata = Readonly<z.infer<typeof toolMetadataSchema>>;

export interface ToolRegistration {
  readonly metadata: ToolMetadata;
  readonly input_schema: z.ZodType<unknown>;
  readonly output_schema: z.ZodType<unknown>;
  readonly resource_reference?: (validatedInput: unknown) => Readonly<{
    type: string;
    id: string;
  }>;
}

export const toolExecutionRequestSchema = z
  .object({
    context: z.unknown(),
    trace_id: nonEmpty.max(256),
    agent_id: nonEmpty,
    prompt_version: nonEmpty,
    tool_id: nonEmpty,
    tool_version: nonEmpty,
    input: z.unknown()
  })
  .strict()
  .readonly();

export interface ToolExecutionRequest {
  readonly context: TrustedRequestContext;
  readonly trace_id: string;
  readonly agent_id: string;
  readonly prompt_version: string;
  readonly tool_id: string;
  readonly tool_version: string;
  readonly input: unknown;
}

const toolSourceSchema = z.object({ system: nonEmpty, reference: nonEmpty }).strict().readonly();

export const toolAdapterResultSchema = z
  .object({
    output: z.unknown(),
    source: toolSourceSchema,
    observed_at: z.string().datetime()
  })
  .strict()
  .readonly();

export type ToolAdapterResult = Readonly<z.infer<typeof toolAdapterResultSchema>>;

export const toolExecutionResponseSchema = z.union([
  z
    .object({
      contract_version: z.literal('1.0'),
      status: z.literal('success'),
      request_id: nonEmpty,
      correlation_id: nonEmpty,
      trace_id: nonEmpty,
      tool_id: nonEmpty,
      tool_version: nonEmpty,
      output: z.unknown(),
      source: toolSourceSchema,
      observed_at: z.string().datetime(),
      attempts: z.number().int().positive()
    })
    .strict()
    .readonly(),
  z
    .object({
      contract_version: z.literal('1.0'),
      status: z.literal('proposed'),
      request_id: nonEmpty,
      correlation_id: nonEmpty,
      trace_id: nonEmpty,
      tool_id: nonEmpty,
      tool_version: nonEmpty,
      proposed_input: z.unknown(),
      approval_required: z.literal(true),
      approval_policy: toolApprovalPolicySchema.exclude(['none'])
    })
    .strict()
    .readonly()
]);

export type ToolExecutionResponse = Readonly<z.infer<typeof toolExecutionResponseSchema>>;

export interface ToolExecutionOptions {
  readonly signal?: AbortSignal;
}
