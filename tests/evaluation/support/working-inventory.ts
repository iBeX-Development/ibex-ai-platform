import { exactUrlSchema } from '../../../packages/contracts/src/validation.js';
import { createHash } from 'node:crypto';
import { z } from 'zod';

const base = 'docs/governance/sir-02/';
const dispatch = `${base}SIR-02-EVIDENCE-DISPATCH-TRACKER-v1.0.md`;
const collection = `${base}SIR-02-EVIDENCE-COLLECTION-REGISTER-v1.0.md`;
const matrix = `${base}controls/SIR-02-KM-OPERATIONAL-EVIDENCE-ACCEPTANCE-MATRIX-v1.0.md`;
const registry = 'docs/evaluation/findings/registry.v1.json';
const snapshotCommit = '529951f9818c301aae67d94e980deafe7495391f';
// Pinned local regression oracles, never independent authority or approval.
const pins: Readonly<Record<string, string>> = {
  [dispatch]: 'bb5a551ee4e3b20bf705ec040931d01bd17a238f77025605b4072508ba2bda4f',
  [collection]: 'a1c04647a705a1430fcd0c4740c64d901ec24180f331fdc84a6d3d656869b307',
  [matrix]: '2f4ef5598d62c5131324a6f52067364e274cbd180b01b69915804ff6105ed15e',
  [registry]: 'c1b4044e724460a450bd4f8ef867a2c3f99a843861bae5d8385ee10749829fc2'
};
const ownerMembers: Readonly<Record<string, readonly string[]>> = {
  Product: ['GOV-01', 'GOV-02', 'CFG-02', 'CFG-03', 'CFG-04', 'CFG-06', 'CFG-07', 'DEF-03'],
  'RAG Architecture': [
    'GOV-01',
    'GOV-03',
    'CFG-02',
    'CFG-03',
    'CFG-04',
    'CFG-07',
    'DEF-01',
    'DEF-02'
  ],
  Security: ['GOV-01', 'GOV-04', 'CFG-04', 'DEF-01'],
  'Data Governance': ['GOV-01', 'GOV-05', 'DEF-01', 'DEF-03'],
  'Platform Operations': ['CFG-05', 'CFG-06'],
  'Knowledge Management': ['DEF-01', 'DEF-02', 'DEF-03']
};
const findingIds = [
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
const oeIds = [
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
const historicalPopulations = ['after-config-scope', 'final-sign-off', 'parent-sir'];
const localRef = (path: string) =>
  z.object({ path: z.literal(path), line: z.number().int().positive().int() }).strict();
const httpsLocator = exactUrlSchema.refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
});
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const schema = z
  .object({
    schema_version: z.literal('1.0.0'),
    inventory_id: z.literal('ibex-bounded-working-inventory'),
    purpose: z.literal('prospective-working-scope-only'),
    project_completeness: z.literal('unknown'),
    authority_status: z.literal('not-activated'),
    scope_acceptance: z
      .object({
        date: z.literal('2026-10-14'),
        reported_message_id: z.literal('Sentinel_d2d954f3771081919ed81abf29b77d93'),
        meaning: z.literal('scope-only-not-exact-content-approval')
      })
      .strict(),
    source_snapshot_commit: z.literal(snapshotCommit),
    source_snapshots: z.array(
      z
        .object({
          path: z.enum([dispatch, collection, matrix]),
          sha256: digest,
          external_locator: httpsLocator
        })
        .strict()
    ),
    finding_registry: z.object({ path: z.literal(registry), sha256: digest }).strict(),
    finding_references: z.array(
      z.object({ record_type: z.literal('finding_reference'), finding_id: z.string() }).strict()
    ),
    owner_assignments: z.array(
      z
        .object({
          record_type: z.literal('owner_assignment'),
          owner_group: z.string(),
          evidence_id: z.string(),
          dispatch_ref: localRef(dispatch),
          collection_ref: localRef(collection),
          historical_state: z
            .object({
              request_status: z.literal('Sent'),
              evidence_status: z.enum(['Ready for Review', 'Missing']),
              review_status: z.enum(['Accepted', 'Not Reviewed'])
            })
            .strict()
        })
        .strict()
    ),
    operational_requirements: z.array(
      z
        .object({
          record_type: z.literal('operational_requirement'),
          requirement_id: z.string(),
          evidence_item: z.string().min(1),
          historical_execution_status: z.literal('Not Executed'),
          matrix_ref: localRef(matrix)
        })
        .strict()
    ),
    historical_gaps: z.array(
      z
        .object({
          record_type: z.literal('unresolved_historical_population'),
          prospective_population_key: z.enum([
            'after-config-scope',
            'final-sign-off',
            'parent-sir'
          ]),
          reported_count: z.number().int().positive().int().nullable(),
          detailed_identities: z.literal('unavailable'),
          obligation_state: z.literal('unresolved'),
          overlap: z.literal('unknown')
        })
        .strict()
    )
  })
  .strict();

