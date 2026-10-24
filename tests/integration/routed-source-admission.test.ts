import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { AuditRecord } from '../../packages/audit/src/index.js';
import { PlatformError, toErrorEnvelope } from '../../packages/errors/src/index.js';
import type {
  KnowledgeChunk,
  RagSecurityFilter,
  RagRetrievalScopePort
} from '../../packages/rag-runtime/src/index.js';
import { createTrustedRequestContext } from '../../packages/security/src/index.js';
import type { SharedAgentRuntimeDependencies } from '../../packages/runtime/src/index.js';
import { bindRagInvocation } from '../testing/rag-routing-binding.js';
import {
  createAdmittedRetrieval,
  SyntheticAdmissionAuthority,
  type AdmissionIdentity
} from '../testing/source-admission.js';
import {
  createRuntime,
  runtimeContext,
  runtimeValidationTime
} from '../testing/runtime-fixtures.js';
import {
  createRagRuntime,
  deterministicEmbeddings,
  deterministicRanker,
  indexedChunk,
  makeDocument,
  ragValidationTime
} from '../testing/rag-runtime-fixtures.js';

const context = createTrustedRequestContext({
  ...runtimeContext,
  role: 'maintenance_technician',
  permissions: ['maintenance:read', 'rag:read', 'maintenance:knowledge'],
  entitlements: ['ai:general', 'rag-runtime']
});
let chunk: KnowledgeChunk;
let identity: AdmissionIdentity;
beforeAll(async () => {
  chunk = await indexedChunk(makeDocument({ knowledge_scopes: ['maintenance-approved'] }));
  identity = {
    source_id: 'synthetic-source-1',
    source_version: 'source-v1',
    checksum: chunk.document_checksum,
    checksum_representation: 'ibex-rag-canonical-document-content-v1',
    document_id: chunk.document_id,
    document_version: chunk.document_version
  };
});
function harness(
  options: {
    enabled?: boolean;
    environment?: string;
    record?: Record<string, unknown>;
    routing?: Partial<SharedAgentRuntimeDependencies>;
  } = {}
) {
  const audits: AuditRecord[] = [];
  const authority = new SyntheticAdmissionAuthority({
    identity,
    issuer: 'synthetic-admission-authority',
    decision_id: 'synthetic-human-decision-1',
    revision: 1,
    tenant_id: context.tenant_id,
    source_owner: chunk.source_owner,
    source_uri: chunk.source_uri,
    ownership_verified: true,
    ownership_evidence: 'synthetic-ownership',
    human_approval: true,
    human_approval_evidence: 'synthetic-approval',
    lifecycle_evidence: 'synthetic-lifecycle',
    conditions_satisfied: true,
    state: 'active',
    ...options.record
  });
  const readExact = vi.fn<
    (
      identity: AdmissionIdentity,
      evidence: ReturnType<SyntheticAdmissionAuthority['admit']>['evidence'],
      filter: RagSecurityFilter,
      signal: AbortSignal
    ) => Promise<KnowledgeChunk[]>
  >(() => Promise.resolve([chunk]));
  const embed = vi.fn(deterministicEmbeddings.embed.bind(deterministicEmbeddings));
  const rank = vi.fn(deterministicRanker.rank.bind(deterministicRanker));
  const build = vi.fn((port: RagRetrievalScopePort) => {
    const admitted = createAdmittedRetrieval({
      ...(options.enabled === undefined ? {} : { enabled: options.enabled }),
      environment: options.environment ?? 'test',
      authority,
      identity,
      context,
      dependencies: { store: { readExact }, embeddings: { embed }, ranker: { rank } },
      build: (dependencies) => createRagRuntime(audits, { ...dependencies, retrievalScope: port })
    });
    const retriever: ReturnType<Parameters<typeof bindRagInvocation>[2]> = {
      retrieve: (raw, execution, now) => {
        // bindRagInvocation supplies an empty execution object; caller options cannot bypass the lease.
        if (
          Object.keys(execution ?? {}).length ||
          typeof raw !== 'object' ||
          raw === null ||
          Array.isArray(raw)
        )
          return Promise.reject(new PlatformError('PERMISSION_DENIED', 'Composition denied', 403));
        return admitted.retrieve(raw as Record<string, unknown>, now ?? ragValidationTime);
      }
    };
    return retriever;
  });
  const start = () =>
    bindRagInvocation(
      createRuntime(audits, options.routing),
      { context, trace_id: 'composed-trace', input: { message: 'maintenance lookup' } },
      build,
      runtimeValidationTime
    );
  return { start, build, readExact, embed, rank, authority, audits };
}
function request(id: string, changes: Record<string, unknown> = {}) {
  return {
    context,
    trace_id: 'composed-trace',
    routing_decision_id: id,
    query: 'bearing vibration lubrication',
    top_k: 5,
    ...changes
  };
}
function counts(h: ReturnType<typeof harness>, store = 0, embed = 0, rank = 0) {
  expect(h.readExact).toHaveBeenCalledTimes(store);
  expect(h.embed).toHaveBeenCalledTimes(embed);
  expect(h.rank).toHaveBeenCalledTimes(rank);
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
describe('actual routing plus exact source admission composition, test-only', () => {
  it('delivers admitted content using only the actual decision scope and bound evidence', async () => {
    const h = harness({ enabled: true });
    const b = await h.start();
    const response = await b.retrieve(request(b.routingId), ragValidationTime);
    expect(response.results[0]?.content).toBe(chunk.content);
    counts(h, 1, 1, 1);
    expect(h.readExact).toHaveBeenCalledWith(
      identity,
      expect.objectContaining({
        identity,
        context,
        decision_id: 'synthetic-human-decision-1',
        revision: 1
      }),
      expect.objectContaining({
        tenant_id: context.tenant_id,
        user_id: context.user_id,
        agent_id: b.decision.selected_agent,
        domain: b.decision.domain,
        knowledge_scopes: b.decision.rag_scopes
      }),
      expect.any(AbortSignal)
    );
    expect(b.decision.rag_scopes).toEqual(['maintenance-approved']);
  });
  it.each([{}, { enabled: false }, { enabled: true, environment: 'production' }])(
    'denies unless explicitly enabled in test mode %j',
    async (options) => {
      const h = harness(options);
      const b = await h.start();
      await expect(b.retrieve(request(b.routingId), ragValidationTime)).rejects.toBeDefined();
      counts(h);
    }
  );
  it('does not construct admission retrieval when actual routing has no RAG plan', async () => {
    const h = harness({
      enabled: true,
      routing: { ragPlanning: { plan: () => Promise.resolve({ required: false, scopes: [] }) } }
    });
    await expect(h.start()).rejects.toBeDefined();
    expect(h.build).not.toHaveBeenCalled();
    counts(h);
  });
  it.each(['routing_decision_id', 'trace_id', 'context', 'knowledge_scopes'])(
    'denies forged %s before exact store access',
    async (field) => {
      const h = harness({ enabled: true });
      const b = await h.start();
      const value =
        field === 'context'
          ? { ...context, tenant_id: 'tenant-b' }
          : field === 'knowledge_scopes'
            ? ['all']
            : 'forged';
      await expect(
        b.retrieve(request(b.routingId, { [field]: value }), ragValidationTime)
      ).rejects.toBeDefined();
      counts(h);
    }
  );
  it('does not let a valid route substitute for source approval', async () => {
    const h = harness({ enabled: true, record: { human_approval: false } });
    const b = await h.start();
    expect(b.decision.rag_required).toBe(true);
    await expect(b.retrieve(request(b.routingId), ragValidationTime)).rejects.toBeDefined();
    counts(h);
  });
  it('rejects a different returned document despite valid route and admission', async () => {
    const h = harness({ enabled: true });
    const b = await h.start();
    h.readExact.mockResolvedValue([{ ...chunk, document_version: 'other' }]);
    await expect(b.retrieve(request(b.routingId), ragValidationTime)).rejects.toBeDefined();
    counts(h, 1);
  });
  it('withdraws pending exact read and prevents reuse of the same valid routing binding', async () => {
    const h = harness({ enabled: true });
    const b = await h.start();
    const entered = deferred<undefined>();
    const pending = deferred<KnowledgeChunk[]>();
    h.readExact.mockImplementation(() => {
      entered.resolve(undefined);
      return pending.promise;
    });
    const result = b
      .retrieve(request(b.routingId), ragValidationTime)
      .catch((error: unknown) => error);
    await entered.promise;
    h.authority.withdraw();
    const error = await result;
    expect(error).toMatchObject({ code: 'TIMEOUT_ERROR', message: 'RAG request was cancelled' });
    expect(h.readExact.mock.calls[0]?.[3].aborted).toBe(true);
    pending.resolve([chunk]);
    await new Promise<void>((resolve) => setImmediate(resolve));
    await expect(b.retrieve(request(b.routingId), ragValidationTime)).rejects.toBeDefined();
    counts(h, 1);
    const publicData = JSON.stringify({ error: toErrorEnvelope(error), audits: h.audits });
    expect(publicData).not.toContain(chunk.content);
    expect(publicData).not.toContain('synthetic-human-decision-1');
  });
});
