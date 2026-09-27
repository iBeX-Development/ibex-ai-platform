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
import { isSensitiveTelemetryKey } from '../../packages/observability/src/index.js';
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

const projectedEventId = (index: number): string =>
  `sir02-km-oe12-${OE12_TENANT_A}-event-${String(index).padStart(2, '0')}`;

// These are audit dependencies, not a claim that independent historical denials
// happened in the order of their OE-12 test projections.
const FAMILY_DEPENDENCIES: Readonly<Record<EventFamily, readonly EventFamily[]>> = {
  source_registration: [],
  tenant_owner_binding: ['source_registration'],
  source_approval: ['source_registration', 'tenant_owner_binding'],
  source_rejection: ['source_registration', 'tenant_owner_binding'],
  version_lineage: ['source_registration', 'tenant_owner_binding', 'source_approval'],
  provenance: ['version_lineage'],
  supersession: ['source_approval', 'version_lineage', 'provenance'],
  stale_quarantine: ['supersession'],
  duplicate_conflict: ['source_registration', 'version_lineage', 'stale_quarantine'],
  human_decision_hold: ['duplicate_conflict'],
  fail_closed_denial: ['source_registration'],
  permission_tenant_denial: ['tenant_owner_binding'],
  reconciliation: ['source_registration', 'source_approval', 'version_lineage', 'provenance'],
  synthetic_withdrawal_retention: ['stale_quarantine']
};

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
  readonly rejectionCaseId: string;
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
  const oe03 = requiredObject(inputs['SIR02-KM-OE-03'], 'OE-03');
  if (!Array.isArray(oe03.execution_observations)) {
    throw new Error('MISSING_OE03_DENIAL_OBSERVATIONS');
  }
  const rejection = requiredObject(
    (oe03.execution_observations as unknown[]).find(
      (item) => requiredObject(item, 'OE-03 observation').case_id === 'missing-approval-decision'
    ),
    'OE-03 denial'
  );
  if (
    rejection.expected !== 'Denied' ||
    rejection.actual !== 'Denied' ||
    rejection.approval_event_creation_calls !== 0
  ) {
    throw new Error('INVALID_OE03_DENIAL_BASIS');
  }
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
    rejectionCaseId: requiredText(rejection.case_id, 'OE-03 denial case'),
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
  readonly projected_event_id: string;
  readonly dependency_event_ids: readonly string[];
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
const allowedTransitions: Readonly<
  Record<
    EventFamily,
    Readonly<{ before: LifecycleState; after: LifecycleState; decision: AuditDecision }>
  >
