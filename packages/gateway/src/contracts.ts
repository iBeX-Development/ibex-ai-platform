import { z } from 'zod';

const nonEmpty = z.string().trim().min(1);
const objectPayload = z.record(z.string(), z.unknown());

export const gatewayEndpointSchema = z.enum([
  'chat',
  'agents',
  'query',
  'tools',
  'approvals',
  'feedback'
]);

export type GatewayEndpoint = z.infer<typeof gatewayEndpointSchema>;

const endpointPayloadSchemas = {
  chat: z.object({ message: nonEmpty }).strict(),
  agents: z.object({ message: nonEmpty, requested_agent: nonEmpty.optional() }).strict(),
  query: z.object({ query: nonEmpty }).strict(),
  tools: z
    .object({ tool_id: nonEmpty, tool_version: nonEmpty, input: z.unknown().optional() })
    .strict(),
  approvals: z.object({ approval_id: nonEmpty, payload: objectPayload }).strict(),
  feedback: z
    .object({
      request_id: nonEmpty,
      rating: z.number().int().min(1).max(5),
      comment: nonEmpty.optional()
    })
    .strict()
} as const;

export function validateEndpointPayload(endpoint: GatewayEndpoint, payload: unknown): unknown {
  return endpointPayloadSchemas[endpoint].parse(payload);
}
