// SYNTHETIC PROTOTYPE ONLY. This is not a Core schema or production semantic gate.
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { toolExecutionResponseSchema } from '../../packages/tool-runtime/src/index.js';
import { rawJsonSnapshot, structuredSnapshot, type IngressLimits } from './scoped-factual-grounding-ingress.js';

const id = z.string().min(1); // Opaque; intentionally no trim or ASCII restriction.
export const selectors = ['parent', 'required_quantity', 'available_quantity', 'planned_quantity', 'issued_quantity', 'issue_status'] as const;
export type Selector = typeof selectors[number];
const selector = z.enum(selectors);
const reason = z.enum(['absent', 'source_null', 'source_unavailable', 'unsupported_source_value']);
type Reason = z.infer<typeof reason>;
const subject = z.union([
  z.object({ kind: z.literal('asset_parent'), asset_id: id }).strict(),
  z.object({ kind: z.literal('warehouse_facts'), wo_id: id, material_line_id: id, part_id: id,
    warehouse_id: id.nullable(), issue_id: id.optional() }).strict()
]);
export type Subject = z.infer<typeof subject>;
const decimal = z.string().regex(/^-?(0|[1-9][0-9]*)(\.[0-9]*[1-9])?$/).refine(v => v !== '-0');
const factValue = z.union([
  z.object({ kind: z.literal('parent'), parent_id: id }).strict(),
  z.object({ kind: z.literal('root') }).strict(),
  z.object({ decimal, unit: id }).strict(),
  z.object({ state: z.enum(['draft', 'completed']) }).strict()
]);
const provenance = z.object({ evidence_id: id, pointer: z.string(), mapping_id: id, mapping_version: id }).strict();
const fact = z.discriminatedUnion('state', [
  z.object({ selector, state: z.literal('known'), value: factValue, provenance }).strict(),
  z.object({ selector, state: z.literal('unknown'), reason, provenance }).strict()
]);
export type Fact = z.infer<typeof fact>;
const evidenceSchema = z.object({
  evidence_id: id, record_id: id, tenant_id: id, capability: id,
  response: toolExecutionResponseSchema
}).strict();
export type Evidence = z.infer<typeof evidenceSchema>;
const resultSchema = z.object({
  contract_id: z.literal('scoped-factual-grounding'), contract_version: z.literal('1.0.1'),
  kind: z.enum(['asset_parent', 'warehouse_facts']), subject,
  tool_responses: z.array(evidenceSchema), facts: z.array(fact).min(1)
}).strict();
export type Candidate = z.infer<typeof resultSchema>;
export interface Binding {
  readonly evidence_id: string;
  readonly pointer: string;
  // These rules are fixture-owned and never accepted from the answer producer.
  readonly unknown: readonly Reason[];
}
export interface TrustedFixture {
  readonly operation: 'asset_parent' | 'warehouse_facts' | 'unsupported';
  readonly subject: Subject;
  readonly requested: readonly Selector[];
  readonly context: { readonly tenant_id: string; readonly request_id: string; readonly correlation_id: string; readonly trace_id: string };
  readonly capability: string;
  readonly tool: { readonly id: string; readonly version: string };
  readonly mapping: { readonly id: string; readonly version: string; readonly bindings: Partial<Record<Selector, Binding>> };
  readonly acquisition: { readonly complete: boolean; readonly conflict: boolean; readonly records: readonly Evidence[] };
  readonly issueAssociations: readonly { readonly issue_id: string; readonly wo_id: string; readonly material_line_id: string }[];
  readonly limits: IngressLimits; // Explicit synthetic budget, not a proposed production policy.
}
type Internal = 'complete' | 'partial' | 'insufficient' | 'invalid';
type RejectionCategory = 'record_inventory' | 'provenance' | 'raw_evidence' | 'context_binding' | 'other';
class ScopedRejection extends Error {
  constructor(readonly category: RejectionCategory) { super(category); }
}
export interface Outcome {
  readonly internal: Internal;
  // Bounded test diagnostic, never included in the public response or production audit.
  readonly rejection_category: RejectionCategory | null;
  readonly public: { readonly response_type: 'operational' | 'analysis' | 'abstain'; readonly evidence_status: 'sufficient' | 'insufficient'; readonly answer: string; readonly limitations: readonly string[] };
  readonly facts: readonly Fact[];
  readonly citations: readonly string[];
  readonly consumer: 'literal-text-only';
}
function blocked(internal: Exclude<Internal, 'complete'>, limitation: string, facts: readonly Fact[] = [], category: RejectionCategory = 'other'): Outcome {
  return Object.freeze({ internal, rejection_category: internal === 'invalid' ? category : null, public: Object.freeze({ response_type: 'abstain', evidence_status: 'insufficient',
    answer: 'Insufficient approved evidence is available for this request.', limitations: Object.freeze([limitation]) }),
    facts: Object.freeze([...facts]), citations: Object.freeze([]), consumer: 'literal-text-only' });
}
function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('source record');
  return value as Record<string, unknown>;
}
function pointerValue(output: unknown, pointer: string): unknown {
  if (!pointer.startsWith('/') || /~(?![01])/.test(pointer)) throw new Error('pointer');
  let current = output;
  for (const token of pointer.slice(1).split('/')) {
    const record = object(current);
    const key = token.replace(/~1/g, '/').replace(/~0/g, '~');
    if (!Object.hasOwn(record, key)) return undefined;
    current = record[key];
  }
  return current;
}
function expectedFact(selected: Selector, source: unknown, binding: Binding): Pick<Fact, 'state'> & { value?: z.infer<typeof factValue>; reason?: Reason } {
  const unknown = (why: Reason) => {
    if (!binding.unknown.includes(why)) throw new Error('unapproved unknown condition');
    return { state: 'unknown' as const, reason: why };
  };
  if (source === undefined) return unknown('absent');
  if (source === null) return unknown('source_null');
  if (selected === 'parent') {
    const parent = z.union([z.object({ kind: z.literal('parent'), parent_id: id }).strict(),
      z.object({ kind: z.literal('root'), explicit_root: z.literal(true) }).strict()]).parse(source);
    return { state: 'known', value: parent.kind === 'root' ? { kind: 'root' } : parent };
  }
  if (selected === 'issue_status') {
    const status = z.string().min(1).parse(source);
    if (status !== 'draft' && status !== 'completed') return unknown('unsupported_source_value');
    return { state: 'known', value: { state: status } };
  }
  const quantity = z.object({ decimal, unit: id.optional() }).strict().parse(source);
  if (quantity.unit === undefined) return unknown('unsupported_source_value');
  return { state: 'known', value: { decimal: quantity.decimal, unit: quantity.unit } };
}
/** Quoted tokens for a literal sink only. Never Markdown/HTML-safe serialization. */
export function quoteLiteral(value: string): string {
  let escaped = '';
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f) || code === 0x2028 || code === 0x2029 ||
      code === 0x061c || code === 0x200e || code === 0x200f || (code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069))
      escaped += `\\u${code.toString(16).toUpperCase().padStart(4, '0')}`;
    else escaped += ch === '"' || ch === '\\' ? `\\${ch}` : ch;
  }
  return `"${escaped}"`;
}
function render(subject: Subject, facts: readonly Fact[]): string {
  return selectors.flatMap(key => facts.filter(f => f.selector === key)).map(f => {
    if (f.state !== 'known') throw new Error('unknown rendering');
    if (subject.kind === 'asset_parent' && 'kind' in f.value) {
      return f.value.kind === 'root' ? `Asset ${quoteLiteral(subject.asset_id)} has no parent in the bound source record.` :
        `Asset ${quoteLiteral(subject.asset_id)} has parent ${quoteLiteral(f.value.parent_id)}.`;
    }
    if (subject.kind !== 'warehouse_facts') throw new Error('kind');
    const prefix = `WO ${quoteLiteral(subject.wo_id)}, material line ${quoteLiteral(subject.material_line_id)}`;
    if ('state' in f.value) return `${prefix}: Issue status in the bound source is ${f.value.state}.`;
    if (!('decimal' in f.value)) throw new Error('quantity');
    const labels: Partial<Record<Selector, string>> = { required_quantity: 'required quantity', available_quantity: 'available quantity', planned_quantity: 'planned quantity', issued_quantity: 'issued quantity' };
    const label = labels[f.selector];
    if (!label) throw new Error('label');
    return `${prefix}, part ${quoteLiteral(subject.part_id)}: ${label} is ${f.value.decimal} ${quoteLiteral(f.value.unit)}.`;
  }).join(' ');
}
export function assure(trusted: TrustedFixture, produce: () => unknown, ingress: 'structured' | 'raw' = 'structured'): Outcome {
  if (trusted.operation === 'unsupported') return blocked('invalid', 'Unsupported scoped operation');
  try {
    // Capture fixture-owned authority before calling a potentially hostile producer.
    trusted = structuredSnapshot(trusted, trusted.limits) as TrustedFixture;
    const requested = trusted.requested;
    if (!requested.length || new Set(requested).size !== requested.length || trusted.operation !== trusted.subject.kind ||
      requested.some(s => trusted.operation === 'asset_parent' ? s !== 'parent' : s === 'parent')) throw new Error('routing');
    subject.parse(trusted.subject);
    if (requested.includes('issue_status')) {
      if (trusted.subject.kind !== 'warehouse_facts' || !trusted.subject.issue_id) throw new Error('missing Issue selector');
      const [association] = trusted.issueAssociations;
      if (trusted.issueAssociations.length !== 1 || !association || association.issue_id !== trusted.subject.issue_id ||
        association.wo_id !== trusted.subject.wo_id || association.material_line_id !== trusted.subject.material_line_id) throw new Error('Issue association');
    }
    if (!trusted.acquisition.complete || trusted.acquisition.conflict) throw new Error('acquisition incomplete or conflicting');
    const raw = produce();
    if (ingress === 'raw' && !(raw instanceof Uint8Array)) throw new Error('raw bytes required');
    const decoded = ingress === 'raw' ? rawJsonSnapshot(raw as Uint8Array, trusted.limits) : structuredSnapshot(raw, trusted.limits);
    // Shared Tool schemas trim some strings. Compare the unnormalized ingress snapshot
    // first so that whitespace changes cannot be erased before acquisition equality.
    const expectedRecords = trusted.acquisition.records;
    const rawEvidence = object(decoded).tool_responses;
    if (!Array.isArray(rawEvidence)) throw new ScopedRejection('raw_evidence');
    for (const entry of rawEvidence) {
      const rawRecord = object(entry);
      const expected = expectedRecords.find(e => e.evidence_id === rawRecord.evidence_id);
      if (!expected || !isDeepStrictEqual(rawRecord, expected)) throw new ScopedRejection('raw_evidence');
    }
    const result = resultSchema.parse(decoded);
    if (result.kind !== trusted.operation || !isDeepStrictEqual(result.subject, trusted.subject)) throw new Error('subject');
    const keys = result.facts.map(f => f.selector);
    if (keys.length !== requested.length || new Set(keys).size !== keys.length || requested.some(k => !keys.includes(k))) throw new Error('selector inventory');
    const unique = (records: readonly Evidence[]) => new Set(records.map(e => e.evidence_id)).size === records.length && new Set(records.map(e => e.record_id)).size === records.length;
    if (!expectedRecords.length || !unique(expectedRecords) || !unique(result.tool_responses) || expectedRecords.length !== result.tool_responses.length) throw new ScopedRejection('record_inventory');
    for (const evidence of result.tool_responses) {
      const expected = expectedRecords.find(e => e.evidence_id === evidence.evidence_id);
      if (!expected || !isDeepStrictEqual(evidence, expected)) throw new Error('trusted acquisition mismatch');
      const r = evidence.response;
      if (evidence.tenant_id !== trusted.context.tenant_id || evidence.capability !== trusted.capability || r.status !== 'success' ||
        r.request_id !== trusted.context.request_id || r.correlation_id !== trusted.context.correlation_id || r.trace_id !== trusted.context.trace_id ||
        r.tool_id !== trusted.tool.id || r.tool_version !== trusted.tool.version) throw new ScopedRejection('context_binding');
      const output = object(r.output);
      if (!isDeepStrictEqual(output.subject, trusted.subject)) throw new Error('record subject');
    }
    for (const f of result.facts) {
      const binding = trusted.mapping.bindings[f.selector];
      if (!binding || f.provenance.mapping_id !== trusted.mapping.id || f.provenance.mapping_version !== trusted.mapping.version ||
        f.provenance.evidence_id !== binding.evidence_id || f.provenance.pointer !== binding.pointer) throw new ScopedRejection('provenance');
      const record = result.tool_responses.find(e => e.evidence_id === binding.evidence_id);
      if (!record || record.response.status !== 'success') throw new Error('record missing');
      const expected = expectedFact(f.selector, pointerValue(record.response.output, binding.pointer), binding);
      const actual = f.state === 'known' ? { state: f.state, value: f.value } : { state: f.state, reason: f.reason };
      if (!isDeepStrictEqual(actual, expected)) throw new Error('typed claim mismatch');
    }
    const orderedFacts = requested.map(key => {
      const selected = result.facts.find(f => f.selector === key);
      if (!selected) throw new Error('selector inventory');
      return selected;
    });
    const facts = structuredSnapshot(orderedFacts, trusted.limits) as readonly Fact[];
    const known = facts.filter(f => f.state === 'known').length;
    if (known !== requested.length) return blocked(known ? 'partial' : 'insufficient',
      `Unavailable requested facts: ${facts.filter(f => f.state === 'unknown').map(f => `${f.selector}:${f.reason}`).join(', ')}`, facts);
    const usedIds = new Set(facts.map(f => f.provenance.evidence_id));
    const citations = expectedRecords.filter(e => usedIds.has(e.evidence_id)).map(e => e.response.status === 'success' ? e.response.source.reference : '');
    return Object.freeze({ internal: 'complete', rejection_category: null, public: Object.freeze({ response_type: trusted.operation === 'asset_parent' ? 'operational' : 'analysis',
      evidence_status: 'sufficient', answer: render(trusted.subject, facts), limitations: Object.freeze([]) }), facts,
      citations: Object.freeze(citations), consumer: 'literal-text-only' });
  } catch (error) { return blocked('invalid', 'Scoped factual contract or trusted binding is invalid', [], error instanceof ScopedRejection ? error.category : 'other'); }
}

/** Synthetic consuming projection guard; not a substitute for production integration. */
export function warehouseSufficient(outcome: Outcome): { evidence_status: 'Sufficient'; answer: string } {
  if (outcome.internal !== 'complete' || outcome.public.evidence_status !== 'sufficient' || outcome.public.response_type !== 'analysis') throw new Error('Warehouse projection unavailable');
  return { evidence_status: 'Sufficient', answer: outcome.public.answer };
}
