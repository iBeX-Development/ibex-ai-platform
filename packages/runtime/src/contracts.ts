import { utcDateTimeSchema } from '../../contracts/src/validation.js';
import { z } from 'zod';
import type { TrustedRequestContext } from '../../security/src/index.js';

const nonEmpty = z.string().trim().min(1);
const nonEmptyList = z.array(nonEmpty).readonly();

export const agentDefinitionSchema = z
  .object({
    agent_id: nonEmpty,
    version: nonEmpty,
    domain: nonEmpty,
    supported_intents: z.array(nonEmpty).min(1).readonly(),
    capabilities: nonEmptyList,
    prompt_version: nonEmpty,
    allowed_tools: nonEmptyList,
    allowed_rag_scopes: nonEmptyList,
    required_permissions: nonEmptyList,
    required_entitlements: nonEmptyList,
    model_policy: z
      .object({
        default_policy: nonEmpty,
        fallback_policies: nonEmptyList
      })
      .strict()
      .readonly(),
    evaluation_profile: nonEmpty,
    status: z.enum(['active', 'disabled'])
  })
  .strict()
  .readonly();

export type AgentDefinition = Readonly<z.infer<typeof agentDefinitionSchema>>;

const promptRecordShape = {
  prompt_id: nonEmpty,
  prompt_version: nonEmpty,
  agent_id: nonEmpty,
  layer: z.enum(['master', 'orchestrator', 'domain']),
  status: z.enum(['draft', 'testing', 'approved', 'retired']),
  effective_date: utcDateTimeSchema,
  content_hash: nonEmpty,
  created_by: nonEmpty,
  approved_by: nonEmpty.optional(),
  change_reason: nonEmpty
} as const;

export const promptRecordSchema = z.object(promptRecordShape).strict().readonly();
export type PromptRecord = Readonly<z.infer<typeof promptRecordSchema>>;

const promptReferenceShape = {
  prompt_id: nonEmpty,
  prompt_version: nonEmpty,
  agent_id: nonEmpty,
  layer: z.enum(['master', 'orchestrator', 'domain']),
  content_hash: nonEmpty
} as const;

export const promptReferenceSchema = z.object(promptReferenceShape).strict().readonly();
export type PromptReference = Readonly<z.infer<typeof promptReferenceSchema>>;

export const promptHierarchySchema = z
  .object({
    layers: z
      .tuple([
        z
          .object({ ...promptReferenceShape, layer: z.literal('master') })
          .strict()
          .readonly(),
        z
          .object({ ...promptReferenceShape, layer: z.literal('orchestrator') })
          .strict()
          .readonly(),
        z
          .object({ ...promptReferenceShape, layer: z.literal('domain') })
          .strict()
          .readonly()
      ])
      .readonly()
  })
  .strict()
  .readonly();

export type PromptHierarchy = Readonly<z.infer<typeof promptHierarchySchema>>;

export const intentClassificationSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('unknown') }).strict(),
  z
    .object({
      status: z.literal('classified'),
      intent: nonEmpty,
      domain: nonEmpty,
      required_capabilities: nonEmptyList
    })
    .strict()
]);

export type IntentClassification = Readonly<z.infer<typeof intentClassificationSchema>>;

export const ragPlanSchema = z
  .object({
    required: z.boolean(),
    scopes: nonEmptyList
  })
  .strict()
  .readonly()
  .superRefine((value, context) => {
    if (!value.required && value.scopes.length > 0) {
      context.addIssue({
        code: 'custom',
        path: ['scopes'],
        message: 'RAG scopes require an enabled RAG decision'
      });
    }
  });

export type RagPlan = Readonly<z.infer<typeof ragPlanSchema>>;

export const toolPlanSchema = z
  .object({
    candidates: nonEmptyList,
    action_class: z.enum(['read', 'recommendation', 'proposed_action']),
    risk_class: z.enum(['low', 'medium', 'high']),
    approval_required: z.boolean()
  })
  .strict()
  .readonly()
  .superRefine((value, context) => {
    if (value.action_class === 'proposed_action' && !value.approval_required) {
      context.addIssue({
        code: 'custom',
        path: ['approval_required'],
        message: 'Proposed actions require approval'
      });
    }
  });

export type ToolPlan = Readonly<z.infer<typeof toolPlanSchema>>;

export const modelPolicySelectionSchema = z
  .object({
    policy_id: nonEmpty,
    fallback: z.boolean()
  })
  .strict()
  .readonly();

export type ModelPolicySelection = Readonly<z.infer<typeof modelPolicySelectionSchema>>;

export const runtimeControlPolicySchema = z
  .object({
    timeout_ms: z.number().refine(Number.isInteger, 'Expected integer').positive(),
    max_context_bytes: z.number().refine(Number.isInteger, 'Expected integer').positive(),
    token_budget: z.number().refine(Number.isInteger, 'Expected integer').positive(),
    retry_policy: z
      .object({ max_attempts: z.number().int().min(1).max(5) })
      .strict()
      .readonly(),
    model_fallback_allowed: z.boolean()
  })
  .strict()
  .readonly();

export type RuntimeControlPolicy = Readonly<z.infer<typeof runtimeControlPolicySchema>>;

export interface OrchestratorRequest {
  readonly context: TrustedRequestContext;
  readonly trace_id: string;
  readonly input: unknown;
  readonly requested_agent?: string;
  readonly signal?: AbortSignal;
}

export const routingDecisionSchema = z
  .object({
    intent: nonEmpty,
    domain: nonEmpty,
    selected_agent: nonEmpty,
    agent_version: nonEmpty,
    required_capabilities: nonEmptyList,
    rag_required: z.boolean(),
    rag_scopes: nonEmptyList,
    tool_candidates: nonEmptyList,
    action_class: z.enum(['read', 'recommendation', 'proposed_action']),
    risk_class: z.enum(['low', 'medium', 'high']),
    approval_required: z.boolean(),
    model_policy: nonEmpty,
    evaluation_profile: nonEmpty,
    prompt_hierarchy: promptHierarchySchema,
    runtime_controls: runtimeControlPolicySchema,
    request_id: nonEmpty,
    correlation_id: nonEmpty,
    trace_id: nonEmpty
  })
  .strict()
  .readonly();

export type RoutingDecision = Readonly<z.infer<typeof routingDecisionSchema>>;

export const orchestratorResultSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('routed'),
      decision: routingDecisionSchema
    })
    .strict(),
  z
    .object({
      status: z.literal('fallback'),
      reason: z.enum(['unknown_intent', 'no_matching_agent']),
      message: z.literal('Unable to route this request safely'),
      request_id: nonEmpty,
      correlation_id: nonEmpty,
      trace_id: nonEmpty
    })
    .strict()
]);

export type OrchestratorResult = Readonly<z.infer<typeof orchestratorResultSchema>>;
