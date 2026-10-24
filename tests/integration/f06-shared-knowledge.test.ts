// Local shared-knowledge regression only; synthetic grants are not policy authority.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { AuditRecord } from '../../packages/audit/src/index.js';
import { PlatformError, toErrorEnvelope } from '../../packages/errors/src/index.js';
import type { KnowledgeChunk, KnowledgeMetadata } from '../../packages/rag-runtime/src/index.js';
import { createRagRuntime, deterministicEmbeddings, deterministicRanker, DeterministicKnowledgeStore,
  indexedChunk, makeDocument, ragContext, ragValidationTime, retrievalRequest } from '../testing/rag-runtime-fixtures.js';

const scopes = ['global_approved', 'domain_approved'] as const;
type Scope = typeof scopes[number];
const fixtures = new Map<Scope, KnowledgeChunk>();
beforeAll(async () => {
  for (const scope of scopes) {
    // Authored non-private document input, not a private indexed chunk relabeled shared.
    fixtures.set(scope, await indexedChunk(makeDocument({
      document_id: `${scope}-restricted-document-canary`, document_version: '1.0',
      title: `${scope}-restricted-title-canary`, source_type: 'approved_manual',
      source_owner: `${scope}-owner-canary`, tenant_scope: scope, tenant_id: undefined,
      classification: 'restricted', domains: ['maintenance'], allowed_agents: ['maintenance-agent'],
      knowledge_scopes: ['maintenance-manuals'], source_uri: `knowledge://${scope}-source-canary`,
      access_scope: { required_permissions: ['maintenance:knowledge'], required_entitlements: ['rag-runtime'],
        allowed_roles: ['maintenance_technician'] },
    }, `bearing vibration lubrication ${scope}-restricted-content-canary`)));
  }
});
function fixture(scope: Scope): KnowledgeChunk {
  const chunk = fixtures.get(scope);
  if (!chunk) throw new Error('fixture unavailable');
  return chunk;
}
const restrictions: [string, Partial<KnowledgeMetadata>][] = [
  ['permission', { access_scope: { required_permissions: ['synthetic-ungranted-permission'], required_entitlements: ['rag-runtime'], allowed_roles: ['maintenance_technician'] } }],
  ['entitlement', { access_scope: { required_permissions: ['maintenance:knowledge'], required_entitlements: ['synthetic-ungranted-entitlement'], allowed_roles: ['maintenance_technician'] } }],
  ['role', { access_scope: { required_permissions: ['maintenance:knowledge'], required_entitlements: ['rag-runtime'], allowed_roles: ['synthetic-other-role'] } }],
  ['agent', { allowed_agents: ['synthetic-other-agent'] }],
  ['domain', { domains: ['synthetic-other-domain'] }],
  ['knowledge scope', { knowledge_scopes: ['synthetic-other-scope'] }],
];
function observe(chunks: readonly KnowledgeChunk[]) {
  const audits: AuditRecord[] = [];
  const store = new DeterministicKnowledgeStore(chunks);
  const filter = vi.fn(store.filter.bind(store));
  const upsert = vi.fn(store.upsert.bind(store));
  const embed = vi.fn(deterministicEmbeddings.embed.bind(deterministicEmbeddings));
  const rank = vi.fn(deterministicRanker.rank.bind(deterministicRanker));
  const runtime = createRagRuntime(audits, { store: { filter, upsert }, embeddings: { embed }, ranker: { rank } });
  return { audits, filter, upsert, embed, rank, runtime };
}
function noDisclosure(value: unknown, chunk: KnowledgeChunk) {
  const serialized = JSON.stringify(value);
  for (const marker of [chunk.content, chunk.document_id, chunk.title, chunk.source_uri, chunk.source_owner,
    chunk.chunk_id, chunk.content_hash, chunk.citation_evidence_hash]) expect(serialized).not.toContain(marker);
}
function counts(h: ReturnType<typeof observe>, filter: number, embed: number, rank: number) {
  expect(h.filter).toHaveBeenCalledTimes(filter);
  expect(h.embed).toHaveBeenCalledTimes(embed);
  expect(h.rank).toHaveBeenCalledTimes(rank);
  expect(h.upsert).toHaveBeenCalledTimes(0);
}
const responseBase = { contract_version: '1.0', status: 'success', request_id: 'request-rag-1',
  correlation_id: 'correlation-rag-1', trace_id: 'rag-trace-2', retrieval_version: 'rag-retrieval-1.0' };

describe.each(scopes)('F06 %s restricted knowledge (local only)', scope => {
  it.each(restrictions)('compliant-store filtering excludes %s without semantic work', async (_name, restriction) => {
    const chunk: KnowledgeChunk = { ...fixture(scope), ...restriction };
    const h = observe([chunk]);
    const response = await h.runtime.retrieve(retrievalRequest(), {}, ragValidationTime);
    expect(response).toEqual({ ...responseBase, results: [] });
    counts(h, 1, 0, 0);
    noDisclosure({ response, audits: h.audits }, chunk);
    expect(h.audits.at(-1)).toMatchObject({ outcome: 'succeeded', result_count: 0 });
  });
  it.each(restrictions)('malicious-store %s return is rejected after one store call', async (_name, restriction) => {
    const chunk: KnowledgeChunk = { ...fixture(scope), ...restriction };
    const h = observe([]);
    h.filter.mockResolvedValue([chunk]);
    let failure: unknown;
    try { await h.runtime.retrieve(retrievalRequest(), {}, ragValidationTime); } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(PlatformError);
    expect(failure).toMatchObject({ code: 'TENANT_SCOPE_VIOLATION', statusCode: 403 });
    const publicError = toErrorEnvelope(failure);
    expect(publicError).toEqual({ error: { code: 'TENANT_SCOPE_VIOLATION',
      message: 'Knowledge retrieval violated the authorized scope', request_id: 'request-rag-1', trace_id: 'rag-trace-2' } });
    counts(h, 1, 0, 0);
    noDisclosure({ publicError, audits: h.audits }, chunk);
    expect(h.audits.at(-1)).toMatchObject({ outcome: 'rejected', stage: 'security_filter' });
  });
  it('authorized Tenant A control retrieves restricted shared content through every observer', async () => {
    const chunk = fixture(scope);
    expect(chunk.tenant_scope).toBe(scope);
    expect(chunk.tenant_id).toBeUndefined();
    expect(chunk.classification).toBe('restricted');
    const h = observe([chunk]);
    const response = await h.runtime.retrieve(retrievalRequest(), {}, ragValidationTime);
    counts(h, 1, 1, 1);
    expect(h.filter.mock.calls[0]?.[0]).toMatchObject({ tenant_id: 'tenant-a', role: ragContext.role,
      permissions: ragContext.permissions, entitlements: ragContext.entitlements, agent_id: 'maintenance-agent',
      domain: 'maintenance', knowledge_scopes: ['maintenance-manuals'] });
    expect(h.rank.mock.calls[0]?.[0].candidates).toEqual([chunk]);
    expect(response).toMatchObject({ ...responseBase, results: [{ content: chunk.content,
      content_trust: 'untrusted_retrieved_content', instruction_authority: 'none' }] });
    expect(response.results).toHaveLength(1);
    expect(JSON.stringify(h.audits)).not.toContain(chunk.content);
    expect(JSON.stringify({ response, audits: h.audits })).not.toContain(chunk.source_owner);
  });
});
