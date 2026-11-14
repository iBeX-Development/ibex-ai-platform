import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findingsRegistrySchema } from '../evaluation/support/findings-registry.js';
import { assessWorkingInventory, type WorkingInventory } from '../evaluation/support/working-inventory.js';
import { embeddingEvidenceSchema, rankedChunkReferenceSchema, ragRetrievalResponseSchema } from '../../packages/rag-runtime/src/contracts.js';
import { modelDefinitionSchema, modelGatewayResponseSchema } from '../../packages/model-gateway/src/contracts.js';
import { measurementEvidenceSchema } from '../evaluation/support/release-gate.js';

const max = Number.MAX_SAFE_INTEGER;
const invalidPositiveIntegers = [max + 1, 1.5, 0, -1, NaN, Infinity, -Infinity, null];
const nonfinite = [NaN, Infinity, -Infinity];
const registry = {
  schema_version: '1.0.0', registry_id: 'synthetic-only', revision: 1,
  repository: 'iBeX-Development/ibex-ai-platform', phase: 'phase10',
  evaluated_commit: 'a'.repeat(40), completeness: 'unknown', review_state: 'unreviewed',
  sources: [{ source_id: 'source', reference: 'https://example.invalid/source', coverage: 'unknown' }],
  evidence: [{ evidence_id: 'evidence', source_id: 'source', reference: 'https://example.invalid/evidence' }],
  findings: [{ finding_id: 'finding', revision: 1, severity: 'unknown', status: 'unreviewed',
    source_refs: ['source'], evidence_refs: ['evidence'], remediation_refs: [], verification_refs: [] }]
};
const inventoryText = readFileSync(new URL('../../docs/evaluation/findings/working-inventory.v1.json', import.meta.url), 'utf8');
const historicalRegistry = readFileSync(new URL('../evaluation/fixtures/registry-v2-historical.json', import.meta.url), 'utf8');
const readLocal = (path: string) => path === 'docs/evaluation/findings/registry.v1.json'
  ? historicalRegistry : readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const inventory = () => JSON.parse(inventoryText) as WorkingInventory;
function first<T>(items: T[]): T {
  const item = items[0];
  if (item === undefined) throw new Error('Missing complete fixture row');
  return item;
}
const model = {
  provider_id: 'provider', model_id: 'model', model_version: '1',
  input_type: { modalities: ['text'], schema: { schema_id: 'message', schema_version: '1' } },
  output_type: { modalities: ['text'], schema: { schema_id: 'message', schema_version: '1' } },
  capabilities: ['MG-GENERAL'], context_limit: 8192, structured_output: true, tool_use: false,
  latency_class: 'standard', cost_class: 'standard', quality_rank: 8,
  maximum_confidentiality: 'RESTRICTED', deployment_type: 'private',
  required_entitlements: [], approved_environments: ['test'],
  input_cost_per_1k: 0, output_cost_per_1k: 0, status: 'approved'
};
const response = {
  request_id: 'request', correlation_id: 'correlation', trace_id: 'trace',
  provider_id: 'provider', model_id: 'model', model_version: '1',
  usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0, estimated_cost: 0 },
  latency_ms: 0, finish_reason: 'stop', fallback_used: false, policy_flags: []
};
const scores = { score: 0, semantic_score: 0, keyword_score: 0 };
const retrieval = {
  contract_version: '1.0', status: 'success', request_id: 'request', correlation_id: 'correlation',
  trace_id: 'trace', retrieval_version: '1', results: [{ content: 'text',
    content_trust: 'untrusted_retrieved_content', instruction_authority: 'none', ...scores,
    citation: { document_id: 'document', document_version: '1', title: 'title',
      chunk_id: 'sha256:' + 'a'.repeat(64), source_uri: 'synthetic',
      source_location: { section: 'section', reference: 'reference', ordinal: 0 },
      content_hash: 'sha256:' + 'b'.repeat(64), document_checksum: 'sha256:' + 'c'.repeat(64), citation_evidence_hash: 'sha256:' + 'd'.repeat(64) }
  }]
};

