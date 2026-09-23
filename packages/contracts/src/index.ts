import { z } from 'zod';

export const contractVersionSchema = z.literal('1.0');
export const apiRequestEnvelopeSchema = z
  .object({
    contract_version: contractVersionSchema,
    request_id: z.string().min(1),
    payload: z.unknown()
  })
  .strict();

const nonEmpty = z.string().trim().min(1);

export const gatewayRequestEnvelopeSchema = z
  .object({
    contract_version: contractVersionSchema,
    request_id: nonEmpty,
    correlation_id: nonEmpty,
    tenant_id: nonEmpty,
    user_id: nonEmpty,
    role: nonEmpty,
    permissions: z.array(nonEmpty).readonly(),
    entitlements: z.array(nonEmpty).readonly(),
    session_id: nonEmpty,
    timestamp: z.string().datetime(),
    locale: nonEmpty,
    payload: z.unknown()
  })
  .strict()
  .readonly();
export const apiResponseEnvelopeSchema = z
  .object({
    contract_version: contractVersionSchema,
    request_id: z.string().min(1),
    status: z.enum(['success', 'partial', 'rejected', 'error']),
    payload: z.unknown().optional()
  })
  .strict();

export const toolRequestSchema = z
  .object({
    contract_version: contractVersionSchema,
    tool_id: z.string().min(1),
    input: z.unknown()
  })
  .strict();
export const toolResponseSchema = z
  .object({
    contract_version: contractVersionSchema,
    tool_id: z.string().min(1),
    status: z.enum(['success', 'rejected', 'error']),
    output: z.unknown().optional()
  })
  .strict();
export const modelRequestSchema = z
  .object({
    contract_version: contractVersionSchema,
    capability: z.string().min(1),
    input: z.unknown(),
    response_schema: z.unknown().optional()
  })
  .strict();
export const modelResponseSchema = z
  .object({
    contract_version: contractVersionSchema,
    status: z.enum(['success', 'error']),
    output: z.unknown().optional()
  })
  .strict();
export const ragRequestSchema = z
  .object({
    contract_version: contractVersionSchema,
    query: z.string().min(1),
    document_scope: z.array(z.string()).readonly()
  })
  .strict();
export const ragResponseSchema = z
  .object({
    contract_version: contractVersionSchema,
    status: z.enum(['success', 'no_evidence', 'error']),
    sources: z.array(z.object({ source_id: z.string(), version: z.string() })).readonly()
  })
  .strict();
export const agentRequestSchema = z
  .object({ contract_version: contractVersionSchema, message: z.string().min(1) })
  .strict();
export const agentResponseSchema = z
  .object({
    contract_version: contractVersionSchema,
    status: z.enum(['success', 'insufficient_evidence', 'rejected', 'error']),
    answer: z.string().optional()
  })
  .strict();
export const auditEventSchema = z
  .object({
    schema_version: z.literal('1.0'),
    event_type: z.string().min(1),
    timestamp: z.string().datetime(),
    request_id: z.string().min(1),
    correlation_id: z.string().min(1),
    tenant_id: z.string().min(1),
    user_id: z.string().min(1),
    service: z.string().min(1),
    environment: z.string().min(1)
  })
  .strict();

export type ApiRequestEnvelope = z.infer<typeof apiRequestEnvelopeSchema>;
export type ApiResponseEnvelope = z.infer<typeof apiResponseEnvelopeSchema>;
export type GatewayRequestEnvelope = Readonly<z.infer<typeof gatewayRequestEnvelopeSchema>>;
