import { describe, expect, it, vi } from 'vitest';
import { createTrustedRequestContext } from '../../packages/security/src/index.js';
import type { RetrievalRankerPort } from '../../packages/rag-runtime/src/index.js';
import {
  DeterministicKnowledgeStore,
  approvedRetrievalScope,
  createRagRuntime,
  deterministicRanker,
  indexedChunk,
  makeDocument,
  ragContext,
  ragValidationTime,
  retrievalRequest
} from '../testing/rag-runtime-fixtures.js';

describe('Gate P6 RAG tenant isolation', () => {
  it('denies ingestion when private knowledge ownership does not match trusted tenant context', async () => {
    const runtime = createRagRuntime([]);
    const document = makeDocument({ tenant_id: 'tenant-b', source_owner: 'tenant-b-engineering' });

    await expect(
      runtime.ingest(
        {
          context: ragContext,
          trace_id: 'rag-cross-tenant-ingest',
          agent_id: 'maintenance-agent',
          document
        },
        {},
        ragValidationTime
      )
    ).rejects.toMatchObject({ code: 'TENANT_SCOPE_VIOLATION' });
  });

  it('never passes another tenant private chunk to semantic ranking', async () => {
    const tenantAChunk = await indexedChunk();
    const tenantBChunk = { ...tenantAChunk, tenant_id: 'tenant-b' };
    const store = new DeterministicKnowledgeStore([tenantAChunk, tenantBChunk]);
    const rank = vi.fn<RetrievalRankerPort['rank']>((request) => deterministicRanker.rank(request));
    const runtime = createRagRuntime([], { store, ranker: { rank } });

    const response = await runtime.retrieve(retrievalRequest(), {}, ragValidationTime);

    expect(response.results).toHaveLength(1);
    expect(rank.mock.calls[0]?.[0].candidates).toEqual([
      expect.objectContaining({ tenant_id: 'tenant-a' })
    ]);
  });

  it('excludes approved documents when permission, entitlement, or role access is missing', async () => {
    const chunk = await indexedChunk();
    const store = new DeterministicKnowledgeStore([chunk]);
    const runtime = createRagRuntime([], { store });
    const contexts = [
      createTrustedRequestContext({ ...ragContext, permissions: ['rag:read'] }),
      createTrustedRequestContext({ ...ragContext, entitlements: [] }),
      createTrustedRequestContext({ ...ragContext, role: 'viewer' })
    ];

    for (const context of contexts) {
      if (context.entitlements.length === 0) {
        await expect(
          runtime.retrieve(retrievalRequest({ context }), {}, ragValidationTime)
        ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
      } else {
        const response = await runtime.retrieve(
          retrievalRequest({ context }),
          {},
          ragValidationTime
        );
        expect(response.results).toEqual([]);
      }
    }
  });

  it('rejects a model-supplied tenant override at the request boundary', async () => {
    const rank = vi.fn<RetrievalRankerPort['rank']>();
    const runtime = createRagRuntime([], { ranker: { rank } });

    await expect(
      runtime.retrieve(
        retrievalRequest({ tenant_id: 'tenant-b', requested_tenant: 'tenant-b' }),
        {},
        ragValidationTime
      )
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(rank).not.toHaveBeenCalled();
  });

  it('rejects caller attempts to widen agent, domain, or knowledge scope', async () => {
    const rank = vi.fn<RetrievalRankerPort['rank']>();
    const runtime = createRagRuntime([], { ranker: { rank } });

    await expect(
      runtime.retrieve(
        retrievalRequest({
          agent_id: 'warehouse',
          domain: 'warehouse',
          knowledge_scopes: ['warehouse-private']
        }),
        {},
        ragValidationTime
      )
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(rank).not.toHaveBeenCalled();
  });

  it('allows globally approved knowledge only through the same access and domain filters', async () => {
    const globalDocument = makeDocument({
      tenant_scope: 'global_approved',
      tenant_id: undefined,
      source_owner: 'ibex',
      classification: 'internal'
    });
    const globalChunk = await indexedChunk(globalDocument);
    const store = new DeterministicKnowledgeStore([globalChunk]);
    const runtime = createRagRuntime([], { store });

    const allowed = await runtime.retrieve(retrievalRequest(), {}, ragValidationTime);
    const wrongDomain = await createRagRuntime([], {
      store,
      retrievalScope: approvedRetrievalScope({ domain: 'warehouse' })
    }).retrieve(retrievalRequest(), {}, ragValidationTime);

    expect(allowed.results).toHaveLength(1);
    expect(wrongDomain.results).toEqual([]);
  });

  it('preserves trusted request, correlation, and trace identifiers in responses', async () => {
    const chunk = await indexedChunk();
    const runtime = createRagRuntime([], { store: new DeterministicKnowledgeStore([chunk]) });

    const response = await runtime.retrieve(retrievalRequest(), {}, ragValidationTime);

    expect(response).toMatchObject({
      request_id: ragContext.request_id,
      correlation_id: ragContext.correlation_id,
      trace_id: 'rag-trace-2'
    });
  });
});
