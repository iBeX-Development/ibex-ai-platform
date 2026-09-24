import type { AuditRecord } from '../../packages/audit/src/index.js';
import { createTrustedRequestContext } from '../../packages/security/src/index.js';
import {
  RagRuntimeService,
  calculateDocumentChecksum,
  matchesRagSecurityFilter,
  type EmbeddingPort,
  type KnowledgeChunk,
  type KnowledgeDocument,
  type KnowledgeGovernancePort,
  type KnowledgeMetadata,
  type KnowledgeStorePort,
  type RagRuntimeDependencies,
  type RagSecurityFilter,
  type RetrievalRankerPort
} from '../../packages/rag-runtime/src/index.js';

export const ragValidationTime = new Date('2026-01-15T00:00:00.000Z');

export const ragContext = createTrustedRequestContext({
  tenant_id: 'tenant-a',
  user_id: 'user-1',
  role: 'maintenance_technician',
  permissions: ['rag:read', 'rag:publish', 'maintenance:knowledge'],
  entitlements: ['rag-runtime'],
  session_id: 'session-rag-1',
  request_id: 'request-rag-1',
  correlation_id: 'correlation-rag-1',
  channel: 'web',
  locale: 'mn-MN'
});

export function makeDocument(
  metadataOverrides: Partial<KnowledgeMetadata> = {},
  content = 'Inspect bearing vibration before lubrication.'
): KnowledgeDocument {
  const sections = [
    {
      location: {
        section: '6.4 Lubrication',
        reference: 'section-6.4',
        page: 42,
        ordinal: 0
      },
      content
    }
  ] as const;
  const metadata: KnowledgeMetadata = {
    document_id: 'pump-manual',
    document_version: '3.2',
    title: 'Pump Maintenance Manual',
    source_type: 'approved_manual',
    source_owner: 'tenant-a-engineering',
    tenant_scope: 'tenant_private',
    tenant_id: 'tenant-a',
    domains: ['maintenance'],
    knowledge_scopes: ['maintenance-manuals'],
    allowed_agents: ['maintenance'],
    classification: 'tenant_confidential',
    approval_status: 'approved',
    effective_date: '2026-01-01T00:00:00.000Z',
    language: 'en',
    source_uri: 'knowledge://pump-manual/3.2',
    checksum: `sha256:${'0'.repeat(64)}`,
    access_scope: {
      required_permissions: ['maintenance:knowledge'],
      required_entitlements: ['rag-runtime'],
      allowed_roles: ['maintenance_technician']
    },
    created_at: '2025-12-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...metadataOverrides
  };
  const provisional = { metadata, sections } as KnowledgeDocument;
  return Object.freeze({
    metadata: Object.freeze({ ...metadata, checksum: calculateDocumentChecksum(provisional) }),
    sections: Object.freeze(sections.map((section) => Object.freeze(section)))
  });
}

export function ingestionRequest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    context: ragContext,
    trace_id: 'rag-trace-1',
    agent_id: 'maintenance',
    document: makeDocument(),
    ...overrides
  };
}

export function retrievalRequest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    context: ragContext,
    trace_id: 'rag-trace-2',
    agent_id: 'maintenance',
    query: 'bearing vibration lubrication',
    domain: 'maintenance',
    knowledge_scopes: ['maintenance-manuals'],
    top_k: 5,
    ...overrides
  };
}

export const deterministicEmbeddings: EmbeddingPort = {
  embed: ({ content }) => {
    const normalized = content.toLowerCase();
    const length = Math.max(normalized.length, 1);
    let characterTotal = 0;
    for (const character of normalized) characterTotal += character.codePointAt(0) ?? 0;
    return Promise.resolve({
      model_id: 'deterministic-test-embedding',
      model_version: '1.0',
      vector: [Math.min(length / 4_000, 1), (characterTotal % 997) / 997]
    });
  }
};

export class DeterministicKnowledgeStore implements KnowledgeStorePort {
  readonly chunks: KnowledgeChunk[] = [];
  readonly filters: RagSecurityFilter[] = [];

