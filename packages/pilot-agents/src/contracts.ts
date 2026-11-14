import { z } from 'zod';
import type { TrustedRequestContext } from '../../security/src/index.js';
import type { ToolExecutionResponse } from '../../tool-runtime/src/index.js';
import type { KnowledgeChunk, RagRetrievalResponse } from '../../rag-runtime/src/index.js';

const nonEmpty = z.string().trim().min(1);
const stringList = z.array(nonEmpty).readonly();

export const evidenceRequirementSchema = z.enum(['none', 'rag', 'tool', 'tool_and_rag']);
export type EvidenceRequirement = z.infer<typeof evidenceRequirementSchema>;

export const pilotIntentPolicySchema = z
  .object({
    intent: nonEmpty,
    response_type: z.enum([
      'knowledge',
      'operational',
      'analysis',
      'recommendation',
      'routed',
      'proposed_action'
    ]),
    evidence: evidenceRequirementSchema,
    required_permissions: stringList,
    required_entitlements: stringList,
    authorization_status: z.enum(['approved', 'blocked_pending_approved_mapping']),
    rag_scopes: stringList,
    tool_capability_classes: stringList,
    handoff_domain: nonEmpty.optional(),
    proposal_only: z.boolean()
  })
  .strict()
  .readonly()
  .superRefine((value, context) => {
    if (
      value.authorization_status === 'approved' &&
      value.required_permissions.length === 0 &&
      value.required_entitlements.length === 0
    )
      context.addIssue({
        code: 'custom',
        path: ['authorization_status'],
        message: 'Approved intents require an explicit authorization mapping'
      });
    if (value.evidence === 'rag' && value.rag_scopes.length === 0)
      context.addIssue({
        code: 'custom',
        path: ['rag_scopes'],
        message: 'RAG evidence requires a scope'
      });
    if (value.evidence === 'tool' && value.tool_capability_classes.length === 0)
      context.addIssue({
        code: 'custom',
        path: ['tool_capability_classes'],
        message: 'Tool evidence requires a capability class'
      });
    if (
      value.evidence === 'tool_and_rag' &&
      (value.rag_scopes.length === 0 || value.tool_capability_classes.length === 0)
    )
      context.addIssue({
        code: 'custom',
        path: ['evidence'],
        message: 'Combined evidence requires both RAG and Tool configuration'
      });
    if (value.response_type === 'proposed_action' && !value.proposal_only)
      context.addIssue({
        code: 'custom',
        path: ['proposal_only'],
        message: 'Actions must remain proposals'
      });
  });
export type PilotIntentPolicy = Readonly<z.infer<typeof pilotIntentPolicySchema>>;

const componentVersionsSchema = z
  .object({
    agent: nonEmpty,
    prompt: nonEmpty,
    permission_policy: nonEmpty,
    tool_allowlist: nonEmpty,
    rag_scope: nonEmpty,
    output_contract: nonEmpty,
    evaluation_dataset: nonEmpty
  })
  .strict()
  .readonly();

const toolCapabilitySchema = z
  .union([
    z
      .object({
        capability_class: nonEmpty,
        classification: z.enum(['read', 'proposal']),
        live_binding: z.literal('blocked_pending_approved_core_contract'),
        enabled: z.literal(false)
      })
      .strict()
      .readonly(),
    z
      .object({
        capability_class: nonEmpty,
        classification: z.enum(['read', 'proposal']),
        live_binding: z.literal('deterministic_test_adapter'),
        enabled: z.literal(true)
      })
      .strict()
      .readonly()
  ])
  .readonly();

