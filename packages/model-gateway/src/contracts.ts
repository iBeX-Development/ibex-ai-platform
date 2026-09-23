import { z } from 'zod';
import { trustedRequestContextSchema } from '../../security/src/index.js';

const nonEmpty = z.string().trim().min(1);
const nonNegativeInteger = z.number().int().nonnegative();
const money = z.number().nonnegative().finite();

export const modelCapabilitySchema = z.enum([
  'MG-FAST',
  'MG-GENERAL',
  'MG-REASONING',
  'MG-LONG-CONTEXT',
  'MG-MULTIMODAL',
  'MG-EMBEDDING',
  'MG-RERANK'
]);
export type ModelCapability = z.infer<typeof modelCapabilitySchema>;

export const confidentialityClassSchema = z.enum([
  'PUBLIC',
  'INTERNAL',
  'TENANT_CONFIDENTIAL',
  'RESTRICTED'
]);
export type ConfidentialityClass = z.infer<typeof confidentialityClassSchema>;

export const providerDefinitionSchema = z
  .object({
    provider_id: nonEmpty,
    adapter_id: nonEmpty,
    mode: z.enum(['test', 'live']),
    endpoint: z.string().url().optional(),
    credential_reference: nonEmpty.optional(),
    capabilities: z.array(modelCapabilitySchema).min(1).readonly(),
    maximum_confidentiality: confidentialityClassSchema,
    required_entitlements: z.array(nonEmpty).readonly(),
    approved_environments: z.array(nonEmpty).min(1).readonly(),
    fallback_priority: nonNegativeInteger,
    health: z.enum(['healthy', 'degraded', 'unavailable']),
    status: z.enum(['enabled', 'disabled'])
  })
  .strict()
  .superRefine((provider, context) => {
    if (provider.mode === 'live' && (!provider.endpoint || !provider.credential_reference)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Live providers require endpoint and credential reference'
      });
    }
    if (
      provider.mode === 'live' &&
      provider.endpoint &&
      !provider.endpoint.startsWith('https://')
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endpoint'],
        message: 'Live provider endpoints require HTTPS'
      });
    }
    if (provider.mode === 'test' && (provider.endpoint || provider.credential_reference)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Test providers cannot declare live credentials or endpoints'
      });
    }
  })
  .readonly();
export type ProviderDefinition = Readonly<z.infer<typeof providerDefinitionSchema>>;

export const modelDefinitionSchema = z
  .object({
    provider_id: nonEmpty,
    model_id: nonEmpty,
    model_version: nonEmpty,
    capabilities: z.array(modelCapabilitySchema).min(1).readonly(),
    context_limit: z.number().int().positive(),
    structured_output: z.boolean(),
    tool_use: z.boolean(),
    latency_class: z.enum(['low', 'standard', 'high']),
    cost_class: z.enum(['low', 'standard', 'high']),
    quality_rank: z.number().int().min(1).max(10),
    maximum_confidentiality: confidentialityClassSchema,
    deployment_type: z.enum(['public', 'private', 'self_hosted']),
    required_entitlements: z.array(nonEmpty).readonly(),
    approved_environments: z.array(nonEmpty).min(1).readonly(),
    input_cost_per_1k: money,
    output_cost_per_1k: money,
    status: z.enum(['unapproved', 'evaluation', 'approved', 'deprecated', 'disabled'])
  })
  .strict()
  .readonly();
export type ModelDefinition = Readonly<z.infer<typeof modelDefinitionSchema>>;

export const modelGatewayRequestSchema = z
  .object({
    context: trustedRequestContextSchema,
    trace_id: nonEmpty.max(256),
    agent_id: nonEmpty,
    capability: modelCapabilitySchema,
    confidentiality_class: confidentialityClassSchema,
    prompt_version: nonEmpty,
    policy_version: nonEmpty,
    input: z.unknown(),
    requires_structured_output: z.boolean(),
    requires_tool_use: z.boolean(),
    latency_priority: z.enum(['low', 'standard']),
    cost_policy: z.enum(['economy', 'balanced', 'quality']),
    output_schema_id: nonEmpty.optional()
  })
  .strict()
  .superRefine((request, context) => {
    if (request.requires_structured_output && !request.output_schema_id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['output_schema_id'],
        message: 'Structured output requires a versioned schema identifier'
      });
    }
  })
  .readonly();
export type ModelGatewayRequest = Readonly<z.infer<typeof modelGatewayRequestSchema>>;

export const providerResultSchema = z
  .object({
    result: z.unknown(),
    structured_output: z.unknown().optional(),
    input_tokens: nonNegativeInteger,
    output_tokens: nonNegativeInteger,
    finish_reason: nonEmpty,
    policy_flags: z.array(nonEmpty).readonly()
  })
  .strict()
  .readonly();
export type ProviderResult = Readonly<z.infer<typeof providerResultSchema>>;

export const modelGatewayResponseSchema = z
  .object({
    request_id: nonEmpty,
    correlation_id: nonEmpty,
    trace_id: nonEmpty,
    result: z.unknown(),
    structured_output: z.unknown().optional(),
    provider_id: nonEmpty,
    model_id: nonEmpty,
    model_version: nonEmpty,
    usage: z
      .object({
        input_tokens: nonNegativeInteger,
        output_tokens: nonNegativeInteger,
        total_tokens: nonNegativeInteger,
        estimated_cost: money
      })
      .strict()
      .readonly(),
    latency_ms: nonNegativeInteger,
    finish_reason: nonEmpty,
    fallback_used: z.boolean(),
    policy_flags: z.array(nonEmpty).readonly()
  })
  .strict()
  .readonly();
export type ModelGatewayResponse = Readonly<z.infer<typeof modelGatewayResponseSchema>>;

export interface ModelGatewayInvocationOptions {
  readonly signal?: AbortSignal;
}

export const modelGatewayPolicySchema = z
  .object({
    version: nonEmpty,
    required_permission: nonEmpty,
    agent_capabilities: z.record(z.array(modelCapabilitySchema).min(1).readonly()).readonly(),
    timeout_ms: z.number().int().positive(),
    max_retries: z.number().int().min(0).max(5),
    fallback_enabled: z.boolean(),
    maximum_input_bytes: z.number().int().positive()
  })
  .strict()
  .readonly();
export type ModelGatewayPolicy = Readonly<z.infer<typeof modelGatewayPolicySchema>>;
