import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, relative, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  FixtureExecutionFailure,
  OE13_NAMESPACE,
  OE13_SCHEMA,
  OE13_TENANT_A,
  OE13_TENANT_B,
  authorizeSyntheticDistinct,
  baselineRecord,
  createFixture,
  executeSubmission,
  loadOe13Inputs,
  makeSubmission,
  scopedKey,
  type ConflictCode,
  type FixtureState,
  type QuarantineDecision,
  type SourceRecord,
  type Submission
} from '../testing/sir02-km-oe13-duplicate-conflict-fixture.js';
import {
  BlockedLiveOperation,
  LIVE_OPERATION_CATEGORIES,
  LiveOperationObserver,
  observeScenario,
  verifyGuardedEntryPointProbes,
  verifySyntheticBlockedProbes,
  type LiveOperationCounters,
  type ScenarioObservationSnapshot
} from '../testing/sir02-km-oe13-live-operation-observer.js';

type Inputs = ReturnType<typeof loadOe13Inputs>;
type Mutate = (state: FixtureState, submission: Submission) => void;
type ObservedSubmission = ReturnType<typeof executeSubmission> & {
  observerSnapshot: ScenarioObservationSnapshot;
};
let inputs: Inputs;
const caseCaptures: Array<{
  scenarioId: string;
  scenarioCategory: string | null;
  subcaseId: number;
  compositeIdentity: string;
  hashAlgorithm: 'SHA-256';
  authoritativeRegistrySha256: string;
  observedRegistrySha256: string;
  authoritativeArtifactInventorySha256: string;
  observedArtifactInventorySha256: string;
  conflictPairs: ReturnType<typeof executeSubmission>['conflictPairs'];
  perTypeUniquePairCounts: ReturnType<typeof executeSubmission>['conflictCounts'];
  totalUniquePairCount: number;
  inputImmutableReferences: Submission['record']['immutableRefs'];
  quarantine: Array<{
    id: string;
    conflictType: ConflictCode;
    humanDecisionRequired: true;
    humanDecisionHoldReference: string;
  }>;
  protectedFieldsDisclosed: number;
  downstreamCalls: ReturnType<typeof executeSubmission>['processingCalls'];
  liveOperationCounters: LiveOperationCounters;
  observerSnapshot: ScenarioObservationSnapshot;
  cleanup: 'Passed';
}> = [];
const scenarioSequence = new Map<string, number>();
let categoryProbeCoverage: Record<string, boolean> | null = null;
let entryPointProbeCoverage: Record<string, boolean> | null = null;
const categoryMatchers: Array<[string, string]> = [
  ['C01', 'loads the accepted immutable baseline'],
  ['C02', 'duplicate source registration with divergent identity'],
  ['C03', 'same version with divergent content/checksum'],
  ['C04', 'conflicting approval record'],
  ['C05', 'conflicting provenance record'],
  ['C06', 'conflicting lineage predecessor'],
  ['C07', 'conflicting supersession record'],
  ['C08', 'conflicting stale/quarantine record'],
  ['C09', 'conflicting immutable commit/reference'],
  ['C10', 'conflicting artifact path/reference'],
  ['C11', 'wrong-tenant submission'],
  ['C12', 'cross-tenant injected duplicate/conflict'],
  ['C13', 'owner substitution/conflict'],
  ['C14', 'checksum/content-identity conflict'],
  ['C15', 'chronology conflict and no newest-record precedence'],
  ['C16', 'ambiguous authoritative state'],
  ['C17', 'classifies an unapproved unregistered version'],
  ['C18', 'rejects wildcard'],
  ['C19', 'keeps the same version in a different synthetic tenant'],
  ['C20', 'holds a duplicate or conflicting quarantine decision']
];

function executeObserved(
  state: FixtureState,
  submission: Submission,
  configureScope?: (observer: LiveOperationObserver) => void
): ObservedSubmission {
  const scenarioId = expect.getState().currentTestName;
  if (!scenarioId) throw new Error('OE13_SCENARIO_ID_MISSING');
  const { result, liveOperationCounters, observation, observerCleanup } = observeScenario(
    scenarioId,
    (observer) => {
      configureScope?.(observer);
      return executeSubmission(state, submission, observer, scenarioId);
    }
  );
  expect(observation.scenarioId).toBe(scenarioId);
  expect(observation.phase).toBe('Before Fixture Cleanup');
  expect(observation.initialCounters).toEqual(
    Object.fromEntries(Object.keys(liveOperationCounters).map((key) => [key, 0]))
  );
  expect(observation.counters).toEqual(liveOperationCounters);
  expect(observation.environmentUnchanged).toBe(true);
  const observedResult: ObservedSubmission = { ...result, observerSnapshot: observation };
  const subcaseId = (scenarioSequence.get(scenarioId) ?? 0) + 1;
  scenarioSequence.set(scenarioId, subcaseId);
  const pairs = result.conflictPairs;
  expect(new Set(pairs.map((pair) => pair.pairId)).size).toBe(result.totalConflicts);
  for (const pair of pairs) {
    expect(pair.leftReferenceId.length).toBeGreaterThan(0);
    expect(pair.rightReferenceId.length).toBeGreaterThan(0);
    expect(pair.leftReferenceId <= pair.rightReferenceId).toBe(true);
    expect(pair.pairId).toBe(
      createHash('sha256')
        .update(
          JSON.stringify([
            scopedKey(submission.record),
            pair.leftReferenceId,
            pair.rightReferenceId
          ])
        )
        .digest('hex')
    );
  }
  for (const hold of result.quarantine)
    expect(
      pairs.filter((pair) => pair.conflictType === hold.conflictType).map((pair) => pair.pairId)
    ).toEqual(hold.affectedPairIds);
  for (const code of result.conflictCodes) {
    const count = result.conflictCounts[code];
    if (count === undefined) throw new Error(`OE13_CAPTURE_CONFLICT_COUNT_MISSING:${code}`);
    expect(pairs.filter((pair) => pair.conflictType === code)).toHaveLength(count);
  }
  for (const value of [
    result.registryHashBefore,
    result.registryHashAfter,
    result.inventoryHashBefore,
    result.inventoryHashAfter
  ])
    expect(value).toMatch(/^[a-f0-9]{64}$/u);
  expect(Object.values(liveOperationCounters).every((count) => count === 0)).toBe(true);
  caseCaptures.push({
    scenarioId,
    scenarioCategory:
      categoryMatchers.find(([category, title]) =>
        scenarioId.includes(category === 'C19' ? title : title.slice(0, 24))
      )?.[0] ?? null,
    subcaseId,
    compositeIdentity: `${submission.record.tenantId}|${submission.record.sourceId}|${submission.record.version}`,
    hashAlgorithm: 'SHA-256',
    authoritativeRegistrySha256: result.registryHashBefore,
    observedRegistrySha256: result.registryHashAfter,
    authoritativeArtifactInventorySha256: result.inventoryHashBefore,
    observedArtifactInventorySha256: result.inventoryHashAfter,
    conflictPairs: structuredClone(pairs),
    perTypeUniquePairCounts: structuredClone(result.conflictCounts),
    totalUniquePairCount: result.totalConflicts,
    inputImmutableReferences: structuredClone(submission.record.immutableRefs),
    quarantine: result.quarantine.map((hold) => ({
      id: hold.id,
      conflictType: hold.conflictType,
      humanDecisionRequired: hold.humanDecisionRequired,
      humanDecisionHoldReference: hold.id
    })),
    protectedFieldsDisclosed: result.protectedFieldsDisclosed,
    downstreamCalls: structuredClone(result.processingCalls),
    liveOperationCounters,
    observerSnapshot: structuredClone(observation),
    cleanup: observerCleanup
  });
  return observedResult;
}