describe('candidate numeric deprecation cleanup preserves domains', () => {
  it('uses otherwise valid complete fixtures', () => {
    expect(findingsRegistrySchema.safeParse(registry).success).toBe(true);
    expect(assessWorkingInventory(inventoryText, readLocal).structural_status).toBe('PASS');
    expect(modelDefinitionSchema.safeParse(model).success).toBe(true);
    expect(modelGatewayResponseSchema.safeParse(response).success).toBe(true);
    expect(ragRetrievalResponseSchema.safeParse(retrieval).success).toBe(true);
  });
  it.each(['registry', 'finding'] as const)('preserves positive safe %s revisions', (field) => {
    const parse = (value: unknown) => findingsRegistrySchema.safeParse(field === 'registry'
      ? { ...registry, revision: value }
      : { ...registry, findings: [{ ...first(registry.findings), revision: value }] }).success;
    for (const value of [1, max]) expect(parse(value)).toBe(true);
    for (const value of invalidPositiveIntegers) expect(parse(value)).toBe(false);
  });
  it.each(['dispatch', 'collection', 'matrix', 'count'] as const)('preserves inventory %s numeric structure', (field) => {
    const check = (value: number | null) => {
      const fixture = inventory();
      if (field === 'count') first(fixture.historical_gaps).reported_count = value;
      else {
        // Non-null local references are exercised with null via serialized input below.
        const ref = field === 'matrix' ? first(fixture.operational_requirements).matrix_ref
          : field === 'dispatch' ? first(fixture.owner_assignments).dispatch_ref
            : first(fixture.owner_assignments).collection_ref;
        const text = JSON.stringify(fixture);
        const altered = text.replace(JSON.stringify(ref), JSON.stringify({ ...ref, line: value }));
        expect(altered).not.toBe(text);
        return assessWorkingInventory(altered, readLocal).diagnostics;
      }
      return assessWorkingInventory(JSON.stringify(fixture), readLocal).diagnostics;
    };
    // Schema acceptance alone: MAX_SAFE_INTEGER references may legitimately fail later row checks.
    for (const value of [max]) expect(check(value)).not.toContain('INVALID_STRUCTURE');
    for (const value of [max + 1, 1.5, 0, -1]) expect(check(value)).toContain('INVALID_STRUCTURE');
    expect(check(null).includes('INVALID_STRUCTURE')).toBe(field !== 'count');
  });
  it('retains finite embedding vectors including negative and zero components', () => {
    const parse = (value: number) => embeddingEvidenceSchema.safeParse({ model_id: 'model', model_version: '1', vector: [value] }).success;
    for (const value of [-Number.MAX_VALUE, 0, Number.MAX_VALUE]) expect(parse(value)).toBe(true);
    for (const value of nonfinite) expect(parse(value)).toBe(false);
  });
  it.each(['score', 'semantic_score', 'keyword_score'] as const)('preserves both %s ranges', (field) => {
    for (const value of [0, 1, 0.5, -0.1, 1.1, ...nonfinite]) {
      const expected = Number.isFinite(value) && value >= 0 && value <= 1;
      expect(rankedChunkReferenceSchema.safeParse({ chunk_id: 'sha256:' + 'a'.repeat(64), ...scores, [field]: value }).success).toBe(expected);
      expect(ragRetrievalResponseSchema.safeParse({ ...retrieval, results: [{ ...first(retrieval.results), [field]: value }] }).success).toBe(expected);
    }
  });
  it.each(['input_cost_per_1k', 'output_cost_per_1k', 'estimated_cost'] as const)('preserves finite nonnegative %s', (field) => {
    for (const value of [0, Number.MAX_VALUE, -1, ...nonfinite]) {
      const actual = field === 'estimated_cost'
        ? modelGatewayResponseSchema.safeParse({ ...response, usage: { ...response.usage, estimated_cost: value } }).success
        : modelDefinitionSchema.safeParse({ ...model, [field]: value }).success;
      expect(actual).toBe(Number.isFinite(value) && value >= 0);
    }
  });
  it('keeps the distinct measurement Infinity-compatible domain', () => {
    const value = { source: 'deterministic_simulation', latency_ms: { p50: Infinity, p95: Infinity, p99: Infinity }, cost: { unit: 'synthetic_cost_unit', total: Infinity } };
    expect(measurementEvidenceSchema.safeParse(value).success).toBe(true);
    expect(measurementEvidenceSchema.safeParse({ ...value, cost: { ...value.cost, total: NaN } }).success).toBe(false);
  });
});
