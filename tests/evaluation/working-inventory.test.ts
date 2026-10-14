import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assessWorkingInventory, type WorkingInventory } from './support/working-inventory.js';

const root = resolve(import.meta.dirname, '../..');
const inventoryText = readFileSync(
  resolve(root, 'docs/evaluation/findings/working-inventory.v1.json'),
  'utf8'
);
const readLocal = (path: string) => readFileSync(resolve(root, path), 'utf8');
const fixture = () => JSON.parse(inventoryText) as WorkingInventory;
const assess = (value: WorkingInventory) =>
  assessWorkingInventory(JSON.stringify(value), readLocal);
function first<T>(values: readonly T[]): T {
  const value = values[0];
  if (value === undefined) throw new Error('Missing fixture row');
  return value;
}

// Independently written regression expectations from the pinned historical tables.
// Neither these expectations nor the checker's pins are an authority mechanism.
const expectedAssignments = [
  'Product/SIR02-GOV-01',
  'Product/SIR02-GOV-02',
  'Product/SIR02-CFG-02',
  'Product/SIR02-CFG-03',
  'Product/SIR02-CFG-04',
  'Product/SIR02-CFG-06',
  'Product/SIR02-CFG-07',
  'Product/SIR02-DEF-03',
  'RAG Architecture/SIR02-GOV-01',
  'RAG Architecture/SIR02-GOV-03',
  'RAG Architecture/SIR02-CFG-02',
  'RAG Architecture/SIR02-CFG-03',
  'RAG Architecture/SIR02-CFG-04',
  'RAG Architecture/SIR02-CFG-07',
  'RAG Architecture/SIR02-DEF-01',
  'RAG Architecture/SIR02-DEF-02',
  'Security/SIR02-GOV-01',
  'Security/SIR02-GOV-04',
  'Security/SIR02-CFG-04',
  'Security/SIR02-DEF-01',
  'Data Governance/SIR02-GOV-01',
  'Data Governance/SIR02-GOV-05',
  'Data Governance/SIR02-DEF-01',
  'Data Governance/SIR02-DEF-03',
  'Platform Operations/SIR02-CFG-05',
  'Platform Operations/SIR02-CFG-06',
  'Knowledge Management/SIR02-DEF-01',
  'Knowledge Management/SIR02-DEF-02',
  'Knowledge Management/SIR02-DEF-03'
];
const expectedFindings = [
  'F01',
  'F02',
  'F03',
  'F04',
  'F05',
  'F06',
  'F07',
  'F08',
  'F09',
  'F10',
  'F11',
  'F12'
];
const expectedRequirements = [
  'SIR02-KM-OE-01',
  'SIR02-KM-OE-02',
  'SIR02-KM-OE-03',
  'SIR02-KM-OE-04',
  'SIR02-KM-OE-05',
  'SIR02-KM-OE-06',
  'SIR02-KM-OE-07',
  'SIR02-KM-OE-08',
  'SIR02-KM-OE-09',
  'SIR02-KM-OE-10',
  'SIR02-KM-OE-11',
  'SIR02-KM-OE-12',
  'SIR02-KM-OE-13',
  'SIR02-KM-OE-14',
  'SIR02-KM-OE-15'
];
const populations = [
  'source_snapshots',
  'finding_references',
  'owner_assignments',
  'operational_requirements',
  'historical_gaps'
] as const;