beforeAll(() => {
  inputs = loadOe13Inputs();
});

afterAll(() => {
  if (!categoryProbeCoverage || !entryPointProbeCoverage)
    throw new Error('OE13_OBSERVER_PROBE_COVERAGE_MISSING');
  const observedCategories = new Set(caseCaptures.map((entry) => entry.scenarioCategory));
  for (const [category] of categoryMatchers)
    if (!observedCategories.has(category))
      throw new Error(`OE13_CAPTURE_CATEGORY_MISSING:${category}`);
  const output = process.env.SIR02_OE13_SUPPLEMENTAL_REPORT_PATH;
  if (!output) return;
  const absolute = resolve(output);
  const underTemp = relative(tmpdir(), absolute);
  if (!isAbsolute(output) || underTemp.startsWith('..') || isAbsolute(underTemp))
    throw new Error('OE13_SUPPLEMENTAL_REPORT_PATH_MUST_BE_TEMP');
  writeFileSync(
    absolute,
    `${JSON.stringify({
      document: 'OE-13 test-only supplemental measurement report',
      status: 'Pending bounded runner exit and independent review',
      originalFormalRun: 'SIR02-KM-OE-13-V1_0-20260926T131738Z-0001',
      supplementalCaptureTimestampUtc: new Date().toISOString(),
      namespace: OE13_NAMESPACE,
      schema: OE13_SCHEMA,
      testDataClassification: 'Synthetic',
      measurementBoundary:
        'Bracketed synchronous OE-13 scenario invocation in isolated test worker',
      observerCoverage: {
        categoryProbes: categoryProbeCoverage,
        guardedEntryPointProbes: entryPointProbeCoverage
      },
      cases: caseCaptures
    })}\n`,
    { encoding: 'utf8', flag: 'wx' }
  );
});

const zeroCalls = {
  parsingChunking: 0,
  embedding: 0,
  indexing: 0,
  vectorStorage: 0,
  retrievalPreparation: 0,
  otherKnowledgeProcessing: 0
};

function expectClean(state: FixtureState): void {
  expect(state.disposed).toBe(true);
  expect(state.registry.size).toBe(0);
  expect(state.artifactInventory.size).toBe(0);
  expect(state.syntheticScopedAuthority.size).toBe(0);
  expect(state.preexistingQuarantineDecisions.size).toBe(0);
  expect(state.quarantine).toEqual([]);
  expect(state.auditEvents).toEqual([]);
  expect(state.request).toBeNull();
  expect(state.beforeClassify).toBeUndefined();
  expect(state.spies.snapshot()).toEqual(zeroCalls);
}

function firstRef(submission: Submission): Submission['record']['immutableRefs'][number] {
  const reference = submission.record.immutableRefs[0];
  if (!reference) throw new Error('TEST_IMMUTABLE_REFERENCE_MISSING');
  return reference;
}

function distinct(state: FixtureState, tenantId: string, sourceId: string): Submission {
  const submission = makeSubmission(state);
  const record = submission.record;
  submission.callerTenant = tenantId;
  record.tenantId = tenantId;
  record.sourceId = sourceId;
  record.registrationId = `sir02-test-registration-${tenantId}-${sourceId}`;
  record.ownerId = `sir02-test-owner-${tenantId}`;
  record.provenanceRef = `synthetic://${tenantId}/${sourceId}/v1.0`;
  record.lineageRoot = `sir02-test-root-${tenantId}-${sourceId}`;
  record.approvalState = 'unapproved';
  record.approvalRef = null;
  record.approvalAt = null;
  record.supersessionState = 'none';
  record.supersessionRef = null;
  record.supersessionAt = null;
  record.quarantineState = 'none';
  record.quarantineRef = null;
  record.quarantineAt = null;
  record.active = false;
  record.immutableRefs = [];
  authorizeSyntheticDistinct(state, record);
  return submission;
}