> = Object.freeze({
  source_registration: { before: 'unregistered', after: 'registered', decision: 'recorded' },
  tenant_owner_binding: { before: 'registered', after: 'registered', decision: 'recorded' },
  source_approval: { before: 'registered', after: 'approved', decision: 'approved' },
  source_rejection: { before: 'approved', after: 'approved', decision: 'denied' },
  version_lineage: { before: 'approved', after: 'approved', decision: 'recorded' },
  provenance: { before: 'approved', after: 'approved', decision: 'recorded' },
  supersession: { before: 'approved', after: 'superseded', decision: 'recorded' },
  stale_quarantine: { before: 'superseded', after: 'quarantined', decision: 'recorded' },
  duplicate_conflict: { before: 'quarantined', after: 'quarantined', decision: 'no_op' },
  human_decision_hold: { before: 'quarantined', after: 'quarantined', decision: 'held' },
  fail_closed_denial: { before: 'quarantined', after: 'quarantined', decision: 'denied' },
  permission_tenant_denial: { before: 'quarantined', after: 'quarantined', decision: 'denied' },
  reconciliation: { before: 'quarantined', after: 'quarantined', decision: 'recorded' },
  synthetic_withdrawal_retention: {
    before: 'quarantined',
    after: 'quarantined',
    decision: 'recorded'
  }
});

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
    const transition = allowedTransitions[family];
    const decision = transition.decision;
    const sourceEventTime = sourceTimes[index];
    if (!ref || !sourceEventTime) {
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
      projected_event_id: projectedEventId(index),
      dependency_event_ids: FAMILY_DEPENDENCIES[family].map((dependency) =>
        projectedEventId(EVENT_FAMILIES.indexOf(dependency))
      ),
      actor_id: 'sir02-km-audit-executor',
      decision,
      outcome: decision === 'denied' ? 'rejected' : 'accepted',
      ...(decision === 'denied' ? { error_code: 'POLICY_DENIED' } : {}),
      state_before: transition.before,
      state_after: transition.after,
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
        ...(family === 'source_rejection'
          ? { rejection_case_id: basis.rejectionCaseId, new_approval_events: 0 }
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
    projected_event_id: z.string().min(1),
    dependency_event_ids: z.array(z.string().min(1)),
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
    event.projected_event_id,
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
  readonly dependencyMap: readonly Readonly<{ eventId: string; dependsOn: readonly string[] }>[];
  readonly failedAuditOperation?: Readonly<{
    eventId: string;
    outcome: 'failed' | 'partial';
    persistedItemCount: number;
  }>;
  readonly syntheticOe08OperationalCount: 0;
  readonly downstreamCalls: 0;
  readonly foreignProtectedFieldsDisclosed: 0;
}

const blocked = (
  reason: string,
  failedAuditOperation?: ReconstructionResult['failedAuditOperation']
): ReconstructionResult => ({
  decision: 'Blocked / Fail Closed',
  reason,
  eventIds: [],
  typeCounts: {},
  transitionMap: [],
  dependencyMap: [],
  ...(failedAuditOperation ? { failedAuditOperation } : {}),
  syntheticOe08OperationalCount: 0,
  downstreamCalls: 0,
  foreignProtectedFieldsDisclosed: 0
});

interface ObservedLifecycleEvent {
  readonly eventId: unknown;
  readonly eventType: unknown;
  readonly timestamp: unknown;
  readonly contextStatus: unknown;
  readonly contextTenant: unknown;
  readonly requestId: unknown;
  readonly correlationId: unknown;
  readonly traceId: unknown;
  readonly source: Readonly<Record<string, unknown>>;
}

const hasSensitiveKey = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(hasSensitiveKey);
  if (value === null || typeof value !== 'object') return false;
  return Object.entries(value).some(
    ([key, child]) => isSensitiveTelemetryKey(key) || hasSensitiveKey(child)
  );
};

const causalDependencies: Readonly<Partial<Record<EventFamily, readonly EventFamily[]>>> = {
  tenant_owner_binding: ['source_registration'],
  source_approval: ['source_registration', 'tenant_owner_binding'],
  source_rejection: ['tenant_owner_binding'],
  version_lineage: ['source_approval'],
  provenance: ['version_lineage'],
  supersession: ['version_lineage', 'provenance'],
  stale_quarantine: ['supersession'],
  duplicate_conflict: ['stale_quarantine'],
  human_decision_hold: ['duplicate_conflict'],
  synthetic_withdrawal_retention: ['stale_quarantine']
};