export const pilotAgentProfileSchema = z
  .object({
    agent_id: nonEmpty,
    domain: nonEmpty,
    specification: nonEmpty,
    deployment_stage: z.literal('evaluation'),
    versions: componentVersionsSchema,
    prompt: z
      .object({ prompt_id: nonEmpty, content_hash: nonEmpty, hierarchy_level: z.literal(3) })
      .strict()
      .readonly(),
    model_policy: nonEmpty,
    intents: z.array(pilotIntentPolicySchema).min(1).readonly(),
    tool_allowlist: z.array(toolCapabilitySchema).readonly(),
    rag_scopes: stringList,
    forbidden_capabilities: z.array(nonEmpty).min(1).readonly(),
    live_capabilities_enabled: z.literal(false),
    integration_blockers: z.array(nonEmpty).min(1).readonly()
  })
  .strict()
  .readonly()
  .superRefine((value, context) => {
    const configuredScopes = new Set(value.rag_scopes);
    const configuredTools = new Set(value.tool_allowlist.map((entry) => entry.capability_class));
    for (const [index, intent] of value.intents.entries()) {
      if (intent.rag_scopes.some((scope) => !configuredScopes.has(scope)))
        context.addIssue({
          code: 'custom',
          path: ['intents', index, 'rag_scopes'],
          message: 'Intent scope is not allowlisted'
        });
      if (intent.tool_capability_classes.some((tool) => !configuredTools.has(tool)))
        context.addIssue({
          code: 'custom',
          path: ['intents', index, 'tool_capability_classes'],
          message: 'Intent tool capability is not allowlisted'
        });
    }
  });
export type PilotAgentProfile = Readonly<z.infer<typeof pilotAgentProfileSchema>>;

export const pilotAgentExecutionRequestSchema = z
  .object({
    context: z.unknown().optional(),
    trace_id: nonEmpty.max(256),
    agent_id: nonEmpty,
    agent_version: nonEmpty,
    domain: nonEmpty,
    intent: nonEmpty,
    requested_rag_scopes: stringList,
    requested_tool_capabilities: stringList
  })
  .strict()
  .readonly();

export interface PilotAgentExecutionRequest {
  readonly context: TrustedRequestContext;
  readonly trace_id: string;
  readonly agent_id: string;
  readonly agent_version: string;
  readonly domain: string;
  readonly intent: string;
  readonly requested_rag_scopes: readonly string[];
  readonly requested_tool_capabilities: readonly string[];
}

export interface VerifiedRagEvidence {
  readonly response: RagRetrievalResponse;
  readonly chunks: readonly KnowledgeChunk[];
}
export interface PilotGroundingEvidence {
  readonly answer: string;
  readonly tool_responses: readonly ToolExecutionResponse[];
  readonly rag: readonly VerifiedRagEvidence[];
}
export interface PilotAgentGroundingPort {
  resolve(
    request: Readonly<{
      context: TrustedRequestContext;
      trace_id: string;
      agent_id: string;
      agent_version: string;
      domain: string;
      intent: string;
      rag_scopes: readonly string[];
      tool_capabilities: readonly string[];
    }>
  ): Promise<PilotGroundingEvidence>;
}

export const agentCitationSchema = z
  .object({
    source_type: z.enum(['rag', 'tool']),
    source_id: nonEmpty,
    source_version: nonEmpty,
    source_reference: nonEmpty,
    content_hash: nonEmpty.optional(),
    citation_evidence_hash: nonEmpty.optional()
  })
  .strict()
  .readonly();
export type AgentCitation = Readonly<z.infer<typeof agentCitationSchema>>;

export const pilotAgentResponseSchema = z
  .object({
    contract_version: z.literal('1.0'),
    request_id: nonEmpty,
    correlation_id: nonEmpty,
    trace_id: nonEmpty,
    agent_id: nonEmpty,
    agent_version: nonEmpty,
    prompt_version: nonEmpty,
    intent: nonEmpty,
    response_type: z.enum([
      'knowledge',
      'operational',
      'analysis',
      'recommendation',
      'routed',
      'proposed_action',
      'abstain'
    ]),
    evidence_status: z.enum(['sufficient', 'partial', 'insufficient']),
    answer: nonEmpty,
    citations: z.array(agentCitationSchema).readonly(),
    approval_required: z.boolean(),
    limitations: z.array(nonEmpty).readonly()
  })
  .strict()
  .readonly();
export type PilotAgentResponse = Readonly<z.infer<typeof pilotAgentResponseSchema>>;