function unauthorizedTenantBRequest(
  state: FixtureState,
  registrationId: string,
  sourceId: string,
  version = 'v1.0'
): Submission {
  const submission = makeSubmission(state);
  submission.callerTenant = OE13_TENANT_B;
  submission.record.tenantId = OE13_TENANT_B;
  submission.record.registrationId = registrationId;
  submission.record.sourceId = sourceId;
  submission.record.version = version;
  submission.record.ownerId = `sir02-test-owner-${OE13_TENANT_B}`;
  submission.record.provenanceRef = `synthetic://${OE13_TENANT_B}/${sourceId}/${version}`;
  submission.record.lineageRoot = `sir02-test-root-${OE13_TENANT_B}-${sourceId}`;
  submission.record.approvalState = 'unapproved';
  submission.record.approvalRef = null;
  submission.record.approvalAt = null;
  submission.record.active = false;
  submission.record.immutableRefs = [];
  return submission;
}

function conflictHold(
  result: ReturnType<typeof executeSubmission>,
  code: ConflictCode
): QuarantineDecision {
  const hold = result.quarantine.find((entry) => entry.conflictType === code);
  if (!hold) throw new Error(`TEST_CONFLICT_HOLD_MISSING:${code}`);
  return hold;
}

function addSameKeyRecord(
  state: FixtureState,
  candidate: SourceRecord,
  mutate: (record: SourceRecord) => void
): void {
  const records = state.registry.get(scopedKey(candidate));
  if (!records) throw new Error('TEST_REGISTRY_RECORD_MISSING');
  const variant = structuredClone(records[0]);
  if (!variant) throw new Error('TEST_REGISTRY_RECORD_MISSING');
  mutate(variant);
  records.push(variant);
}

function expectConflict(state: FixtureState, submission: Submission, code: ConflictCode): void {
  const result = executeObserved(state, submission);
  expect(result.decision).toBe('Conflict / Quarantined / Fail Closed');
  expect(result.classification).toBe('CONFLICT');
  expect(result.conflictCodes).toContain(code);
  expect(result.conflictCodes).toEqual([...result.conflictCodes].sort());
  expect(result.totalConflicts).toBe(
    new Set(result.quarantine.flatMap((hold) => hold.affectedPairIds)).size
  );
  expect(result.quarantine).toHaveLength(result.conflictCodes.length);
  for (const hold of result.quarantine) {
    expect(hold.conflictType).toBeTypeOf('string');
    expect(hold.exactConflictCount).toBe(result.conflictCounts[hold.conflictType]);
    expect(hold.affectedPairIds).toHaveLength(hold.exactConflictCount);
    expect(new Set(hold.affectedPairIds).size).toBe(hold.exactConflictCount);
    expect(hold.humanDecisionRequired).toBe(true);
    expect(hold.lifecycleState).toBe('Blocked / Quarantined / Non-Operational');
    expect(hold.artifactCountBefore).toEqual(result.artifactCountBefore);
    expect(hold.artifactCountAfter).toEqual(result.artifactCountAfter);
    expect(hold.callerVisible).toEqual({
      decision: 'Blocked / Fail Closed',
      reason: 'KNOWLEDGE_SOURCE_DENIED',
      correlationId: result.callerVisible.correlationId
    });
  }
  expect(result.artifactCountAfter).toEqual(result.artifactCountBefore);
  expect(result.registryHashAfter).toBe(result.registryHashBefore);
  expect(result.inventoryHashAfter).toBe(result.inventoryHashBefore);
  expect(result.processingCalls).toEqual(zeroCalls);
  expect(result.artifactCountAfter.active).toBe(0);
  expect(result.artifactCountAfter.downstreamKnowledge).toBe(0);
  expect(result.protectedFieldsDisclosed).toBe(0);
  expect(result.callerVisible).toEqual({
    decision: 'Blocked / Fail Closed',
    reason: 'KNOWLEDGE_SOURCE_DENIED',
    correlationId: result.callerVisible.correlationId
  });
  expect(result.audit.reasonCodes).toEqual(result.conflictCodes);
  expect(result.audit.conflictCounts).toEqual(result.conflictCounts);
  expect(result.audit.processingCalls).toEqual(zeroCalls);
  expect(result.audit.protectedFieldsDisclosed).toBe(0);
  expect(result.audit.quarantineIds).toEqual(result.quarantine.map((entry) => entry.id));
  if (submission.callerTenant === OE13_TENANT_B) {
    expect(result.audit.immutableReferenceIds).toEqual([]);
    expect(result.audit.candidateRecordHash).toBeNull();
  } else {
    expect(result.audit.immutableReferenceIds).toHaveLength(7);
    expect(result.audit.candidateRecordHash).toMatch(/^[a-f0-9]{64}$/u);
    const candidateHash = result.audit.candidateRecordHash;
    if (!candidateHash) throw new Error('TEST_CANDIDATE_HASH_MISSING');
    for (const hold of result.quarantine)
      expect(hold.conflictingRecordReferences).toContain(
        `candidate-record-sha256:${candidateHash}`
      );
  }
  expect(result.audit.eventTimestamp).toMatch(/Z$/u);
  expect(result.cleanup).toBe('Passed');
  expect(result.namespace).toBe(OE13_NAMESPACE);
  expect(result.schema).toBe(OE13_SCHEMA);
  expect(result.classificationOfData).toBe('Synthetic');
  expectClean(state);
}

