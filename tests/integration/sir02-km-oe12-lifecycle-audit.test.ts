import { beforeAll, describe, expect, it } from 'vitest';
import type { CanonicalAuditEvent } from '../../packages/audit/src/index.js';
import {
  EVENT_FAMILIES,
  OE12_NAMESPACE,
  OE12_SCHEMA,
  OE12_TENANT_A,
  OE12_TENANT_B,
  PINNED_INPUTS,
  buildLifecycleEvents,
  callerVisibleDenial,
  canonicalSha256,
  createFixture,
  executeLifecycle,
  loadEvidenceBasis,
  reconstructLifecycle,
  type EvidenceBasis,
  type KmLifecycleAuditEvent
} from '../testing/sir02-km-oe12-lifecycle-audit-fixture.js';

let basis: EvidenceBasis;
let sourceEvents: KmLifecycleAuditEvent[];
let positive: Awaited<ReturnType<typeof executeLifecycle>>;
const expectedFamilies = [
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
const expectedEdges = [
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
] as const;

beforeAll(async () => {
  basis = loadEvidenceBasis();
  sourceEvents = buildLifecycleEvents(basis);
  positive = await executeLifecycle(sourceEvents, basis);
});

const at = (events: readonly CanonicalAuditEvent[], index: number): CanonicalAuditEvent => {
  const event = events[index];
  if (!event) throw new Error(`MISSING_TEST_EVENT:${String(index)}`);
  return event;
};
const replace = (
  events: readonly CanonicalAuditEvent[],
  index: number,
  edit: (event: CanonicalAuditEvent) => CanonicalAuditEvent
): CanonicalAuditEvent[] =>
  events.map((event, position) => (position === index ? edit(event) : event));
const patchEvidence = (
  events: readonly CanonicalAuditEvent[],
  index: number,
  patch: Record<string, unknown>
): CanonicalAuditEvent[] =>
  replace(events, index, (event) => ({ ...event, evidence: { ...event.evidence, ...patch } }));
const withoutEvidence = (
  events: readonly CanonicalAuditEvent[],
  index: number,
  field: string
): CanonicalAuditEvent[] =>
  replace(events, index, (event) => ({
    ...event,
    evidence: Object.fromEntries(Object.entries(event.evidence).filter(([key]) => key !== field))
  }));
const metadataAt = (
  events: readonly CanonicalAuditEvent[],
  index: number
): Readonly<Record<string, unknown>> => {
  const value = at(events, index).evidence.metadata;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('MISSING_TEST_METADATA');
  }
  return value as Readonly<Record<string, unknown>>;
};

const sourceAt = (
  events: readonly KmLifecycleAuditEvent[],
  index: number
): KmLifecycleAuditEvent => {
  const event = events[index];
  if (!event) throw new Error(`MISSING_TEST_SOURCE_EVENT:${String(index)}`);
  return event;
};
const replaceSource = (
  events: readonly KmLifecycleAuditEvent[],
  index: number,
  edit: (event: KmLifecycleAuditEvent) => KmLifecycleAuditEvent
): KmLifecycleAuditEvent[] =>
  events.map((event, position) => (position === index ? edit(event) : event));
const patchSource = (
  events: readonly KmLifecycleAuditEvent[],
  index: number,
  patch: Partial<KmLifecycleAuditEvent>
): KmLifecycleAuditEvent[] => replaceSource(events, index, (event) => ({ ...event, ...patch }));
const withoutSource = (
  events: readonly KmLifecycleAuditEvent[],
  index: number,
  field: string
): KmLifecycleAuditEvent[] =>
  replaceSource(
    events,
    index,
    (event) =>
      Object.fromEntries(
        Object.entries(event).filter(([key]) => key !== field)
      ) as unknown as KmLifecycleAuditEvent
  );

