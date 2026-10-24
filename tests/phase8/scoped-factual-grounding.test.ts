import { describe, expect, it, vi } from 'vitest';
import { assetAgentProfile } from '../../agents/asset/src/index.js';
import { warehouseAgentProfile } from '../../agents/warehouse/src/index.js';
import { assure, warehouseSufficient, type Evidence, type Outcome, type Selector } from '../testing/scoped-factual-grounding.js';
import { rawJsonSnapshot, structuredSnapshot } from '../testing/scoped-factual-grounding-ingress.js';
import { fixture, claim, source, unknown, subjectIdentity, type Fixture } from '../testing/scoped-factual-grounding-fixtures.js';
import { createPilotHarness, pilotRequest, pilotValidationTime } from '../testing/pilot-agent-fixtures.js';

const run = (f: Fixture) => assure(f.trusted, () => f.candidate);
const warehouse = (...keys: Selector[]) => fixture('warehouse_facts', keys.length ? keys : ['available_quantity']);
function rejected(outcome: Outcome, internal = 'invalid'): void {
  expect(outcome.internal).toBe(internal);
  expect(outcome.public).toMatchObject({ response_type: 'abstain', evidence_status: 'insufficient' });
  expect(outcome.public.limitations.length).toBeGreaterThan(0);
  expect(outcome.public.answer).toBe('Insufficient approved evidence is available for this request.');
  expect(() => warehouseSufficient(outcome)).toThrow();
}
function complete(outcome: Outcome, answer: string): void {
  expect(outcome.internal).toBe('complete');
  expect(outcome.public.evidence_status).toBe('sufficient');
  expect(outcome.public.answer).toBe(answer);
  expect(outcome.consumer).toBe('literal-text-only');
  expect(Object.isFrozen(outcome.facts)).toBe(true);
  expect(outcome.citations).toEqual(['fixture://R1']);
}
const parentAnswer = 'Asset "A" has parent "P1".';
const zeroAnswer = 'WO "W", material line "L1", part "P": available quantity is 0 "U".';
function firstFact(f: Fixture) { const v = f.candidate.facts[0]; if (!v) throw new Error('fixture'); return v; }
function firstEvidence(f: Fixture) { const v = f.candidate.tool_responses[0]; if (!v) throw new Error('fixture'); return v; }

