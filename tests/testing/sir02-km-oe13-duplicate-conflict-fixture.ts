import { createHash } from 'node:crypto';
import {
  ACCEPTED_INPUTS,
  OE09_NAMESPACE,
  OE09_SCHEMA,
  OE09_TENANT_A,
  OE09_TENANT_B,
  buildAuthoritativeInventory,
  loadAcceptedEvidence,
  type InventoryVersion
} from './sir02-km-oe09-reconciliation-fixture.js';
import {
  createProcessingSpies,
  type ProcessingCallCounters,
  type ProcessingSpies
} from './sir02-km-oe11-fail-closed-fixture.js';
import type { LiveOperationObserver } from './sir02-km-oe13-live-operation-observer.js';

export const OE13_NAMESPACE = OE09_NAMESPACE;
export const OE13_SCHEMA = OE09_SCHEMA;
export const OE13_TENANT_A = OE09_TENANT_A;
export const OE13_TENANT_B = OE09_TENANT_B;
export const OE13_EVALUATION_TIME = '2026-09-26T00:00:00Z';

export type ConflictCode =
  | 'REGISTRATION_ID_CONFLICT'
  | 'SOURCE_VERSION_CONFLICT'
  | 'CONTENT_IDENTITY_CONFLICT'
  | 'APPROVAL_CONFLICT'
  | 'PROVENANCE_CONFLICT'
  | 'LINEAGE_CONFLICT'
  | 'SUPERSESSION_CONFLICT'
  | 'STALE_QUARANTINE_CONFLICT'
  | 'IMMUTABLE_COMMIT_CONFLICT'
  | 'ARTIFACT_REFERENCE_CONFLICT'
  | 'TENANT_BINDING_CONFLICT'
  | 'CROSS_TENANT_INJECTION'
  | 'OWNER_CONFLICT'
  | 'CHRONOLOGY_CONFLICT'
  | 'AMBIGUOUS_AUTHORITATIVE_STATE'
  | 'WILDCARD_IDENTIFIER'
  | 'QUARANTINE_DECISION_CONFLICT';

export interface ImmutableReference {
  id: string;
  commit: string;
  path: string;
  sha256: string;
}

export interface SourceRecord extends InventoryVersion {
  contentIdentity: string;
  immutableRefs: ImmutableReference[];
  eventTimestamp: string;
}

export interface Submission {
  callerTenant: string;
  actorId: string;
  correlationId: string;
  record: SourceRecord;
  claimedApproval?: string;
  repeatCount?: number;
}

export interface LogicalArtifactCount {
  authoritativeRecords: number;
  active: number;
  downstreamKnowledge: number;
}

export interface QuarantineDecision {
  id: string;
  tenantId: string;
  canonicalSourceId: string;
  sourceVersion: string;
  conflictType: ConflictCode;
  conflictingRecordReferences: string[];
  affectedPairIds: string[];
  exactConflictCount: number;
  artifactCountBefore: LogicalArtifactCount;
  artifactCountAfter: LogicalArtifactCount;
  lifecycleState: 'Blocked / Quarantined / Non-Operational';
  humanDecisionRequired: true;
  correlationId: string;
  callerVisible: {
    decision: 'Blocked / Fail Closed';
    reason: 'KNOWLEDGE_SOURCE_DENIED';
    correlationId: string;
  };
}

/** Internal evidence only. Never include these references in caller-visible output. */
export interface ConflictPairEvidence {
  conflictType: ConflictCode;
  pairId: string;
  leftReferenceId: string;
  rightReferenceId: string;
}

export interface AuditEvent {
  eventType: 'km_duplicate_conflict_evaluated';
  eventTimestamp: typeof OE13_EVALUATION_TIME;
  actorScope: 'sir02-test-submitter';
  tenantScope: string;
  requestId: string;
  correlationId: string;
  traceId: string;
  outcome: SubmissionResult['decision'];
  reasonCodes: ConflictCode[] | ['EXACT_DUPLICATE_NO_OP'] | ['DISTINCT_SCOPED_IDENTITY'];
  conflictCounts: Partial<Record<ConflictCode, number>>;
  immutableReferenceIds: string[];
  candidateRecordHash: string | null;
  protectedFieldsDisclosed: number;
  processingCalls: ProcessingCallCounters;
  artifactCountBefore: LogicalArtifactCount;
  artifactCountAfter: LogicalArtifactCount;
  quarantineIds: string[];
}

