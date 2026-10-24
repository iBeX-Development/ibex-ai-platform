import { describe, expect, it, vi } from 'vitest';
import type { AuditRecord } from '../../packages/audit/src/index.js';
import { createTrustedRequestContext } from '../../packages/security/src/index.js';
import {
  AgentRegistry,
  type SharedAgentRuntimeDependencies
} from '../../packages/runtime/src/index.js';
import { enabledTestFeatureControls } from '../../packages/testing/src/index.js';
import type { RagRetrievalScopePort } from '../../packages/rag-runtime/src/index.js';
import { bindRagInvocation } from '../testing/rag-routing-binding.js';
import {
  createRuntime,
  runtimeContext,
  runtimeValidationTime,
  maintenanceAgent
} from '../testing/runtime-fixtures.js';
import {
  createRagRuntime,
  deterministicEmbeddings,
  deterministicRanker,
  DeterministicKnowledgeStore,
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
function harness(overrides: Partial<SharedAgentRuntimeDependencies> = {}) {
  const routingAudits: AuditRecord[] = [];
  const store = new DeterministicKnowledgeStore();
  const filter = vi.fn(store.filter.bind(store));
  const embed = vi.fn(deterministicEmbeddings.embed.bind(deterministicEmbeddings));
  const rank = vi.fn(deterministicRanker.rank.bind(deterministicRanker));
  const upsert = vi.fn(store.upsert.bind(store));
  const build = vi.fn((port: RagRetrievalScopePort) =>
    createRagRuntime([], {
      retrievalScope: port,
      store: { filter, upsert },
      embeddings: { embed },
      ranker: { rank }
    })
  );
  const start = () =>
    bindRagInvocation(
      createRuntime(routingAudits, overrides),
      { context, trace_id: 'composition-trace', input: { message: 'maintenance lookup' } },
      build,
      runtimeValidationTime
    );
  return { start, build, filter, embed, rank, store, upsert, routingAudits };
}
function request(id: string, overrides: Record<string, unknown> = {}) {
  return {
    context,
    trace_id: 'composition-trace',
    routing_decision_id: id,
    query: 'bearing vibration lubrication',
    top_k: 5,
    ...overrides
  };
}
function zero(h: ReturnType<typeof harness>) {
  expect(h.filter).toHaveBeenCalledTimes(0);
  expect(h.embed).toHaveBeenCalledTimes(0);
  expect(h.rank).toHaveBeenCalledTimes(0);
  expect(h.upsert).toHaveBeenCalledTimes(0);
}
describe('invocation-scoped Orchestrator to RAG test composition', () => {
  it('uses a real successful decision and original context for authorized retrieval', async () => {
    const h = harness();
    h.store.chunks.push(
      await indexedChunk(makeDocument({ knowledge_scopes: ['maintenance-approved'] }))
    );
    const binding = await h.start();
    expect(h.routingAudits.at(-1)).toMatchObject({ outcome: 'routed' });
    expect(binding.scope).toEqual({
      routing_decision_id: binding.routingId,
      tenant_id: context.tenant_id,
      user_id: context.user_id,
      request_id: context.request_id,
      correlation_id: context.correlation_id,
      agent_id: binding.decision.selected_agent,
      agent_version: binding.decision.agent_version,
      domain: binding.decision.domain,
      knowledge_scopes: binding.decision.rag_scopes
    });
    expect(binding.decision.required_capabilities).toEqual(['maintenance:read']);
    const response = await binding.retrieve(request(binding.routingId), ragValidationTime);
    expect(response.results).toHaveLength(1);
    expect(h.filter).toHaveBeenCalledTimes(1);
    expect(h.embed).toHaveBeenCalledTimes(1);
    expect(h.rank).toHaveBeenCalledTimes(1);
    expect(h.upsert).toHaveBeenCalledTimes(0);
    expect(h.filter.mock.calls[0]?.[0]).toMatchObject({
      agent_id: 'maintenance-agent',
      domain: 'maintenance',
      knowledge_scopes: ['maintenance-approved']
    });
  });
  it.each([
    'tenant_id',
    'user_id',
    'request_id',
    'correlation_id',
    'role',
    'session_id',
    'locale',
    'channel'
  ] as const)('denies changed trusted context %s before store', async (field) => {
    const h = harness();
    const b = await h.start();
    const changed = { ...context, [field]: field === 'channel' ? 'mobile' : 'other' };
    await expect(
      b.retrieve(request(b.routingId, { context: changed }), ragValidationTime)
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    zero(h);
  });
  it.each(['permissions', 'entitlements'] as const)(
    'denies changed %s even with all required grants retained',
    async (field) => {
      const h = harness();
      const b = await h.start();
      await expect(
        b.retrieve(
          request(b.routingId, {
            context: { ...context, [field]: [...context[field], 'extra-grant'] }
          }),
          ragValidationTime
        )
      ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
      zero(h);
    }
  );
  it.each(['agent_id', 'agent_version', 'domain', 'knowledge_scopes', 'required_capabilities'])(
    'denies caller widening %s',
    async (field) => {
      const h = harness();
      const b = await h.start();
      await expect(
        b.retrieve(request(b.routingId, { [field]: 'widened' }), ragValidationTime)
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
      zero(h);
    }
  );
  it('denies unknown IDs and IDs from another invocation', async () => {
    const h = harness();
    const b = await h.start();
    const other = await h.start();
    expect(b.routingId).not.toBe(other.routingId);
    for (const id of ['unknown', other.routingId])
      await expect(b.retrieve(request(id), ragValidationTime)).rejects.toMatchObject({
        code: 'PERMISSION_DENIED'
      });
    zero(h);
  });
  it('checks trace in the composition wrapper before RAG access', async () => {
    const h = harness();
    const b = await h.start();
    await expect(
      b.retrieve(request(b.routingId, { trace_id: 'other-trace' }), ragValidationTime)
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    zero(h);
  });
  it('rejects mutation attempts on binding, scope, capabilities and resolved scopes', async () => {
    const h = harness();
    const b = await h.start();
    expect(() => Object.assign(b, { routingId: 'other' })).toThrow();
    expect(() => Object.assign(b.scope, { domain: 'other' })).toThrow();
    expect(() => Object.assign(b.scope.knowledge_scopes, { 0: 'other' })).toThrow();
    expect(() => Object.assign(b.decision.required_capabilities, { 0: 'other' })).toThrow();
    const resolved = await b.port.resolve(context, b.routingId);
    if (!resolved.allowed) throw new Error('valid control denied');
    expect(() => Object.assign(resolved.scope, { agent_id: 'other' })).toThrow();
    zero(h);
  });
  it.each([
    ['disabled RAG', { featureControls: { ...enabledTestFeatureControls, rag: false } }],
    [
      'disabled agent',
      { agents: new AgentRegistry([{ ...maintenanceAgent, status: 'disabled' }]) }
    ],
    [
      'unknown intent fallback',
      { classifier: { classify: () => Promise.resolve({ status: 'unknown' as const }) } }
    ],
    [
      'no RAG plan',
      { ragPlanning: { plan: () => Promise.resolve({ required: false, scopes: [] }) } }
    ],
    [
      'unregistered capability',
      {
        classifier: {
          classify: () =>
            Promise.resolve({
              status: 'classified' as const,
              intent: 'maintenance_lookup',
              domain: 'maintenance',
              required_capabilities: ['unregistered']
            })
        }
      }
    ]
  ] satisfies [string, Partial<SharedAgentRuntimeDependencies>][])(
    'denies %s without constructing a retriever',
    async (_name, overrides) => {
      const h = harness(overrides);
      await expect(h.start()).rejects.toBeDefined();
      expect(h.build).not.toHaveBeenCalled();
      zero(h);
    }
  );
});