function hasCycle(
  events: readonly ObservedLifecycleEvent[],
  positions: ReadonlyMap<string, number>
): boolean {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    const index = positions.get(id);
    if (index === undefined) return false;
    visiting.add(id);
    const dependencies = events[index]?.source.dependency_event_ids;
    if (Array.isArray(dependencies)) {
      for (const dependency of dependencies) {
        if (typeof dependency === 'string' && visit(dependency)) return true;
      }
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  return [...positions.keys()].some(visit);
}

function evaluateLifecycle(
  events: readonly ObservedLifecycleEvent[],
  basis: EvidenceBasis,
  refs: readonly PinnedEvidenceInput[] = PINNED_INPUTS
): ReconstructionResult {
  if (events.length !== EVENT_FAMILIES.length) return blocked('MISSING_LIFECYCLE_EVENT');
  const first = events[0];
  if (!first) return blocked('MISSING_LIFECYCLE_EVENT');
  const sourceIdentity = first.source.canonical_source_id;
  const registrationIdentity = first.source.source_registration_id;
  const versionIdentity = first.source.source_version;
  const ownerIdentity = first.source.source_owner_id;
  if (
    sourceIdentity !== basis.sourceId ||
    registrationIdentity !== basis.registrationId ||
    versionIdentity !== basis.version ||
    ownerIdentity !== basis.ownerId
  ) {
    return blocked('SOURCE_VERSION_OWNER_CONFLICT');
  }
  const positions = new Map<string, number>();
  for (const [index, event] of events.entries()) {
    if (!validString(event.eventId)) return blocked('MISSING_AUDIT_BINDING');
    if (positions.has(event.eventId)) return blocked('DUPLICATE_EVENT_ID');
    positions.set(event.eventId, index);
  }
  if (hasCycle(events, positions)) return blocked('CIRCULAR_DEPENDENCY');
  let state: LifecycleState = 'unregistered';
  const transitionsFound: Array<{
    eventId: string;
    before: LifecycleState;
    after: LifecycleState;
    evidenceId: string;
  }> = [];
  const dependencyMap: Array<{ eventId: string; dependsOn: readonly string[] }> = [];
  const counts: Record<string, number> = {};
  for (const [index, event] of events.entries()) {
    const family = EVENT_FAMILIES[index];
    const source = event.source;
    if (!family || event.eventType !== `km.lifecycle.${family}`)
      return blocked('EVENT_ORDER_CONFLICT');
    if (event.eventId !== projectedEventId(index) || source.projected_event_id !== event.eventId)
      return blocked('EVENT_ID_CONFLICT');
    if (
      event.contextStatus !== 'trusted' ||
      event.contextTenant !== OE12_TENANT_A ||
      source.tenant_id !== OE12_TENANT_A
    ) {
      return blocked('TENANT_BINDING_CONFLICT');
    }
    if (
      !validString(event.requestId) ||
      !validString(event.correlationId) ||
      !validString(event.traceId) ||
      !validString(source.canonical_source_id) ||
      !validString(source.source_registration_id) ||
      !validString(source.source_version) ||
      !validString(source.source_owner_id) ||
      !validString(source.actor_id)
    ) {
      return blocked('MISSING_AUDIT_BINDING');
    }
    if (
      !event.requestId.includes(OE12_TENANT_A) ||
      !event.correlationId.includes(OE12_TENANT_A) ||
      !event.traceId.includes(OE12_TENANT_A) ||
      (typeof source.metadata === 'object' &&
        source.metadata !== null &&
        !Array.isArray(source.metadata) &&
        Object.hasOwn(source.metadata, 'caller_tenant_override'))
    ) {
      return blocked('TENANT_BINDING_CONFLICT');
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
      typeof source.metadata !== 'object' ||
      source.metadata === null ||
      Array.isArray(source.metadata)
    ) {
      return blocked('INVALID_AUDIT_INPUT');
    }
    const metadata = source.metadata as Record<string, unknown>;
    if (metadata.ambiguous_authoritative_state === true) {
      return blocked('AMBIGUOUS_AUTHORITATIVE_STATE');
    }
    const ref = refs.find((item) => item.id === source.evidence_id);
    if (
      !ref ||
      ref.id !== `SIR02-KM-OE-${String(familyEvidence[index])}` ||
      ref.commit !== source.evidence_commit ||
      ref.path !== source.evidence_path ||
      ref.sha256 !== source.evidence_sha256
    ) {
      return blocked('IMMUTABLE_REFERENCE_CONFLICT');
    }
    const rule = allowedTransitions[family];
    if (
      source.state_before !== state ||
      source.state_before !== rule.before ||
      source.state_after !== rule.after ||
      source.decision !== rule.decision
    ) {
      return blocked('STATE_TRANSITION_CONFLICT');
    }
    const rawDependencies: unknown = source.dependency_event_ids;
    if (!Array.isArray(rawDependencies)) {
      return blocked('MISSING_DEPENDENCY');
    }
    const dependencies: string[] = [];
    for (const id of rawDependencies as unknown[]) {
      if (!validString(id)) return blocked('MISSING_DEPENDENCY');
      dependencies.push(id);
    }
    if (new Set(dependencies).size !== dependencies.length) return blocked('AMBIGUOUS_DEPENDENCY');
    const expectedDependencies = FAMILY_DEPENDENCIES[family].map((parent) =>
      projectedEventId(EVENT_FAMILIES.indexOf(parent))
    );
    for (const dependency of dependencies) {
      const parentIndex = positions.get(dependency);
      if (parentIndex === undefined) return blocked('UNSEEN_DEPENDENCY');
      if (parentIndex >= index) return blocked('FUTURE_DEPENDENCY');
      const parent = events[parentIndex];
      if (
        !parent ||
        parent.contextTenant !== event.contextTenant ||
        parent.source.canonical_source_id !== source.canonical_source_id ||
        parent.source.source_registration_id !== source.source_registration_id ||
        parent.source.source_version !== source.source_version ||
        parent.source.source_owner_id !== source.source_owner_id
      ) {
        return blocked('DEPENDENCY_BINDING_CONFLICT');
      }
      if (Date.parse(String(parent.timestamp)) > Date.parse(String(event.timestamp))) {
        return blocked('CHRONOLOGY_CONFLICT');
      }
    }
    if (JSON.stringify(dependencies) !== JSON.stringify(expectedDependencies)) {
      return blocked('DEPENDENCY_CONFLICT');
    }
    if (
      typeof source.source_event_time !== 'string' ||
      typeof source.projection_time !== 'string' ||
      Date.parse(source.source_event_time) > Date.parse(source.projection_time) ||
      event.timestamp !== source.test_emission_time ||
      Number.isNaN(Date.parse(source.source_event_time)) ||
      Number.isNaN(Date.parse(source.projection_time))
    ) {
      return blocked('CHRONOLOGY_CONFLICT');
    }
    if (family === 'source_approval' && source.source_event_time !== basis.approvalAt) {
      return blocked('ORIGINAL_APPROVAL_CHRONOLOGY_CONFLICT');
    }
    for (const parentFamily of causalDependencies[family] ?? []) {
      const parentIndex = EVENT_FAMILIES.indexOf(parentFamily);
      const parentTime = events[parentIndex]?.source.source_event_time;
      const currentTime = Date.parse(source.source_event_time);
      const priorTime = Date.parse(String(parentTime));
      const sameOriginalEvent =
        (family === 'tenant_owner_binding' || family === 'source_approval') &&
        currentTime === Date.parse(basis.approvalAt) &&
        priorTime === Date.parse(basis.approvalAt);
      const sameConflictEvent =
        family === 'human_decision_hold' && source.source_event_time === parentTime;
      if (
        Number.isNaN(priorTime) ||
        currentTime < priorTime ||
        (currentTime === priorTime && !sameOriginalEvent && !sameConflictEvent)
      ) {
        return blocked('CHRONOLOGY_CONFLICT');
      }
    }
    if (
      (family === 'source_approval' &&
        (metadata.reconstructed_prior_event !== true ||
          metadata.prior_attempt_0001 !== 'pre_artifact_tooling_failure' ||
          metadata.prior_attempt_0002_evidence_commit !==
            'fa51d26ab43abd53f354d544da7ab5bfca394276' ||
          metadata.chronology_clarification_review_commit !==
            '79f2d74ab31335e2487fa4e6c7dce4158c9a7b1f' ||
          metadata.corrected_0003_evidence_commit !==
            '74c8eff31a88ab7de1e693b7dad0ca8e8e91a51a')) ||
      (family === 'source_rejection' && metadata.new_approval_events !== 0) ||
      (family === 'duplicate_conflict' &&
        (metadata.exact_repeat_scenario_id !== basis.exactRepeatScenarioId ||
          metadata.additional_authoritative_artifacts !== 0 ||
          metadata.additional_downstream_artifacts !== 0)) ||
      (family === 'version_lineage' && metadata.successor_version !== 'v1.1') ||
      (family === 'version_lineage' && metadata.successor_approved !== false) ||
      (family === 'source_rejection' && metadata.rejection_case_id !== basis.rejectionCaseId) ||
      (family === 'human_decision_hold' &&
        (metadata.conflict_scenario_id !== basis.conflict.scenarioId ||
          metadata.conflict_type !== basis.conflict.type ||
          metadata.pair_id !== basis.conflict.pairId ||
          metadata.left_reference_id !== basis.conflict.leftReferenceId ||
          metadata.right_reference_id !== basis.conflict.rightReferenceId ||
          metadata.human_decision_hold_reference !== basis.conflict.holdReference))
    ) {
      return blocked('DEPENDENCY_REFERENCE_CONFLICT');
    }
    if (
      source.synthetic_audit_only !== (family === 'synthetic_withdrawal_retention') ||
      source.operational_oe08_evidence !== false ||
      (family === 'synthetic_withdrawal_retention' &&
        metadata.boundary_label !==
          'Synthetic Audit-Only Transition — Not OE-08 Operational Evidence')
    ) {
      return blocked('OE08_BOUNDARY_VIOLATION');
    }
    state = source.state_after as LifecycleState;
    transitionsFound.push({
      eventId: event.eventId,
      before: source.state_before as LifecycleState,
      after: state,
      evidenceId: ref.id
    });
    dependencyMap.push({ eventId: event.eventId, dependsOn: [...dependencies] });
    counts[family] = (counts[family] ?? 0) + 1;
  }
  if (state !== 'quarantined') return blocked('INCOMPLETE_FINAL_STATE');
  return {
    decision: 'Complete / Test-Only',
    reason: 'COMPLETE',
    eventIds: events.map((event) => event.eventId as string),
    typeCounts: counts,
    transitionMap: transitionsFound,
    dependencyMap,
    syntheticOe08OperationalCount: 0,
    downstreamCalls: 0,
    foreignProtectedFieldsDisclosed: 0
  };
}

export function preflightLifecycle(
  events: readonly KmLifecycleAuditEvent[],
  basis: EvidenceBasis
): ReconstructionResult {
  if (events.some(hasSensitiveKey)) return blocked('PROHIBITED_AUDIT_DATA');
  const observed: ObservedLifecycleEvent[] = events.map((event) => ({
    eventId: event.projected_event_id,
    eventType: event.event_type,
    timestamp: event.test_emission_time,
    contextStatus: validString(event.tenant_id) ? 'trusted' : 'unavailable',
    contextTenant: event.tenant_id,
    requestId: event.request_id,
    correlationId: event.correlation_id,
    traceId: event.trace_id,
    source: { ...event }
  }));
  const result = evaluateLifecycle(observed, basis);
  if (result.decision === 'Blocked / Fail Closed') return result;
  try {
    for (const event of events) validateKmEvent(event);
  } catch {
    return blocked('INVALID_AUDIT_INPUT');
  }
  return result;
}

export function reconstructLifecycle(
  events: readonly CanonicalAuditEvent[],
  basis: EvidenceBasis,
  refs: readonly PinnedEvidenceInput[] = PINNED_INPUTS
): ReconstructionResult {
  return evaluateLifecycle(
    events.map((event) => ({
      eventId: event.event_id,
      eventType: event.event_type,
      timestamp: event.timestamp,
      contextStatus: event.context.status,
      contextTenant: event.context.tenant_id,
      requestId: event.request_id,
      correlationId: event.correlation_id,
      traceId: event.trace_id,
      source: event.evidence
    })),
    basis,
    refs
  );
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
  readonly writeAttempts: number;
  readonly sinkFailure:
    | Readonly<{
        sink: AuditHealthEvidence['failed_component'] | 'health_exporter';
        phase: 'persist' | 'export';
      }>
    | undefined;
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
  let writeAttempts = 0;
  let sinkFailure: FixtureState['sinkFailure'];
  let nextId = 0;
  const dependencies: AuditTelemetryPipelineDependencies = {
    evidenceStore: {
      persistAudit: async (event) => {
        writeAttempts += 1;
        if (options.failPersistAt === store.audits.length) {
          sinkFailure = { sink: 'evidence_store', phase: 'persist' };
          throw new Error('SYNTHETIC_STORE_FAILURE');
        }
        await store.persistAudit(event);
      },
      persistHealth: (evidence) => store.persistHealth(evidence)
    },
    auditExporter: {
      export: (event) => {
        if (options.failAuditExportAt === exported.length) {
          sinkFailure = { sink: 'audit_exporter', phase: 'export' };
          return Promise.reject(new Error('SYNTHETIC_EXPORT_FAILURE'));
        }
        exported.push(event);
        return Promise.resolve();
      }
    },
    securityExporter: {
      export: (item) => {
        if (options.failSecurityExportAt === security.length) {
          sinkFailure = { sink: 'security_exporter', phase: 'export' };
          return Promise.reject(new Error('SYNTHETIC_SECURITY_EXPORT_FAILURE'));
        }
        security.push(item);
        return Promise.resolve();
      }
    },
    metricsExporter: {
      export: (items) => {
        if (options.failMetricsExportAt === metricBatches.length) {
          sinkFailure = { sink: 'metrics_exporter', phase: 'export' };
          return Promise.reject(new Error('SYNTHETIC_METRICS_EXPORT_FAILURE'));
        }
        metricBatches.push(items);
        return Promise.resolve();
      }
    },
    healthExporter: {
      export: (item) => {
        if (options.failHealthExport) {
          if (!sinkFailure) sinkFailure = { sink: 'health_exporter', phase: 'export' };
          return Promise.reject(new Error('SYNTHETIC_HEALTH_EXPORT_FAILURE'));
        }
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
    get writeAttempts() {
      return writeAttempts;
    },
    get sinkFailure() {
      return sinkFailure;
    },
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
      writeAttempts = 0;
      sinkFailure = undefined;
      this.disposed = true;
      if (options.failCleanup) throw new Error('SYNTHETIC_CLEANUP_FAILURE');
    }
  };
}

export interface AuditSinkObservation {
  readonly attemptedEventIds: readonly string[];
  readonly committedEventIds: readonly string[];
  readonly failedEvent?: Readonly<{
    eventId: string;
    tenantId: string;
    sourceId: string;
    eventType: string;
    stateBefore: LifecycleState;
    stateAfter: LifecycleState;
    decision: string;
    requestId: string;
    correlationId: string;
    traceId: string;
    immutableReference: Readonly<{ id: string; commit: string; path: string; sha256: string }>;
    timestamp: string;
  }>;
  readonly failedSink?: AuditHealthEvidence['failed_component'] | 'health_exporter';
  readonly failedPhase?: 'persist' | 'export';
  readonly failureCode?: 'AUDIT_DELIVERY_FAILURE' | 'AUDIT_VALIDATION_FAILURE';
  readonly outcome: 'complete' | 'failed' | 'partial';
  readonly writeOccurred: boolean;
  readonly partialWrite: boolean;
  readonly expectedItemCount: number;
  readonly attemptedWriteCount: number;
  readonly actualPersistedCount: number;
  readonly health: readonly Readonly<{
    eventId?: string;
    timestamp: string;
    failedComponent: string;
    reasonCode: string;
  }>[];
  readonly callerVisibleResult:
    ReturnType<typeof callerVisibleDenial> | Readonly<{ decision: 'recorded' }>;
  readonly protectedFieldsDisclosed: 0;
}

export interface ExecutionObservation {
  readonly attempted: number;
  readonly committed: number;
  readonly exported: number;
  readonly securityExported: number;
  readonly metricsExported: number;
  readonly healthCount: number;
  readonly pipelineHealth: 'healthy' | 'degraded';
  readonly writeAttempts: number;
  readonly sink: AuditSinkObservation;
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
  let preflightResult: ReconstructionResult | undefined;
  let cleanupError: string | undefined;
  let observation: ExecutionObservation;
  try {
    preflightResult = preflightLifecycle(events, basis);
    if (preflightResult.decision === 'Blocked / Fail Closed') {
      primaryError =
        preflightResult.reason === 'PROHIBITED_AUDIT_DATA'
          ? 'Audit evidence contains prohibited data'
          : preflightResult.reason;
    } else {
      for (const event of events) {
        fixture.requestScopes.push(event.request_id);
        fixture.tenantScopes.push(event.tenant_id);
        await fixture.pipeline.emit(event);
      }
    }
  } catch (error) {
    primaryError =
      error instanceof Error && error.message === 'Required audit evidence could not be delivered'
        ? error.message
        : 'AUDIT_EXECUTION_FAILURE';
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
    const attemptedEventIds = [...fixture.eventIds];
    const committedEventIds = retained.map((event) => event.event_id);
    const failedSource =
      fixture.sinkFailure && attemptedEventIds.length > 0
        ? events[attemptedEventIds.length - 1]
        : undefined;
    const failedEventId = attemptedEventIds.at(-1);
    const sinkOutcome: AuditSinkObservation['outcome'] = primaryError
      ? retained.length > 0
        ? 'partial'
        : 'failed'
      : 'complete';
    const healthRecords = fixture.health.length > 0 ? fixture.health : fixture.store.health;
    const sink: AuditSinkObservation = {
      attemptedEventIds,
      committedEventIds,
      ...(failedSource && failedEventId
        ? {
            failedEvent: {
              eventId: failedEventId,
              tenantId: failedSource.tenant_id,
              sourceId: failedSource.canonical_source_id,
              eventType: failedSource.event_type,
              stateBefore: failedSource.state_before,
              stateAfter: failedSource.state_after,
              decision: failedSource.decision,
              requestId: failedSource.request_id,
              correlationId: failedSource.correlation_id,
              traceId: failedSource.trace_id,
              immutableReference: {
                id: failedSource.evidence_id,
                commit: failedSource.evidence_commit,
                path: failedSource.evidence_path,
                sha256: failedSource.evidence_sha256
              },
              timestamp: failedSource.test_emission_time
            }
          }
        : {}),
      ...(fixture.sinkFailure
        ? { failedSink: fixture.sinkFailure.sink, failedPhase: fixture.sinkFailure.phase }
        : {}),
      ...(primaryError
        ? {
            failureCode: fixture.sinkFailure
              ? ('AUDIT_DELIVERY_FAILURE' as const)
              : ('AUDIT_VALIDATION_FAILURE' as const)
          }
        : {}),
      outcome: sinkOutcome,
      writeOccurred: retained.length > 0,
      partialWrite: sinkOutcome === 'partial',
      expectedItemCount: events.length,
      attemptedWriteCount: fixture.writeAttempts,
      actualPersistedCount: retained.length,
      health: healthRecords.map((item) => ({
        ...(item.event_id ? { eventId: item.event_id } : {}),
        timestamp: item.timestamp,
        failedComponent: item.failed_component,
        reasonCode: item.reason_code
      })),
      callerVisibleResult: primaryError ? callerVisibleDenial() : { decision: 'recorded' },
      protectedFieldsDisclosed: 0
    };
    const failedAuditOperation =
      failedEventId && fixture.sinkFailure
        ? {
            eventId: failedEventId,
            outcome: sinkOutcome === 'partial' ? ('partial' as const) : ('failed' as const),
            persistedItemCount: retained.length
          }
        : undefined;
    observation = {
      attempted: fixture.eventIds.length,
      committed: retained.length,
      exported: fixture.exported.length,
      securityExported: fixture.security.length,
      metricsExported: fixture.metricBatches.length,
      healthCount: fixture.health.length,
      pipelineHealth: fixture.pipeline.healthStatus().status,
      writeAttempts: fixture.writeAttempts,
      sink,
      reconstruction:
        preflightResult?.decision === 'Blocked / Fail Closed'
          ? preflightResult
          : primaryError
            ? blocked('AUDIT_DELIVERY_OR_VALIDATION_FAILURE', failedAuditOperation)
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
        fixture.tenantScopes.length ||
        fixture.writeAttempts ||
        fixture.sinkFailure
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