describe('bounded working inventory structure only', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('matches exact source-backed sets and keeps three populations distinct', () => {
    const value = fixture();
    expect(value.finding_references.map((f) => f.finding_id).sort()).toEqual(
      [...expectedFindings].sort()
    );
    expect(value.owner_assignments.map((a) => `${a.owner_group}/${a.evidence_id}`).sort()).toEqual(
      [...expectedAssignments].sort()
    );
    expect(value.operational_requirements.map((o) => o.requirement_id).sort()).toEqual(
      [...expectedRequirements].sort()
    );
    expect(
      value.historical_gaps.map((g) => [g.prospective_population_key, g.reported_count])
    ).toEqual([
      ['after-config-scope', 32],
      ['final-sign-off', 11],
      ['parent-sir', null]
    ]);
    expect(assess(value)).toEqual({
      structural_status: 'PASS',
      authority_status: 'not-activated',
      project_completeness: 'unknown',
      diagnostics: []
    });
  });

  it.each(populations)('rejects duplicate records in %s', (key) => {
    const value = fixture();
    Object.assign(value, { [key]: [...value[key], first(value[key] as readonly unknown[])] });
    expect(assess(value).structural_status).toBe('FAIL');
  });
  it.each(populations)('rejects missing records in %s', (key) => {
    const value = fixture();
    value[key].pop();
    expect(assess(value).structural_status).toBe('FAIL');
  });
  it.each(['finding_references', 'owner_assignments', 'operational_requirements'] as const)(
    'rejects replacement and extra identities in %s',
    (key) => {
      const value = fixture();
      const row = first(value[key] as readonly object[]);
      const field =
        key === 'finding_references'
          ? 'finding_id'
          : key === 'owner_assignments'
            ? 'evidence_id'
            : 'requirement_id';
      const extra = { ...row, [field]: 'invented-id' };
      Object.assign(value, { [key]: [...value[key], extra] });
      expect(assess(value).structural_status).toBe('FAIL');
      Object.assign(value, { [key]: [extra, ...value[key].slice(2)] });
      expect(assess(value).structural_status).toBe('FAIL');
    }
  );
  it.each([
    'finding_references',
    'owner_assignments',
    'operational_requirements',
    'historical_gaps'
  ] as const)('rejects wrong record types in %s', (key) => {
    const value = fixture();
    Object.assign(first(value[key] as readonly object[]), { record_type: 'finding' });
    expect(assess(value).diagnostics).toContain('INVALID_STRUCTURE');
  });
  it.each([
    'top',
    'source',
    'finding',
    'assignment',
    'state',
    'reference',
    'requirement',
    'gap',
    'scope',
    'registry'
  ])('rejects unknown fields at %s', (where) => {
    const value = fixture();
    const targets: Record<string, object> = {
      top: value,
      source: first(value.source_snapshots),
      finding: first(value.finding_references),
      assignment: first(value.owner_assignments),
      state: first(value.owner_assignments).historical_state,
      reference: first(value.owner_assignments).dispatch_ref,
      requirement: first(value.operational_requirements),
      gap: first(value.historical_gaps),
      scope: value.scope_acceptance,
      registry: value.finding_registry
    };
    Object.assign(targets[where] ?? {}, { approved: true });
    expect(assess(value).diagnostics).toContain('INVALID_STRUCTURE');
  });
  it.each(['after-config-scope', 'final-sign-off', 'parent-sir'])(
    'retains unresolved gap %s without fabricated historical identities',
    (key) => {
      const value = fixture();
      const gap = value.historical_gaps.find((g) => g.prospective_population_key === key);
      if (!gap) throw new Error('Missing gap');
      gap.reported_count = 43;
      expect(assess(value).diagnostics).toContain('HISTORICAL_COUNT_MISMATCH');
      Object.assign(gap, { obligation_state: 'waived', historical_ids: [] });
      expect(assess(value).diagnostics).toContain('INVALID_STRUCTURE');
    }
  );
  it('rejects owner substitution and a different owners valid collection row', () => {
    const value = fixture();
    const row = first(value.owner_assignments);
    row.owner_group = 'Unknown Owner';
    expect(assess(value).diagnostics).toContain('MEMBERSHIP_ASSIGNMENTS');
    row.owner_group = 'Product';
    row.collection_ref = first(
      value.owner_assignments.filter((a) => a.owner_group === 'Security')
    ).collection_ref;
    expect(assess(value).diagnostics).toContain('ASSIGNMENT_REFERENCE_MISMATCH');
  });
  it('rejects historically unsupported state promotion', () => {
    const value = fixture();
    const missing = value.owner_assignments.find(
      (a) => a.owner_group === 'Knowledge Management' && a.evidence_id === 'SIR02-DEF-02'
    );
    if (!missing) throw new Error('Missing assignment');
    missing.historical_state.evidence_status = 'Ready for Review';
    missing.historical_state.review_status = 'Accepted';
    expect(assess(value).diagnostics).toContain('HISTORICAL_STATE_MISMATCH');
  });
  it('keeps lifecycle OE-12 distinct from Worker-Host OE-12/D2', () => {
    const value = fixture();
    const oe12 = value.operational_requirements.find((o) => o.requirement_id === 'SIR02-KM-OE-12');
    expect(oe12?.evidence_item).toBe('Lifecycle audit evidence');
    if (!oe12) throw new Error('Missing OE-12');
    oe12.evidence_item = 'Worker-Host OE-12/D2';
    expect(assess(value).diagnostics).toContain('REQUIREMENT_REFERENCE_MISMATCH');
    oe12.requirement_id = 'OE-12';
    expect(assess(value).diagnostics).toContain('MEMBERSHIP_REQUIREMENTS');
  });
  it.each([
    '../registry.v1.json',
    '/etc/passwd',
    'https://example.invalid/local',
    'docs/missing.md'
  ])('rejects malformed local path %s before resolving', (path) => {
    const value = fixture();
    first(value.owner_assignments).dispatch_ref.path = path;
    const resolver = vi.fn(readLocal);
    expect(assessWorkingInventory(JSON.stringify(value), resolver).diagnostics).toContain(
      'INVALID_STRUCTURE'
    );
    expect(resolver).not.toHaveBeenCalled();
  });
  it.each([0, -1, 1.5, 999999])('rejects malformed or unresolved row %s', (line) => {
    const value = fixture();
    first(value.owner_assignments).dispatch_ref.line = line;
    expect(assess(value).structural_status).toBe('FAIL');
  });
  it('rejects unavailable local sources and altered snapshot bytes', () => {
    expect(
      assessWorkingInventory(inventoryText, () => {
        throw new Error('Absent');
      }).diagnostics
    ).toContain('LOCAL_REFERENCE_UNRESOLVED');
    expect(
      assessWorkingInventory(inventoryText, (path) => readLocal(path) + '\n').diagnostics
    ).toContain('LOCAL_SNAPSHOT_MISMATCH');
    const value = fixture();
    first(value.source_snapshots).sha256 = '0'.repeat(64);
    expect(assess(value).diagnostics).toContain('LOCAL_SNAPSHOT_MISMATCH');
    value.finding_registry.sha256 = '0'.repeat(64);
    expect(assess(value).structural_status).toBe('FAIL');
  });
  it.each([
    'http://example.invalid/a',
    'https://user:pass@example.invalid/a',
    'file:///tmp/a',
    'not-a-url'
  ])('rejects invalid external locator shape %s', (url) => {
    const value = fixture();
    first(value.source_snapshots).external_locator = url;
    expect(assess(value).diagnostics).toContain('INVALID_STRUCTURE');
  });
  it('does not authenticate or fetch a well-shaped external locator', () => {
    const fetch = vi.fn(() => {
      throw new Error('Network forbidden');
    });
    vi.stubGlobal('fetch', fetch);
    const value = fixture();
    first(value.source_snapshots).external_locator = 'https://unavailable.example.invalid/source';
    expect(assess(value).structural_status).toBe('PASS');
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    '{"a":1,"a":2}',
    '{"a":1,"\\u0061":2}',
    '{"x":[{"a":1,"\\u0061":2}]}',
    '{"a":',
    '{"a":1,}',
    '[1,]',
    '{"a":tru}',
    '{} trailing',
    'null',
    '['.repeat(102) + '0' + ']'.repeat(102),
    ' '.repeat(1_048_577)
  ])('rejects malformed, duplicate-key or noninventory JSON %#', (text) => {
    expect(assessWorkingInventory(text, readLocal).structural_status).toBe('FAIL');
  });
  it('detects escaped duplicate keys in otherwise valid inventory before schema parsing', () => {
    const text = inventoryText.replace(
      '"date": "2026-10-14"',
      '"date": "2026-10-14", "\\u0064ate": "2026-10-14"'
    );
    expect(assessWorkingInventory(text, readLocal).diagnostics).toEqual(['MALFORMED_JSON']);
  });
  it.each(['project_completeness', 'authority_status', 'source_snapshot_commit'])(
    'rejects unsupported claims in %s',
    (field) => {
      const value = fixture();
      Object.assign(value, { [field]: 'approved' });
      expect(assess(value).diagnostics).toContain('INVALID_STRUCTURE');
    }
  );
  it('requires prospective scope acceptance date and meaning', () => {
    const value = fixture();
    Object.assign(value.scope_acceptance, {
      date: '2026-09-25',
      meaning: 'exact-content-approval'
    });
    expect(assess(value).diagnostics).toContain('INVALID_STRUCTURE');
  });
});
