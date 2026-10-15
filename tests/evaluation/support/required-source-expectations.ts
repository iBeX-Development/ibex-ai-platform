import type { AgentCitation } from '../../../packages/pilot-agents/src/index.js';

export type RequiredSourceIdentity = Pick<
  AgentCitation,
  'source_type' | 'source_id' | 'source_version' | 'source_reference'
>;

// Independent synthetic evaluation labels, never runtime or grounding inputs.
// This is not a replacement/version update for the historical v1 datasets.
export const syntheticRequiredSourceExpectation = {
  expectation_id: 'AQ10-SYNTHETIC-REQUIRED-SOURCE-001',
  measurement_classification: 'synthetic_source_identity_only',
  required_sources: [
    {
      source_type: 'rag',
      source_id: 'document-1',
      source_version: '1.0',
      source_reference: 'knowledge://approved/document-1#section-1'
    }
  ]
} as const satisfies {
  expectation_id: string;
  measurement_classification: string;
  required_sources: readonly RequiredSourceIdentity[];
};