describe('Scoped factual grounding 1.0.1 — synthetic only, 52 finite cases', () => {
  it('H01 rejects legacy P2 answer; typed facts render source P1', () => {
    const f = fixture(); rejected(assure(f.trusted, () => ({ answer: 'Asset A has parent P2.', tool_responses: f.candidate.tool_responses, rag: [] })));
    complete(run(f), parentAnswer);
  });
  it('H02 null stock never becomes known zero', () => {
    const f = warehouse(); source(f, 'available_quantity', null); unknown(f, 'available_quantity', 'source_null');
    rejected(run(f), 'insufficient'); claim(f, 'available_quantity', { decimal: '0', unit: 'U' }); rejected(run(f));
  });
  it('H03 issued zero is not planned five', () => {
    const f = warehouse('issued_quantity'); complete(run(f), 'WO "W", material line "L1", part "P": issued quantity is 0 "U".');
    claim(f, 'issued_quantity', { decimal: '5', unit: 'U' }); rejected(run(f));
  });
  it('H04 source draft renders draft, never completed', () => {
    const f = warehouse('issue_status'); complete(run(f), 'WO "W", material line "L1": Issue status in the bound source is draft.');
    claim(f, 'issue_status', { state: 'completed' }); rejected(run(f));
  });
  it('H05 readiness unsupported with unavailable inventory', () => {
    const f = warehouse(); source(f, 'available_quantity', null); const producer = vi.fn(() => ({ answer: 'Fully ready' }));
    rejected(assure({ ...f.trusted, operation: 'unsupported' }, producer)); expect(producer).not.toHaveBeenCalled();
  });
  it('H06 faithful P1 parent', () => { complete(run(fixture()), parentAnswer); });
  it('H07 explicit zero with synthetic authoritative unit', () => { complete(run(warehouse()), zeroAnswer); });
  it('H08 absent required Tool response abstains', () => {
    const f = warehouse(); f.candidate.tool_responses = []; rejected(run(f));
  });
  it('H09 actual unchanged Asset and Warehouse profiles remain blocked', async () => {
    for (const [profile, intent, capability] of [
      [assetAgentProfile, 'ASSET_HIERARCHY', 'asset.get_parent'],
      [warehouseAgentProfile, 'WORK_ORDER_MATERIAL_QUERY', 'WO_MATERIAL_LOOKUP']
    ] as const) {
      const f = fixture(profile.agent_id === 'asset' ? 'asset_parent' : 'warehouse_facts');
      const h = createPilotHarness(profile, { synthetic: false, grounding: { answer: 'Injected fixture', tool_responses: f.candidate.tool_responses.map(e => e.response), rag: [] } });
      const resolve = vi.spyOn(h.grounding, 'resolve');
      await expect(h.runtime.execute(pilotRequest(profile, { intent, requested_tool_capabilities: [capability] }), pilotValidationTime)).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
      expect(resolve).not.toHaveBeenCalled();
    }
  });
  it('G1-01 unsupported contract version', () => { const f = fixture(); rejected(assure(f.trusted, () => ({ ...f.candidate, contract_version: '2' }))); });
  it('G1-02 wrong exact mapping version', () => { const f = fixture(); firstFact(f).provenance.mapping_version = '2'; rejected(run(f)); });
  it('G1-03 scoped route rejects legacy result', () => { const f = fixture(); rejected(assure(f.trusted, () => ({ answer: parentAnswer, tool_responses: f.candidate.tool_responses, rag: [] }))); });
  it('G1-04 unsupported route never calls legacy producer', () => { const f = fixture(); const producer = vi.fn(() => ({ answer: 'Ready' })); rejected(assure({ ...f.trusted, operation: 'unsupported' }, producer)); expect(producer).not.toHaveBeenCalled(); });
  it('G1-05 producer cannot narrow planned plus issued', () => { const f = warehouse('planned_quantity', 'issued_quantity'); f.candidate.facts.pop(); rejected(run(f)); });
  it('G1-06 producer cannot add selector', () => { const f = fixture(); f.candidate.facts.push({ ...firstFact(f), selector: 'available_quantity' }); rejected(run(f)); });
  it('G2-01 raw nested duplicates rejected before materialization', () => {
    const f = fixture(); const json = JSON.stringify(f.candidate).replace('"state":"known"', '"state":"known","state":"unknown"');
    rejected(assure(f.trusted, () => Buffer.from(json), 'raw'));
    expect(() => rawJsonSnapshot(Buffer.from('{"a":{"state":1,"st\\u0061te":2}}'), f.trusted.limits)).toThrow('duplicate member');
    expect(() => rawJsonSnapshot(new Uint8Array([0xc3, 0x28]), f.trusted.limits)).toThrow();
    expect(() => rawJsonSnapshot(Buffer.from('{"x":1e999}'), f.trusted.limits)).toThrow('nonfinite');
    expect(() => rawJsonSnapshot(Buffer.from('{} trailing'), f.trusted.limits)).toThrow();
    expect(() => rawJsonSnapshot(Buffer.from('{}'), { bytes: 1, depth: 32 })).toThrow('size');
    expect(() => rawJsonSnapshot(Buffer.from('{"x":{}}'), { bytes: 100, depth: 0 })).toThrow('depth');
    complete(assure(f.trusted, () => Buffer.from(JSON.stringify(f.candidate)), 'raw'), parentAnswer);
  });
  it('G2-02 duplicate evidence ID', () => { const f = fixture(); f.candidate.tool_responses.push(structuredClone(firstEvidence(f))); rejected(run(f)); });
  it('G2-03 duplicate fact selector', () => { const f = fixture(); f.candidate.facts.push(structuredClone(firstFact(f))); rejected(run(f)); });
  it('G2-04 extra answer forbidden', () => { const f = fixture(); rejected(assure(f.trusted, () => ({ ...f.candidate, answer: parentAnswer }))); });
  it('G2-05 string facts invalid, not Unknown', () => { const f = fixture(); rejected(assure(f.trusted, () => ({ ...f.candidate, facts: 'unknown' }))); });
  it('G2-06 accessor not evaluated', () => {
    const f = fixture(); const getter = vi.fn(() => ({ kind: 'parent', parent_id: 'P1' }));
    Object.defineProperty(firstFact(f), 'value', { enumerable: true, get: getter }); rejected(run(f)); expect(getter).not.toHaveBeenCalled();
    expect(() => structuredSnapshot(new Date(), f.trusted.limits)).toThrow('prototype');
  });
  it('G3-01 wrong trusted subject', () => { const f = fixture(); f.candidate.subject = { kind: 'asset_parent', asset_id: 'S2' }; rejected(run(f)); });
  it('G3-02 wrong correlation', () => { const f = fixture(); const e = firstEvidence(f); f.candidate.tool_responses[0] = { ...e, response: { ...e.response, correlation_id: 'C2' } }; rejected(run(f)); });
  it('G3-03 missing trusted Issue selector', () => { const f = warehouse('issue_status'); if (f.trusted.subject.kind !== 'warehouse_facts') throw new Error('fixture'); const { issue_id: omitted, ...subject } = f.trusted.subject; expect(omitted).toBe('I'); f.trusted = { ...f.trusted, subject }; const producer = vi.fn(() => f.candidate); rejected(assure(f.trusted, producer)); expect(producer).not.toHaveBeenCalled(); });
  it('G3-04 Issue belongs to wrong material line', () => { const f = warehouse('issue_status'); f.trusted = { ...f.trusted, issueAssociations: [{ issue_id: 'I', wo_id: 'W', material_line_id: 'L2' }] }; rejected(run(f)); });
  it('G3-05 two Issue associations', () => { const f = warehouse('issue_status'); f.trusted = { ...f.trusted, issueAssociations: [...f.trusted.issueAssociations, { issue_id: 'I2', wo_id: 'W', material_line_id: 'L1' }] }; rejected(run(f)); });
  it('G4-01 cross-tenant evidence', () => { const f = fixture(); firstEvidence(f).tenant_id = 'T2'; rejected(run(f)); });
  it('G4-02 unauthorized capability', () => { const f = fixture(); firstEvidence(f).capability = 'K2'; rejected(run(f)); });
  it('G4-03 mapper-required record omitted', () => { const f = fixture(); f.candidate.tool_responses = []; rejected(run(f)); });
  it('G4-04 same record twice with distinct evidence IDs', () => {
    const f = fixture();
    // Build acquisition from independent source fixtures, never from candidate evidence.
    const acquired = fixture().trusted.acquisition.records[0];
    if (!acquired) throw new Error('fixture acquisition');
    const acquiredDuplicate = { ...structuredClone(acquired), evidence_id: 'E2' };
    f.trusted = { ...f.trusted, acquisition: { ...f.trusted.acquisition, records: [acquired, acquiredDuplicate] } };
    f.candidate.tool_responses.push({ ...structuredClone(firstEvidence(fixture())), evidence_id: 'E2' });
    expect(f.trusted.acquisition.records).toEqual(f.candidate.tool_responses);
    expect(f.trusted.acquisition.records[0]).not.toBe(f.candidate.tool_responses[0]);
    const result = run(f); rejected(result);
    expect(result.rejection_category).toBe('record_inventory');
  });
  it('G4-05 conflicting authoritative records without precedence', () => {
    const f = fixture(); const conflict = structuredClone(firstEvidence(f)); conflict.evidence_id = 'E2';
    if (conflict.response.status !== 'success') throw new Error('fixture');
    (conflict.response.output as { fields: Record<string, unknown> }).fields.parent = { kind: 'parent', parent_id: 'P2' };
    f.trusted = { ...f.trusted, acquisition: { complete: true, conflict: true, records: [...f.trusted.acquisition.records, conflict] } };
    f.candidate.tool_responses.push(structuredClone(conflict)); rejected(run(f));
  });
  it('G4-06 hidden conflict/incomplete trusted acquisition', () => { const f = fixture(); f.trusted = { ...f.trusted, acquisition: { ...f.trusted.acquisition, complete: false } }; const producer = vi.fn(() => f.candidate); rejected(assure(f.trusted, producer)); expect(producer).not.toHaveBeenCalled(); });
  it('G5-01 well-shaped parent lie P2', () => { const f = fixture(); claim(f, 'parent', { kind: 'parent', parent_id: 'P2' }); rejected(run(f)); });
  it('G5-02 same value wrong pointer', () => { const f = fixture(); source(f, 'alternative_parent', { kind: 'parent', parent_id: 'P1' }); firstFact(f).provenance.pointer = '/fields/alternative_parent'; rejected(run(f)); });
  it('G5-03 same value wrong record', () => {
    const f = fixture();
    const acquired = fixture().trusted.acquisition.records[0];
    const offered = firstEvidence(fixture());
    if (!acquired || acquired.response.status !== 'success' || offered.response.status !== 'success') throw new Error('fixture acquisition');
    const acquiredR2 = { ...acquired, evidence_id: 'E2', record_id: 'R2', response: { ...acquired.response, source: { system: 'synthetic-fixture', reference: 'fixture://R2' } } };
    const offeredR2 = { ...offered, evidence_id: 'E2', record_id: 'R2', response: { ...offered.response, source: { system: 'synthetic-fixture', reference: 'fixture://R2' } } };
    // Both records are required, complete and non-conflicting; only E1 is mapped to parent.
    f.trusted = { ...f.trusted, acquisition: { ...f.trusted.acquisition, records: [...f.trusted.acquisition.records, acquiredR2] } };
    f.candidate.tool_responses.push(offeredR2);
    expect(f.trusted.acquisition.records).toEqual(f.candidate.tool_responses);
    expect(acquiredR2).not.toBe(offeredR2);
    // Positive control proves this two-record inventory can pass with the mapped record.
    complete(run(f), parentAnswer);
    firstFact(f).provenance.evidence_id = 'E2';
    const result = run(f); rejected(result);
    expect(result.rejection_category).toBe('provenance');
  });
  it('G5-04 producer redirects pointer to P2', () => { const f = fixture(); source(f, 'unrelated_parent', { kind: 'parent', parent_id: 'P2' }); firstFact(f).provenance.pointer = '/fields/unrelated_parent'; claim(f, 'parent', { kind: 'parent', parent_id: 'P2' }); rejected(run(f)); });
  it('G6-01 explicit synthetic root proof', () => { const f = fixture(); source(f, 'parent', { kind: 'root', explicit_root: true }); claim(f, 'parent', { kind: 'root' }); complete(run(f), 'Asset "A" has no parent in the bound source record.'); });
  it('G6-02 mapped null Unknown is not root', () => { const f = fixture(); source(f, 'parent', null); unknown(f, 'parent', 'source_null'); rejected(run(f), 'insufficient'); });
  it('G6-03 root proof absent', () => { const f = fixture(); source(f, 'parent', { kind: 'root' }); claim(f, 'parent', { kind: 'root' }); rejected(run(f)); });
  it('G7-01 canonical known zero', () => { const result = run(warehouse()); complete(result, zeroAnswer); expect(warehouseSufficient(result).evidence_status).toBe('Sufficient'); });
  it('G7-02 exact canonical 1.25 without arithmetic', () => { const f = warehouse(); source(f, 'available_quantity', { decimal: '1.25', unit: 'U' }); claim(f, 'available_quantity', { decimal: '1.25', unit: 'U' }); complete(run(f), 'WO "W", material line "L1", part "P": available quantity is 1.25 "U".'); });
  it('G7-03 negative zero invalid', () => { const f = warehouse(); claim(f, 'available_quantity', { decimal: '-0', unit: 'U' }); rejected(run(f)); });
  it('G7-04 exponent invalid', () => { const f = warehouse(); claim(f, 'available_quantity', { decimal: '1e3', unit: 'U' }); rejected(run(f)); });
  it('G7-05 nonfinite Number invalid', () => { const f = warehouse(); claim(f, 'available_quantity', { decimal: Infinity, unit: 'U' }); rejected(run(f)); });
  it('G7-06 numeric zero never coerced', () => { const f = warehouse(); claim(f, 'available_quantity', { decimal: 0, unit: 'U' }); rejected(run(f)); });
  it('G7-07 missing unit only Unknown under explicit fixture rule', () => { const f = warehouse(); source(f, 'available_quantity', { decimal: '0' }); rejected(run(f)); unknown(f, 'available_quantity', 'unsupported_source_value'); rejected(run(f), 'insufficient'); });
  it('G7-08 draft cannot become completed', () => { const f = warehouse('issue_status'); claim(f, 'issue_status', { state: 'completed' }); rejected(run(f)); });
  it('G7-09 unmapped source status explicitly Unknown', () => { const f = warehouse('issue_status'); source(f, 'issue_status', 'pending'); unknown(f, 'issue_status', 'unsupported_source_value'); rejected(run(f), 'insufficient'); });
  it('G8-01 portable rendering only: markup retained as literal data', () => { const f = fixture(); subjectIdentity(f, '**x** <b>x</b>'); complete(run(f), 'Asset "**x** <b>x</b>" has parent "P1".'); });
  it('G8-02 portable rendering only: visible bidi/control escapes', () => { const f = fixture(); subjectIdentity(f, 'A\u202E\u000A'); const result = run(f); complete(result, 'Asset "A\\u202E\\u000A" has parent "P1".'); expect(result.public.answer).not.toContain(String.fromCodePoint(0x202e)); expect(result.public.answer).not.toContain(String.fromCodePoint(0x0a)); });
  it('G8-03 portable rendering only: quote and backslash', () => { const f = fixture(); subjectIdentity(f, 'A"\\B'); complete(run(f), 'Asset "A\\"\\\\B" has parent "P1".'); });
  it('G8-04 internal partial always publicly abstains', () => { const f = warehouse('planned_quantity', 'issued_quantity'); source(f, 'issued_quantity', null); unknown(f, 'issued_quantity', 'source_null'); const result = run(f); rejected(result, 'partial'); expect(result.facts.map(v => v.state)).toEqual(['known', 'unknown']); expect(result.public.answer).not.toContain('5'); });
  it.skip('G8-01 actual downstream consumer — BLOCKED: no real literal-text view supplied', () => undefined);
  it.skip('G8-02 actual downstream bidi/control display — BLOCKED: no real literal-text view supplied', () => undefined);
  it.skip('G8-03 actual downstream second-decoding check — BLOCKED: no real literal-text view supplied', () => undefined);
});