export interface SubmissionResult {
  decision:
    | 'Exact Duplicate / No Op'
    | 'Distinct Scoped Identity / Non-Operational'
    | 'Conflict / Quarantined / Fail Closed';
  classification: 'EXACT_DUPLICATE_NO_OP' | 'DISTINCT_SCOPED_IDENTITY' | 'CONFLICT';
  conflictCodes: ConflictCode[];
  conflictPairs: ConflictPairEvidence[];
  conflictCounts: Partial<Record<ConflictCode, number>>;
  totalConflicts: number;
  artifactCountBefore: LogicalArtifactCount;
  artifactCountAfter: LogicalArtifactCount;
  registryHashBefore: string;
  registryHashAfter: string;
  inventoryHashBefore: string;
  inventoryHashAfter: string;
  quarantine: QuarantineDecision[];
  callerVisible: {
    decision:
      | 'Blocked / Fail Closed'
      | 'Exact Duplicate / No Op'
      | 'Distinct Scoped Identity / Non-Operational';
    reason: 'KNOWLEDGE_SOURCE_DENIED' | 'EXACT_REPEAT_NO_OP' | 'SCOPE_CONTROL_ONLY';
    correlationId: string;
  };
  protectedFieldsDisclosed: number;
  processingCalls: ProcessingCallCounters;
  audit: AuditEvent;
  auditTrail: AuditEvent[];
  repeatObservations: Array<{
    classification: 'EXACT_DUPLICATE_NO_OP';
    registryHash: string;
    inventoryHash: string;
  }>;
  cleanup: 'Passed';
  namespace: typeof OE13_NAMESPACE;
  schema: typeof OE13_SCHEMA;
  classificationOfData: 'Synthetic';
}

export interface FixtureState {
  registry: Map<string, SourceRecord[]>;
  artifactInventory: Map<string, { active: number; downstreamKnowledge: number }>;
  syntheticScopedAuthority: Map<string, string>;
  preexistingQuarantineDecisions: Map<string, QuarantineDecision[]>;
  quarantine: QuarantineDecision[];
  auditEvents: AuditEvent[];
  spies: ProcessingSpies;
  request: Submission | null;
  beforeClassify?: () => void;
  disposed: boolean;
}

export class FixtureExecutionFailure extends AggregateError {
  readonly cleanup = 'Failed' as const;
  constructor(
    readonly primaryError: unknown,
    readonly cleanupError: unknown
  ) {
    super(
      primaryError === null ? [cleanupError] : [primaryError, cleanupError],
      'OE13_CLEANUP_FAILED'
    );
    this.name = 'FixtureExecutionFailure';
  }
}

const hash = (value: unknown): string =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const copy = <T>(value: T): T => structuredClone(value);
const validId = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.trim() !== '' &&
  !/[?*]/u.test(value) &&
  !['all', 'any', 'global'].includes(value.toLowerCase());
const validUtc = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(value) &&
  !Number.isNaN(Date.parse(value));
const keyOf = (record: Pick<SourceRecord, 'tenantId' | 'sourceId' | 'version'>): string =>
  `${record.tenantId}\u001f${record.sourceId}\u001f${record.version}`;
export const scopedKey = keyOf;

const orderedRegistry = (registry: FixtureState['registry']): unknown =>
  [...registry]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, records]) => [
      key,
      [...records].sort((left, right) => hash(left).localeCompare(hash(right)))
    ]);
const orderedInventory = (inventory: FixtureState['artifactInventory']): unknown =>
  [...inventory].sort(([a], [b]) => a.localeCompare(b));
const counts = (state: FixtureState): LogicalArtifactCount => ({
  authoritativeRecords: [...state.registry.values()].reduce(
    (sum, records) => sum + records.length,
    0
  ),
  active: [...state.artifactInventory.values()].reduce((sum, entry) => sum + entry.active, 0),
  downstreamKnowledge: [...state.artifactInventory.values()].reduce(
    (sum, entry) => sum + entry.downstreamKnowledge,
    0
  )
});

