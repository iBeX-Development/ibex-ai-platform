import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { AuditRecord } from '../../packages/audit/src/index.js';
import { toErrorEnvelope } from '../../packages/errors/src/index.js';
import type { KnowledgeChunk } from '../../packages/rag-runtime/src/index.js';
import { createAdmittedRetrieval, SyntheticAdmissionAuthority, type AdmissionIdentity } from '../testing/source-admission.js';
import { createRagRuntime, deterministicEmbeddings, deterministicRanker, indexedChunk, ragContext,
  ragValidationTime, retrievalRequest } from '../testing/rag-runtime-fixtures.js';

let chunk: KnowledgeChunk;
let identity: AdmissionIdentity;
beforeAll(async () => {
  chunk = await indexedChunk();
  identity = { source_id: 'synthetic-source-1', source_version: 'source-v1', checksum: chunk.document_checksum,
    checksum_representation: 'ibex-rag-canonical-document-content-v1',
    document_id: chunk.document_id, document_version: chunk.document_version };
});
function record(overrides: Record<string, unknown> = {}) {
  return { identity, issuer: 'synthetic-admission-authority', decision_id: 'synthetic-human-decision-1', revision: 1,
    tenant_id: 'tenant-a', source_owner: chunk.source_owner, source_uri: chunk.source_uri,
    ownership_verified: true, ownership_evidence: 'synthetic-ownership-evidence',
    human_approval: true, human_approval_evidence: 'synthetic-human-approval-evidence',
    lifecycle_evidence: 'synthetic-full-record-ref', conditions_satisfied: true, state: 'active', ...overrides };
}
function harness(authority = new SyntheticAdmissionAuthority(record()), overrides: Record<string, unknown> = {}) {
  const audits: AuditRecord[] = [];
  const filter = vi.fn(() => Promise.resolve([chunk]));
  const embed = vi.fn(deterministicEmbeddings.embed.bind(deterministicEmbeddings));
  const rank = vi.fn(deterministicRanker.rank.bind(deterministicRanker));
  const adapter = createAdmittedRetrieval({ environment: 'test', enabled: true, authority, identity, context: ragContext,
    dependencies: { store: { readExact: filter }, embeddings: { embed }, ranker: { rank } },
    build: dependencies => createRagRuntime(audits, dependencies), ...overrides });
  return { authority, adapter, filter, embed, rank, audits };
}
function counts(h: ReturnType<typeof harness>, store: number, embed = 0, rank = 0) {
  expect(h.filter).toHaveBeenCalledTimes(store); expect(h.embed).toHaveBeenCalledTimes(embed);
  expect(h.rank).toHaveBeenCalledTimes(rank);
}
function deferred<T>() {
  let resolve: (value: T) => void = () => { throw new Error('Deferred not initialized'); };
  let reject: (error: Error) => void = () => { throw new Error('Deferred not initialized'); };
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const drain = () => new Promise<void>(resolve => setImmediate(resolve));
async function reject(h: ReturnType<typeof harness>, input = retrievalRequest()) {
  let failure: unknown;
  try { await h.adapter.retrieve(input, ragValidationTime); } catch (error) { failure = error; }
  expect(failure).toBeDefined();
  const publicData = JSON.stringify({ error: toErrorEnvelope(failure), audits: h.audits });
  expect(publicData).not.toContain(chunk.content);
  expect(publicData).not.toContain('synthetic-human-decision-1');
}
describe('disabled/test-only exact source admission', () => {
  it('admits exact source/version/checksum and observes full valid retrieval', async () => {
    const h = harness();
    const lease = h.authority.admit(identity, ragContext);
    expect(lease.evidence).toMatchObject({ identity, issuer: 'synthetic-admission-authority',
      decision_id: 'synthetic-human-decision-1', revision: 1, context: ragContext });
    lease.release();
    const response = await h.adapter.retrieve(retrievalRequest(), ragValidationTime);
    expect(response.results[0]?.content).toBe(chunk.content); counts(h, 1, 1, 1);
    expect(h.filter).toHaveBeenCalledWith(identity, expect.objectContaining({ identity,
      issuer: 'synthetic-admission-authority', decision_id: 'synthetic-human-decision-1', revision: 1,
      context: ragContext }), expect.objectContaining({ tenant_id: 'tenant-a' }), expect.any(AbortSignal));
  });
  it.each([
    { enabled: false }, { enabled: undefined }, { environment: 'production' },
  ])('remains disabled outside explicit synthetic test mode %j', async overrides => {
    const h = harness(undefined, overrides); await reject(h); counts(h, 0);
  });
  it.each([
    { ownership_verified: false }, { human_approval: false }, { conditions_satisfied: false },
    { ownership_evidence: '' }, { human_approval_evidence: '' }, { lifecycle_evidence: '' },
    { issuer: 'unknown-authority' }, { decision_id: '' }, { revision: 0 }, { tenant_id: 'tenant-b' },
    ...['withdrawn', 'unknown', 'superseded', 'quarantined', 'expired'].map(state => ({ state })),
  ])('denies unverified/unknown/inactive authority before store %j', async changes => {
    const h = harness(new SyntheticAdmissionAuthority(record(changes))); await reject(h); counts(h, 0);
  });
  it.each(['source_id', 'source_version', 'document_id', 'document_version', 'checksum'] as const)(
    'does not inherit approval across changed %s', async field => {
      const changed = { ...identity, [field]: field === 'checksum' ? `sha256:${'f'.repeat(64)}` : 'other' };
      const h = harness(undefined, { identity: changed }); await reject(h); counts(h, 0);
    });
  it.each(['*', ' source', 'source ', 'source/*'])('rejects noncanonical source identifier %s', value => {
    expect(() => harness(undefined, { identity: { ...identity, source_id: value } })).toThrow();
  });
  it('rejects checksum spelling aliases rather than normalizing authority', () => {
    expect(() => harness(undefined, { identity: { ...identity, checksum: identity.checksum.toUpperCase() } })).toThrow();
  });
  it('rejects an unsupported raw-file checksum representation before admission/store', () => {
    expect(() => harness(undefined, { identity: { ...identity, checksum_representation: 'raw-file-sha256' } })).toThrow();
  });
  it.each(['tenant_id', 'user_id', 'request_id', 'correlation_id', 'role', 'session_id'] as const)(
    'denies changed requesting context %s before store', async field => {
      const h = harness(); await reject(h, retrievalRequest({ context: { ...ragContext, [field]: 'other' } })); counts(h, 0);
    });
  it.each(['document_id', 'document_version', 'document_checksum', 'tenant_id', 'source_owner', 'source_uri'] as const)(
    'rejects store substitution of %s before embeddings', async field => {
      const h = harness();
      h.filter.mockResolvedValue([{ ...chunk, [field]: field === 'document_checksum' ? `sha256:${'f'.repeat(64)}` : 'other' }]);
      await reject(h); counts(h, 1);
    });
  it.each(['document_id', 'document_version', 'tenant_id', 'source_owner', 'source_uri'] as const)(
    'rejects raw whitespace alias of %s before schema normalization', async field => {
      const h = harness();
      const value = chunk[field];
      if (typeof value !== 'string') throw new Error('Expected bound fixture field');
      h.filter.mockResolvedValue([{ ...chunk, [field]: ` ${value} ` }]);
      await reject(h); counts(h, 1);
    });
  it('withdrawal before admission denies without touching store', async () => {
    const h = harness(); h.authority.withdraw(); await reject(h); counts(h, 0);
  });
  it('withdrawal ordered during store invalidates the lease and prevents semantic processing', async () => {
    const h = harness();
    h.filter.mockImplementation(() => { h.authority.withdraw(); return Promise.resolve([chunk]); });
    await reject(h); counts(h, 1);
    await reject(h); counts(h, 1);
  });
  it('withdrawal during embedding prevents ranking and public output', async () => {
    const h = harness();
    h.embed.mockImplementation(input => { h.authority.withdraw(); return deterministicEmbeddings.embed(input); });
    await reject(h); counts(h, 1, 1);
  });
  it('withdrawal during ranking prevents public output', async () => {
    const h = harness();
    h.rank.mockImplementation(input => { h.authority.withdraw(); return deterministicRanker.rank(input); });
    await reject(h); counts(h, 1, 1, 1);
  });
  it('completion ordered before withdrawal succeeds; later admission denies', async () => {
    const h = harness();
    expect((await h.adapter.retrieve(retrievalRequest(), ragValidationTime)).results).toHaveLength(1);
    h.authority.withdraw(); await reject(h); counts(h, 1, 1, 1);
  });
  it('freezes evidence and invalidates previously issued leases immediately', () => {
    const h = harness(); const lease = h.authority.admit(identity, ragContext);
    expect(() => Object.assign(lease.evidence, { revision: 99 })).toThrow();
    expect(() => Object.assign(lease.evidence.identity, { source_version: 'other' })).toThrow();
    h.authority.withdraw(); expect(lease.signal.aborted).toBe(true); expect(lease.assert).toThrow();
    lease.release(); counts(h, 0);
  });
  it('captures request, identity and authority input before a pending store can observe caller mutation', async () => {
    const source = structuredClone(record());
    const inputIdentity = structuredClone(identity);
    const h = harness(new SyntheticAdmissionAuthority(source), { identity: inputIdentity });
    const entered = deferred<undefined>(); const pending = deferred<KnowledgeChunk[]>();
    h.filter.mockImplementation(() => { entered.resolve(undefined); return pending.promise; });
    const input = { ...retrievalRequest(), context: structuredClone(ragContext) };
    const running = h.adapter.retrieve(input, ragValidationTime);
    await entered.promise;
    Object.assign(input.context, { tenant_id: 'foreign-tenant' });
    Object.assign(input, { query: 'mutated-query-canary' });
    Object.assign(inputIdentity, { document_id: 'foreign-document' });
    Object.assign(source.identity, { document_id: 'foreign-document' });
    source.human_approval = false;
    pending.resolve([chunk]);
    const response = await running;
    expect(response.results[0]?.content).toBe(chunk.content);
    expect(h.embed.mock.calls[0]?.[0].content).toBe('bearing vibration lubrication');
    expect(h.embed.mock.calls[0]?.[0].context.tenant_id).toBe('tenant-a');
    expect(JSON.stringify({ response, audits: h.audits, ranked: h.rank.mock.calls })).not.toContain('foreign-document');
    counts(h, 1, 1, 1);
  });
  it('rejects adversarial returned identity mutation before a pending store resolves', async () => {
    const h = harness(); const entered = deferred<undefined>(); const pending = deferred<KnowledgeChunk[]>();
    const returned = structuredClone(chunk);
    h.filter.mockImplementation(() => { entered.resolve(undefined); return pending.promise; });
    const running = h.adapter.retrieve(retrievalRequest(), ragValidationTime).then(() => false, () => true);
    await entered.promise;
    Object.assign(returned, { document_id: 'foreign-document' });
    pending.resolve([returned]);
    expect(await running).toBe(true); counts(h, 1);
  });
  it('isolates already captured chunks from mutation while embedding is pending', async () => {
    const h = harness(); const returned = structuredClone(chunk);
    h.filter.mockResolvedValue([returned]);
    const entered = deferred<undefined>(); const pending = deferred<unknown>();
    h.embed.mockImplementation(() => { entered.resolve(undefined); return pending.promise; });
    const running = h.adapter.retrieve(retrievalRequest(), ragValidationTime);
    await entered.promise;
    Object.assign(returned, { content: 'late-content-canary', document_id: 'foreign-document' });
    Object.assign(returned.access_scope, { required_permissions: ['foreign-permission'] });
    pending.resolve({ model_id: 'test-embedding', model_version: '1.0', vector: [0.1, 0.2] });
    const response = await running;
    expect(h.rank.mock.calls[0]?.[0].candidates).toEqual([chunk]);
    expect(response.results[0]?.content).toBe(chunk.content);
    expect(JSON.stringify({ response, audits: h.audits })).not.toContain('late-content-canary');
    counts(h, 1, 1, 1);
  });
  it.each(['store', 'embedding', 'ranking'] as const)(
    'withdrawal while %s is pending observes late rejection without output or reopening', async stage => {
      const h = harness(); const entered = deferred<undefined>();
      const store = deferred<KnowledgeChunk[]>(); const dependency = deferred<unknown>();
      if (stage === 'store') h.filter.mockImplementation(() => { entered.resolve(undefined); return store.promise; });
      if (stage === 'embedding') h.embed.mockImplementation(() => { entered.resolve(undefined); return dependency.promise; });
      if (stage === 'ranking') h.rank.mockImplementation(() => { entered.resolve(undefined); return dependency.promise; });
      const running = h.adapter.retrieve(retrievalRequest(), ragValidationTime)
        .then(() => ({ succeeded: true, error: undefined }), (error: unknown) => ({ succeeded: false, error: toErrorEnvelope(error) }));
      await entered.promise;
      h.authority.withdraw();
      const result = await running;
      expect(result.succeeded).toBe(false);
      const auditAfterWithdrawal = JSON.stringify(h.audits);
      if (stage === 'store') store.reject(new Error('late-private-rejection-canary'));
      else dependency.reject(new Error('late-private-rejection-canary'));
      await drain(); await drain();
      expect(JSON.stringify(h.audits)).toBe(auditAfterWithdrawal);
      expect(JSON.stringify({ result, audits: h.audits })).not.toContain('late-private-rejection-canary');
      await reject(h);
      counts(h, 1, stage === 'store' ? 0 : 1, stage === 'ranking' ? 1 : 0);
    });
  it('recovers from a settled store failure only while the same authority remains active', async () => {
    const h = harness(); const entered = deferred<undefined>(); const pending = deferred<KnowledgeChunk[]>();
    h.filter.mockImplementationOnce(() => { entered.resolve(undefined); return pending.promise; });
    const running = h.adapter.retrieve(retrievalRequest(), ragValidationTime).then(() => false, (error: unknown) => {
      expect(toErrorEnvelope(error).error.code).toBe('DEPENDENCY_ERROR'); return true;
    });
    await entered.promise; pending.reject(new Error('private-store-failure-canary'));
    expect(await running).toBe(true); counts(h, 1);
    expect((await h.adapter.retrieve(retrievalRequest(), ragValidationTime)).results).toHaveLength(1);
    counts(h, 2, 1, 1);
    expect(JSON.stringify(h.audits)).not.toContain('private-store-failure-canary');
  });
});
