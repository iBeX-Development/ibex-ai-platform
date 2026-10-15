import { describe, expect, it, vi } from 'vitest';
import { warehouseAgentProfile } from '../../agents/warehouse/src/index.js';
import type { PilotAgentResponse } from '../../packages/pilot-agents/src/index.js';
import {
  citationEvidenceHashForStoredChunk,
  stableChunkIdForStoredChunk,
  type KnowledgeChunk
} from '../../packages/rag-runtime/src/index.js';
import {
  createPilotHarness,
  groundedChunk,
  pilotRequest,
  pilotValidationTime,
  ragGrounding
} from '../testing/pilot-agent-fixtures.js';
import {
  syntheticRequiredSourceExpectation,
  type RequiredSourceIdentity
} from './support/required-source-expectations.js';

// Post-execution evaluation only. Answer wording, scores, and hashes are not
// substitutes for the independently specified required source identity.
function matchesRequiredSources(
  response: PilotAgentResponse,
  required: readonly RequiredSourceIdentity[]
): boolean {
  return (
    required.length > 0 &&
    required.every((expected) =>
      response.citations.some(
        (actual) =>
          actual.source_type === expected.source_type &&
          actual.source_id === expected.source_id &&
          actual.source_version === expected.source_version &&
          actual.source_reference === expected.source_reference
      )
    )
  );
}

const scope = 'approved-warehouse-procedures';
function request() {
  return pilotRequest(warehouseAgentProfile, {
    intent: 'WAREHOUSE_KNOWLEDGE_QUERY',
    requested_rag_scopes: [scope]
  });
}

// Stimuli use the existing synthetic fixture, never the expectation object.
// Rebind both stored and returned evidence after changing source identity.
function consistentEvidence(overrides: Partial<KnowledgeChunk> = {}) {
  const chunk = groundedChunk(warehouseAgentProfile, scope, overrides);
  return ragGrounding(warehouseAgentProfile, scope, {
    ...chunk,
    chunk_id: stableChunkIdForStoredChunk(chunk),
    citation_evidence_hash: citationEvidenceHashForStoredChunk(chunk)
  });
}

describe('AQ10 synthetic required-source correctness (not semantic quality)', () => {
  it('matches independent labels only after actual runtime execution', async () => {
    const evidence = consistentEvidence();
    const { runtime, grounding } = createPilotHarness(warehouseAgentProfile, {
      grounding: evidence
    });
    const resolve = vi.spyOn(grounding, 'resolve');
    const input = request();
    const response = await runtime.execute(input, pilotValidationTime);
    expect(response.evidence_status).toBe('sufficient');
    expect(response.response_type).toBe('knowledge');
    expect(
      matchesRequiredSources(response, syntheticRequiredSourceExpectation.required_sources)
    ).toBe(true);
    expect(resolve).toHaveBeenCalledOnce();
    const runtimeInputs = JSON.stringify({ input, evidence, groundingCalls: resolve.mock.calls });
    expect(runtimeInputs).not.toContain(syntheticRequiredSourceExpectation.expectation_id);
    expect(runtimeInputs).not.toContain('required_sources');
    expect(runtimeInputs).not.toContain('synthetic_source_identity_only');
  });

  it.each([
    {
      name: 'different document',
      overrides: { document_id: 'document-2', source_uri: 'knowledge://approved/document-2' }
    },
    { name: 'wrong ID alone', overrides: { document_id: 'document-2' } },
    { name: 'wrong version', overrides: { document_version: '2.0' } },
    { name: 'wrong URI', overrides: { source_uri: 'knowledge://approved/another-source' } },
    {
      name: 'wrong section reference',
      overrides: { source_location: { section: '1', reference: 'section-2', ordinal: 0 } }
    }
  ])(
    'fails required-source comparison for $name despite valid integrity',
    async ({ overrides }) => {
      const evidence = consistentEvidence(overrides);
      const runtime = createPilotHarness(warehouseAgentProfile, { grounding: evidence }).runtime;
      const response = await runtime.execute(request(), pilotValidationTime);
      // These are actual accepted runtime citations, not tampered output objects.
      expect(response.evidence_status).toBe('sufficient');
      expect(response.response_type).toBe('knowledge');
      expect(response.citations).toHaveLength(1);
      expect(response.citations[0]?.content_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(response.citations[0]?.citation_evidence_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(
        matchesRequiredSources(response, syntheticRequiredSourceExpectation.required_sources)
      ).toBe(false);
    }
  );

  it('compares source type independently of the other identity fields', async () => {
    const runtime = createPilotHarness(warehouseAgentProfile, {
      grounding: consistentEvidence()
    }).runtime;
    const response = await runtime.execute(request(), pilotValidationTime);
    expect(response.evidence_status).toBe('sufficient');
    // Deliberately contradictory evaluation label; never passed to the runtime.
    const wrongType: readonly RequiredSourceIdentity[] =
      syntheticRequiredSourceExpectation.required_sources.map((source) => ({
        ...source,
        source_type: 'tool'
      }));
    expect(matchesRequiredSources(response, wrongType)).toBe(false);
    expect(matchesRequiredSources(response, [])).toBe(false);
  });

  it('fails when the runtime has no required source and abstains', async () => {
    const runtime = createPilotHarness(warehouseAgentProfile).runtime;
    const response = await runtime.execute(request(), pilotValidationTime);
    expect(response).toMatchObject({
      response_type: 'abstain',
      evidence_status: 'insufficient',
      citations: []
    });
    expect(
      matchesRequiredSources(response, syntheticRequiredSourceExpectation.required_sources)
    ).toBe(false);
  });

  it('distinguishes broken integrity binding from valid-but-wrong source identity', async () => {
    // Existing fixture overrides without recomputing hashes deliberately break binding.
    const broken = ragGrounding(warehouseAgentProfile, scope, { document_id: 'document-2' });
    const runtime = createPilotHarness(warehouseAgentProfile, { grounding: broken }).runtime;
    const response = await runtime.execute(request(), pilotValidationTime);
    expect(response).toMatchObject({
      response_type: 'abstain',
      evidence_status: 'insufficient',
      citations: []
    });
    expect(response.limitations).toContain(
      'Approved grounding evidence failed integrity validation'
    );
    expect(
      matchesRequiredSources(response, syntheticRequiredSourceExpectation.required_sources)
    ).toBe(false);
  });

  it.each([
    { name: 'expected source', overrides: {}, expected: true },
    { name: 'different source', overrides: { document_id: 'document-2' }, expected: false }
  ])('keeps $name correctness independent of answer wording', async ({ overrides, expected }) => {
    const evidence = consistentEvidence(overrides);
    for (const answer of ['Synthetic evaluation wording A.', 'Different synthetic phrasing B.']) {
      const runtime = createPilotHarness(warehouseAgentProfile, {
        grounding: { ...evidence, answer }
      }).runtime;
      const response = await runtime.execute(request(), pilotValidationTime);
      expect(response.evidence_status).toBe('sufficient');
      expect(response.answer).toBe(answer);
      expect(
        matchesRequiredSources(response, syntheticRequiredSourceExpectation.required_sources)
      ).toBe(expected);
    }
  });
});