export function loadOe13Inputs(): ReturnType<typeof loadAcceptedEvidence> {
  return loadAcceptedEvidence();
}

export function createFixture(inputs: ReturnType<typeof loadAcceptedEvidence>): FixtureState {
  const inventory = buildAuthoritativeInventory(inputs);
  const refs: ImmutableReference[] = ACCEPTED_INPUTS.map((item) => ({
    id: item.id,
    commit: item.evidenceCommit,
    path: item.path,
    sha256: item.sha256
  }));
  const registry = new Map<string, SourceRecord[]>();
  const artifactInventory = new Map<string, { active: number; downstreamKnowledge: number }>();
  for (const version of inventory.versions) {
    const record: SourceRecord = {
      ...copy(version),
      contentIdentity: version.checksum,
      immutableRefs: copy(refs),
      eventTimestamp: version.createdAt
    };
    const key = keyOf(record);
    if (registry.has(key)) throw new Error('AMBIGUOUS_ACCEPTED_INPUT');
    registry.set(key, [record]);
    artifactInventory.set(key, { active: 0, downstreamKnowledge: 0 });
  }
  return {
    registry,
    artifactInventory,
    syntheticScopedAuthority: new Map(),
    preexistingQuarantineDecisions: new Map(),
    quarantine: [],
    auditEvents: [],
    spies: createProcessingSpies(),
    request: null,
    disposed: false
  };
}

export function baselineRecord(state: FixtureState, version = 'v1.0'): SourceRecord {
  const records = [...state.registry.values()]
    .flat()
    .filter((record) => record.version === version);
  const record = records[0];
  if (records.length !== 1 || !record) throw new Error('BASELINE_RECORD_AMBIGUOUS');
  return copy(record);
}

export function makeSubmission(state: FixtureState, version = 'v1.0'): Submission {
  return {
    callerTenant: OE13_TENANT_A,
    actorId: 'sir02-test-submitter',
    correlationId: 'sir02-oe13-synthetic-correlation',
    record: baselineRecord(state, version)
  };
}

// A distinct, non-operational identity needs test-harness authority independent of
// the accepted Tenant A evidence. The caller cannot grant this authority.
export function authorizeSyntheticDistinct(state: FixtureState, record: SourceRecord): void {
  const tenant = record.tenantId;
  const source = record.sourceId;
  if (
    state.disposed ||
    ![OE13_TENANT_A, OE13_TENANT_B].includes(tenant) ||
    !validId(source) ||
    record.registrationId !== `sir02-test-registration-${tenant}-${source}` ||
    record.ownerId !== `sir02-test-owner-${tenant}` ||
    record.provenanceRef !== `synthetic://${tenant}/${source}/v1.0` ||
    record.lineageRoot !== `sir02-test-root-${tenant}-${source}` ||
    record.immutableRefs.length !== 0 ||
    record.approvalState !== 'unapproved' ||
    record.approvalRef !== null ||
    record.active ||
    state.registry.has(keyOf(record)) ||
    [...state.registry.values()]
      .flat()
      .some((prior) => prior.registrationId === record.registrationId)
  )
    throw new Error('INVALID_SYNTHETIC_SCOPED_AUTHORITY');
  state.syntheticScopedAuthority.set(keyOf(record), hash(record));
}

const refPairs = (left: ImmutableReference[], right: ImmutableReference[]): string[] =>
  [...new Set([...left, ...right].map((entry) => entry.id))].sort();
const recordIdentity = (record: SourceRecord): string => `record-sha256:${hash(record)}`;
const referenceIdentity = (reference: ImmutableReference): string =>
  `reference:${reference.id}:sha256:${hash(reference)}`;
const acceptedReferenceIdentity = (item: (typeof ACCEPTED_INPUTS)[number]): string =>
  referenceIdentity({
    id: item.id,
    commit: item.evidenceCommit,
    path: item.path,
    sha256: item.sha256
  });