describe('Independent-review regressions — 18 tests additional to the original 52 cases', () => {
  type Field = 'tenant_id' | 'capability' | 'request_id' | 'correlation_id' | 'trace_id' | 'tool_id' | 'tool_version' | 'source.system' | 'source.reference';
  function replaceField(record: Evidence, field: Field, value: string): Evidence {
    if (field === 'tenant_id' || field === 'capability') return { ...record, [field]: value };
    if (record.response.status !== 'success') throw new Error('fixture evidence');
    if (field === 'source.system' || field === 'source.reference') return { ...record, response: {
      ...record.response, source: { ...record.response.source, [field === 'source.system' ? 'system' : 'reference']: value }
    } };
    return { ...record, response: { ...record.response, [field]: value } };
  }
  const whitespaceFields = [
    ['request_id', 'Q'], ['correlation_id', 'C'], ['trace_id', 'TRACE'],
    ['tool_id', 'fixture.scoped.read'], ['tool_version', '1.0.0'],
    ['source.system', 'synthetic-fixture'], ['source.reference', 'fixture://R1']
  ] as const;
  it.each(whitespaceFields)('R1 rejects unnormalized whitespace in %s on both ingress paths', (field, original) => {
    const f = fixture();
    f.candidate.tool_responses[0] = replaceField(firstEvidence(f), field, ` ${original} `);
    for (const ingress of ['structured', 'raw'] as const) {
      const result = assure(f.trusted, () => ingress === 'raw' ? Buffer.from(JSON.stringify(f.candidate)) : f.candidate, ingress);
      rejected(result); expect(result.rejection_category).toBe('raw_evidence');
    }
  });
  it('R1 valid exact evidence control on both ingress paths', () => {
    const f = fixture();
    for (const ingress of ['structured', 'raw'] as const) {
      complete(assure(f.trusted, () => ingress === 'raw' ? Buffer.from(JSON.stringify(f.candidate)) : f.candidate, ingress), parentAnswer);
    }
  });
  it('R2 reversed two-Unknown facts preserve complete outcome and limitation order', () => {
    const f = warehouse('planned_quantity', 'issued_quantity');
    source(f, 'planned_quantity', null); unknown(f, 'planned_quantity', 'source_null');
    source(f, 'issued_quantity', null); unknown(f, 'issued_quantity', 'source_null');
    const canonical = run(f); rejected(canonical, 'insufficient');
    expect(canonical.facts.map(fact => fact.selector)).toEqual(['planned_quantity', 'issued_quantity']);
    expect(canonical.public.limitations).toEqual(['Unavailable requested facts: planned_quantity:source_null, issued_quantity:source_null']);
    f.candidate.facts.reverse();
    expect(run(f)).toEqual(canonical);
  });
  it('R2 reversed two-evidence and fact arrays preserve outcome and trusted citation order', () => {
    const f = warehouse('planned_quantity', 'issued_quantity');
    const acquired = warehouse('planned_quantity', 'issued_quantity').trusted.acquisition.records[0];
    const offered = firstEvidence(warehouse('planned_quantity', 'issued_quantity'));
    if (!acquired || acquired.response.status !== 'success' || offered.response.status !== 'success') throw new Error('fixture acquisition');
    const acquiredR2 = { ...acquired, evidence_id: 'E2', record_id: 'R2', response: { ...acquired.response, source: { system: 'synthetic-fixture', reference: 'fixture://R2' } } };
    const offeredR2 = { ...offered, evidence_id: 'E2', record_id: 'R2', response: { ...offered.response, source: { system: 'synthetic-fixture', reference: 'fixture://R2' } } };
    const issuedBinding = f.trusted.mapping.bindings.issued_quantity;
    const issuedFact = f.candidate.facts.find(fact => fact.selector === 'issued_quantity');
    if (!issuedBinding || !issuedFact) throw new Error('fixture mapping');
    f.trusted = { ...f.trusted,
      acquisition: { ...f.trusted.acquisition, records: [...f.trusted.acquisition.records, acquiredR2] },
      mapping: { ...f.trusted.mapping, bindings: { ...f.trusted.mapping.bindings, issued_quantity: { ...issuedBinding, evidence_id: 'E2' } } }
    };
    f.candidate.tool_responses.push(offeredR2);
    issuedFact.provenance.evidence_id = 'E2';
    const canonical = run(f);
    expect(canonical.internal).toBe('complete');
    expect(canonical.public.answer).toBe('WO "W", material line "L1", part "P": planned quantity is 5 "U". WO "W", material line "L1", part "P": issued quantity is 0 "U".');
    expect(canonical.facts.map(fact => fact.selector)).toEqual(['planned_quantity', 'issued_quantity']);
    expect(canonical.citations).toEqual(['fixture://R1', 'fixture://R2']);
    f.candidate.tool_responses.reverse(); f.candidate.facts.reverse();
    expect(run(f)).toEqual(canonical);
  });
  const contextFields = [
    ['tenant_id', 'T2'], ['capability', 'K2'], ['request_id', 'Q2'], ['correlation_id', 'C2'],
    ['trace_id', 'TRACE2'], ['tool_id', 'fixture.other.read'], ['tool_version', '2.0.0']
  ] as const;
  it.each(contextFields)('R3 matching acquired/offered %s still rejects authoritative context mismatch', (field, wrong) => {
    const f = fixture();
    const independentAcquired = fixture().trusted.acquisition.records[0];
    const independentOffered = firstEvidence(fixture());
    if (!independentAcquired) throw new Error('fixture acquisition');
    const acquired = replaceField(independentAcquired, field, wrong);
    const offered = replaceField(independentOffered, field, wrong);
    expect(acquired).toEqual(offered); expect(acquired).not.toBe(offered);
    f.trusted = { ...f.trusted, acquisition: { ...f.trusted.acquisition, records: [acquired] } };
    f.candidate.tool_responses = [offered];
    const result = run(f); rejected(result);
    expect(result.rejection_category).toBe('context_binding');
  });
  it('R3 independently authored matching evidence and authoritative context passes', () => {
    const f = fixture();
    const acquired = fixture().trusted.acquisition.records[0];
    const offered = firstEvidence(fixture());
    if (!acquired) throw new Error('fixture acquisition');
    expect(acquired).toEqual(offered); expect(acquired).not.toBe(offered);
    f.trusted = { ...f.trusted, acquisition: { ...f.trusted.acquisition, records: [acquired] } };
    f.candidate.tool_responses = [offered];
    complete(run(f), parentAnswer);
  });
});
