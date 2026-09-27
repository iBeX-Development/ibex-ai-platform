import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { z } from 'zod';
import { auditEventSchema } from '../../packages/contracts/src/index.js';
import {
  AuditTelemetryPipeline,
  InMemoryAuditEvidenceStore,
  createSecurityAuditEvent,
  type AuditEvent,
  type AuditHealthEvidence,
  type AuditMetric,
  type AuditTelemetryPipelineDependencies,
  type CanonicalAuditEvent,
  type SecurityObservation
} from '../../packages/audit/src/index.js';
import { createTrustedRequestContext } from '../../packages/security/src/index.js';
import {
  ACCEPTED_INPUTS,
  OE09_NAMESPACE,
  OE09_SCHEMA,
  OE09_TENANT_A,
  OE09_TENANT_B,
  buildAuthoritativeInventory,
  loadAcceptedEvidence,
  type ImmutableEvidenceInput
} from './sir02-km-oe09-reconciliation-fixture.js';

export const OE12_NAMESPACE = OE09_NAMESPACE;
export const OE12_SCHEMA = OE09_SCHEMA;
export const OE12_TENANT_A = OE09_TENANT_A;
export const OE12_TENANT_B = OE09_TENANT_B;

export const EVENT_FAMILIES = [
  'source_registration',
  'tenant_owner_binding',
  'source_approval',
  'source_rejection',
  'version_lineage',
  'provenance',
  'supersession',
  'stale_quarantine',
  'duplicate_conflict',
  'human_decision_hold',
  'fail_closed_denial',
  'permission_tenant_denial',
  'reconciliation',
  'synthetic_withdrawal_retention'
] as const;
export type EventFamily = (typeof EVENT_FAMILIES)[number];

export interface PinnedEvidenceInput {
  readonly id: string;
  readonly path: string;
  readonly commit: string;
  readonly sha256: string;
  readonly reviewCommit: string;
}

const laterInputs: readonly PinnedEvidenceInput[] = [
  {
    id: 'SIR02-KM-OE-09',
    path: 'docs/governance/sir-02/operational-evidence/oe-09/SIR-02-KM-OE-09-SOURCE-RECONCILIATION-FORMAL-EVIDENCE-0001-v1.0.json',
    commit: 'de9cc392fc258156cbda9dad5d7197b46c8251f9',
    sha256: 'f33f71447115e5c0835d112925d611eb848b9be24bc50c0de01c02dba3661b58',
    reviewCommit: '564d545c6ec0e0d52e43d758c0ba7ff8810df6aa'
  },
  {
    id: 'SIR02-KM-OE-10',
    path: 'docs/governance/sir-02/operational-evidence/oe-10/SIR-02-KM-OE-10-EXISTING-EVIDENCE-INDEX-REUSE-ASSESSMENT-v1.0.md',
    commit: '40653085601a651c9fc40f6f7911af2aecbadbac',
    sha256: 'e79b722be7a08f9743b7c7e8664e6c52b301b372a4c6a3ea37bde64f82d287b3',
    reviewCommit: '02db21acd0faf8a90bcbf09f3a46657b0bd7eff8'
  },
  {
    id: 'SIR02-KM-OE-11',
    path: 'docs/governance/sir-02/operational-evidence/oe-11/SIR-02-KM-OE-11-MISSING-LIFECYCLE-EVIDENCE-FORMAL-EVIDENCE-0002-v1.0.json',
    commit: '363963e3f3aa87257d1fe276165d01150239b69d',
    sha256: 'd6c520faae815bfa1e1ff84ecb8f288ae55a26a801eeb99ec6b7acc4da536d51',
    reviewCommit: '2bb7ebbcfe5d137b34f5cd19b2107ac68e24b1cc'
  },
  {
    id: 'SIR02-KM-OE-13',
    path: 'docs/governance/sir-02/operational-evidence/oe-13/SIR-02-KM-OE-13-DUPLICATE-CONFLICT-FORMAL-EVIDENCE-0001-v1.0.json',
    commit: 'a0bcdb4ef646b0322cca6e30ef1f8c3b282501c9',
    sha256: '908843689d9ccb1b5139d2ab8939a12067d046fc2f04c857cda065ea41544bee',
    reviewCommit: 'f415701fe52eb4b0c347b6b96d3e3d2008343e23'
  },
  {
    id: 'SIR02-KM-OE-13-SUPPLEMENTAL',
    path: 'docs/governance/sir-02/operational-evidence/oe-13/SIR-02-KM-OE-13-SUPPLEMENTAL-RAW-MEASUREMENTS-0001-v1.0.json',
    commit: 'd7626372612d60c4959bbdf51a89c00a80b3b9b1',
    sha256: '31d1d636bf420d679f0ff21338affd89b82a3f04f67b21617fceb342ab319fac',
    reviewCommit: '133e88bd41398362aeca1bcf57d8d2cd4bbb3d94'
  }
];

