// Local regression evidence only. Not an official OE-10 execution or policy authority.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { AuditRecord } from '../../packages/audit/src/index.js';
import { PlatformError, toErrorEnvelope } from '../../packages/errors/src/index.js';
import {
  citationEvidenceHashForStoredChunk,
  stableChunkIdForStoredChunk,
  type KnowledgeChunk,
  type RagRuntimeDependencies
} from '../../packages/rag-runtime/src/index.js';
import {
  approvedRetrievalScope,
  createRagRuntime,
  deterministicEmbeddings,
  deterministicRanker,
  DeterministicKnowledgeStore,
  indexedChunk,
  makeDocument,
  ragContext,
  ragValidationTime,
  retrievalRequest
} from '../testing/rag-runtime-fixtures.js';

let allowed: KnowledgeChunk;
let restricted: KnowledgeChunk;
beforeAll(async () => {
  allowed = await indexedChunk();
  restricted = await indexedChunk(
    makeDocument(
      {
        document_id: 'restricted-document-canary',
        title: 'restricted-title-canary',
        source_uri: 'knowledge://restricted-source-canary',
        source_owner: 'restricted-owner-canary'
      },
      'bearing vibration lubrication restricted-content-canary'
    )
  );
});

function observe(
  chunks: readonly KnowledgeChunk[] = [],
  overrides: Partial<RagRuntimeDependencies> = {}
) {
  const audits: AuditRecord[] = [];
  const store = new DeterministicKnowledgeStore(chunks);
  const filter = vi.fn(store.filter.bind(store));
  const upsert = vi.fn(store.upsert.bind(store));
  const embed = vi.fn(deterministicEmbeddings.embed.bind(deterministicEmbeddings));
  const rank = vi.fn(deterministicRanker.rank.bind(deterministicRanker));
  const scope = approvedRetrievalScope();
  const resolve = vi.fn(scope.resolve.bind(scope));
  const runtime = createRagRuntime(audits, {
    ...overrides,
    store: { filter, upsert },
    embeddings: { embed },
    ranker: { rank },
    retrievalScope: overrides.retrievalScope ?? { resolve }
  });
  return { audits, filter, upsert, embed, rank, resolve, runtime };
}
function noDisclosure(value: unknown, chunk = restricted) {
  const serialized = JSON.stringify(value);
  for (const secret of [
    chunk.content,
    chunk.document_id,
    chunk.title,
    chunk.source_uri,
    chunk.source_owner,
    chunk.chunk_id,
    chunk.citation_evidence_hash,
    'private-policy-canary'
  ]) {
    expect(serialized).not.toContain(secret);
  }
}
async function denied(
  h: ReturnType<typeof observe>,
  request: Record<string, unknown>,
  code: string,
  storeCalls: number
) {
  let failure: unknown;
  try {
    await h.runtime.retrieve(request, {}, ragValidationTime);
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(PlatformError);
  expect(failure).toMatchObject({ code });
  const publicError = toErrorEnvelope(failure);
  expect(publicError.error.code).toBe(code);
  noDisclosure({ publicError, audits: h.audits });
  expect(h.audits.at(-1)).toMatchObject({ outcome: 'rejected' });
  expect(h.filter).toHaveBeenCalledTimes(storeCalls);
  expect(h.embed).not.toHaveBeenCalled();
  expect(h.rank).not.toHaveBeenCalled();
  expect(h.upsert).not.toHaveBeenCalled();
  return publicError;
}

describe('F06 local authorization stages (not OE-10)', () => {
  it.each(['permissions', 'entitlements'] as const)(
    'pre-store: missing retrieval %s blocks all data dependencies',
    async (field) => {
      const h = observe([restricted]);
      await denied(
        h,
        retrievalRequest({ context: { ...ragContext, [field]: [] } }),
        'PERMISSION_DENIED',
        0
      );
      expect(h.resolve).not.toHaveBeenCalled();
    }
  );
  it.each(['deny', 'throw', 'malformed'] as const)(
    'pre-store: server policy %s is sanitized',
    async (mode) => {
      const authorize = vi.fn(() => {
        if (mode === 'throw') throw new Error('private-policy-canary');
        return Promise.resolve(
          mode === 'deny'
            ? { allowed: false as const, reason: 'private-policy-canary' }
            : { allowed: true as const, decision_id: '' }
        );
      });
      const h = observe([restricted], { authorization: { authorize } });
      await denied(
        h,
        retrievalRequest(),
        mode === 'deny' ? 'PERMISSION_DENIED' : 'AUTHORIZATION_ERROR',
        0
      );
      expect(authorize).toHaveBeenCalledTimes(1);
      expect(h.resolve).not.toHaveBeenCalled();
    }
  );
  it.each(['tenant_id', 'user_id', 'request_id', 'correlation_id', 'routing_decision_id'] as const)(
    'pre-store: independently conflicting resolved %s is rejected',
    async (field) => {
      const h = observe([restricted], {
        retrievalScope: {
          resolve: async (context, routingId) => {
            const decision = await approvedRetrievalScope().resolve(context, routingId);
            if (!decision.allowed) throw new Error('fixture setup');
            return { ...decision, scope: { ...decision.scope, [field]: 'foreign-binding-canary' } };
          }
        }
      });
      const error = await denied(h, retrievalRequest(), 'TENANT_SCOPE_VIOLATION', 0);
      expect(JSON.stringify({ error, audits: h.audits })).not.toContain('foreign-binding-canary');
    }
  );
  it.each(['deny', 'throw', 'malformed'] as const)(
    'pre-store: scope %s blocks downstream calls',
    async (mode) => {
      const approvedDecision = await approvedRetrievalScope().resolve(ragContext, 'routing-rag-1');
      if (!approvedDecision.allowed) throw new Error('fixture setup');
      const h = observe([restricted], {
        retrievalScope: {
          resolve: () => {
            if (mode === 'throw') throw new Error('private-policy-canary');
            if (mode === 'malformed') {
              return Promise.resolve({ ...approvedDecision, decision_id: '' });
            }
            return Promise.resolve({ allowed: false, reason: 'private-policy-canary' });
          }
        }
      });
      await denied(
        h,
        retrievalRequest(),
        mode === 'deny' ? 'PERMISSION_DENIED' : 'AUTHORIZATION_ERROR',
        0
      );
    }
  );
  it.each(['tenant_id', 'agent_id', 'domain', 'knowledge_scopes'] as const)(
    'pre-store: caller-supplied %s cannot override server scope',
    async (field) => {
      const h = observe([restricted]);
      await denied(h, retrievalRequest({ [field]: 'caller-override-canary' }), 'INVALID_INPUT', 0);
    }
  );

  // Metadata mutations are independently authored. Recompute integrity so these
  // exercise authorization filtering, not an earlier hash-integrity rejection.
  const dimensions: [string, (chunk: KnowledgeChunk) => KnowledgeChunk][] = [
    ['tenant', (chunk) => ({ ...chunk, tenant_id: 'foreign-tenant-canary' })],
    [
      'document permission',
      (chunk) => ({
        ...chunk,
        access_scope: { ...chunk.access_scope, required_permissions: ['synthetic-ungranted'] }
      })
    ],
    [
      'document entitlement',
      (chunk) => ({
        ...chunk,
        access_scope: { ...chunk.access_scope, required_entitlements: ['synthetic-ungranted'] }
      })
    ],
    [
      'role',
      (chunk) => ({
        ...chunk,
        access_scope: { ...chunk.access_scope, allowed_roles: ['synthetic-other-role'] }
      })
    ],
    ['agent', (chunk) => ({ ...chunk, allowed_agents: ['synthetic-other-agent'] })],
    ['domain', (chunk) => ({ ...chunk, domains: ['synthetic-other-domain'] })],
    ['knowledge scope', (chunk) => ({ ...chunk, knowledge_scopes: ['synthetic-other-scope'] })]
  ];
  function candidate(mutate: (chunk: KnowledgeChunk) => KnowledgeChunk) {
    const changed = mutate(restricted);
    return {
      ...changed,
      chunk_id: stableChunkIdForStoredChunk(changed),
      citation_evidence_hash: citationEvidenceHashForStoredChunk(changed)
    };
  }
  it.each(dimensions)(
    'store filtering: %s excludes inaccessible candidates before embedding/ranking',
    async (_name, mutate) => {
      const chunk = candidate(mutate);
      const h = observe([chunk]);
      const response = await h.runtime.retrieve(retrievalRequest(), {}, ragValidationTime);
      expect(response).toEqual({
        contract_version: '1.0',
        status: 'success',
        request_id: 'request-rag-1',
        correlation_id: 'correlation-rag-1',
        trace_id: 'rag-trace-2',
        retrieval_version: 'rag-retrieval-1.0',
        results: []
      });
      noDisclosure({ response, audits: h.audits }, chunk);
      expect(h.filter).toHaveBeenCalledTimes(1);
      expect(h.embed).not.toHaveBeenCalled();
      expect(h.rank).not.toHaveBeenCalled();
      expect(h.upsert).not.toHaveBeenCalled();
    }
  );
  it.each(dimensions)(
    'post-store validation: malicious store %s cannot reach embedding/ranking',
    async (_name, mutate) => {
      const chunk = candidate(mutate);
      const h = observe();
      h.filter.mockResolvedValue([chunk]);
      const error = await denied(h, retrievalRequest(), 'TENANT_SCOPE_VIOLATION', 1);
      noDisclosure({ error, audits: h.audits }, chunk);
      expect(h.audits.at(-1)).toMatchObject({ stage: 'security_filter' });
    }
  );
  it('positive control: exact authorized metadata reaches independent store/embed/ranker observers', async () => {
    const h = observe([allowed]);
    const response = await h.runtime.retrieve(retrievalRequest(), {}, ragValidationTime);
    expect(h.filter).toHaveBeenCalledTimes(1);
    expect(h.embed).toHaveBeenCalledTimes(1);
    expect(h.rank).toHaveBeenCalledTimes(1);
    expect(h.rank.mock.calls[0]?.[0].candidates).toEqual([allowed]);
    expect(response.results).toHaveLength(1);
    expect(response.results[0]?.content).toBe(allowed.content);
    expect(h.filter.mock.calls[0]?.[0]).toMatchObject({
      tenant_id: ragContext.tenant_id,
      user_id: ragContext.user_id,
      role: ragContext.role,
      permissions: ragContext.permissions,
      entitlements: ragContext.entitlements,
      agent_id: 'maintenance-agent',
      domain: 'maintenance',
      knowledge_scopes: ['maintenance-manuals']
    });
    noDisclosure({ response, audits: h.audits });
  });
  it('mixed store: foreign artifacts never enter ranker, complete response or audit', async () => {
    const foreign = candidate((chunk) => ({ ...chunk, tenant_id: 'foreign-tenant-canary' }));
    const h = observe([allowed, foreign]);
    const response = await h.runtime.retrieve(retrievalRequest(), {}, ragValidationTime);
    expect(h.rank.mock.calls[0]?.[0].candidates).toEqual([allowed]);
    expect(h.embed).toHaveBeenCalledTimes(1);
    expect(h.rank).toHaveBeenCalledTimes(1);
    expect(response.results).toHaveLength(1);
    noDisclosure({ response, audits: h.audits, rankerCalls: h.rank.mock.calls }, foreign);
  });
});
