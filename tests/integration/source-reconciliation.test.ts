import { describe, expect, it, vi } from 'vitest';
import { createSyntheticReconciler } from '../testing/source-reconciliation.js';

const identity = { source_id: 'source-1', source_version: 'v1', document_id: 'document-1', document_version: 'v1',
  checksum_representation: 'ibex-rag-canonical-document-content-v1', checksum: `sha256:${'a'.repeat(64)}` };
function fixture(tenant = 'tenant-a') {
  return { sources: [{ admission: { identity: { ...identity }, issuer: 'synthetic-admission-authority',
    decision_id: 'synthetic-decision', revision: 1, tenant_id: tenant, source_owner: 'synthetic-owner',
    source_uri: 'synthetic://source', ownership_verified: true, ownership_evidence: 'synthetic-ownership',
    human_approval: true, human_approval_evidence: 'synthetic-approval', lifecycle_evidence: 'synthetic-lifecycle',
    conditions_satisfied: true, state: 'active' }, expected: [{ artifact_id: 'document-1', kind: 'document' },
      { artifact_id: 'chunk-1', kind: 'chunk' }] }], derived: [
    { artifact_id: 'document-1', kind: 'document', tenant_id: tenant, identity: { ...identity }, state: 'active' },
    { artifact_id: 'chunk-1', kind: 'chunk', tenant_id: tenant, identity: { ...identity }, state: 'active' }] };
}
const reconciler = (tenant = 'tenant-a') => createSyntheticReconciler({ enabled: true, environment: 'test', tenant });
type Fixture = ReturnType<typeof fixture>;
function first<T>(items: T[]): T { const item = items[0]; if (!item) throw new Error('Missing test fixture'); return item; }
function multiDocument(change: 'document_id' | 'document_version', owner: string) {
  const data = fixture(); const original = first(data.sources);
  original.expected = [first(original.expected)]; data.derived = [first(data.derived)];
  const other = structuredClone(original); other.admission.identity[change] = 'second';
  other.admission.source_owner = owner;
  other.expected = [{ artifact_id: 'second-artifact', kind: 'document' }];
  data.sources.push(other);
  data.derived.push({ artifact_id: 'second-artifact', kind: 'document', tenant_id: 'tenant-a',
    identity: { ...other.admission.identity }, state: 'active' });
  return data;
}
describe('synthetic tenant inventory reconciliation contract', () => {
  it('reconciles exact counts without mutating inventories and allows a guarded local consumer', () => {
    const data = fixture(); const before = structuredClone(data); const consume = vi.fn();
    const report = reconciler().reconcile(data); if (report.allowed) consume();
    expect(report).toMatchObject({ allowed: true, discrepancies: [], counts: { sources: 1, expected: 2, derived: 2, matched: 2 } });
    expect(consume).toHaveBeenCalledTimes(1); expect(data).toEqual(before);
    expect(report.inputHash).toMatch(/^[a-f0-9]{64}$/); expect(Object.isFrozen(report.counts)).toBe(true);
  });
  it.each([
    ['orphan', (d: Fixture) => { first(d.derived).identity.source_id = 'orphan'; }],
    ['duplicate', (d: Fixture) => { d.derived.push(structuredClone(first(d.derived))); }],
    ['missing', (d: Fixture) => { d.derived.pop(); }],
    ['stale', (d: Fixture) => { first(d.sources).admission.state = 'expired'; }],
    ['superseded', (d: Fixture) => { first(d.sources).admission.state = 'superseded'; }],
    ['withdrawn', (d: Fixture) => { first(d.sources).admission.state = 'withdrawn'; }],
    ['cross-tenant', (d: Fixture) => { first(d.derived).tenant_id = 'tenant-b'; }],
    ['checksum-mismatch', (d: Fixture) => { first(d.derived).identity.checksum = `sha256:${'b'.repeat(64)}`; }],
    ['conflict', (d: Fixture) => { first(d.derived).kind = 'cache'; }],
    ['ineligible', (d: Fixture) => { first(d.sources).admission.human_approval = false; }],
    ['duplicate', (d: Fixture) => { d.sources.push(structuredClone(first(d.sources))); }],
  ] as const)('blocks %s with no local consumer calls or silent repair', (code, mutate) => {
    const data = fixture(); mutate(data); const before = structuredClone(data); const consume = vi.fn();
    const report = reconciler().reconcile(data); if (report.allowed) consume();
    expect(report.allowed).toBe(false); expect(report.discrepancies).toContain(code);
    expect(report.disposition).toBe('quarantined');
    expect(consume).not.toHaveBeenCalled(); expect(data).toEqual(before);
    expect(reconciler().reconcile(data)).toEqual(report);
  });
  it('rejects changed source versions and cannot match by recency or checksum alone', () => {
    const data = fixture(); first(data.derived).identity.source_version = 'v2';
    expect(reconciler().reconcile(data).discrepancies).toEqual(['missing', 'orphan']);
  });
  it('quarantines conflicting ownership records without choosing a winner', () => {
    const data = fixture(); const other = structuredClone(first(data.sources));
    other.admission.source_owner = 'other-owner'; data.sources.push(other);
    const report = reconciler().reconcile(data);
    expect(report.discrepancies).toEqual(['conflict', 'duplicate', 'missing']);
    expect(report.disposition).toBe('quarantined');
    data.sources.reverse(); expect(reconciler().reconcile(data)).toEqual(report);
  });
  it.each(['document_id', 'document_version'] as const)('quarantines source-level owner conflict across %s in either order', field => {
    const data = multiDocument(field, 'contradictory-owner'); const consume = vi.fn();
    const before = structuredClone(data); const report = reconciler().reconcile(data);
    if (report.allowed) consume();
    expect(report).toMatchObject({ allowed: false, disposition: 'quarantined', discrepancies: ['conflict', 'missing'],
      counts: { sources: 2, expected: 2, derived: 2, matched: 0 } });
    expect(consume).not.toHaveBeenCalled(); expect(data).toEqual(before);
    data.sources.reverse(); data.derived.reverse(); expect(reconciler().reconcile(data)).toEqual(report);
  });
  it.each(['document_id', 'document_version'] as const)('allows consistent-owner mappings across %s', field => {
    const data = multiDocument(field, 'synthetic-owner');
    expect(reconciler().reconcile(data)).toMatchObject({ allowed: true, discrepancies: [],
      counts: { sources: 2, expected: 2, derived: 2, matched: 2 } });
  });
  it('does not conflate genuinely distinct sources with different owners', () => {
    const data = multiDocument('document_id', 'different-source-owner');
    const other = data.sources[1]; const artifact = data.derived[1];
    if (!other || !artifact) throw new Error('Missing second mapping');
    other.admission.identity.source_id = 'source-2'; artifact.identity.source_id = 'source-2';
    expect(reconciler().reconcile(data)).toMatchObject({ allowed: true, discrepancies: [],
      counts: { sources: 2, expected: 2, derived: 2, matched: 2 } });
  });
  it.each(['stale', 'superseded', 'withdrawn'])('blocks %s derived artifacts even with active source approval', state => {
    const data = fixture(); first(data.derived).state = state;
    const report = reconciler().reconcile(data);
    expect(report.allowed).toBe(false); expect(report.discrepancies).toEqual(['missing', state].sort());
    expect(report.counts).toEqual({ sources: 1, expected: 2, derived: 2, matched: 1 });
  });
  it('counts all seven artifact kinds and detects an omitted declared artifact', () => {
    const data = fixture(); const s = first(data.sources);
    const kinds = ['document', 'chunk', 'embedding', 'index', 'vector', 'cache', 'retrieval-preparation'];
    s.expected = kinds.map(kind => ({ artifact_id: `artifact-${kind}`, kind }));
    data.derived = s.expected.map(item => ({ ...item, tenant_id: 'tenant-a', identity: { ...identity }, state: 'active' }));
    expect(reconciler().reconcile(data)).toMatchObject({ allowed: true, counts: { sources: 1, expected: 7, derived: 7, matched: 7 } });
    data.derived.pop();
    expect(reconciler().reconcile(data)).toMatchObject({ allowed: false, discrepancies: ['missing'],
      counts: { sources: 1, expected: 7, derived: 6, matched: 6 } });
  });
  it('reports the same opaque partition denial for different foreign records', () => {
    const a = fixture('tenant-b'); const b = fixture('tenant-c');
    first(b.sources).admission.source_uri = 'synthetic://FOREIGN-CANARY'; b.derived.pop();
    const left = reconciler().reconcile(a); const right = reconciler().reconcile(b);
    expect(left).toEqual(right); expect(left).toMatchObject({ allowed: false, inputHash: null,
      discrepancies: ['cross-tenant'], counts: { sources: 0, expected: 0, derived: 0, matched: 0 } });
    expect(JSON.stringify(right)).not.toContain('FOREIGN-CANARY');
  });
  it('keeps separately configured tenant runs independent and blocks a mixed inventory', () => {
    const a = fixture(); const b = fixture('tenant-b'); const runA = reconciler(); const runB = reconciler('tenant-b');
    const before = runA.reconcile(a); expect(runB.reconcile(b).allowed).toBe(true);
    first(b.derived).state = 'withdrawn'; expect(runB.reconcile(b).allowed).toBe(false);
    expect(runA.reconcile(a)).toEqual(before);
    expect(runA.reconcile({ sources: [...a.sources, ...b.sources], derived: [...a.derived, ...b.derived] }).discrepancies).toEqual(['cross-tenant']);
  });
  it('has deterministic reports across inventory order and detects content changes', () => {
    const a = fixture(); const b = structuredClone(a); b.derived.reverse(); first(b.sources).expected.reverse();
    expect(reconciler().reconcile(a)).toEqual(reconciler().reconcile(b));
    first(b.sources).admission.revision++;
    expect(reconciler().reconcile(a).inputHash).not.toBe(reconciler().reconcile(b).inputHash);
  });
  it.each([{}, { sources: [], derived: [] }, { ...fixture(), caller_override: true }])('rejects invalid inventories', raw => {
    expect(reconciler().reconcile(raw).discrepancies).toEqual(['invalid-inventory']);
  });
  it('rejects accessor input without evaluating it', () => {
    const getter = vi.fn(() => fixture().sources);
    expect(reconciler().reconcile({ get sources() { return getter(); }, derived: [] }).allowed).toBe(false);
    expect(getter).not.toHaveBeenCalled();
  });
  it.each([{ environment: 'test' }, { environment: 'test', enabled: false }, { environment: 'production', enabled: true }])(
    'requires explicit test-only enablement %j', options => {
      expect(createSyntheticReconciler({ ...options, tenant: 'tenant-a' }).reconcile(fixture()).allowed).toBe(false);
    });
});