interface ConflictObservation {
  code: ConflictCode;
  pairId: string;
  references: string[];
}
const refsValid = (refs: ImmutableReference[]): boolean =>
  refs.length === ACCEPTED_INPUTS.length &&
  new Set(refs.map((ref) => ref.id)).size === ACCEPTED_INPUTS.length &&
  refs.every((ref) =>
    ACCEPTED_INPUTS.some(
      (pinned) =>
        pinned.id === ref.id &&
        pinned.evidenceCommit === ref.commit &&
        pinned.path === ref.path &&
        pinned.sha256 === ref.sha256
    )
  );

function classify(state: FixtureState, submission: Submission): ConflictObservation[] {
  const candidate = submission.record;
  const observations = new Map<string, ConflictObservation>();
  const candidateIdentity = recordIdentity(candidate);
  const add = (
    code: ConflictCode,
    left = `validation:${code}`,
    right = candidateIdentity
  ): void => {
    const references = [left, right].sort();
    const pairId = hash([keyOf(candidate), ...references]);
    observations.set(`${code}:${pairId}`, { code, pairId, references });
  };
  if (
    !validId(candidate.registrationId) ||
    !validId(candidate.sourceId) ||
    !validId(candidate.version) ||
    !validId(candidate.tenantId) ||
    !validId(candidate.ownerId)
  )
    add('WILDCARD_IDENTIFIER');
  if (!validId(submission.callerTenant) || submission.callerTenant !== candidate.tenantId)
    add('TENANT_BINDING_CONFLICT');
  if (![OE13_TENANT_A, OE13_TENANT_B].includes(candidate.tenantId)) add('TENANT_BINDING_CONFLICT');
  if (!validUtc(candidate.eventTimestamp) || candidate.eventTimestamp !== candidate.createdAt)
    add('CHRONOLOGY_CONFLICT');
  if (candidate.approvalAt && Date.parse(candidate.approvalAt) < Date.parse(candidate.createdAt))
    add('CHRONOLOGY_CONFLICT');
  if (
    candidate.supersessionAt &&
    Date.parse(candidate.supersessionAt) <= Date.parse(candidate.createdAt)
  )
    add('CHRONOLOGY_CONFLICT');
  if (
    candidate.quarantineAt &&
    candidate.supersessionAt &&
    Date.parse(candidate.quarantineAt) <= Date.parse(candidate.supersessionAt)
  )
    add('CHRONOLOGY_CONFLICT');
  if (
    candidate.active &&
    (candidate.supersessionState === 'superseded' || candidate.quarantineState === 'quarantined')
  )
    add('STALE_QUARANTINE_CONFLICT');
  if (candidate.approvalState === 'approved' && !candidate.approvalRef) add('APPROVAL_CONFLICT');
  if (!candidate.contentIdentity || candidate.contentIdentity !== candidate.checksum)
    add('CONTENT_IDENTITY_CONFLICT');
  const scopedAuthority = state.syntheticScopedAuthority.get(keyOf(candidate));
  const authorizedDistinct =
    scopedAuthority === hash(candidate) && candidate.immutableRefs.length === 0;
  for (const ref of candidate.immutableRefs) {
    const pinned = ACCEPTED_INPUTS.find((item) => item.id === ref.id);
    if (!pinned || pinned.evidenceCommit !== ref.commit || pinned.sha256 !== ref.sha256)
      add(
        'IMMUTABLE_COMMIT_CONFLICT',
        pinned ? acceptedReferenceIdentity(pinned) : 'reference:unknown',
        referenceIdentity(ref)
      );
    if (!pinned || pinned.path !== ref.path)
      add(
        'ARTIFACT_REFERENCE_CONFLICT',
        pinned ? acceptedReferenceIdentity(pinned) : 'reference:unknown',
        referenceIdentity(ref)
      );
  }
  if (!authorizedDistinct) {
    for (const pinned of ACCEPTED_INPUTS) {
      const matching = candidate.immutableRefs.filter((ref) => ref.id === pinned.id);
      if (matching.length !== 1)
        add(
          'IMMUTABLE_COMMIT_CONFLICT',
          acceptedReferenceIdentity(pinned),
          matching.length === 0
            ? 'reference:missing'
            : `reference:duplicate:sha256:${hash(matching)}`
        );
    }
    if (
      !refsValid(candidate.immutableRefs) &&
      ![...observations.values()].some((entry) => entry.code === 'IMMUTABLE_COMMIT_CONFLICT')
    )
      add('IMMUTABLE_COMMIT_CONFLICT');
  }

  // Scope and registration checks occur before any foreign record can be disclosed.
  const all = [...state.registry.values()].flat();
  const registrationClaims = all.filter(
    (record) => record.registrationId === candidate.registrationId
  );
  for (const record of registrationClaims) {
    if (record.tenantId !== candidate.tenantId)
      add('CROSS_TENANT_INJECTION', recordIdentity(record));
    if (record.tenantId === candidate.tenantId && record.sourceId !== candidate.sourceId)
      add('REGISTRATION_ID_CONFLICT', recordIdentity(record));
  }
  const sameSource = all.filter(
    (record) => record.tenantId === candidate.tenantId && record.sourceId === candidate.sourceId
  );
  if (!state.registry.has(keyOf(candidate))) {
    for (const record of sameSource)
      if (
        record.registrationId === candidate.registrationId &&
        record.version !== candidate.version &&
        candidate.predecessor !== record.version
      )
        add('SOURCE_VERSION_CONFLICT', recordIdentity(record));
  }
  const existing = state.registry.get(keyOf(candidate)) ?? [];
  if (existing.length === 0 && !authorizedDistinct)
    add('TENANT_BINDING_CONFLICT', 'authority:missing');
  if (existing.length > 1)
    for (const record of existing) add('AMBIGUOUS_AUTHORITATIVE_STATE', recordIdentity(record));
  for (const authoritative of existing) {
    const addAgainst = (code: ConflictCode): void => {
      add(code, recordIdentity(authoritative));
    };
    if (authoritative.registrationId !== candidate.registrationId)
      addAgainst('REGISTRATION_ID_CONFLICT');
    if (authoritative.ownerId !== candidate.ownerId) addAgainst('OWNER_CONFLICT');
    if (
      authoritative.checksum !== candidate.checksum ||
      authoritative.contentIdentity !== candidate.contentIdentity
    )
      addAgainst('CONTENT_IDENTITY_CONFLICT');
    if (
      authoritative.approvalState !== candidate.approvalState ||
      authoritative.approvalRef !== candidate.approvalRef ||
      authoritative.approvalAt !== candidate.approvalAt
    )
      addAgainst('APPROVAL_CONFLICT');
    if (authoritative.provenanceRef !== candidate.provenanceRef) addAgainst('PROVENANCE_CONFLICT');
    if (
      authoritative.lineageRoot !== candidate.lineageRoot ||
      authoritative.predecessor !== candidate.predecessor
    )
      addAgainst('LINEAGE_CONFLICT');
    if (
      authoritative.supersessionState !== candidate.supersessionState ||
      authoritative.supersessionRef !== candidate.supersessionRef ||
      authoritative.supersessionAt !== candidate.supersessionAt
    )
      addAgainst('SUPERSESSION_CONFLICT');
    if (
      authoritative.quarantineState !== candidate.quarantineState ||
      authoritative.quarantineRef !== candidate.quarantineRef ||
      authoritative.quarantineAt !== candidate.quarantineAt ||
      authoritative.active !== candidate.active
    )
      addAgainst('STALE_QUARANTINE_CONFLICT');
    if (
      authoritative.eventTimestamp !== candidate.eventTimestamp ||
      authoritative.createdAt !== candidate.createdAt
    )
      addAgainst('CHRONOLOGY_CONFLICT');
    for (const ref of candidate.immutableRefs) {
      const prior = authoritative.immutableRefs.find((item) => item.id === ref.id);
      if (!prior || prior.commit !== ref.commit || prior.sha256 !== ref.sha256)
        add(
          'IMMUTABLE_COMMIT_CONFLICT',
          prior ? referenceIdentity(prior) : 'reference:missing',
          referenceIdentity(ref)
        );
      if (!prior || prior.path !== ref.path)
        add(
          'ARTIFACT_REFERENCE_CONFLICT',
          prior ? referenceIdentity(prior) : 'reference:missing',
          referenceIdentity(ref)
        );
    }
    for (const prior of authoritative.immutableRefs)
      if (!candidate.immutableRefs.some((ref) => ref.id === prior.id))
        add('IMMUTABLE_COMMIT_CONFLICT', referenceIdentity(prior), 'reference:missing');
  }
  if ((state.preexistingQuarantineDecisions.get(keyOf(candidate))?.length ?? 0) > 0)
    add('QUARANTINE_DECISION_CONFLICT');
  return [...observations.values()].sort(
    (left, right) => left.code.localeCompare(right.code) || left.pairId.localeCompare(right.pairId)
  );
}