describe('OE-12 isolated lifecycle audit projection', () => {
  it('loads accepted immutable references and retains a complete canonical Phase 7 event set', () => {
    expect(PINNED_INPUTS).toHaveLength(12);
    expect(basis.refs.map((ref) => ref.id)).toEqual(PINNED_INPUTS.map((ref) => ref.id));
    expect(positive.primaryError).toBeUndefined();
    expect(positive.attempted).toBe(14);
    expect(positive.committed).toBe(14);
    expect(positive.exported).toBe(14);
    expect(positive.securityExported).toBe(3);
    expect(positive.metricsExported).toBe(14);
    expect(positive.healthCount).toBe(0);
    expect(positive.pipelineHealth).toBe('healthy');
    expect(positive.cleanup).toBe('Passed');
    expect(positive.reconstruction.decision).toBe('Complete / Test-Only');
    expect(EVENT_FAMILIES).toEqual(expectedFamilies);
    expect(Object.keys(positive.reconstruction.typeCounts).sort()).toEqual(
      [...expectedFamilies].sort()
    );
    expect(Object.values(positive.reconstruction.typeCounts)).toEqual(Array(14).fill(1));
    expect(positive.reconstruction.transitionMap).toHaveLength(14);
    expect(positive.reconstruction.transitionMap.map((edge) => [edge.before, edge.after])).toEqual(
      expectedEdges
    );
    expect(positive.reconstruction.dependencyMap).toHaveLength(14);
    expect(positive.reconstruction.syntheticOe08OperationalCount).toBe(0);
    expect(positive.reconstruction.downstreamCalls).toBe(0);
    expect(positive.reconstruction.foreignProtectedFieldsDisclosed).toBe(0);
    for (const [index, event] of positive.retained.entries()) {
      const family = expectedFamilies[index];
      const source = sourceEvents[index];
      expect(source).toBeDefined();
      expect(family).toBeDefined();
      expect(event.event_type).toBe(`km.lifecycle.${String(family)}`);
      expect(event.context.status).toBe('trusted');
      expect(event.context.tenant_id).toBe(OE12_TENANT_A);
      expect(event.event_id).toContain(OE12_TENANT_A);
      expect(event.request_id).toContain(OE12_TENANT_A);
      expect(event.correlation_id).toContain(OE12_TENANT_A);
      expect(event.trace_id).toContain(OE12_TENANT_A);
      expect(event.request_id).toBe(source?.request_id);
      expect(event.correlation_id).toBe(source?.correlation_id);
      expect(event.trace_id).toBe(source?.trace_id);
      expect(event.evidence).toMatchObject({
        namespace_id: OE12_NAMESPACE,
        fixture_schema_version: OE12_SCHEMA,
        canonical_source_id: basis.sourceId,
        source_registration_id: basis.registrationId,
        source_owner_id: basis.ownerId,
        source_version: basis.version,
        actor_id: 'sir02-km-audit-executor',
        evidence_id: source?.evidence_id,
        evidence_commit: source?.evidence_commit,
        evidence_path: source?.evidence_path,
        evidence_sha256: source?.evidence_sha256,
        audit_sink_result: 'submitted_for_persistence',
        operational_oe08_evidence: false
      });
      expect(event.evidence.source_event_time).toBe(source?.source_event_time);
      expect(event.evidence.projection_time).toBe(event.timestamp);
      expect(event.evidence.test_emission_time).toBe(event.timestamp);
      expect(JSON.stringify(event)).not.toMatch(
        /chain.of.thought|raw.prompt|customer.content|private.key/iu
      );
    }
    expect(canonicalSha256(positive.retained)).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('preserves original approval chronology and keeps the OE-08 event audit-only', () => {
    const approval = at(positive.retained, 2);
    const syntheticRetention = at(positive.retained, 13);
    expect(approval.evidence.source_event_time).toBe(basis.approvalAt);
    expect(approval.evidence.source_event_time).not.toBe(approval.timestamp);
    expect(approval.evidence.metadata).toMatchObject({ reconstructed_prior_event: true });
    expect(approval.evidence.metadata).toMatchObject({
      prior_attempt_0001: 'pre_artifact_tooling_failure',
      prior_attempt_0002_evidence_commit: 'fa51d26ab43abd53f354d544da7ab5bfca394276',
      corrected_0003_evidence_commit: '74c8eff31a88ab7de1e693b7dad0ca8e8e91a51a'
    });
    expect(at(positive.retained, 3).evidence.metadata).toMatchObject({
      rejection_case_id: 'missing-approval-decision',
      new_approval_events: 0
    });
    expect(syntheticRetention.evidence).toMatchObject({
      synthetic_audit_only: true,
      operational_oe08_evidence: false,
      state_before: 'quarantined',
      state_after: 'quarantined',
      metadata: {
        boundary_label: 'Synthetic Audit-Only Transition — Not OE-08 Operational Evidence'
      }
    });
    expect(
      positive.reconstruction.transitionMap.filter((edge) => edge.after === 'approved')
    ).toHaveLength(4);
    expect(at(positive.retained, 8).evidence.metadata).toMatchObject({
      exact_repeat_scenario_id: basis.exactRepeatScenarioId,
      additional_authoritative_artifacts: 0,
      additional_downstream_artifacts: 0
    });
    expect(at(positive.retained, 9).evidence.metadata).toMatchObject({
      conflict_type: basis.conflict.type,
      pair_id: basis.conflict.pairId,
      left_reference_id: basis.conflict.leftReferenceId,
      right_reference_id: basis.conflict.rightReferenceId,
      human_decision_hold_reference: basis.conflict.holdReference
    });
  });

  it.each(expectedFamilies)(
    'enforces the exact %s family transition before persistence',
    async (family) => {
      const index = expectedFamilies.indexOf(family);
      const expected = expectedEdges[index];
      if (!expected) throw new Error('MISSING_EXPECTED_EDGE');
      const invalidTarget = expected[1] === 'approved' ? 'quarantined' : 'approved';
      const candidate = patchSource(sourceEvents, index, { state_after: invalidTarget });
      const result = await executeLifecycle(candidate, basis);
      expect(result.reconstruction.reason).toBe('STATE_TRANSITION_CONFLICT');
      expect(result.attempted).toBe(0);
      expect(result.writeAttempts).toBe(0);
      expect(result.retained).toEqual([]);
      expect(result.cleanup).toBe('Passed');
    }
  );

  it('blocks coordinated state skipping even when adjacent state continuity is preserved', async () => {
    const candidate = patchSource(patchSource(sourceEvents, 1, { state_after: 'approved' }), 2, {
      state_before: 'approved',
      state_after: 'approved'
    });
    const result = await executeLifecycle(candidate, basis);
    expect(result.reconstruction.reason).toBe('STATE_TRANSITION_CONFLICT');
    expect(result.writeAttempts).toBe(0);
    expect(result.committed).toBe(0);
  });

  it('blocks invalid re-entry and lifecycle-family mismatch before persistence', async () => {
    const reentry = await executeLifecycle(
      patchSource(sourceEvents, 7, { state_after: 'approved' }),
      basis
    );
    const wrongFamily = await executeLifecycle(
      patchSource(sourceEvents, 7, { event_type: 'km.lifecycle.supersession' }),
      basis
    );
    expect(reentry.reconstruction.reason).toBe('STATE_TRANSITION_CONFLICT');
    expect(wrongFamily.reconstruction.reason).toBe('EVENT_ORDER_CONFLICT');
    expect(reentry.writeAttempts).toBe(0);
    expect(wrongFamily.writeAttempts).toBe(0);
  });

  const dependencyCases: ReadonlyArray<{
    name: string;
    mutate: (events: readonly KmLifecycleAuditEvent[]) => KmLifecycleAuditEvent[];
    reason: string;
  }> = [
    {
      name: 'missing registration prerequisite',
      mutate: (events) => events.filter((_, index) => index !== 0),
      reason: 'MISSING_LIFECYCLE_EVENT'
    },
    {
      name: 'unseen dependency',
      mutate: (events) =>
        patchSource(events, 4, { dependency_event_ids: ['sir02-km-unknown-parent'] }),
      reason: 'UNSEEN_DEPENDENCY'
    },
    {
      name: 'future dependency',
      mutate: (events) =>
        patchSource(events, 2, {
          dependency_event_ids: [sourceAt(events, 3).projected_event_id]
        }),
      reason: 'FUTURE_DEPENDENCY'
    },
    {
      name: 'circular dependency',
      mutate: (events) =>
        patchSource(events, 0, {
          dependency_event_ids: [sourceAt(events, 1).projected_event_id]
        }),
      reason: 'CIRCULAR_DEPENDENCY'
    },
    {
      name: 'ambiguous duplicate dependency',
      mutate: (events) =>
        patchSource(events, 4, {
          dependency_event_ids: [
            ...sourceAt(events, 4).dependency_event_ids,
            sourceAt(events, 2).projected_event_id
          ]
        }),
      reason: 'AMBIGUOUS_DEPENDENCY'
    },
    {
      name: 'cross-tenant dependency',
      mutate: (events) => patchSource(events, 1, { tenant_id: OE12_TENANT_B }),
      reason: 'TENANT_BINDING_CONFLICT'
    },
    {
      name: 'incompatible source lineage',
      mutate: (events) => patchSource(events, 4, { canonical_source_id: 'sir02-other-source' }),
      reason: 'SOURCE_VERSION_OWNER_CONFLICT'
    },
    {
      name: 'quarantine before supersession',
      mutate: (events) => patchSource(events, 7, { source_event_time: '2026-09-25T12:00:00.000Z' }),
      reason: 'CHRONOLOGY_CONFLICT'
    },
    {
      name: 'hold without its qualifying conflict pair',
      mutate: (events) =>
        patchSource(events, 9, {
          metadata: { ...sourceAt(events, 9).metadata, pair_id: 'sir02-other-pair' }
        }),
      reason: 'DEPENDENCY_REFERENCE_CONFLICT'
    },
    {
      name: 'reconciliation without its provenance dependency',
      mutate: (events) =>
        patchSource(events, 12, {
          dependency_event_ids: [sourceAt(events, 0).projected_event_id]
        }),
      reason: 'DEPENDENCY_CONFLICT'
    },
    {
      name: 'synthetic retention without quarantined precursor',
      mutate: (events) => patchSource(events, 13, { dependency_event_ids: [] }),
      reason: 'DEPENDENCY_CONFLICT'
    }
  ];

  it.each(dependencyCases)(
    'fails closed for $name before persistence',
    async ({ mutate, reason }) => {
      const result = await executeLifecycle(mutate(sourceEvents), basis);
      expect(result.reconstruction.reason).toBe(reason);
      expect(result.writeAttempts).toBe(0);
      expect(result.committed).toBe(0);
      expect(result.sink.protectedFieldsDisclosed).toBe(0);
      expect(result.cleanup).toBe('Passed');
    }
  );

  const cases: ReadonlyArray<{
    id: string;
    name: string;
    mutate: (events: readonly KmLifecycleAuditEvent[]) => KmLifecycleAuditEvent[];
    reason: string;
  }> = [
    {
      id: 'N01',
      name: 'missing required lifecycle event',
      mutate: (events) => events.filter((_, index) => index !== 4),
      reason: 'MISSING_LIFECYCLE_EVENT'
    },
    {
      id: 'N02',
      name: 'missing trusted tenant binding',
      mutate: (events) => patchSource(events, 3, { tenant_id: '' }),
      reason: 'TENANT_BINDING_CONFLICT'
    },
    {
      id: 'N03',
      name: 'missing source identity',
      mutate: (events) => withoutSource(events, 4, 'canonical_source_id'),
      reason: 'MISSING_AUDIT_BINDING'
    },
    {
      id: 'N04',
      name: 'missing actor',
      mutate: (events) => withoutSource(events, 4, 'actor_id'),
      reason: 'MISSING_AUDIT_BINDING'
    },
    {
      id: 'N05',
      name: 'missing request ID',
      mutate: (events) => withoutSource(events, 4, 'request_id'),
      reason: 'MISSING_AUDIT_BINDING'
    },
    {
      id: 'N06',
      name: 'missing correlation ID',
      mutate: (events) => withoutSource(events, 4, 'correlation_id'),
      reason: 'MISSING_AUDIT_BINDING'
    },
    {
      id: 'N07',
      name: 'missing immutable evidence reference',
      mutate: (events) => withoutSource(events, 4, 'evidence_commit'),
      reason: 'IMMUTABLE_REFERENCE_CONFLICT'
    },
    {
      id: 'N08',
      name: 'duplicate event ID',
      mutate: (events) =>
        patchSource(events, 4, { projected_event_id: sourceAt(events, 3).projected_event_id }),
      reason: 'DUPLICATE_EVENT_ID'
    },
    {
      id: 'N09',
      name: 'conflicting state transition',
      mutate: (events) => patchSource(events, 2, { state_after: 'registered' }),
      reason: 'STATE_TRANSITION_CONFLICT'
    },
    {
      id: 'N10',
      name: 'out-of-order causal chronology',
      mutate: (events) => patchSource(events, 6, { source_event_time: '2026-09-25T08:00:00.000Z' }),
      reason: 'CHRONOLOGY_CONFLICT'
    },
    {
      id: 'N11',
      name: 'cross-tenant injected event',
      mutate: (events) => patchSource(events, 4, { tenant_id: OE12_TENANT_B }),
      reason: 'TENANT_BINDING_CONFLICT'
    },
    {
      id: 'N12',
      name: 'spoofed trusted tenant context',
      mutate: (events) =>
        patchSource(events, 4, {
          request_id: sourceAt(events, 4).request_id.replace(OE12_TENANT_A, OE12_TENANT_B)
        }),
      reason: 'TENANT_BINDING_CONFLICT'
    },
    {
      id: 'N13',
      name: 'caller-supplied audit tenant override',
      mutate: (events) =>
        patchSource(events, 4, {
          metadata: { ...sourceAt(events, 4).metadata, caller_tenant_override: OE12_TENANT_B }
        }),
      reason: 'TENANT_BINDING_CONFLICT'
    },
    {
      id: 'N14',
      name: 'conflicting source version',
      mutate: (events) => patchSource(events, 4, { source_version: 'v2.0' }),
      reason: 'SOURCE_VERSION_OWNER_CONFLICT'
    },
    {
      id: 'N15',
      name: 'invalid before and after state',
      mutate: (events) => patchSource(events, 4, { state_before: 'unregistered' }),
      reason: 'STATE_TRANSITION_CONFLICT'
    },
    {
      id: 'N20',
      name: 'ambiguous authoritative state',
      mutate: (events) =>
        patchSource(events, 4, {
          metadata: { ...sourceAt(events, 4).metadata, ambiguous_authoritative_state: true }
        }),
      reason: 'AMBIGUOUS_AUTHORITATIVE_STATE'
    }
  ];

  it.each(cases)('$id rejects $name before any authoritative write', async ({ mutate, reason }) => {
    const result = await executeLifecycle(mutate(sourceEvents), basis);
    expect(result.reconstruction.decision).toBe('Blocked / Fail Closed');
    expect(result.reconstruction.reason).toBe(reason);
    expect(result.attempted).toBe(0);
    expect(result.writeAttempts).toBe(0);
    expect(result.committed).toBe(0);
    expect(result.retained).toEqual([]);
    expect(result.reconstruction.transitionMap).toEqual([]);
    expect(result.reconstruction.downstreamCalls).toBe(0);
    expect(result.sink.protectedFieldsDisclosed).toBe(0);
    expect(result.sink.callerVisibleResult).toEqual({
      decision: 'denied',
      reasonCode: 'AUDIT_EVIDENCE_UNAVAILABLE',
      protectedFieldsDisclosed: 0
    });
    expect(result.cleanup).toBe('Passed');
  });

  it('N16 blocks an unredacted sensitive field before persistence', async () => {
    const contaminated = sourceEvents.map((event, index) =>
      index === 0 ? { ...event, metadata: { secret: 'SYNTHETIC-NOT-A-REAL-SECRET' } } : event
    );
    const result = await executeLifecycle(contaminated, basis);
    expect(result.primaryError).toMatch(/prohibited data/iu);
    expect(result.attempted).toBe(0);
    expect(result.writeAttempts).toBe(0);
    expect(result.committed).toBe(0);
    expect(result.healthCount).toBe(0);
    expect(result.sink.outcome).toBe('failed');
    expect(JSON.stringify(result.retained)).not.toContain('SYNTHETIC-NOT-A-REAL-SECRET');
    expect(result.cleanup).toBe('Passed');
  });

  it('N17 blocks a nested alias for prohibited reasoning content', async () => {
    const contaminated = sourceEvents.map((event, index) =>
      index === 0
        ? { ...event, metadata: { nested: { chain_of_thought: 'SYNTHETIC-REASONING' } } }
        : event
    );
    const result = await executeLifecycle(contaminated, basis);
    expect(result.primaryError).toMatch(/prohibited data/iu);
    expect(result.attempted).toBe(0);
    expect(result.writeAttempts).toBe(0);
    expect(result.committed).toBe(0);
    expect(result.healthCount).toBe(0);
    expect(JSON.stringify(result.retained)).not.toContain('SYNTHETIC-REASONING');
    expect(result.cleanup).toBe('Passed');
  });

  const retainedTamperCases: ReadonlyArray<{
    name: string;
    mutate: (events: readonly CanonicalAuditEvent[]) => CanonicalAuditEvent[];
    reason: string;
  }> = [
    {
      name: 'coordinated state skip',
      mutate: (events) =>
        patchEvidence(patchEvidence(events, 1, { state_after: 'approved' }), 2, {
          state_before: 'approved',
          state_after: 'approved'
        }),
      reason: 'STATE_TRANSITION_CONFLICT'
    },
    {
      name: 'causal supersession inversion',
      mutate: (events) =>
        patchEvidence(events, 6, { source_event_time: '2026-09-25T08:00:00.000Z' }),
      reason: 'CHRONOLOGY_CONFLICT'
    },
    {
      name: 'wrong version lineage',
      mutate: (events) => patchEvidence(events, 4, { source_version: 'v2.0' }),
      reason: 'SOURCE_VERSION_OWNER_CONFLICT'
    },
    {
      name: 'owner substitution',
      mutate: (events) => patchEvidence(events, 4, { source_owner_id: 'sir02-other-owner' }),
      reason: 'SOURCE_VERSION_OWNER_CONFLICT'
    },
    {
      name: 'tenant substitution',
      mutate: (events) => patchEvidence(events, 4, { tenant_id: OE12_TENANT_B }),
      reason: 'TENANT_BINDING_CONFLICT'
    },
    {
      name: 'immutable reference substitution',
      mutate: (events) => patchEvidence(events, 4, { evidence_commit: '0'.repeat(40) }),
      reason: 'IMMUTABLE_REFERENCE_CONFLICT'
    },
    {
      name: 'duplicate retained event identity',
      mutate: (events) =>
        replace(events, 4, (event) => ({ ...event, event_id: at(events, 3).event_id })),
      reason: 'DUPLICATE_EVENT_ID'
    },
    {
      name: 'conflicting retained event sequence',
      mutate: (events) => [events[1], events[0], ...events.slice(2)] as CanonicalAuditEvent[],
      reason: 'EVENT_ORDER_CONFLICT'
    },
    {
      name: 'missing retained dependency edge',
      mutate: (events) => patchEvidence(events, 6, { dependency_event_ids: [] }),
      reason: 'DEPENDENCY_CONFLICT'
    },
    {
      name: 'missing retained immutable evidence ID',
      mutate: (events) => withoutEvidence(events, 4, 'evidence_id'),
      reason: 'IMMUTABLE_REFERENCE_CONFLICT'
    },
    {
      name: 'ambiguous retained authority',
      mutate: (events) =>
        patchEvidence(events, 4, {
          metadata: { ...metadataAt(events, 4), ambiguous_authoritative_state: true }
        }),
      reason: 'AMBIGUOUS_AUTHORITATIVE_STATE'
    },
    {
      name: 'missing original OE-03 tooling and clarification lineage',
      mutate: (events) =>
        patchEvidence(events, 2, {
          metadata: { ...metadataAt(events, 2), prior_attempt_0001: undefined }
        }),
      reason: 'DEPENDENCY_REFERENCE_CONFLICT'
    },
    {
      name: 'missing accepted conflict hold reference',
      mutate: (events) =>
        patchEvidence(events, 9, {
          metadata: { ...metadataAt(events, 9), human_decision_hold_reference: '' }
        }),
      reason: 'DEPENDENCY_REFERENCE_CONFLICT'
    }
  ];

  it.each(retainedTamperCases)('reconstruction fails closed for $name', ({ mutate, reason }) => {
    const result = reconstructLifecycle(mutate(positive.retained), basis);
    expect(result.decision).toBe('Blocked / Fail Closed');
    expect(result.reason).toBe(reason);
    expect(result.foreignProtectedFieldsDisclosed).toBe(0);
  });

  it('rejects an incomplete retained prefix instead of treating a failed attempt as complete', () => {
    const result = reconstructLifecycle(positive.retained.slice(0, 5), basis);
    expect(result.decision).toBe('Blocked / Fail Closed');
    expect(result.reason).toBe('MISSING_LIFECYCLE_EVENT');
  });

  it('N18 fails closed when the audit evidence store fails before write', async () => {
    const result = await executeLifecycle(sourceEvents, basis, { failPersistAt: 0 });
    expect(result.primaryError).toMatch(/Required audit evidence could not be delivered/iu);
    expect(result.attempted).toBe(1);
    expect(result.writeAttempts).toBe(1);
    expect(result.committed).toBe(0);
    expect(result.sink).toMatchObject({
      attemptedEventIds: [result.sink.failedEvent?.eventId],
      committedEventIds: [],
      failedSink: 'evidence_store',
      failedPhase: 'persist',
      failureCode: 'AUDIT_DELIVERY_FAILURE',
      outcome: 'failed',
      writeOccurred: false,
      partialWrite: false,
      expectedItemCount: 14,
      attemptedWriteCount: 1,
      actualPersistedCount: 0,
      callerVisibleResult: callerVisibleDenial(),
      protectedFieldsDisclosed: 0
    });
    expect(result.sink.failedEvent).toMatchObject({
      tenantId: OE12_TENANT_A,
      sourceId: basis.sourceId,
      eventType: sourceAt(sourceEvents, 0).event_type,
      stateBefore: 'unregistered',
      stateAfter: 'registered',
      decision: 'recorded',
      requestId: sourceAt(sourceEvents, 0).request_id,
      correlationId: sourceAt(sourceEvents, 0).correlation_id,
      traceId: sourceAt(sourceEvents, 0).trace_id,
      immutableReference: {
        id: sourceAt(sourceEvents, 0).evidence_id,
        commit: sourceAt(sourceEvents, 0).evidence_commit,
        path: sourceAt(sourceEvents, 0).evidence_path,
        sha256: sourceAt(sourceEvents, 0).evidence_sha256
      },
      timestamp: sourceAt(sourceEvents, 0).test_emission_time
    });
    expect(result.sink.health.length).toBeGreaterThan(0);
    expect(result.sink.health.every((item) => item.reasonCode.length > 0)).toBe(true);
    expect(result.reconstruction.failedAuditOperation).toEqual({
      eventId: result.sink.failedEvent?.eventId,
      outcome: 'failed',
      persistedItemCount: 0
    });
    expect(result.pipelineHealth).toBe('degraded');
    expect(result.healthCount).toBeGreaterThan(0);
    expect(result.reconstruction.decision).toBe('Blocked / Fail Closed');
    expect(result.cleanup).toBe('Passed');
  });

  it('N19 retains the committed prefix and blocks partial audit delivery', async () => {
    const result = await executeLifecycle(sourceEvents, basis, { failAuditExportAt: 4 });
    expect(result.primaryError).toMatch(/Required audit evidence could not be delivered/iu);
    expect(result.committed).toBe(5);
    expect(result.exported).toBe(4);
    expect(result.attempted).toBe(5);
    expect(result.writeAttempts).toBe(5);
    expect(result.sink).toMatchObject({
      attemptedEventIds: result.sink.attemptedEventIds,
      committedEventIds: result.retained.map((event) => event.event_id),
      failedSink: 'audit_exporter',
      failedPhase: 'export',
      failureCode: 'AUDIT_DELIVERY_FAILURE',
      outcome: 'partial',
      writeOccurred: true,
      partialWrite: true,
      expectedItemCount: 14,
      attemptedWriteCount: 5,
      actualPersistedCount: 5,
      callerVisibleResult: callerVisibleDenial(),
      protectedFieldsDisclosed: 0
    });
    expect(result.sink.attemptedEventIds).toHaveLength(5);
    expect(result.sink.committedEventIds).toHaveLength(5);
    expect(result.sink.failedEvent).toMatchObject({
      eventId: result.sink.attemptedEventIds[4],
      tenantId: OE12_TENANT_A,
      sourceId: basis.sourceId,
      eventType: sourceAt(sourceEvents, 4).event_type,
      stateBefore: 'approved',
      stateAfter: 'approved',
      decision: 'recorded',
      immutableReference: {
        id: sourceAt(sourceEvents, 4).evidence_id,
        commit: sourceAt(sourceEvents, 4).evidence_commit,
        path: sourceAt(sourceEvents, 4).evidence_path,
        sha256: sourceAt(sourceEvents, 4).evidence_sha256
      },
      timestamp: sourceAt(sourceEvents, 4).test_emission_time
    });
    expect(result.reconstruction.failedAuditOperation).toEqual({
      eventId: result.sink.failedEvent?.eventId,
      outcome: 'partial',
      persistedItemCount: 5
    });
    expect(result.sink.health.length).toBeGreaterThan(0);
    expect(result.healthCount).toBeGreaterThan(0);
    expect(result.reconstruction.decision).toBe('Blocked / Fail Closed');
    expect(JSON.stringify(result.sink)).not.toMatch(
      /SYNTHETIC_EXPORT_FAILURE|private.key|chain.of.thought/iu
    );
    expect(result.cleanup).toBe('Passed');
  });

  it('fails closed for independent security and metrics exporter failures', async () => {
    const securityFailure = await executeLifecycle(sourceEvents, basis, {
      failSecurityExportAt: 0
    });
    expect(securityFailure.reconstruction.decision).toBe('Blocked / Fail Closed');
    expect(securityFailure.pipelineHealth).toBe('degraded');
    expect(securityFailure.healthCount).toBeGreaterThan(0);
    expect(securityFailure.committed).toBe(4);
    expect(securityFailure.securityExported).toBe(0);
    const metricsFailure = await executeLifecycle(sourceEvents, basis, {
      failMetricsExportAt: 0
    });
    expect(metricsFailure.reconstruction.decision).toBe('Blocked / Fail Closed');
    expect(metricsFailure.pipelineHealth).toBe('degraded');
    expect(metricsFailure.healthCount).toBeGreaterThan(0);
    expect(metricsFailure.committed).toBe(1);
    expect(metricsFailure.metricsExported).toBe(0);
    expect(JSON.stringify(securityFailure)).not.toContain('SYNTHETIC-NOT-A-REAL-SECRET');
  });

  it('fails explicitly if the independent health path is unavailable', async () => {
    const result = await executeLifecycle(sourceEvents, basis, {
      failPersistAt: 0,
      failHealthExport: true
    });
    expect(result.primaryError).toContain('HEALTH_OUTPUT_UNAVAILABLE');
    expect(result.reconstruction.decision).toBe('Blocked / Fail Closed');
    expect(result.cleanup).toBe('Passed');
  });

  it('rejects caller tenant substitution before persistence with a non-enumerating denial', async () => {
    const substituted = sourceEvents.map((event, index) =>
      index === 0 ? { ...event, tenant_id: OE12_TENANT_B } : event
    );
    const result = await executeLifecycle(substituted, basis);
    expect(result.committed).toBe(0);
    expect(result.reconstruction.decision).toBe('Blocked / Fail Closed');
    expect(callerVisibleDenial()).toEqual({
      decision: 'denied',
      reasonCode: 'AUDIT_EVIDENCE_UNAVAILABLE',
      protectedFieldsDisclosed: 0
    });
  });

  it('isolates subsequent cases and leaves no in-memory audit state after cleanup', async () => {
    const first = await executeLifecycle(sourceEvents, basis, { failAuditExportAt: 1 });
    const second = await executeLifecycle(sourceEvents, basis);
    expect(first.reconstruction.decision).toBe('Blocked / Fail Closed');
    expect(second.reconstruction.decision).toBe('Complete / Test-Only');
    expect(second.retained).toEqual(positive.retained);
    const fixture = createFixture();
    const firstSource = sourceEvents[0];
    if (!firstSource) throw new Error('MISSING_TEST_SOURCE_EVENT');
    await fixture.pipeline.emit(firstSource);
    fixture.cleanup();
    expect(fixture.disposed).toBe(true);
    expect(fixture.store.audits).toEqual([]);
    expect(fixture.store.health).toEqual([]);
    expect(fixture.exported).toEqual([]);
    expect(fixture.health).toEqual([]);
    expect(fixture.eventIds).toEqual([]);
    expect(fixture.requestScopes).toEqual([]);
    expect(fixture.tenantScopes).toEqual([]);
  });

  it('reports primary and cleanup errors independently', async () => {
    await expect(
      executeLifecycle(sourceEvents, basis, { failPersistAt: 0, failCleanup: true })
    ).rejects.toThrow(
      /CLEANUP_FAILURE:SYNTHETIC_CLEANUP_FAILURE;PRIMARY:Required audit evidence could not be delivered/u
    );
  });
});