export type WorkingInventory = z.infer<typeof schema>;

// Scan the raw token stream before parsing the complete object. JSON.parse on an
// individual string token decodes escaped keys without discarding duplicate keys.
function parseUniqueJson(text: string): unknown {
  if (Buffer.byteLength(text, 'utf8') > 1_048_576) throw new Error('Too large');
  let offset = 0;
  const space = () => {
    while (/[\t\r\n ]/.test(text[offset] ?? '') && offset < text.length) offset++;
  };
  const string = (): string => {
    const token = /"(?:[^"\\]|\\.)*"/y;
    token.lastIndex = offset;
    const match = token.exec(text);
    if (!match) throw new Error('Invalid string');
    offset = token.lastIndex;
    return JSON.parse(match[0]) as string;
  };
  const take = (character: string) => {
    space();
    if (text[offset++] !== character) throw new Error('Invalid punctuation');
  };
  const value = (depth: number): void => {
    if (depth > 100) throw new Error('Too deep');
    space();
    const start = text[offset];
    if (start === '{' || start === '[') {
      offset++;
      const end = start === '{' ? '}' : ']';
      const keys = new Set<string>();
      space();
      if (text[offset] === end) {
        offset++;
        return;
      }
      for (;;) {
        space();
        if (start === '{') {
          const key = string();
          if (keys.has(key)) throw new Error('Duplicate decoded JSON key');
          keys.add(key);
          take(':');
        }
        value(depth + 1);
        space();
        if (text[offset] === end) {
          offset++;
          break;
        }
        take(',');
      }
    } else if (start === '"') string();
    else {
      const token = /(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/y;
      token.lastIndex = offset;
      if (!token.exec(text)) throw new Error('Invalid value');
      offset = token.lastIndex;
    }
  };
  value(0);
  space();
  if (offset !== text.length) throw new Error('Trailing data');
  return JSON.parse(text) as unknown;
}

export interface WorkingInventoryAssessment {
  readonly structural_status: 'PASS' | 'FAIL';
  readonly authority_status: 'not-activated';
  readonly project_completeness: 'unknown';
  readonly diagnostics: readonly string[];
}

