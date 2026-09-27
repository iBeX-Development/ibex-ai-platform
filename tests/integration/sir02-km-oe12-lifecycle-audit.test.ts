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

  const cases: ReadonlyArray<{
    id: string;
    name: string;
    mutate: (events: readonly CanonicalAuditEvent[]) => CanonicalAuditEvent[];
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
      mutate: (events) =>
        replace(events, 3, (event) => ({
          ...event,
          context: { status: 'unavailable', permission_refs: [], entitlement_refs: [] }
        })),
      reason: 'TENANT_BINDING_CONFLICT'
    },
    {
      id: 'N03',
      name: 'missing source identity',
      mutate: (events) => withoutEvidence(events, 4, 'canonical_source_id'),
      reason: 'MISSING_AUDIT_BINDING'
    },
    {
      id: 'N04',
      name: 'missing actor',
      mutate: (events) => withoutEvidence(events, 4, 'actor_id'),
      reason: 'MISSING_AUDIT_BINDING'
    },
    {
      id: 'N05',
      name: 'missing request ID',
      mutate: (events) =>
        replace(
          events,
          4,
          (event) =>
            Object.fromEntries(
              Object.entries(event).filter(([key]) => key !== 'request_id')
            ) as unknown as CanonicalAuditEvent
        ),
      reason: 'MISSING_AUDIT_BINDING'
    },
    {
      id: 'N06',
      name: 'missing correlation ID',
      mutate: (events) =>
        replace(
          events,
          4,
          (event) =>
            Object.fromEntries(
              Object.entries(event).filter(([key]) => key !== 'correlation_id')
            ) as unknown as CanonicalAuditEvent
        ),
      reason: 'MISSING_AUDIT_BINDING'
    },
    {
      id: 'N07',
      name: 'missing immutable evidence reference',
      mutate: (events) => withoutEvidence(events, 4, 'evidence_commit'),
      reason: 'IMMUTABLE_REFERENCE_CONFLICT'
    },
    {
      id: 'N08',
      name: 'duplicate event ID',
      mutate: (events) =>
        replace(events, 4, (event) => ({
          ...event,
          event_id: at(events, 3).event_id
        })),
      reason: 'DUPLICATE_EVENT_ID'
    },
    {
      id: 'N09',
      name: 'conflicting state transition',
      mutate: (events) => patchEvidence(events, 2, { state_after: 'registered' }),
      reason: 'STATE_TRANSITION_CONFLICT'
    },
    {
      id: 'N10',
      name: 'out-of-order chronology',
      mutate: (events) =>
        patchEvidence(events, 4, { source_event_time: '2030-01-01T00:00:00.000Z' }),
      reason: 'CHRONOLOGY_CONFLICT'
    },
    {
      id: 'N11',
      name: 'cross-tenant injected event',
      mutate: (events) => patchEvidence(events, 4, { tenant_id: OE12_TENANT_B }),
      reason: 'TENANT_BINDING_CONFLICT'
    },
    {
      id: 'N12',
      name: 'spoofed trusted tenant context',
      mutate: (events) =>
        replace(events, 4, (event) => ({
          ...event,
          context: { ...event.context, tenant_id: OE12_TENANT_B }
        })),
      reason: 'TENANT_BINDING_CONFLICT'
    },
    {
      id: 'N13',
      name: 'caller-supplied audit tenant override',
      mutate: (events) => patchEvidence(events, 4, { tenant_id: OE12_TENANT_B }),
      reason: 'TENANT_BINDING_CONFLICT'
    },
    {
      id: 'N14',
      name: 'conflicting source version',
      mutate: (events) => patchEvidence(events, 4, { source_version: 'v2.0' }),
      reason: 'SOURCE_VERSION_OWNER_CONFLICT'
    },
    {
      id: 'N15',
      name: 'invalid before and after state',
      mutate: (events) => patchEvidence(events, 4, { state_before: 'unregistered' }),
      reason: 'STATE_TRANSITION_CONFLICT'
    },
    {
      id: 'N20',
      name: 'ambiguous authoritative state',
      mutate: (events) =>
        patchEvidence(events, 4, {
          metadata: { ambiguous_authoritative_state: true }
        }),
      reason: 'AMBIGUOUS_AUTHORITATIVE_STATE'
    }
  ];

  it.each(cases)('$id blocks $name without caller disclosure', ({ mutate, reason }) => {
    const result = reconstructLifecycle(mutate(positive.retained), basis);
    expect(result.decision).toBe('Blocked / Fail Closed');
    expect(result.reason).toBe(reason);
    expect(result.transitionMap).toEqual([]);
    expect(result.downstreamCalls).toBe(0);
    expect(result.foreignProtectedFieldsDisclosed).toBe(0);
    expect(callerVisibleDenial()).toEqual({
      decision: 'denied',
      reasonCode: 'AUDIT_EVIDENCE_UNAVAILABLE',
      protectedFieldsDisclosed: 0
    });
  });

  it('N16 blocks an unredacted sensitive field before persistence', async () => {
    const contaminated = sourceEvents.map((event, index) =>
      index === 0 ? { ...event, metadata: { secret: 'SYNTHETIC-NOT-A-REAL-SECRET' } } : event
    );
    const result = await executeLifecycle(contaminated, basis);
    expect(result.primaryError).toMatch(/prohibited data/iu);
    expect(result.committed).toBe(0);
    expect(result.healthCount).toBeGreaterThan(0);
    expect(result.pipelineHealth).toBe('degraded');
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
    expect(result.committed).toBe(0);
    expect(result.healthCount).toBeGreaterThan(0);
    expect(JSON.stringify(result.retained)).not.toContain('SYNTHETIC-REASONING');
    expect(result.cleanup).toBe('Passed');
  });

  it('N18 fails closed when the audit evidence store fails before write', async () => {
    const result = await executeLifecycle(sourceEvents, basis, { failPersistAt: 0 });
    expect(result.primaryError).toMatch(/Required audit evidence could not be delivered/iu);
    expect(result.committed).toBe(0);
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
    expect(result.healthCount).toBeGreaterThan(0);
    expect(result.reconstruction.decision).toBe('Blocked / Fail Closed');
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
