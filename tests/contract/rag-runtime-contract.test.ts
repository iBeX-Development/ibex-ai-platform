import { describe, expect, it } from 'vitest';
import {
  knowledgeMetadataSchema,
  ragIngestionRequestSchema,
  ragRetrievalRequestSchema,
  ragRetrievalResponseSchema
} from '../../packages/rag-runtime/src/index.js';
import {
  ingestionRequest,
  makeDocument,
  ragContext,
  retrievalRequest
} from '../testing/rag-runtime-fixtures.js';

describe('Gate P6 RAG Runtime contracts', () => {
  it('requires an explicit tenant for tenant-private knowledge', () => {
    const metadata = { ...makeDocument().metadata, tenant_id: undefined };
    expect(knowledgeMetadataSchema.safeParse(metadata).success).toBe(false);
  });

  it('forbids tenant identity on shared approved knowledge', () => {
    expect(
      knowledgeMetadataSchema.safeParse({
        ...makeDocument().metadata,
        tenant_scope: 'global_approved'
      }).success
    ).toBe(false);
  });

  it('does not admit live transactional source types', () => {
    expect(
      knowledgeMetadataSchema.safeParse({
        ...makeDocument().metadata,
        source_type: 'work_order_live_record'
      }).success
    ).toBe(false);
  });

  it('keeps trusted context separate from retrieval arguments', () => {
    expect(
      ragRetrievalRequestSchema.safeParse({
        ...retrievalRequest(),
        tenant_id: 'tenant-b'
      }).success
    ).toBe(false);
  });

  it('accepts only an opaque routing decision reference for retrieval scope', () => {
    expect(
      ragRetrievalRequestSchema.safeParse(
        retrievalRequest({
          agent_id: 'warehouse',
          domain: 'warehouse',
          knowledge_scopes: ['warehouse-private']
        })
      ).success
    ).toBe(false);
    const withoutRoutingDecision = retrievalRequest();
    delete withoutRoutingDecision.routing_decision_id;
    expect(ragRetrievalRequestSchema.safeParse(withoutRoutingDecision).success).toBe(false);
  });

  it('keeps trusted context separate from ingestion arguments', () => {
    expect(
      ragIngestionRequestSchema.safeParse({
        ...ingestionRequest(),
        permissions: ['platform:admin']
      }).success
    ).toBe(false);
  });

  it('limits retrieval query and top-k boundaries', () => {
    expect(ragRetrievalRequestSchema.safeParse(retrievalRequest({ top_k: 21 })).success).toBe(
      false
    );
    expect(
      ragRetrievalRequestSchema.safeParse(retrievalRequest({ query: 'x'.repeat(4_001) })).success
    ).toBe(false);
  });

  it('requires explicit untrusted-content and citation evidence in results', () => {
    expect(
      ragRetrievalResponseSchema.safeParse({
        contract_version: '1.0',
        status: 'success',
        request_id: ragContext.request_id,
        correlation_id: ragContext.correlation_id,
        trace_id: 'trace',
        retrieval_version: '1.0',
        results: [{ content: 'unsafe instruction' }]
      }).success
    ).toBe(false);
  });
});