function cleanup(state: FixtureState): void {
  const failures: unknown[] = [];
  const clear = (action: () => void): void => {
    try {
      action();
    } catch (error) {
      failures.push(error);
    }
  };
  clear(() => {
    state.registry.clear();
  });
  clear(() => {
    state.artifactInventory.clear();
  });
  clear(() => {
    state.syntheticScopedAuthority.clear();
  });
  clear(() => {
    state.preexistingQuarantineDecisions.clear();
  });
  clear(() => {
    state.quarantine.length = 0;
  });
  clear(() => {
    state.auditEvents.length = 0;
  });
  clear(() => {
    state.request = null;
  });
  clear(() => {
    delete state.beforeClassify;
  });
  clear(() => {
    state.spies.reset();
  });
  clear(() => {
    state.spies = createProcessingSpies();
  });
  state.disposed = true;
  if (failures.length) throw new AggregateError(failures, 'OE13_CLEANUP_STEP_FAILED');
}

export function executeSubmission(
  state: FixtureState,
  submission: Submission,
  observer: LiveOperationObserver,
  scenarioId: string
): SubmissionResult {
  let result: Omit<SubmissionResult, 'cleanup'> | undefined;
  let primaryError: unknown = null;
  let cleanupError: unknown = null;
  try {
    if (state.disposed) throw new Error('OE13_FIXTURE_DISPOSED');
    observer.assertActive(scenarioId);
    const portNames = Object.keys(state.spies.ports) as Array<keyof ProcessingSpies['ports']>;
    for (const name of portNames) state.spies.ports[name] = () => observer.attemptOperation(name);
    observer.bindProcessingPorts(portNames);
    state.request = copy(submission);
    const before = counts(state);
    const registryHashBefore = hash(orderedRegistry(state.registry));
    const inventoryHashBefore = hash(orderedInventory(state.artifactInventory));
    state.beforeClassify?.();
    const observations = classify(state, submission);
    const key = keyOf(submission.record);
    const existing = state.registry.get(key) ?? [];
    const identical =
      observations.length === 0 &&
      existing.length === 1 &&
      hash(existing[0]) === hash(submission.record);
    const isDistinct = observations.length === 0 && existing.length === 0;
    if (!identical && !isDistinct && observations.length === 0) {
      const references = [
        recordIdentity(existing[0] ?? submission.record),
        recordIdentity(submission.record)
      ].sort();
      observations.push({
        code: 'AMBIGUOUS_AUTHORITATIVE_STATE',
        pairId: hash([key, ...references]),
        references
      });
    }
    const codes = [...new Set(observations.map((entry) => entry.code))].sort();
    const decision: SubmissionResult['decision'] =
      codes.length > 0
        ? 'Conflict / Quarantined / Fail Closed'
        : identical
          ? 'Exact Duplicate / No Op'
          : 'Distinct Scoped Identity / Non-Operational';
    const correlationId = `sir02-oe13-${hash(submission.correlationId).slice(0, 16)}`;
    const callerVisible: SubmissionResult['callerVisible'] =
      codes.length > 0
        ? { decision: 'Blocked / Fail Closed', reason: 'KNOWLEDGE_SOURCE_DENIED', correlationId }
        : identical
          ? { decision: 'Exact Duplicate / No Op', reason: 'EXACT_REPEAT_NO_OP', correlationId }
          : {
              decision: 'Distinct Scoped Identity / Non-Operational',
              reason: 'SCOPE_CONTROL_ONLY',
              correlationId
            };
    const visibleText = JSON.stringify(callerVisible);
    const protectedFieldsDisclosed = [...state.registry.values()]
      .flat()
      .filter((records) => records.tenantId !== submission.callerTenant)
      .flatMap((record) => [
        record.registrationId,
        record.sourceId,
        record.ownerId,
        record.version,
        record.checksum,
        record.provenanceRef,
        record.approvalRef ?? ''
      ])
      .filter((value) => value.length > 0 && visibleText.includes(value)).length;
    if (protectedFieldsDisclosed !== 0) throw new Error('PROTECTED_FIELD_DISCLOSURE');
    if (codes.length === 0 && isDistinct) {
      // A separate scoped synthetic record is non-active and cannot inherit approval.
      if (
        submission.record.active ||
        submission.record.approvalState !== 'unapproved' ||
        submission.record.approvalRef
      )
        throw new Error('DISTINCT_SCOPE_MUST_REMAIN_UNAPPROVED');
      state.registry.set(key, [copy(submission.record)]);
      state.artifactInventory.set(key, { active: 0, downstreamKnowledge: 0 });
    }
    const after = counts(state);
    const byCode: Partial<Record<ConflictCode, number>> = {};
    for (const observation of observations)
      byCode[observation.code] = (byCode[observation.code] ?? 0) + 1;
    const quarantine: QuarantineDecision[] = codes.map((code) => ({
      id: `sir02-oe13-hold-${hash([key, code, correlationId]).slice(0, 16)}`,
      tenantId: submission.record.tenantId,
      canonicalSourceId: submission.record.sourceId,
      sourceVersion: submission.record.version,
      conflictType: code,
      conflictingRecordReferences:
        submission.callerTenant === OE13_TENANT_B
          ? []
          : [
              ...new Set([
                ...observations
                  .filter((entry) => entry.code === code)
                  .flatMap((entry) => entry.references),
                ...refPairs(existing[0]?.immutableRefs ?? [], submission.record.immutableRefs),
                `candidate-record-sha256:${hash(submission.record)}`
              ])
            ].sort(),
      affectedPairIds: observations
        .filter((entry) => entry.code === code)
        .map((entry) => entry.pairId)
        .sort(),
      exactConflictCount: byCode[code] ?? 0,
      artifactCountBefore: copy(before),
      artifactCountAfter: copy(after),
      lifecycleState: 'Blocked / Quarantined / Non-Operational',
      humanDecisionRequired: true,
      correlationId,
      callerVisible: {
        decision: 'Blocked / Fail Closed',
        reason: 'KNOWLEDGE_SOURCE_DENIED',
        correlationId
      }
    }));
    state.quarantine.push(...quarantine);
    const processingCalls = state.spies.snapshot();
    if (Object.values(processingCalls).some((count) => count !== 0))
      throw new Error('DOWNSTREAM_PROCESSING_CALL');
    if (
      codes.length > 0 &&
      (after.authoritativeRecords !== before.authoritativeRecords ||
        after.active !== before.active ||
        after.downstreamKnowledge !== before.downstreamKnowledge)
    )
      throw new Error('CONFLICT_MUTATED_AUTHORITATIVE_STATE');
    if (
      identical &&
      (registryHashBefore !== hash(orderedRegistry(state.registry)) ||
        inventoryHashBefore !== hash(orderedInventory(state.artifactInventory)))
    )
      throw new Error('EXACT_DUPLICATE_MUTATED_STATE');
    const audit: AuditEvent = {
      eventType: 'km_duplicate_conflict_evaluated',
      eventTimestamp: OE13_EVALUATION_TIME,
      actorScope: 'sir02-test-submitter',
      tenantScope: submission.callerTenant,
      requestId: `${correlationId}-request`,
      correlationId,
      traceId: `${correlationId}-trace`,
      outcome: decision,
      reasonCodes:
        codes.length > 0
          ? codes
          : identical
            ? ['EXACT_DUPLICATE_NO_OP']
            : ['DISTINCT_SCOPED_IDENTITY'],
      conflictCounts: byCode,
      immutableReferenceIds:
        submission.callerTenant === OE13_TENANT_B
          ? []
          : submission.record.immutableRefs.map((reference) => reference.id).sort(),
      candidateRecordHash:
        submission.callerTenant === OE13_TENANT_B ? null : hash(submission.record),
      protectedFieldsDisclosed,
      processingCalls,
      artifactCountBefore: copy(before),
      artifactCountAfter: copy(after),
      quarantineIds: quarantine.map((entry) => entry.id)
    };
    state.auditEvents.push(audit);
    const repeatObservations: SubmissionResult['repeatObservations'] = [];
    if (submission.repeatCount !== undefined) {
      if (!identical || !Number.isInteger(submission.repeatCount) || submission.repeatCount < 1)
        throw new Error('INVALID_REPEAT_CONTROL');
      for (let repeat = 1; repeat <= submission.repeatCount; repeat += 1) {
        if (
          classify(state, submission).length !== 0 ||
          hash(state.registry.get(key)?.[0]) !== hash(submission.record)
        )
          throw new Error('EXACT_REPEAT_NOT_SUPPRESSED');
        const registryHash = hash(orderedRegistry(state.registry));
        const inventoryHash = hash(orderedInventory(state.artifactInventory));
        if (registryHash !== registryHashBefore || inventoryHash !== inventoryHashBefore)
          throw new Error('EXACT_REPEAT_MUTATED_STATE');
        state.auditEvents.push({
          ...audit,
          requestId: `${correlationId}-repeat-${repeat.toString()}`
        });
        repeatObservations.push({
          classification: 'EXACT_DUPLICATE_NO_OP',
          registryHash,
          inventoryHash
        });
      }
    }
    result = {
      decision,
      classification:
        codes.length > 0
          ? 'CONFLICT'
          : identical
            ? 'EXACT_DUPLICATE_NO_OP'
            : 'DISTINCT_SCOPED_IDENTITY',
      conflictCodes: codes,
      conflictPairs: observations.map((entry) => {
        const [leftReferenceId, rightReferenceId] = entry.references;
        if (!leftReferenceId || !rightReferenceId)
          throw new Error('OE13_CONFLICT_PAIR_REFERENCE_MISSING');
        return {
          conflictType: entry.code,
          pairId: entry.pairId,
          leftReferenceId,
          rightReferenceId
        };
      }),
      conflictCounts: byCode,
      totalConflicts: new Set(observations.map((entry) => entry.pairId)).size,
      artifactCountBefore: before,
      artifactCountAfter: after,
      registryHashBefore,
      registryHashAfter: hash(orderedRegistry(state.registry)),
      inventoryHashBefore,
      inventoryHashAfter: hash(orderedInventory(state.artifactInventory)),
      quarantine,
      callerVisible,
      protectedFieldsDisclosed,
      processingCalls,
      audit,
      auditTrail: copy(state.auditEvents),
      repeatObservations,
      namespace: OE13_NAMESPACE,
      schema: OE13_SCHEMA,
      classificationOfData: 'Synthetic'
    };
  } catch (error) {
    primaryError = error;
  } finally {
    try {
      observer.captureBeforeFixtureCleanup(scenarioId);
    } catch (error) {
      cleanupError = error;
    }
    try {
      cleanup(state);
    } catch (error) {
      cleanupError =
        cleanupError === null
          ? error
          : new AggregateError([cleanupError, error], 'OE13_OBSERVER_AND_FIXTURE_CLEANUP_FAILED');
    }
  }
  if (cleanupError !== null) throw new FixtureExecutionFailure(primaryError, cleanupError);
  if (primaryError instanceof Error) throw primaryError;
  if (primaryError !== null)
    throw new Error('OE13_PRIMARY_NON_ERROR_FAILURE', { cause: primaryError });
  if (!result) throw new Error('OE13_RESULT_MISSING');
  return { ...result, cleanup: 'Passed' };
}
