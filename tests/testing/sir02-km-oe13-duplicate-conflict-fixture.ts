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
  exactConflictCount: number;
  artifactCountBefore: LogicalArtifactCount;
  artifactCountAfter: LogicalArtifactCount;
  lifecycleState: 'Blocked / Quarantined / Non-Operational';
  humanDecisionRequired: true;
  correlationId: string;
  callerVisible: { decision: 'Blocked / Fail Closed'; reason: 'KNOWLEDGE_SOURCE_DENIED'; correlationId: string };
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
    decision: 'Blocked / Fail Closed' | 'Exact Duplicate / No Op' | 'Distinct Scoped Identity / Non-Operational';
    reason: 'KNOWLEDGE_SOURCE_DENIED' | 'EXACT_REPEAT_NO_OP' | 'SCOPE_CONTROL_ONLY';
    correlationId: string;
  };
  protectedFieldsDisclosed: number;
  processingCalls: ProcessingCallCounters;
  audit: AuditEvent;
  auditTrail: AuditEvent[];
  repeatObservations: Array<{ classification: 'EXACT_DUPLICATE_NO_OP'; registryHash: string; inventoryHash: string }>;
  cleanup: 'Passed';
  namespace: typeof OE13_NAMESPACE;
  schema: typeof OE13_SCHEMA;
  classificationOfData: 'Synthetic';
}

export interface FixtureState {
  registry: Map<string, SourceRecord[]>;
  artifactInventory: Map<string, { active: number; downstreamKnowledge: number }>;
  quarantine: QuarantineDecision[];
  auditEvents: AuditEvent[];
  spies: ProcessingSpies;
  request: Submission | null;
  beforeClassify?: () => void;
  disposed: boolean;
}