const laterReviewPaths: Readonly<Record<string, string>> = {
  'SIR02-KM-OE-09':
    'docs/governance/sir-02/operational-evidence/oe-09/SIR-02-KM-OE-09-INDEPENDENT-REVIEW-v2.0.md',
  'SIR02-KM-OE-10':
    'docs/governance/sir-02/operational-evidence/oe-10/SIR-02-KM-OE-10-FINAL-INDEPENDENT-REVIEW-v2.0.md',
  'SIR02-KM-OE-11':
    'docs/governance/sir-02/operational-evidence/oe-11/SIR-02-KM-OE-11-INDEPENDENT-REVIEW-v1.0.md',
  'SIR02-KM-OE-13':
    'docs/governance/sir-02/operational-evidence/oe-13/SIR-02-KM-OE-13-FINAL-INDEPENDENT-REVIEW-v1.0.md',
  'SIR02-KM-OE-13-SUPPLEMENTAL':
    'docs/governance/sir-02/operational-evidence/oe-13/SIR-02-KM-OE-13-SUPPLEMENTAL-FINAL-INDEPENDENT-REVIEW-v1.0.md'
};

const upstream = (input: ImmutableEvidenceInput): PinnedEvidenceInput => ({
  id: input.id,
  path: input.path,
  commit: input.evidenceCommit,
  sha256: input.sha256,
  reviewCommit: input.reviewCommit
});
export const PINNED_INPUTS: readonly PinnedEvidenceInput[] = [
  ...ACCEPTED_INPUTS.map(upstream),
  ...laterInputs
];

const sha256 = (bytes: Buffer | string): string => createHash('sha256').update(bytes).digest('hex');