// readLocal is a read-only local-text resolver, not an authority callback. Only
// the four fixed paths above reach it; this module never fetches external URLs.
export function assessWorkingInventory(
  text: string,
  readLocal: (path: string) => string
): WorkingInventoryAssessment {
  const diagnostics: string[] = [];
  const problem = (code: string) => {
    if (!diagnostics.includes(code)) diagnostics.push(code);
  };
  const finish = (): WorkingInventoryAssessment => ({
    structural_status: diagnostics.length ? 'FAIL' : 'PASS',
    authority_status: 'not-activated',
    project_completeness: 'unknown',
    diagnostics
  });
  let parsed: unknown;
  try {
    parsed = parseUniqueJson(text);
  } catch {
    problem('MALFORMED_JSON');
    return finish();
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    problem('INVALID_STRUCTURE');
    return finish();
  }
  const inventory = result.data;
  const members = (actual: readonly string[], expected: readonly string[], label: string) => {
    if (new Set(actual).size !== actual.length) problem(`DUPLICATE_${label}`);
    if (
      actual.length !== expected.length ||
      expected.some((id) => !actual.includes(id)) ||
      actual.some((id) => !expected.includes(id))
    )
      problem(`MEMBERSHIP_${label}`);
  };
  members(
    inventory.source_snapshots.map((s) => s.path),
    [dispatch, collection, matrix],
    'SOURCES'
  );
  members(
    inventory.finding_references.map((f) => f.finding_id),
    findingIds,
    'FINDINGS'
  );
  members(
    inventory.owner_assignments.map((a) => `${a.owner_group}/${a.evidence_id}`),
    Object.entries(ownerMembers).flatMap(([owner, ids]) => ids.map((id) => `${owner}/SIR02-${id}`)),
    'ASSIGNMENTS'
  );
  members(
    inventory.operational_requirements.map((o) => o.requirement_id),
    oeIds,
    'REQUIREMENTS'
  );
  members(
    inventory.historical_gaps.map((g) => g.prospective_population_key),
    historicalPopulations,
    'GAPS'
  );
  for (const gap of inventory.historical_gaps) {
    const expected =
      gap.prospective_population_key === 'after-config-scope'
        ? 32
        : gap.prospective_population_key === 'final-sign-off'
          ? 11
          : null;
    if (gap.reported_count !== expected) problem('HISTORICAL_COUNT_MISMATCH');
  }
  const local = new Map<string, string>();
  for (const source of [...inventory.source_snapshots, inventory.finding_registry]) {
    try {
      const content = readLocal(source.path);
      if (
        source.sha256 !== pins[source.path] ||
        createHash('sha256').update(content, 'utf8').digest('hex') !== pins[source.path]
      )
        problem('LOCAL_SNAPSHOT_MISMATCH');
      else local.set(source.path, content);
    } catch {
      problem('LOCAL_REFERENCE_UNRESOLVED');
    }
  }
  const row = (ref: { path: string; line: number }): string[] => {
    const line = local.get(ref.path)?.split('\n')[ref.line - 1];
    if (!line?.startsWith('|')) {
      problem('LOCAL_ROW_UNRESOLVED');
      return [];
    }
    return line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim().replace(/^`|`$/g, ''));
  };
  for (const a of inventory.owner_assignments) {
    const d = row(a.dispatch_ref);
    const c = row(a.collection_ref);
    const heading = local
      .get(collection)
      ?.split('\n')
      .slice(0, a.collection_ref.line - 1)
      .filter((line) => line.startsWith('## '))
      .at(-1);
    if (
      d[0] !== a.evidence_id ||
      d[1] !== a.owner_group ||
      c[0] !== a.evidence_id ||
      heading !== `## ${a.owner_group} Immediate-stage evidence`
    )
      problem('ASSIGNMENT_REFERENCE_MISMATCH');
    if (
      d[3] !== a.historical_state.request_status ||
      d[4] !== a.historical_state.evidence_status ||
      d[5] !== a.historical_state.review_status ||
      c[4] !== a.historical_state.evidence_status ||
      c[5] !== a.historical_state.review_status
    )
      problem('HISTORICAL_STATE_MISMATCH');
  }
  for (const o of inventory.operational_requirements) {
    const m = row(o.matrix_ref);
    if (
      m[0] !== o.requirement_id ||
      m[1] !== o.evidence_item ||
      m[8] !== o.historical_execution_status
    )
      problem('REQUIREMENT_REFERENCE_MISMATCH');
  }
  // The pinned draft supplies references only; it must retain unknown/unreviewed findings.
  const draftText = local.get(registry);
  if (draftText) {
    const draftSchema = z.object({
      findings: z.array(
        z.object({
          finding_id: z.string(),
          severity: z.literal('unknown'),
          status: z.literal('unreviewed'),
          remediation_refs: z.array(z.string()).max(0),
          verification_refs: z.array(z.string()).max(0)
        })
      )
    });
    const draft = draftSchema.safeParse(parseUniqueJson(draftText));
    if (!draft.success) problem('FINDING_REFERENCE_MISMATCH');
    else
      members(
        draft.data.findings.map((f) => f.finding_id),
        findingIds,
        'REGISTRY_FINDINGS'
      );
  }
  return finish();
}
