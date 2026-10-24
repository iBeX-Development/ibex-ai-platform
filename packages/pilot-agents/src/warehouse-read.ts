import { z } from 'zod';
import { agentCitationSchema } from './contracts.js';

const ragCitation = agentCitationSchema.refine(
  (citation) =>
    citation.source_type === 'rag' &&
    Boolean(citation.content_hash && citation.citation_evidence_hash)
);
const toolCitation = agentCitationSchema.refine((citation) => citation.source_type === 'tool');
const common = {
  agent: z.literal('warehouse'),
  answer: z.string().min(1),
  evidence_status: z.literal('Sufficient'),
  proposed_action: z.null(),
  approval_required: z.literal(false),
  warnings: z.array(z.string().min(1)).max(0).readonly(),
  limitations: z.array(z.string().min(1)).readonly()
};

// Shape validation is not evidence verification. Only executeWarehouseRead produces
// this projection from the runtime's verified evidence path.
export const warehouseReadResponseSchema = z
  .discriminatedUnion('response_type', [
    z
      .object({
        ...common,
        response_type: z.literal('informational'),
        risk_level: z.literal('R0'),
        sources: z.array(ragCitation).min(1).readonly(),
        tools_used: z.array(toolCitation).max(0).readonly()
      })
      .strict(),
    z
      .object({
        ...common,
        response_type: z.literal('analysis'),
        risk_level: z.literal('R1'),
        sources: z.array(ragCitation).max(0).readonly(),
        tools_used: z.array(toolCitation).min(1).readonly()
      })
      .strict()
  ])
  .readonly();

export type WarehouseReadResponse = z.infer<typeof warehouseReadResponseSchema>;
