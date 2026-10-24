import type { Candidate, Evidence, Fact, Selector, Subject, TrustedFixture } from './scoped-factual-grounding.js';

// Entire mapping and acquisition protocol are SYNTHETIC ONLY, not inferred Core fields.
export interface Fixture { trusted: TrustedFixture; candidate: Candidate }
export function fixture(kind: 'asset_parent' | 'warehouse_facts' = 'asset_parent', requested: readonly Selector[] = kind === 'asset_parent' ? ['parent'] : ['available_quantity']): Fixture {
  const subject: Subject = kind === 'asset_parent' ? { kind, asset_id: 'A' } : {
    kind, wo_id: 'W', material_line_id: 'L1', part_id: 'P', warehouse_id: 'WH',
    ...(requested.includes('issue_status') ? { issue_id: 'I' } : {})
  };
  // Source facts are independently authored, not extracted from candidate claims.
  const source = { parent: { kind: 'parent', parent_id: 'P1' },
    required_quantity: { decimal: '5', unit: 'U' }, available_quantity: { decimal: '0', unit: 'U' },
    planned_quantity: { decimal: '5', unit: 'U' }, issued_quantity: { decimal: '0', unit: 'U' }, issue_status: 'draft' };
  const claims: Record<Selector, unknown> = {
    parent: { kind: 'parent', parent_id: 'P1' }, required_quantity: { decimal: '5', unit: 'U' },
    available_quantity: { decimal: '0', unit: 'U' }, planned_quantity: { decimal: '5', unit: 'U' },
    issued_quantity: { decimal: '0', unit: 'U' }, issue_status: { state: 'draft' }
  };
  const evidence: Evidence = {
    evidence_id: 'E1', record_id: 'R1', tenant_id: 'T1', capability: kind === 'asset_parent' ? 'asset.get_parent' : 'WO_MATERIAL_LOOKUP',
    response: { contract_version: '1.0', status: 'success', request_id: 'Q', correlation_id: 'C', trace_id: 'TRACE',
      tool_id: 'fixture.scoped.read', tool_version: '1.0.0', output: { subject: structuredClone(subject), fields: source },
      source: { system: 'synthetic-fixture', reference: 'fixture://R1' }, observed_at: '2026-10-18T00:00:00.000Z', attempts: 1 }
  };
  const bindings = Object.fromEntries(requested.map(key => [key, { evidence_id: 'E1', pointer: `/fields/${key}`, unknown: [] }]));
  const trusted: TrustedFixture = {
    operation: kind, subject, requested: [...requested],
    context: { tenant_id: 'T1', request_id: 'Q', correlation_id: 'C', trace_id: 'TRACE' }, capability: evidence.capability,
    tool: { id: 'fixture.scoped.read', version: '1.0.0' }, mapping: { id: 'fixture.scoped.mapping', version: '1', bindings },
    acquisition: { complete: true, conflict: false, records: [structuredClone(evidence)] },
    issueAssociations: requested.includes('issue_status') ? [{ issue_id: 'I', wo_id: 'W', material_line_id: 'L1' }] : [],
    // Explicit test budget only; actual production ingress limits are unresolved.
    limits: { bytes: 65_536, depth: 32 }
  };
  const facts = requested.map(key => ({ selector: key, state: 'known', value: structuredClone(claims[key]),
    provenance: { evidence_id: 'E1', pointer: `/fields/${key}`, mapping_id: 'fixture.scoped.mapping', mapping_version: '1' } })) as Fact[];
  return { trusted, candidate: { contract_id: 'scoped-factual-grounding', contract_version: '1.0.1', kind,
    subject: structuredClone(subject), tool_responses: [structuredClone(evidence)], facts } };
}

export function claim(f: Fixture, key: Selector, value: unknown): void {
  const index = f.candidate.facts.findIndex(v => v.selector === key);
  const old = f.candidate.facts[index];
  if (!old) throw new Error('fixture selector');
  // Deliberately permit malformed adversarial claims at the test boundary.
  f.candidate.facts[index] = { selector: key, state: 'known', value, provenance: old.provenance } as Fact;
}
export function source(f: Fixture, key: string, value: unknown): void {
  const records = structuredClone(f.trusted.acquisition.records);
  const record = records[0];
  if (!record || record.response.status !== 'success') throw new Error('fixture evidence');
  const output = record.response.output as { fields: Record<string, unknown> };
  if (value === undefined) Reflect.deleteProperty(output.fields, key); else output.fields[key] = value;
  f.trusted = { ...f.trusted, acquisition: { ...f.trusted.acquisition, records } };
  f.candidate.tool_responses = structuredClone([...records]);
}
export function unknown(f: Fixture, key: Selector, why: 'absent' | 'source_null' | 'unsupported_source_value'): void {
  const binding = f.trusted.mapping.bindings[key];
  const index = f.candidate.facts.findIndex(v => v.selector === key);
  const old = f.candidate.facts[index];
  if (!binding || !old) throw new Error('fixture binding');
  f.trusted = { ...f.trusted, mapping: { ...f.trusted.mapping, bindings: { ...f.trusted.mapping.bindings,
    [key]: { ...binding, unknown: [why] } } } };
  f.candidate.facts[index] = { selector: key, state: 'unknown', reason: why, provenance: old.provenance };
}
export function subjectIdentity(f: Fixture, assetId: string): void {
  const subject: Subject = { kind: 'asset_parent', asset_id: assetId };
  const records = structuredClone(f.trusted.acquisition.records);
  const record = records[0];
  if (!record || record.response.status !== 'success') throw new Error('fixture evidence');
  (record.response.output as Record<string, unknown>).subject = subject;
  f.trusted = { ...f.trusted, subject, acquisition: { ...f.trusted.acquisition, records } };
  f.candidate.subject = structuredClone(subject);
  f.candidate.tool_responses = structuredClone([...records]);
}