export class FixtureExecutionFailure extends AggregateError {
  readonly cleanup = 'Failed' as const;
  constructor(readonly primaryError: unknown, readonly cleanupError: unknown) {
    super(primaryError === null ? [cleanupError] : [primaryError, cleanupError], 'OE13_CLEANUP_FAILED');
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
  [...registry].sort(([a], [b]) => a.localeCompare(b)).map(([key, records]) => [key, records]);
const orderedInventory = (inventory: FixtureState['artifactInventory']): unknown =>
  [...inventory].sort(([a], [b]) => a.localeCompare(b));
const counts = (state: FixtureState): LogicalArtifactCount => ({
  authoritativeRecords: [...state.registry.values()].reduce((sum, records) => sum + records.length, 0),
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
    quarantine: [],
    auditEvents: [],
    spies: createProcessingSpies(),
    request: null,
    disposed: false
  };
}

export function baselineRecord(state: FixtureState, version = 'v1.0'): SourceRecord {
  const records = [...state.registry.values()].flat().filter((record) => record.version === version);
  if (records.length !== 1) throw new Error('BASELINE_RECORD_AMBIGUOUS');
  return copy(records[0]!);
}

export function makeSubmission(state: FixtureState, version = 'v1.0'): Submission {
  return {
    callerTenant: OE13_TENANT_A,
    actorId: 'sir02-test-submitter',
    correlationId: 'sir02-oe13-synthetic-correlation',
    record: baselineRecord(state, version)
  };
}

const refPairs = (left: ImmutableReference[], right: ImmutableReference[]): string[] =>
  [...new Set([...left, ...right].map((entry) => entry.id))].sort();
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

function classify(state: FixtureState, submission: Submission): ConflictCode[] {
  const candidate = submission.record;
  const codes = new Set<ConflictCode>();
  const add = (code: ConflictCode): void => void codes.add(code);
  if (
    !validId(candidate.registrationId) ||
    !validId(candidate.sourceId) ||
    !validId(candidate.version) ||
    !validId(candidate.tenantId) ||
    !validId(candidate.ownerId)
  ) add('WILDCARD_IDENTIFIER');
  if (!validId(submission.callerTenant) || submission.callerTenant !== candidate.tenantId)
    add('TENANT_BINDING_CONFLICT');
  if (![OE13_TENANT_A, OE13_TENANT_B].includes(candidate.tenantId))
    add('TENANT_BINDING_CONFLICT');
  if (!validUtc(candidate.eventTimestamp) || candidate.eventTimestamp !== candidate.createdAt)
    add('CHRONOLOGY_CONFLICT');
  if (candidate.approvalAt && Date.parse(candidate.approvalAt) < Date.parse(candidate.createdAt))
    add('CHRONOLOGY_CONFLICT');
  if (candidate.supersessionAt && Date.parse(candidate.supersessionAt) <= Date.parse(candidate.createdAt))
    add('CHRONOLOGY_CONFLICT');
  if (candidate.quarantineAt && candidate.supersessionAt && Date.parse(candidate.quarantineAt) <= Date.parse(candidate.supersessionAt))
    add('CHRONOLOGY_CONFLICT');
  if (candidate.active && (candidate.supersessionState === 'superseded' || candidate.quarantineState === 'quarantined'))
    add('STALE_QUARANTINE_CONFLICT');
  if (candidate.approvalState === 'approved' && !candidate.approvalRef) add('APPROVAL_CONFLICT');
  if (!candidate.contentIdentity || candidate.contentIdentity !== candidate.checksum)
    add('CONTENT_IDENTITY_CONFLICT');
  if (!candidate.immutableRefs.length) add('IMMUTABLE_COMMIT_CONFLICT');
  for (const ref of candidate.immutableRefs) {
    const pinned = ACCEPTED_INPUTS.find((item) => item.id === ref.id);
    if (!pinned || pinned.evidenceCommit !== ref.commit || pinned.sha256 !== ref.sha256)
      add('IMMUTABLE_COMMIT_CONFLICT');
    if (!pinned || pinned.path !== ref.path) add('ARTIFACT_REFERENCE_CONFLICT');
  }
  if (!refsValid(candidate.immutableRefs)) add('IMMUTABLE_COMMIT_CONFLICT');

  // Scope and registration checks occur before any foreign record can be disclosed.
  const all = [...state.registry.values()].flat();
  const registrationClaims = all.filter((record) => record.registrationId === candidate.registrationId);
  if (registrationClaims.some((record) => record.tenantId !== candidate.tenantId))
    add('CROSS_TENANT_INJECTION');
  if (
    registrationClaims.some(
      (record) => record.tenantId === candidate.tenantId && record.sourceId !== candidate.sourceId
    )
  ) add('REGISTRATION_ID_CONFLICT');
  const sameSource = all.filter(
    (record) =>
      record.tenantId === candidate.tenantId && record.sourceId === candidate.sourceId
  );
  if (
    !state.registry.has(keyOf(candidate)) &&
    sameSource.some(
      (record) => record.registrationId === candidate.registrationId && record.version !== candidate.version && candidate.predecessor !== record.version
    )
  ) add('SOURCE_VERSION_CONFLICT');
  const existing = state.registry.get(keyOf(candidate)) ?? [];
  if (existing.length > 1) add('AMBIGUOUS_AUTHORITATIVE_STATE');
  const authoritative = existing[0];
  if (authoritative) {
    if (authoritative.registrationId !== candidate.registrationId) add('REGISTRATION_ID_CONFLICT');
    if (authoritative.ownerId !== candidate.ownerId) add('OWNER_CONFLICT');
    if (authoritative.checksum !== candidate.checksum || authoritative.contentIdentity !== candidate.contentIdentity)
      add('CONTENT_IDENTITY_CONFLICT');
    if (authoritative.approvalState !== candidate.approvalState || authoritative.approvalRef !== candidate.approvalRef || authoritative.approvalAt !== candidate.approvalAt)
      add('APPROVAL_CONFLICT');
    if (authoritative.provenanceRef !== candidate.provenanceRef) add('PROVENANCE_CONFLICT');
    if (authoritative.lineageRoot !== candidate.lineageRoot || authoritative.predecessor !== candidate.predecessor)
      add('LINEAGE_CONFLICT');
    if (authoritative.supersessionState !== candidate.supersessionState || authoritative.supersessionRef !== candidate.supersessionRef || authoritative.supersessionAt !== candidate.supersessionAt)
      add('SUPERSESSION_CONFLICT');
    if (authoritative.quarantineState !== candidate.quarantineState || authoritative.quarantineRef !== candidate.quarantineRef || authoritative.quarantineAt !== candidate.quarantineAt || authoritative.active !== candidate.active)
      add('STALE_QUARANTINE_CONFLICT');
    if (authoritative.eventTimestamp !== candidate.eventTimestamp || authoritative.createdAt !== candidate.createdAt)
      add('CHRONOLOGY_CONFLICT');
    for (const ref of candidate.immutableRefs) {
      const prior = authoritative.immutableRefs.find((item) => item.id === ref.id);
      if (!prior || prior.commit !== ref.commit || prior.sha256 !== ref.sha256)
        add('IMMUTABLE_COMMIT_CONFLICT');
      if (!prior || prior.path !== ref.path) add('ARTIFACT_REFERENCE_CONFLICT');
    }
    if (authoritative.immutableRefs.length !== candidate.immutableRefs.length)
      add('IMMUTABLE_COMMIT_CONFLICT');
  }
  if (state.quarantine.some((entry) => entry.tenantId === candidate.tenantId && entry.canonicalSourceId === candidate.sourceId && entry.sourceVersion === candidate.version))
    add('QUARANTINE_DECISION_CONFLICT');
  return [...codes].sort();
}

function cleanup(state: FixtureState): void {
  const failures: unknown[] = [];
  const clear = (action: () => void): void => {
    try { action(); } catch (error) { failures.push(error); }
  };
  clear(() => state.registry.clear());
  clear(() => state.artifactInventory.clear());
  clear(() => { state.quarantine.length = 0; });
  clear(() => { state.auditEvents.length = 0; });
  clear(() => { state.request = null; });
  clear(() => { delete state.beforeClassify; });
  clear(() => state.spies.reset());
  clear(() => { state.spies = createProcessingSpies(); });
  state.disposed = true;
  if (failures.length) throw new AggregateError(failures, 'OE13_CLEANUP_STEP_FAILED');
}

export function executeSubmission(state: FixtureState, submission: Submission): SubmissionResult {
  let result: Omit<SubmissionResult, 'cleanup'> | undefined;
  let primaryError: unknown = null;
  let cleanupError: unknown = null;
  try {
    if (state.disposed) throw new Error('OE13_FIXTURE_DISPOSED');
    state.request = copy(submission);
    const before = counts(state);
    const registryHashBefore = hash(orderedRegistry(state.registry));
    const inventoryHashBefore = hash(orderedInventory(state.artifactInventory));
    state.beforeClassify?.();
    const codes = classify(state, submission);
    const key = keyOf(submission.record);
    const existing = state.registry.get(key) ?? [];
    const identical =
      codes.length === 0 && existing.length === 1 && hash(existing[0]) === hash(submission.record);
    const isDistinct = codes.length === 0 && existing.length === 0;
    if (!identical && !isDistinct && codes.length === 0) codes.push('AMBIGUOUS_AUTHORITATIVE_STATE');
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
          : { decision: 'Distinct Scoped Identity / Non-Operational', reason: 'SCOPE_CONTROL_ONLY', correlationId };
    const visibleText = JSON.stringify(callerVisible);
    const protectedFieldsDisclosed = [
      ...state.registry.values()
    ]
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
      if (submission.record.active || submission.record.approvalState !== 'unapproved' || submission.record.approvalRef)
        throw new Error('DISTINCT_SCOPE_MUST_REMAIN_UNAPPROVED');
      state.registry.set(key, [copy(submission.record)]);
      state.artifactInventory.set(key, { active: 0, downstreamKnowledge: 0 });
    }
    const after = counts(state);
    const byCode: Partial<Record<ConflictCode, number>> = {};
    for (const code of codes) byCode[code] = 1;
    const quarantine: QuarantineDecision[] = codes.map((code) => ({
      id: `sir02-oe13-hold-${hash([key, code, correlationId]).slice(0, 16)}`,
      tenantId: submission.callerTenant,
      canonicalSourceId: submission.record.sourceId,
      sourceVersion: submission.record.version,
      conflictType: code,
      conflictingRecordReferences: submission.callerTenant === OE13_TENANT_B ? [] : refPairs(existing[0]?.immutableRefs ?? [], submission.record.immutableRefs),
      exactConflictCount: 1,
      artifactCountBefore: copy(before),
      artifactCountAfter: copy(after),
      lifecycleState: 'Blocked / Quarantined / Non-Operational',
      humanDecisionRequired: true,
      correlationId,
      callerVisible: { decision: 'Blocked / Fail Closed', reason: 'KNOWLEDGE_SOURCE_DENIED', correlationId }
    }));
    state.quarantine.push(...quarantine);
    const processingCalls = state.spies.snapshot();
    if (Object.values(processingCalls).some((count) => count !== 0))
      throw new Error('DOWNSTREAM_PROCESSING_CALL');
    if (codes.length > 0 && (after.authoritativeRecords !== before.authoritativeRecords || after.active !== before.active || after.downstreamKnowledge !== before.downstreamKnowledge))
      throw new Error('CONFLICT_MUTATED_AUTHORITATIVE_STATE');
    if (identical && (registryHashBefore !== hash(orderedRegistry(state.registry)) || inventoryHashBefore !== hash(orderedInventory(state.artifactInventory))))
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
      reasonCodes: codes.length > 0 ? codes : identical ? ['EXACT_DUPLICATE_NO_OP'] : ['DISTINCT_SCOPED_IDENTITY'],
      conflictCounts: byCode,
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
        if (classify(state, submission).length !== 0 || hash(state.registry.get(key)?.[0]) !== hash(submission.record))
          throw new Error('EXACT_REPEAT_NOT_SUPPRESSED');
        const registryHash = hash(orderedRegistry(state.registry));
        const inventoryHash = hash(orderedInventory(state.artifactInventory));
        if (registryHash !== registryHashBefore || inventoryHash !== inventoryHashBefore)
          throw new Error('EXACT_REPEAT_MUTATED_STATE');
        state.auditEvents.push({ ...audit, requestId: `${correlationId}-repeat-${repeat}` });
        repeatObservations.push({ classification: 'EXACT_DUPLICATE_NO_OP', registryHash, inventoryHash });
      }
    }
    result = {
      decision,
      classification: codes.length > 0 ? 'CONFLICT' : identical ? 'EXACT_DUPLICATE_NO_OP' : 'DISTINCT_SCOPED_IDENTITY',
      conflictCodes: codes,
      conflictCounts: byCode,
      totalConflicts: codes.length,
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
    try { cleanup(state); } catch (error) { cleanupError = error; }
  }
  if (cleanupError !== null) throw new FixtureExecutionFailure(primaryError, cleanupError);
  if (primaryError !== null) throw primaryError;
  if (!result) throw new Error('OE13_RESULT_MISSING');
  return { ...result, cleanup: 'Passed' };
}