function verifiedGitBytes(input: PinnedEvidenceInput): Buffer {
  if (!/^[a-f0-9]{40}$/u.test(input.commit) || !/^[a-f0-9]{64}$/u.test(input.sha256)) {
    throw new Error(`INVALID_IMMUTABLE_REFERENCE:${input.id}`);
  }
  let bytes: Buffer;
  try {
    bytes = execFileSync('git', ['show', `${input.commit}:${input.path}`], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    execFileSync('git', ['cat-file', '-e', `${input.reviewCommit}^{commit}`], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
  } catch {
    throw new Error(`IMMUTABLE_REFERENCE_UNRESOLVED:${input.id}`);
  }
  const normalized = bytes.toString('utf8');
  const crlf = Buffer.from(normalized.replace(/\r?\n/gu, '\r\n'));
  const hybrid = Buffer.from(crlf.toString('utf8').replace(/\r\n$/u, '\n'));
  if (![bytes, crlf, hybrid].some((form) => sha256(form) === input.sha256)) {
    throw new Error(`IMMUTABLE_CHECKSUM_MISMATCH:${input.id}`);
  }
  const reviewPath = laterReviewPaths[input.id];
  if (!reviewPath) throw new Error(`MISSING_ACCEPTED_REVIEW_PATH:${input.id}`);
  let review: string;
  try {
    review = execFileSync('git', ['show', `${input.reviewCommit}:${reviewPath}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
  } catch {
    throw new Error(`IMMUTABLE_REVIEW_UNRESOLVED:${input.id}`);
  }
  if (!review.includes('Accepted') || !review.includes(input.commit)) {
    throw new Error(`EVIDENCE_NOT_ACCEPTED:${input.id}`);
  }
  return bytes;
}

export interface EvidenceBasis {
  readonly inputs: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  readonly sourceId: string;
  readonly registrationId: string;
  readonly ownerId: string;
  readonly version: string;
  readonly approvalAt: string;
  readonly exactRepeatScenarioId: string;
  readonly conflict: Readonly<{
    scenarioId: string;
    type: string;
    pairId: string;
    leftReferenceId: string;
    rightReferenceId: string;
    holdReference: string;
  }>;
  readonly refs: readonly PinnedEvidenceInput[];
}

function requiredObject(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`INVALID_SUPPLEMENTAL_STRUCTURE:${label}`);
  }
  return value as Record<string, unknown>;
}
function requiredText(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`MISSING_SUPPLEMENTAL_FIELD:${label}`);
  }
  return value;
}

function supplementalFacts(
  bytes: Buffer
): Pick<EvidenceBasis, 'exactRepeatScenarioId' | 'conflict'> {
  const document = requiredObject(JSON.parse(bytes.toString('utf8')) as unknown, 'document');
  if (document.namespace !== OE12_NAMESPACE || document.schema !== OE12_SCHEMA) {
    throw new Error('SUPPLEMENTAL_GATE_A_MISMATCH');
  }
  if (!Array.isArray(document.cases)) throw new Error('MISSING_SUPPLEMENTAL_CASES');
  const cases: unknown[] = document.cases;
  const repeat = requiredObject(
    cases.find((item) => requiredObject(item, 'case').scenarioCategory === 'C01'),
    'C01'
  );
  const conflict = requiredObject(
    cases.find((item) => requiredObject(item, 'case').scenarioCategory === 'C02'),
    'C02'
  );
  if (!Array.isArray(conflict.conflictPairs) || !Array.isArray(conflict.quarantine)) {
    throw new Error('MISSING_SUPPLEMENTAL_CONFLICT');
  }
  const pair = requiredObject(conflict.conflictPairs[0], 'pair');
  const hold = requiredObject(conflict.quarantine[0], 'hold');
  if (conflict.totalUniquePairCount !== 1 || hold.humanDecisionRequired !== true) {
    throw new Error('AMBIGUOUS_SUPPLEMENTAL_CONFLICT');
  }
  return {
    exactRepeatScenarioId: requiredText(repeat.scenarioId, 'repeat.scenarioId'),
    conflict: {
      scenarioId: requiredText(conflict.scenarioId, 'conflict.scenarioId'),
      type: requiredText(pair.conflictType, 'pair.conflictType'),
      pairId: requiredText(pair.pairId, 'pair.pairId'),
      leftReferenceId: requiredText(pair.leftReferenceId, 'pair.leftReferenceId'),
      rightReferenceId: requiredText(pair.rightReferenceId, 'pair.rightReferenceId'),
      holdReference: requiredText(hold.humanDecisionHoldReference, 'hold.reference')
    }
  };
}

export function loadEvidenceBasis(): EvidenceBasis {
  const inputs = loadAcceptedEvidence();
  const laterBytes = new Map(laterInputs.map((input) => [input.id, verifiedGitBytes(input)]));
  const rawSupplement = laterBytes.get('SIR02-KM-OE-13-SUPPLEMENTAL');
  if (!rawSupplement) throw new Error('MISSING_ACCEPTED_SUPPLEMENTAL_EVIDENCE');
  const oe13 = supplementalFacts(rawSupplement);
  const inventory = buildAuthoritativeInventory(inputs);
  if (
    inventory.tenantId !== OE12_TENANT_A ||
    inventory.versions.length < 2 ||
    inventory.versions.find((version) => version.version === 'v1.0')?.approvalState !==
      'approved' ||
    inventory.versions.find((version) => version.version === 'v1.1')?.approvalState !== 'unapproved'
  ) {
    throw new Error('UPSTREAM_LIFECYCLE_CONFLICT');
  }
  const root = inventory.versions.find((version) => version.version === 'v1.0');
  if (!root?.approvalAt) throw new Error('MISSING_ORIGINAL_APPROVAL_TIME');
  return {
    inputs,
    sourceId: inventory.sourceId,
    registrationId: inventory.registrationId,
    ownerId: inventory.ownerId,
    version: 'v1.0',
    approvalAt: root.approvalAt,
    ...oe13,
    refs: PINNED_INPUTS
  };
}

export type LifecycleState =
  'unregistered' | 'registered' | 'approved' | 'superseded' | 'quarantined';
export type AuditDecision = 'recorded' | 'approved' | 'denied' | 'no_op' | 'held';

export interface KmLifecycleAuditEvent extends AuditEvent {
  readonly projection_kind: string;
  readonly namespace_id: string;
  readonly fixture_schema_version: string;
  readonly canonical_source_id: string;
  readonly source_registration_id: string;
  readonly source_version: string;
  readonly source_owner_id: string;
  readonly actor_id: string;
  readonly decision: AuditDecision;
  readonly outcome?: 'accepted' | 'rejected';
  readonly error_code?: string;
  readonly state_before: LifecycleState;
  readonly state_after: LifecycleState;
  readonly source_event_time: string;
  readonly projection_time: string;
  readonly test_emission_time: string;
  readonly evidence_id: string;
  readonly evidence_commit: string;
  readonly evidence_path: string;
  readonly evidence_sha256: string;
  readonly audit_sink_result: 'submitted_for_persistence';
  readonly caller_result: 'recorded' | 'denied';
  readonly synthetic_audit_only: boolean;
  readonly operational_oe08_evidence: boolean;
  readonly metadata: Readonly<Record<string, unknown>>;
}

const sourceTimes: readonly string[] = [
  '2026-09-25T05:22:58.000Z',
  '2026-09-25T05:22:58.000Z',
  '2026-09-25T05:22:58.000Z',
  '2026-09-25T07:59:08.000Z',
  '2026-09-25T08:52:07.000Z',
  '2026-09-25T12:02:00.000Z',
  '2026-09-25T12:18:03.000Z',
  '2026-09-25T12:32:37.000Z',
  '2026-09-26T13:17:38.000Z',
  '2026-09-26T13:17:38.000Z',
  '2026-09-26T06:06:08.000Z',
  '2026-09-27T00:00:00.000Z',
  '2026-09-26T02:06:27.000Z',
  '2026-09-27T00:00:00.000Z'
];
const familyEvidence: readonly string[] = [
  '01',
  '02',
  '03',
  '03',
  '04',
  '05',
  '06',
  '07',
  '13-SUPPLEMENTAL',
  '13-SUPPLEMENTAL',
  '11',
  '10',
  '09',
  '07'
];
const decisions: readonly AuditDecision[] = [
  'recorded',
  'recorded',
  'approved',
  'denied',
  'recorded',
  'recorded',
  'recorded',
  'recorded',
  'no_op',
  'held',
  'denied',
  'denied',
  'recorded',
  'recorded'
];
const transitions: readonly (readonly [LifecycleState, LifecycleState])[] = [
  ['unregistered', 'registered'],
  ['registered', 'registered'],
  ['registered', 'approved'],
  ['approved', 'approved'],
  ['approved', 'approved'],
  ['approved', 'approved'],
  ['approved', 'superseded'],
  ['superseded', 'quarantined'],
  ['quarantined', 'quarantined'],
  ['quarantined', 'quarantined'],
  ['quarantined', 'quarantined'],
  ['quarantined', 'quarantined'],
  ['quarantined', 'quarantined'],
  ['quarantined', 'quarantined']
];

function trustedContext(tenantId: string, index: number) {
  return createTrustedRequestContext({
    tenant_id: tenantId,
    user_id: 'sir02-km-audit-executor',
    role: 'administrator',
    permissions: ['km:audit:test'],
    entitlements: ['km:evidence:test'],
    session_id: `sir02-km-audit-${tenantId}-session-${String(index)}`,
    request_id: `sir02-km-audit-${tenantId}-request-${String(index)}`,
    correlation_id: `sir02-km-audit-${tenantId}-correlation-${String(index)}`,
    channel: 'system',
    locale: 'en'
  });
}

export function buildLifecycleEvents(basis: EvidenceBasis): KmLifecycleAuditEvent[] {
  return EVENT_FAMILIES.map((family, index) => {
    const number = familyEvidence[index];
    const ref = basis.refs.find((input) => input.id === `SIR02-KM-OE-${String(number)}`);
    const transition = transitions[index];
    const decision = decisions[index];
    const sourceEventTime = sourceTimes[index];
    if (!ref || !transition || !decision || !sourceEventTime) {
      throw new Error('INCOMPLETE_PROJECTION_DEFINITION');
    }
    const timestamp = new Date(Date.UTC(2026, 8, 27, 1, 0, index)).toISOString();
    const base = createSecurityAuditEvent(
      trustedContext(OE12_TENANT_A, index),
      'sir02-km-test-audit',
      'test',
      `km.lifecycle.${family}`,
      `sir02-km-audit-${OE12_TENANT_A}-trace-${String(index)}`,
      new Date(timestamp)
    );
    const event: KmLifecycleAuditEvent = Object.freeze({
      ...base,
      projection_kind: 'OE12_SYNTHETIC_AUDIT_PROJECTION',
      namespace_id: OE12_NAMESPACE,
      fixture_schema_version: OE12_SCHEMA,
      canonical_source_id: basis.sourceId,
      source_registration_id: basis.registrationId,
      source_version: basis.version,
      source_owner_id: basis.ownerId,
      actor_id: 'sir02-km-audit-executor',
      decision,
      outcome: decision === 'denied' ? 'rejected' : 'accepted',
      ...(decision === 'denied' ? { error_code: 'POLICY_DENIED' } : {}),
      state_before: transition[0],
      state_after: transition[1],
      source_event_time: family === 'source_approval' ? basis.approvalAt : sourceEventTime,
      projection_time: timestamp,
      test_emission_time: timestamp,
      evidence_id: ref.id,
      evidence_commit: ref.commit,
      evidence_path: ref.path,
      evidence_sha256: ref.sha256,
      audit_sink_result: 'submitted_for_persistence',
      caller_result: decision === 'denied' ? 'denied' : 'recorded',
      synthetic_audit_only: family === 'synthetic_withdrawal_retention',
      operational_oe08_evidence: false,
      metadata: Object.freeze({
        reason_code: family.toUpperCase(),
        source_version: basis.version,
        ...(family === 'duplicate_conflict'
          ? {
              exact_repeat_scenario_id: basis.exactRepeatScenarioId,
              additional_authoritative_artifacts: 0,
              additional_downstream_artifacts: 0
            }
          : {}),
        ...(family === 'human_decision_hold'
          ? {
              conflict_scenario_id: basis.conflict.scenarioId,
              conflict_type: basis.conflict.type,
              pair_id: basis.conflict.pairId,
              left_reference_id: basis.conflict.leftReferenceId,
              right_reference_id: basis.conflict.rightReferenceId,
              human_decision_hold_reference: basis.conflict.holdReference
            }
          : {}),
        ...(family === 'version_lineage'
          ? { successor_version: 'v1.1', successor_approved: false }
          : {}),
        ...(family === 'source_approval'
          ? {
              reconstructed_prior_event: true,
              prior_attempt_0001: 'pre_artifact_tooling_failure',
              prior_attempt_0002_evidence_commit: 'fa51d26ab43abd53f354d544da7ab5bfca394276',
              chronology_clarification_review_commit: '79f2d74ab31335e2487fa4e6c7dce4158c9a7b1f',
              corrected_0003_evidence_commit: '74c8eff31a88ab7de1e693b7dad0ca8e8e91a51a'
            }
          : {}),
        ...(family === 'synthetic_withdrawal_retention'
          ? { boundary_label: 'Synthetic Audit-Only Transition — Not OE-08 Operational Evidence' }
          : {})
      })
    });
    validateKmEvent(event);
    return event;
  });
}

const validString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value !== '*';

// Validate the complete test-only extension before using the public Phase 7 sink.
// The production base schema and pipeline remain unchanged and are not relaxed.
const kmAuditInputSchema = auditEventSchema
  .extend({
    projection_kind: z.literal('OE12_SYNTHETIC_AUDIT_PROJECTION'),
    namespace_id: z.literal(OE12_NAMESPACE),
    fixture_schema_version: z.literal(OE12_SCHEMA),
    canonical_source_id: z.string().min(1),
    source_registration_id: z.string().min(1),
    source_version: z.string().min(1),
    source_owner_id: z.string().min(1),
    actor_id: z.string().min(1),
    decision: z.enum(['recorded', 'approved', 'denied', 'no_op', 'held']),
    outcome: z.enum(['accepted', 'rejected']).optional(),
    error_code: z.string().optional(),
    state_before: z.enum(['unregistered', 'registered', 'approved', 'superseded', 'quarantined']),
    state_after: z.enum(['unregistered', 'registered', 'approved', 'superseded', 'quarantined']),
    source_event_time: z.string().datetime(),
    projection_time: z.string().datetime(),
    test_emission_time: z.string().datetime(),
    evidence_id: z.string().min(1),
    evidence_commit: z.string().regex(/^[a-f0-9]{40}$/u),
    evidence_path: z.string().min(1),
    evidence_sha256: z.string().regex(/^[a-f0-9]{64}$/u),
    audit_sink_result: z.literal('submitted_for_persistence'),
    caller_result: z.enum(['recorded', 'denied']),
    synthetic_audit_only: z.boolean(),
    operational_oe08_evidence: z.literal(false),
    metadata: z.record(z.string(), z.unknown())
  })
  .strict();

export function validateKmEvent(event: KmLifecycleAuditEvent): void {
  kmAuditInputSchema.parse(event);
  const required = [
    event.tenant_id,
    event.user_id,
    event.request_id,
    event.correlation_id,
    event.trace_id,
    event.canonical_source_id,
    event.source_registration_id,
    event.source_version,
    event.source_owner_id,
    event.actor_id,
    event.evidence_id,
    event.evidence_commit,
    event.evidence_path,
    event.evidence_sha256
  ];
  if (required.some((value) => !validString(value))) throw new Error('MISSING_AUDIT_BINDING');
  if (
    event.tenant_id !== OE12_TENANT_A ||
    event.projection_kind !== 'OE12_SYNTHETIC_AUDIT_PROJECTION' ||
    event.namespace_id !== OE12_NAMESPACE ||
    event.fixture_schema_version !== OE12_SCHEMA ||
    !/^km\.lifecycle\./u.test(event.event_type) ||
    !/^[a-f0-9]{40}$/u.test(event.evidence_commit) ||
    !/^[a-f0-9]{64}$/u.test(event.evidence_sha256) ||
    Number.isNaN(Date.parse(event.source_event_time)) ||
    Number.isNaN(Date.parse(event.test_emission_time))
  ) {
    throw new Error('INVALID_AUDIT_BINDING');
  }
  if (
    event.synthetic_audit_only &&
    (event.event_type !== 'km.lifecycle.synthetic_withdrawal_retention' ||
      event.operational_oe08_evidence)
  ) {
    throw new Error('OE08_BOUNDARY_VIOLATION');
  }
}

export interface ReconstructionResult {
  readonly decision: 'Complete / Test-Only' | 'Blocked / Fail Closed';
  readonly reason: string;
  readonly eventIds: readonly string[];
  readonly typeCounts: Readonly<Record<string, number>>;
  readonly transitionMap: readonly Readonly<{
    eventId: string;
    before: LifecycleState;
    after: LifecycleState;
    evidenceId: string;
  }>[];
  readonly syntheticOe08OperationalCount: 0;
  readonly downstreamCalls: 0;
  readonly foreignProtectedFieldsDisclosed: 0;
}

const blocked = (reason: string): ReconstructionResult => ({
  decision: 'Blocked / Fail Closed',
  reason,
  eventIds: [],
  typeCounts: {},
  transitionMap: [],
  syntheticOe08OperationalCount: 0,
  downstreamCalls: 0,
  foreignProtectedFieldsDisclosed: 0
});

export function reconstructLifecycle(
  events: readonly CanonicalAuditEvent[],
  basis: EvidenceBasis,
  refs: readonly PinnedEvidenceInput[] = PINNED_INPUTS
): ReconstructionResult {
  if (events.length !== EVENT_FAMILIES.length) return blocked('MISSING_LIFECYCLE_EVENT');
  const first = events[0];
  if (!first) return blocked('MISSING_LIFECYCLE_EVENT');
  const sourceIdentity = first.evidence.canonical_source_id;
  const registrationIdentity = first.evidence.source_registration_id;
  const versionIdentity = first.evidence.source_version;
  const ownerIdentity = first.evidence.source_owner_id;
  if (
    sourceIdentity !== basis.sourceId ||
    registrationIdentity !== basis.registrationId ||
    versionIdentity !== basis.version ||
    ownerIdentity !== basis.ownerId
  ) {
    return blocked('SOURCE_VERSION_OWNER_CONFLICT');
  }
  const ids = new Set<string>();
  let state: LifecycleState = 'unregistered';
  const transitionsFound: Array<{
    eventId: string;
    before: LifecycleState;
    after: LifecycleState;
    evidenceId: string;
  }> = [];
  const counts: Record<string, number> = {};
  for (const [index, event] of events.entries()) {
    const family = EVENT_FAMILIES[index];
    const source = event.evidence;
    if (!family || event.event_type !== `km.lifecycle.${family}`)
      return blocked('EVENT_ORDER_CONFLICT');
    if (ids.has(event.event_id)) return blocked('DUPLICATE_EVENT_ID');
    ids.add(event.event_id);
    if (
      event.context.status !== 'trusted' ||
      event.context.tenant_id !== OE12_TENANT_A ||
      source.tenant_id !== OE12_TENANT_A
    ) {
      return blocked('TENANT_BINDING_CONFLICT');
    }
    if (
      !validString(event.request_id) ||
      !validString(event.correlation_id) ||
      !validString(event.trace_id) ||
      !validString(source.canonical_source_id) ||
      !validString(source.source_registration_id) ||
      !validString(source.source_version) ||
      !validString(source.source_owner_id) ||
      !validString(source.actor_id)
    ) {
      return blocked('MISSING_AUDIT_BINDING');
    }
    if (
      source.canonical_source_id !== sourceIdentity ||
      source.source_registration_id !== registrationIdentity ||
      source.source_version !== versionIdentity ||
      source.source_owner_id !== ownerIdentity
    ) {
      return blocked('SOURCE_VERSION_OWNER_CONFLICT');
    }
    if (
      typeof source.metadata === 'object' &&
      source.metadata !== null &&
      !Array.isArray(source.metadata) &&
      (source.metadata as Record<string, unknown>).ambiguous_authoritative_state === true
    ) {
      return blocked('AMBIGUOUS_AUTHORITATIVE_STATE');
    }
    const ref = refs.find((item) => item.id === source.evidence_id);
    if (
      !ref ||
      ref.commit !== source.evidence_commit ||
      ref.path !== source.evidence_path ||
      ref.sha256 !== source.evidence_sha256
    ) {
      return blocked('IMMUTABLE_REFERENCE_CONFLICT');
    }
    if (source.state_before !== state || !validString(source.state_after)) {
      return blocked('STATE_TRANSITION_CONFLICT');
    }
    if (
      typeof source.source_event_time !== 'string' ||
      typeof source.projection_time !== 'string' ||
      Date.parse(source.source_event_time) > Date.parse(source.projection_time) ||
      event.timestamp !== source.test_emission_time
    ) {
      return blocked('CHRONOLOGY_CONFLICT');
    }
    if (family === 'source_approval' && source.source_event_time !== basis.approvalAt) {
      return blocked('ORIGINAL_APPROVAL_CHRONOLOGY_CONFLICT');
    }
    if (
      source.synthetic_audit_only === true &&
      (family !== 'synthetic_withdrawal_retention' || source.operational_oe08_evidence !== false)
    ) {
      return blocked('OE08_BOUNDARY_VIOLATION');
    }
    state = source.state_after as LifecycleState;
    transitionsFound.push({
      eventId: event.event_id,
      before: source.state_before as LifecycleState,
      after: state,
      evidenceId: ref.id
    });
    counts[family] = (counts[family] ?? 0) + 1;
  }
  if (state !== 'quarantined') return blocked('INCOMPLETE_FINAL_STATE');
  return {
    decision: 'Complete / Test-Only',
    reason: 'COMPLETE',
    eventIds: events.map((event) => event.event_id),
    typeCounts: counts,
    transitionMap: transitionsFound,
    syntheticOe08OperationalCount: 0,
    downstreamCalls: 0,
    foreignProtectedFieldsDisclosed: 0
  };
}

export interface FixtureState {
  readonly store: InMemoryAuditEvidenceStore;
  readonly exported: CanonicalAuditEvent[];
  readonly security: SecurityObservation[];
  readonly metricBatches: (readonly AuditMetric[])[];
  readonly health: AuditHealthEvidence[];
  readonly eventIds: string[];
  readonly requestScopes: string[];
  readonly tenantScopes: string[];
  readonly pipeline: AuditTelemetryPipeline;
  disposed: boolean;
  cleanup(): void;
}

export interface FixtureOptions {
  readonly failAuditExportAt?: number;
  readonly failPersistAt?: number;
  readonly failSecurityExportAt?: number;
  readonly failMetricsExportAt?: number;
  readonly failHealthExport?: boolean;
  readonly failCleanup?: boolean;
}

export function createFixture(options: FixtureOptions = {}): FixtureState {
  const store = new InMemoryAuditEvidenceStore();
  const exported: CanonicalAuditEvent[] = [];
  const security: SecurityObservation[] = [];
  const metricBatches: (readonly AuditMetric[])[] = [];
  const health: AuditHealthEvidence[] = [];
  const eventIds: string[] = [];
  const requestScopes: string[] = [];
  const tenantScopes: string[] = [];
  let nextId = 0;
  const dependencies: AuditTelemetryPipelineDependencies = {
    evidenceStore: {
      persistAudit: async (event) => {
        if (options.failPersistAt === store.audits.length)
          throw new Error('SYNTHETIC_STORE_FAILURE');
        await store.persistAudit(event);
      },
      persistHealth: (evidence) => store.persistHealth(evidence)
    },
    auditExporter: {
      export: (event) => {
        if (options.failAuditExportAt === exported.length)
          return Promise.reject(new Error('SYNTHETIC_EXPORT_FAILURE'));
        exported.push(event);
        return Promise.resolve();
      }
    },
    securityExporter: {
      export: (item) => {
        if (options.failSecurityExportAt === security.length)
          return Promise.reject(new Error('SYNTHETIC_SECURITY_EXPORT_FAILURE'));
        security.push(item);
        return Promise.resolve();
      }
    },
    metricsExporter: {
      export: (items) => {
        if (options.failMetricsExportAt === metricBatches.length)
          return Promise.reject(new Error('SYNTHETIC_METRICS_EXPORT_FAILURE'));
        metricBatches.push(items);
        return Promise.resolve();
      }
    },
    healthExporter: {
      export: (item) => {
        if (options.failHealthExport)
          return Promise.reject(new Error('SYNTHETIC_HEALTH_EXPORT_FAILURE'));
        health.push(item);
        return Promise.resolve();
      }
    },
    metricLabelPolicy: { services: ['sir02-km-test-audit'], environments: ['test'] },
    environment: 'test',
    eventIdFactory: () => {
      const id = `sir02-km-oe12-${OE12_TENANT_A}-event-${String(nextId++).padStart(2, '0')}`;
      eventIds.push(id);
      return id;
    }
  };
  return {
    store,
    exported,
    security,
    metricBatches,
    health,
    eventIds,
    requestScopes,
    tenantScopes,
    pipeline: new AuditTelemetryPipeline(dependencies),
    disposed: false,
    cleanup() {
      store.audits.length = 0;
      store.health.length = 0;
      exported.length = 0;
      security.length = 0;
      metricBatches.length = 0;
      health.length = 0;
      eventIds.length = 0;
      requestScopes.length = 0;
      tenantScopes.length = 0;
      this.disposed = true;
      if (options.failCleanup) throw new Error('SYNTHETIC_CLEANUP_FAILURE');
    }
  };
}

export interface ExecutionObservation {
  readonly attempted: number;
  readonly committed: number;
  readonly exported: number;
  readonly securityExported: number;
  readonly metricsExported: number;
  readonly healthCount: number;
  readonly pipelineHealth: 'healthy' | 'degraded';
  readonly reconstruction: ReconstructionResult;
  readonly retained: readonly CanonicalAuditEvent[];
  readonly cleanup: 'Passed';
  readonly primaryError?: string;
}

export async function executeLifecycle(
  events: readonly KmLifecycleAuditEvent[],
  basis: EvidenceBasis,
  options: FixtureOptions = {}
): Promise<ExecutionObservation> {
  const fixture = createFixture(options);
  let primaryError: string | undefined;
  let cleanupError: string | undefined;
  let observation: ExecutionObservation;
  try {
    for (const event of events) {
      validateKmEvent(event);
      fixture.requestScopes.push(event.request_id);
      fixture.tenantScopes.push(event.tenant_id);
      await fixture.pipeline.emit(event);
    }
  } catch (error) {
    primaryError = error instanceof Error ? error.message : 'UNKNOWN_EXECUTION_FAILURE';
  } finally {
    const retained = [...fixture.store.audits];
    if (
      primaryError &&
      fixture.pipeline.healthStatus().status === 'degraded' &&
      fixture.health.length === 0 &&
      fixture.store.health.length === 0
    ) {
      primaryError = `${primaryError};HEALTH_OUTPUT_UNAVAILABLE`;
    }
    observation = {
      attempted: fixture.eventIds.length,
      committed: retained.length,
      exported: fixture.exported.length,
      securityExported: fixture.security.length,
      metricsExported: fixture.metricBatches.length,
      healthCount: fixture.health.length,
      pipelineHealth: fixture.pipeline.healthStatus().status,
      reconstruction: primaryError
        ? blocked('AUDIT_DELIVERY_OR_VALIDATION_FAILURE')
        : reconstructLifecycle(retained, basis),
      retained,
      cleanup: 'Passed',
      ...(primaryError ? { primaryError } : {})
    };
    try {
      fixture.cleanup();
      if (
        !fixture.disposed ||
        fixture.store.audits.length ||
        fixture.exported.length ||
        fixture.health.length ||
        fixture.security.length ||
        fixture.metricBatches.length ||
        fixture.requestScopes.length ||
        fixture.tenantScopes.length
      ) {
        cleanupError = 'INCOMPLETE_STATE_RESET';
      }
    } catch (error) {
      cleanupError = error instanceof Error ? error.message : 'UNKNOWN_CLEANUP_FAILURE';
    }
  }
  if (cleanupError)
    throw new Error(`CLEANUP_FAILURE:${cleanupError};PRIMARY:${primaryError ?? 'NONE'}`);
  return observation;
}

export function canonicalSha256(value: unknown): string {
  const sorted = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(sorted);
    if (item === null || typeof item !== 'object') return item;
    return Object.fromEntries(
      Object.entries(item)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sorted(child)])
    );
  };
  return sha256(JSON.stringify(sorted(value)));
}

export function callerVisibleDenial(): Readonly<{
  decision: 'denied';
  reasonCode: 'AUDIT_EVIDENCE_UNAVAILABLE';
  protectedFieldsDisclosed: 0;
}> {
  return Object.freeze({
    decision: 'denied',
    reasonCode: 'AUDIT_EVIDENCE_UNAVAILABLE',
    protectedFieldsDisclosed: 0
  });
}