  constructor(initial: readonly KnowledgeChunk[] = []) {
    this.chunks.push(...initial);
  }

  upsert(chunks: readonly KnowledgeChunk[]): Promise<void> {
    for (const chunk of chunks) {
      const existing = this.chunks.findIndex(({ chunk_id }) => chunk_id === chunk.chunk_id);
      if (existing >= 0) this.chunks.splice(existing, 1, chunk);
      else this.chunks.push(chunk);
    }
    return Promise.resolve();
  }

  filter(filter: RagSecurityFilter): Promise<unknown> {
    this.filters.push(filter);
    const accessible = this.chunks.filter((chunk) => matchesRagSecurityFilter(chunk, filter));
    const latestByDocument = new Map<string, KnowledgeChunk>();
    for (const chunk of accessible) {
      const previous = latestByDocument.get(chunk.document_id);
      if (
        !previous ||
        Date.parse(chunk.document_updated_at) > Date.parse(previous.document_updated_at)
      ) {
        latestByDocument.set(chunk.document_id, chunk);
      }
    }
    const latestVersions = new Set(
      [...latestByDocument.values()].map(
        ({ document_id, document_version }) => `${document_id}\u0000${document_version}`
      )
    );
    return Promise.resolve(
      accessible.filter(({ document_id, document_version }) =>
        latestVersions.has(`${document_id}\u0000${document_version}`)
      )
    );
  }
}

export const deterministicRanker: RetrievalRankerPort = {
  rank: ({ query, candidates, top_k }) => {
    const terms = query.toLowerCase().split(/\s+/u);
    return Promise.resolve(
      candidates
        .map((chunk) => {
          const matches = terms.filter((term) => chunk.content.toLowerCase().includes(term)).length;
          const keyword = terms.length === 0 ? 0 : matches / terms.length;
          const semantic = keyword > 0 ? 0.8 : 0.2;
          return {
            chunk_id: chunk.chunk_id,
            score: Math.min(semantic * 0.7 + keyword * 0.3, 1),
            semantic_score: semantic,
            keyword_score: keyword
          };
        })
        .sort((left, right) => right.score - left.score)
        .slice(0, top_k)
    );
  }
};

export const approvedGovernance: KnowledgeGovernancePort = {
  authorizeIngestion: () => Promise.resolve({ allowed: true, decision_id: 'rag-governance-1' })
};

export function createRagRuntime(
  audits: AuditRecord[],
  overrides: Partial<RagRuntimeDependencies> = {}
): RagRuntimeService {
  return new RagRuntimeService({
    authorization: {
      authorize: () => Promise.resolve({ allowed: true, decision_id: 'rag-auth-1' })
    },
    governance: approvedGovernance,
    embeddings: deterministicEmbeddings,
    store: new DeterministicKnowledgeStore(),
    ranker: deterministicRanker,
    audit: {
      emit: (event) => {
        audits.push(event);
        return Promise.resolve();
      }
    },
    policy: {
      ingestion_permissions: ['rag:publish'],
      ingestion_entitlements: ['rag-runtime'],
      retrieval_permissions: ['rag:read'],
      retrieval_entitlements: ['rag-runtime'],
      timeout_ms: 1_000,
      retrieval_version: 'rag-retrieval-1.0'
    },
    service: 'rag-runtime-test',
    environment: 'test',
    traceIdFactory: () => 'generated-rag-trace',
    clock: () => ragValidationTime.getTime(),
    ...overrides
  });
}

export async function indexedChunk(
  document = makeDocument(),
  overrides: Partial<RagRuntimeDependencies> = {}
): Promise<KnowledgeChunk> {
  const store = new DeterministicKnowledgeStore();
  const runtime = createRagRuntime([], { store, ...overrides });
  await runtime.ingest(ingestionRequest({ document }), {}, ragValidationTime);
  const chunk = store.chunks[0];
  if (!chunk) throw new Error('Expected deterministic chunk');
  return chunk;
}