describe('SIR02-KM-OE-13 authorized test-only duplicate/conflict fixture', () => {
  it('proves every live-operation counter using synthetic blocked probes', () => {
    const verified = verifySyntheticBlockedProbes();
    expect(Object.keys(verified).sort()).toEqual([...LIVE_OPERATION_CATEGORIES].sort());
    expect(Object.values(verified).every(Boolean)).toBe(true);
    categoryProbeCoverage = verified;
  });

  it('blocks guarded network, filesystem, process, and environment entry points', () => {
    const verified = verifyGuardedEntryPointProbes();
    expect(Object.keys(verified).sort()).toEqual([
      'child-process',
      'fetch',
      'filesystem-write',
      'http',
      'net',
      'process-environment'
    ]);
    expect(Object.values(verified).every(Boolean)).toBe(true);
    entryPointProbeCoverage = verified;
  });

  it('cleans observer state after normal and exceptional scoped execution', () => {
    const firstState = createFixture(inputs);
    const first = executeObserved(firstState, makeSubmission(firstState));
    expect(first.observerSnapshot.phase).toBe('Before Fixture Cleanup');
    expect(Object.values(first.observerSnapshot.counters).every((count) => count === 0)).toBe(true);
    expectClean(firstState);
    const failedState = createFixture(inputs);
    failedState.beforeClassify = () => {
      throw new Error('SYNTHETIC_OBSERVER_ERROR');
    };
    expect(() => executeObserved(failedState, makeSubmission(failedState))).toThrow(
      'SYNTHETIC_OBSERVER_ERROR'
    );
    expectClean(failedState);
    const secondState = createFixture(inputs);
    const second = executeObserved(secondState, makeSubmission(secondState));
    expect(
      Object.values(second.observerSnapshot.initialCounters).every((count) => count === 0)
    ).toBe(true);
    expect(Object.values(second.observerSnapshot.counters).every((count) => count === 0)).toBe(
      true
    );
    expectClean(secondState);
  });

  it('blocks a known fixture processing attempt inside the measured scenario', () => {
    const state = createFixture(inputs);
    state.beforeClassify = () => {
      state.spies.ports.embedding();
    };
    let blocked: BlockedLiveOperation | undefined;
    try {
      executeObserved(state, makeSubmission(state));
    } catch (error) {
      if (error instanceof BlockedLiveOperation) blocked = error;
      else throw error;
    }
    expect(blocked?.category).toBe('liveEmbedding');
    expect(blocked?.observation?.phase).toBe('Before Fixture Cleanup');
    expect(blocked?.observation?.counters.liveEmbedding).toBe(1);
    expect(blocked?.observation?.blockedAudit).toEqual([
      { reason: 'PROHIBITED_OPERATION_BLOCKED', category: 'liveEmbedding' }
    ]);
    expectClean(state);
  });

  it('blocks unknown fixture processing and resets counters before the next scenario', () => {
    const state = createFixture(inputs);
    state.beforeClassify = () => {
      state.spies.ports.otherKnowledgeProcessing();
    };
    let blocked: BlockedLiveOperation | undefined;
    try {
      executeObserved(state, makeSubmission(state));
    } catch (error) {
      if (error instanceof BlockedLiveOperation) blocked = error;
      else throw error;
    }
    expect(blocked?.category).toBe('unknownProhibitedActions');
    expect(blocked?.observation?.counters.unknownProhibitedActions).toBe(1);
    expect(blocked?.observation?.blockedAudit).toEqual([
      { reason: 'PROHIBITED_OPERATION_BLOCKED', category: 'unknownProhibitedActions' }
    ]);
    expectClean(state);
    const nextState = createFixture(inputs);
    const next = executeObserved(nextState, makeSubmission(nextState));
    expect(Object.values(next.observerSnapshot.initialCounters).every((count) => count === 0)).toBe(
      true
    );
    expect(Object.values(next.observerSnapshot.counters).every((count) => count === 0)).toBe(true);
    expectClean(nextState);
  });

  it('measures all known categories inside the real scenario path and blocks side effects', () => {
    for (const category of LIVE_OPERATION_CATEGORIES) {
      const state = createFixture(inputs);
      let sideEffectReached = false;
      let blocked: BlockedLiveOperation | undefined;
      try {
        executeObserved(state, makeSubmission(state), (observer) => {
          state.beforeClassify = () => {
            observer.attemptOperation(category);
            sideEffectReached = true;
          };
        });
      } catch (error) {
        if (error instanceof BlockedLiveOperation) blocked = error;
        else throw error;
      }
      expect(blocked?.category).toBe(category);
      expect(blocked?.observation?.counters[category]).toBe(1);
      expect(
        Object.values(blocked?.observation?.counters ?? {}).reduce((sum, count) => sum + count, 0)
      ).toBe(1);
      expect(blocked?.observation?.blockedAudit).toEqual([
        { reason: 'PROHIBITED_OPERATION_BLOCKED', category }
      ]);
      expect(sideEffectReached).toBe(false);
      expectClean(state);
    }
  });

  it('intercepts an unmapped prohibited operation inside the real scenario path', () => {
    const state = createFixture(inputs);
    let sideEffectReached = false;
    let blocked: BlockedLiveOperation | undefined;
    try {
      executeObserved(state, makeSubmission(state), (observer) => {
        state.beforeClassify = () => {
          observer.attemptOperation('sir02-synthetic-unrecognized-action');
          sideEffectReached = true;
        };
      });
    } catch (error) {
      if (error instanceof BlockedLiveOperation) blocked = error;
      else throw error;
    }
    expect(blocked?.category).toBe('unknownProhibitedActions');
    expect(blocked?.observation?.counters.unknownProhibitedActions).toBe(1);
    expect(
      Object.values(blocked?.observation?.counters ?? {}).reduce((sum, count) => sum + count, 0)
    ).toBe(1);
    expect(blocked?.observation?.blockedAudit).toEqual([
      { reason: 'PROHIBITED_OPERATION_BLOCKED', category: 'unknownProhibitedActions' }
    ]);
    expect(sideEffectReached).toBe(false);
    expectClean(state);
  });

  it('fails closed when the observer does not cover the real fixture invocation', () => {
    const state = createFixture(inputs);
    const unarmed = new LiveOperationObserver();
    expect(() =>
      executeSubmission(state, makeSubmission(state), unarmed, 'unarmed-scenario')
    ).toThrow('OE13_CLEANUP_FAILED');
    expectClean(state);
    expect(() => observeScenario('missing-fixture-capture', () => 'synthetic-only')).toThrow(
      'OE13_OBSERVER_COVERAGE_INCOMPLETE'
    );
  });

  it('loads the accepted immutable baseline and suppresses repeated exact registration/version submissions', () => {
    const state = createFixture(inputs);
    const original = baselineRecord(state);
    const submission = makeSubmission(state);
    submission.repeatCount = 2;
    const result = executeObserved(state, submission);
    expect(result.decision).toBe('Exact Duplicate / No Op');
    expect(result.classification).toBe('EXACT_DUPLICATE_NO_OP');
    expect(result.conflictCodes).toEqual([]);
    expect(result.quarantine).toEqual([]);
    expect(result.artifactCountAfter).toEqual(result.artifactCountBefore);
    expect(result.registryHashAfter).toBe(result.registryHashBefore);
    expect(result.inventoryHashAfter).toBe(result.inventoryHashBefore);
    expect(result.processingCalls).toEqual(zeroCalls);
    expect(result.repeatObservations).toHaveLength(2);
    expect(result.auditTrail).toHaveLength(3);
    expect(result.auditTrail.map((event) => event.reasonCodes)).toEqual([
      ['EXACT_DUPLICATE_NO_OP'],
      ['EXACT_DUPLICATE_NO_OP'],
      ['EXACT_DUPLICATE_NO_OP']
    ]);
    expect(result.audit.immutableReferenceIds).toHaveLength(7);
    expect(result.audit.candidateRecordHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(original.immutableRefs).toHaveLength(7);
    expect(result.artifactCountAfter.active).toBe(0);
    expect(result.artifactCountAfter.downstreamKnowledge).toBe(0);
    expectClean(state);
  });

  it('classifies an exact source/version repeat as a no-op in an independent case', () => {
    const state = createFixture(inputs);
    const result = executeObserved(state, makeSubmission(state));
    expect(result.classification).toBe('EXACT_DUPLICATE_NO_OP');
    expect(result.artifactCountAfter.authoritativeRecords).toBe(
      result.artifactCountBefore.authoritativeRecords
    );
    expect(result.quarantine).toEqual([]);
    expectClean(state);
  });

  const conflicts: Array<{ category: string; code: ConflictCode; mutate: Mutate }> = [
    {
      category: 'duplicate source registration with divergent identity',
      code: 'REGISTRATION_ID_CONFLICT',
      mutate: (_state, submission) => {
        submission.record.registrationId = 'sir02-test-divergent-registration';
      }
    },
    {
      category: 'same version with divergent content/checksum',
      code: 'CONTENT_IDENTITY_CONFLICT',
      mutate: (_state, submission) => {
        submission.record.checksum = 'f'.repeat(64);
        submission.record.contentIdentity = 'f'.repeat(64);
      }
    },
    {
      category: 'conflicting approval record',
      code: 'APPROVAL_CONFLICT',
      mutate: (_state, submission) => {
        submission.record.approvalRef = 'e'.repeat(40);
      }
    },
    {
      category: 'conflicting provenance record',
      code: 'PROVENANCE_CONFLICT',
      mutate: (_state, submission) => {
        submission.record.provenanceRef = 'synthetic://conflicting-origin';
      }
    },
    {
      category: 'conflicting lineage predecessor',
      code: 'LINEAGE_CONFLICT',
      mutate: (_state, submission) => {
        submission.record.predecessor = 'v0.9';
      }
    },
    {
      category: 'conflicting supersession record',
      code: 'SUPERSESSION_CONFLICT',
      mutate: (_state, submission) => {
        submission.record.supersessionRef = 'sir02-test-conflicting-supersession';
      }
    },
    {
      category: 'conflicting stale/quarantine record',
      code: 'STALE_QUARANTINE_CONFLICT',
      mutate: (_state, submission) => {
        submission.record.quarantineRef = 'sir02-test-conflicting-quarantine';
      }
    },
    {
      category: 'conflicting immutable commit/reference',
      code: 'IMMUTABLE_COMMIT_CONFLICT',
      mutate: (_state, submission) => {
        firstRef(submission).commit = 'f'.repeat(40);
      }
    },
    {
      category: 'conflicting artifact path/reference',
      code: 'ARTIFACT_REFERENCE_CONFLICT',
      mutate: (_state, submission) => {
        firstRef(submission).path = 'docs/invalid-artifact.json';
      }
    },
    {
      category: 'wrong-tenant submission',
      code: 'TENANT_BINDING_CONFLICT',
      mutate: (_state, submission) => {
        submission.callerTenant = OE13_TENANT_B;
      }
    },
    {
      category: 'cross-tenant injected duplicate/conflict',
      code: 'CROSS_TENANT_INJECTION',
      mutate: (_state, submission) => {
        submission.callerTenant = OE13_TENANT_B;
        submission.record.tenantId = OE13_TENANT_B;
        submission.record.approvalState = 'unapproved';
        submission.record.approvalRef = null;
        submission.record.approvalAt = null;
      }
    },
    {
      category: 'owner substitution/conflict',
      code: 'OWNER_CONFLICT',
      mutate: (_state, submission) => {
        submission.record.ownerId = 'sir02-test-substitute-owner';
      }
    },
    {
      category: 'checksum/content-identity conflict',
      code: 'CONTENT_IDENTITY_CONFLICT',
      mutate: (_state, submission) => {
        submission.record.contentIdentity = 'e'.repeat(64);
      }
    },
    {
      category: 'chronology conflict and no newest-record precedence',
      code: 'CHRONOLOGY_CONFLICT',
      mutate: (_state, submission) => {
        submission.record.eventTimestamp = '2026-09-27T00:00:00Z';
      }
    },
    {
      category: 'ambiguous authoritative state',
      code: 'AMBIGUOUS_AUTHORITATIVE_STATE',
      mutate: (state, submission) => {
        const records = state.registry.get(scopedKey(submission.record));
        if (!records) throw new Error('TEST_REGISTRY_RECORD_MISSING');
        records.push(structuredClone(submission.record));
      }
    }
  ];

  it.each(conflicts)(
    '$category fails closed with typed quarantine and zero processing',
    ({ code, mutate }) => {
      const state = createFixture(inputs);
      const submission = makeSubmission(state);
      mutate(state, submission);
      expectConflict(state, submission, code);
    }
  );

  it('classifies an unapproved unregistered version without inheriting root approval', () => {
    const state = createFixture(inputs);
    const submission = makeSubmission(state);
    submission.record.version = 'v2.0';
    submission.record.approvalState = 'unapproved';
    submission.record.approvalRef = null;
    submission.record.approvalAt = null;
    expectConflict(state, submission, 'SOURCE_VERSION_CONFLICT');
  });

  it('does not infer successor approval from a caller claim or the approved predecessor', () => {
    const state = createFixture(inputs);
    const submission = makeSubmission(state, 'v1.1');
    submission.claimedApproval = 'Approved';
    expect(submission.record.approvalState).toBe('unapproved');
    expect(submission.record.approvalRef).toBeNull();
    const result = executeObserved(state, submission);
    expect(result.classification).toBe('EXACT_DUPLICATE_NO_OP');
    expect(result.artifactCountAfter.active).toBe(0);
    expect(result.artifactCountAfter.downstreamKnowledge).toBe(0);
    expect(result.processingCalls).toEqual(zeroCalls);
    expectClean(state);
  });

  it.each([
    [
      'source',
      (submission: Submission) => {
        submission.record.sourceId = '*';
      }
    ],
    [
      'version',
      (submission: Submission) => {
        submission.record.version = '*';
      }
    ],
    [
      'tenant',
      (submission: Submission) => {
        submission.record.tenantId = '*';
      }
    ],
    [
      'owner',
      (submission: Submission) => {
        submission.record.ownerId = '*';
      }
    ]
  ] as const)('rejects wildcard %s identifiers', (_field, mutate) => {
    const state = createFixture(inputs);
    const submission = makeSubmission(state);
    mutate(submission);
    expectConflict(state, submission, 'WILDCARD_IDENTIFIER');
  });

  it('keeps the same version in a different synthetic tenant as a distinct non-active identity', () => {
    const state = createFixture(inputs);
    const submission = distinct(state, OE13_TENANT_B, makeSubmission(state).record.sourceId);
    expect(scopedKey(submission.record)).not.toBe(scopedKey(baselineRecord(state)));
    const result = executeObserved(state, submission);
    expect(result.classification).toBe('DISTINCT_SCOPED_IDENTITY');
    expect(result.conflictCodes).toEqual([]);
    expect(result.artifactCountAfter.authoritativeRecords).toBe(
      result.artifactCountBefore.authoritativeRecords + 1
    );
    expect(result.artifactCountAfter.active).toBe(0);
    expect(result.artifactCountAfter.downstreamKnowledge).toBe(0);
    expect(result.processingCalls).toEqual(zeroCalls);
    expect(result.protectedFieldsDisclosed).toBe(0);
    expectClean(state);
  });

  it('keeps the same version in a different canonical source as a distinct non-active identity', () => {
    const state = createFixture(inputs);
    const submission = distinct(state, OE13_TENANT_A, 'sir02-test-distinct-source');
    expect(scopedKey(submission.record)).not.toBe(scopedKey(baselineRecord(state)));
    const result = executeObserved(state, submission);
    expect(result.classification).toBe('DISTINCT_SCOPED_IDENTITY');
    expect(result.conflictCodes).toEqual([]);
    expect(result.artifactCountAfter.authoritativeRecords).toBe(
      result.artifactCountBefore.authoritativeRecords + 1
    );
    expect(result.artifactCountAfter.active).toBe(0);
    expect(result.artifactCountAfter.downstreamKnowledge).toBe(0);
    expectClean(state);
  });

  it('holds a duplicate or conflicting quarantine decision for separate human resolution', () => {
    const state = createFixture(inputs);
    const submission = makeSubmission(state);
    const prior: QuarantineDecision = {
      id: 'sir02-test-prior-hold',
      tenantId: submission.record.tenantId,
      canonicalSourceId: submission.record.sourceId,
      sourceVersion: submission.record.version,
      conflictType: 'APPROVAL_CONFLICT',
      conflictingRecordReferences: [],
      affectedPairIds: ['sir02-test-prior-pair'],
      exactConflictCount: 1,
      artifactCountBefore: { authoritativeRecords: 2, active: 0, downstreamKnowledge: 0 },
      artifactCountAfter: { authoritativeRecords: 2, active: 0, downstreamKnowledge: 0 },
      lifecycleState: 'Blocked / Quarantined / Non-Operational',
      humanDecisionRequired: true,
      correlationId: 'sir02-test-prior-correlation',
      callerVisible: {
        decision: 'Blocked / Fail Closed',
        reason: 'KNOWLEDGE_SOURCE_DENIED',
        correlationId: 'sir02-test-prior-correlation'
      }
    };
    state.preexistingQuarantineDecisions.set(scopedKey(submission.record), [prior]);
    expectConflict(state, submission, 'QUARANTINE_DECISION_CONFLICT');
  });

  it('does not expose Tenant A protected lifecycle values to a Tenant B caller', () => {
    const state = createFixture(inputs);
    const protectedRecord = baselineRecord(state);
    const submission = makeSubmission(state);
    submission.callerTenant = OE13_TENANT_B;
    const result = executeObserved(state, submission);
    const visible = JSON.stringify(result.callerVisible);
    for (const secret of [
      protectedRecord.registrationId,
      protectedRecord.sourceId,
      protectedRecord.ownerId,
      protectedRecord.version,
      protectedRecord.checksum,
      protectedRecord.provenanceRef
    ])
      expect(visible).not.toContain(secret);
    expect(result.protectedFieldsDisclosed).toBe(0);
    expect(result.audit.tenantScope).toBe(OE13_TENANT_B);
    expect(result.quarantine.every((hold) => hold.tenantId === OE13_TENANT_A)).toBe(true);
    expect(result.audit.processingCalls).toEqual(zeroCalls);
    expectClean(state);
  });

  it('gives Tenant B identical caller-visible denial for existing and unknown foreign registrations', () => {
    const existingState = createFixture(inputs);
    const foreignRegistration = baselineRecord(existingState).registrationId;
    const existing = executeObserved(
      existingState,
      unauthorizedTenantBRequest(existingState, foreignRegistration, 'sir02-test-unknown-source')
    );
    const unknownState = createFixture(inputs);
    const unknown = executeObserved(
      unknownState,
      unauthorizedTenantBRequest(
        unknownState,
        'sir02-test-registration-unknown',
        'sir02-test-unknown-source'
      )
    );
    expect(existing.decision).toBe('Conflict / Quarantined / Fail Closed');
    expect(unknown.decision).toBe(existing.decision);
    expect(existing.classification).toBe('CONFLICT');
    expect(unknown.classification).toBe(existing.classification);
    expect(unknown.callerVisible).toEqual(existing.callerVisible);
    expect(Object.keys(unknown.callerVisible)).toEqual(Object.keys(existing.callerVisible));
    expect(existing.protectedFieldsDisclosed).toBe(0);
    expect(unknown.protectedFieldsDisclosed).toBe(0);
    expect(existing.audit.reasonCodes).toContain('CROSS_TENANT_INJECTION');
    expect(unknown.audit.reasonCodes).not.toContain('CROSS_TENANT_INJECTION');
    expectClean(existingState);
    expectClean(unknownState);
  });

  it('gives Tenant B identical denial for foreign and unknown source/version references', () => {
    const foreignState = createFixture(inputs);
    const foreign = baselineRecord(foreignState);
    const attempted = executeObserved(
      foreignState,
      unauthorizedTenantBRequest(
        foreignState,
        'sir02-test-registration-unknown',
        foreign.sourceId,
        foreign.version
      )
    );
    const unknownState = createFixture(inputs);
    const unknown = executeObserved(
      unknownState,
      unauthorizedTenantBRequest(
        unknownState,
        'sir02-test-registration-unknown',
        'sir02-test-unknown-source',
        'v9.9'
      )
    );
    expect(attempted.decision).toBe('Conflict / Quarantined / Fail Closed');
    expect(unknown.decision).toBe(attempted.decision);
    expect(unknown.classification).toBe(attempted.classification);
    expect(unknown.callerVisible).toEqual(attempted.callerVisible);
    expect(attempted.protectedFieldsDisclosed).toBe(0);
    expect(unknown.protectedFieldsDisclosed).toBe(0);
    expectClean(foreignState);
    expectClean(unknownState);
  });

  it('keeps a direct Tenant B foreign-tenant claim indistinguishable from an unknown claim', () => {
    const existingState = createFixture(inputs);
    const existingClaim = makeSubmission(existingState);
    existingClaim.callerTenant = OE13_TENANT_B;
    const existing = executeObserved(existingState, existingClaim);
    const unknownState = createFixture(inputs);
    const unknownClaim = makeSubmission(unknownState);
    unknownClaim.callerTenant = OE13_TENANT_B;
    unknownClaim.record.registrationId = 'sir02-test-registration-unknown';
    unknownClaim.record.sourceId = 'sir02-test-unknown-source';
    unknownClaim.record.version = 'v9.9';
    const unknown = executeObserved(unknownState, unknownClaim);
    expect(existing.decision).toBe('Conflict / Quarantined / Fail Closed');
    expect(unknown.decision).toBe(existing.decision);
    expect(existing.classification).toBe('CONFLICT');
    expect(unknown.classification).toBe(existing.classification);
    expect(unknown.callerVisible).toEqual(existing.callerVisible);
    expect(existing.protectedFieldsDisclosed).toBe(0);
    expect(unknown.protectedFieldsDisclosed).toBe(0);
    expectClean(existingState);
    expectClean(unknownState);
  });

  it('counts one affected pair for a single conflict instance', () => {
    const state = createFixture(inputs);
    const submission = makeSubmission(state);
    submission.record.checksum = 'f'.repeat(64);
    submission.record.contentIdentity = 'f'.repeat(64);
    const result = executeObserved(state, submission);
    const hold = conflictHold(result, 'CONTENT_IDENTITY_CONFLICT');
    expect(result.conflictCounts.CONTENT_IDENTITY_CONFLICT).toBe(1);
    expect(hold.exactConflictCount).toBe(1);
    expect(hold.affectedPairIds).toHaveLength(1);
    expectClean(state);
  });

  it('counts distinct same-type pairs twice without counting repeated observations twice', () => {
    const state = createFixture(inputs);
    const submission = makeSubmission(state);
    submission.record.checksum = 'f'.repeat(64);
    submission.record.contentIdentity = 'f'.repeat(64);
    addSameKeyRecord(state, submission.record, (record) => {
      record.checksum = 'e'.repeat(64);
      record.contentIdentity = 'e'.repeat(64);
    });
    const result = executeObserved(state, submission);
    const hold = conflictHold(result, 'CONTENT_IDENTITY_CONFLICT');
    expect(result.conflictCounts.CONTENT_IDENTITY_CONFLICT).toBe(2);
    expect(hold.exactConflictCount).toBe(2);
    expect(hold.affectedPairIds).toHaveLength(2);
    expect(new Set(hold.affectedPairIds).size).toBe(2);
    expectClean(state);

    const repeatedState = createFixture(inputs);
    const repeated = makeSubmission(repeatedState);
    repeated.record.checksum = 'f'.repeat(64);
    repeated.record.contentIdentity = 'f'.repeat(64);
    addSameKeyRecord(repeatedState, repeated.record, () => {});
    const repeatedResult = executeObserved(repeatedState, repeated);
    expect(repeatedResult.conflictCounts.CONTENT_IDENTITY_CONFLICT).toBe(1);
    expect(conflictHold(repeatedResult, 'CONTENT_IDENTITY_CONFLICT').affectedPairIds).toHaveLength(
      1
    );
    expectClean(repeatedState);
  });

  it('counts distinct immutable-reference pairs without repeating pinned and registry observations', () => {
    const state = createFixture(inputs);
    const submission = makeSubmission(state);
    const first = submission.record.immutableRefs[0];
    const second = submission.record.immutableRefs[1];
    if (!first || !second) throw new Error('TEST_IMMUTABLE_REFERENCES_MISSING');
    first.commit = 'e'.repeat(40);
    second.commit = 'f'.repeat(40);
    const result = executeObserved(state, submission);
    const hold = conflictHold(result, 'IMMUTABLE_COMMIT_CONFLICT');
    expect(result.conflictCounts.IMMUTABLE_COMMIT_CONFLICT).toBe(2);
    expect(hold.exactConflictCount).toBe(2);
    expect(hold.affectedPairIds).toHaveLength(2);
    expect(new Set(hold.affectedPairIds).size).toBe(2);
    expectClean(state);
  });

  it('counts different typed pairs independently and preserves pair IDs across input order', () => {
    const build = (reverse: boolean): { state: FixtureState; submission: Submission } => {
      const state = createFixture(inputs);
      const submission = makeSubmission(state);
      const candidate = submission.record;
      const records = state.registry.get(scopedKey(candidate));
      if (!records) throw new Error('TEST_REGISTRY_RECORD_MISSING');
      const contentConflict = structuredClone(candidate);
      contentConflict.approvalRef = 'e'.repeat(40);
      const approvalConflict = structuredClone(candidate);
      approvalConflict.checksum = 'f'.repeat(64);
      approvalConflict.contentIdentity = 'f'.repeat(64);
      records.splice(
        0,
        records.length,
        ...(reverse ? [approvalConflict, contentConflict] : [contentConflict, approvalConflict])
      );
      return { state, submission };
    };
    const run = ({ state, submission }: { state: FixtureState; submission: Submission }) => {
      submission.record.checksum = 'f'.repeat(64);
      submission.record.contentIdentity = 'f'.repeat(64);
      submission.record.approvalRef = 'e'.repeat(40);
      return executeObserved(state, submission);
    };
    const firstState = build(false);
    const secondState = build(true);
    const first = run(firstState);
    const second = run(secondState);
    expect(first.conflictCounts.CONTENT_IDENTITY_CONFLICT).toBe(1);
    expect(first.conflictCounts.APPROVAL_CONFLICT).toBe(1);
    expect(first.totalConflicts).toBe(
      new Set(first.quarantine.flatMap((hold) => hold.affectedPairIds)).size
    );
    expect(first.totalConflicts).toBe(2);
    expect(conflictHold(first, 'CONTENT_IDENTITY_CONFLICT').affectedPairIds).toEqual(
      conflictHold(second, 'CONTENT_IDENTITY_CONFLICT').affectedPairIds
    );
    expect(conflictHold(first, 'APPROVAL_CONFLICT').affectedPairIds).toEqual(
      conflictHold(second, 'APPROVAL_CONFLICT').affectedPairIds
    );
    expect(first.conflictCounts).toEqual(second.conflictCounts);
    expect(first.totalConflicts).toBe(second.totalConflicts);
    expect(first.registryHashBefore).toBe(second.registryHashBefore);
    expect(first.registryHashAfter).toBe(second.registryHashAfter);
    expect(first.inventoryHashBefore).toBe(second.inventoryHashBefore);
    expect(first.inventoryHashAfter).toBe(second.inventoryHashAfter);
    expectClean(firstState.state);
    expectClean(secondState.state);
  });

  it('produces deterministic classified output for identical synthetic input', () => {
    const first = createFixture(inputs);
    const second = createFixture(inputs);
    const a = makeSubmission(first);
    const b = makeSubmission(second);
    a.record.checksum = 'd'.repeat(64);
    b.record.checksum = 'd'.repeat(64);
    expect(executeObserved(first, a)).toEqual(executeObserved(second, b));
    expectClean(first);
    expectClean(second);
  });

  it('cleans state after an unexpected adapter/classifier error without concealing it', () => {
    const state = createFixture(inputs);
    state.beforeClassify = () => {
      throw new Error('SYNTHETIC_UNEXPECTED_ERROR');
    };
    expect(() => executeObserved(state, makeSubmission(state))).toThrow(
      'SYNTHETIC_UNEXPECTED_ERROR'
    );
    expectClean(state);
  });

  it('cleans an early rejection and prevents Tenant A/B state or counters leaking between cases', () => {
    const first = createFixture(inputs);
    const rejected = makeSubmission(first);
    rejected.record.sourceId = '*';
    expectConflict(first, rejected, 'WILDCARD_IDENTIFIER');
    const second = createFixture(inputs);
    const tenantB = makeSubmission(second);
    tenantB.callerTenant = OE13_TENANT_B;
    expectConflict(second, tenantB, 'TENANT_BINDING_CONFLICT');
  });

  it('fails on downstream spy activity rather than reporting a passing conflict', () => {
    const state = createFixture(inputs);
    state.spies.ports.embedding();
    const submission = makeSubmission(state);
    submission.record.ownerId = 'sir02-test-invalid-owner';
    expect(() => executeObserved(state, submission)).toThrow('DOWNSTREAM_PROCESSING_CALL');
    expectClean(state);
  });

  it('reports cleanup failure independently while retaining the original failure', () => {
    const state = createFixture(inputs);
    state.beforeClassify = () => {
      throw new Error('PRIMARY_SYNTHETIC_FAILURE');
    };
    state.spies.reset = () => {
      throw new Error('CLEANUP_SYNTHETIC_FAILURE');
    };
    let thrown: unknown;
    try {
      executeObserved(state, makeSubmission(state));
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(FixtureExecutionFailure);
    const failure = thrown as FixtureExecutionFailure;
    expect((failure.primaryError as Error).message).toBe('PRIMARY_SYNTHETIC_FAILURE');
    expect((failure.cleanupError as AggregateError).errors[0]).toMatchObject({
      message: 'CLEANUP_SYNTHETIC_FAILURE'
    });
    expectClean(state);
  });
});
