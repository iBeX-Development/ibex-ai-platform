import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ACCEPTED_INPUTS,
  OE09_NAMESPACE,
  OE09_SCHEMA,
  OE09_TENANT_A,
  OE09_TENANT_B,
  buildAuthoritativeInventory,
  buildDerivedInventory,
  loadAcceptedEvidence,
  reconcile,
  reconcileForViewer,
  reconciliationSha256,
  serializeReconciliationResult,
  type Inventory,
  type InventoryVersion
} from '../testing/sir02-km-oe09-reconciliation-fixture.js';

const reconciliationTime = '2026-09-26T00:00:00Z';
const correlationId = 'sir02-oe09-test-only-correlation';
const versionAt = (inventory: Inventory, index: number): InventoryVersion => {
  const entry = inventory.versions[index];
  if (!entry) throw new Error(`MISSING_TEST_VERSION:${String(index)}`);
  return entry;
};

describe('SIR02-KM-OE-09 test-only reconciliation fixture', () => {
  let acceptedInputs: ReturnType<typeof loadAcceptedEvidence>;
  let authoritative: Inventory;
  let derived: Inventory;

  beforeAll(() => {
    acceptedInputs = loadAcceptedEvidence();
  });

  beforeEach(() => {
    authoritative = buildAuthoritativeInventory(acceptedInputs);
    derived = buildDerivedInventory(acceptedInputs);
  });

  afterEach(() => {
    // Dispose only in-memory test projections. The immutable upstream records are never altered.
    authoritative.versions.splice(0);
    derived.versions.splice(0);
  });

  const run = (): ReturnType<typeof reconcile> =>
    reconcile(authoritative, derived, reconciliationTime, correlationId);

  it('loads seven immutable accepted synthetic inputs and builds inventories independently', () => {
    expect(Object.keys(acceptedInputs).sort()).toEqual(
      ACCEPTED_INPUTS.map((entry) => entry.id).sort()
    );
    expect(authoritative).not.toBe(derived);
    expect(authoritative.versions).not.toBe(derived.versions);
    expect(authoritative.versions[0]).not.toBe(derived.versions[0]);
    expect(authoritative.kind).toBe('authoritative');
    expect(derived.kind).toBe('derived');
    expect(authoritative.tenantId).toBe(OE09_TENANT_A);
    expect(derived.tenantId).toBe(OE09_TENANT_A);
  });

  it('reconciles the accepted chronology without creating an active knowledge version', () => {
    const result = run();
    expect(result).toEqual(run());
    expect(serializeReconciliationResult(result)).toEqual(serializeReconciliationResult(run()));
    expect(reconciliationSha256(result)).toMatch(/^[a-f0-9]{64}$/u);
    expect(result.decision).toBe('Reconciled / Non-Operational Test State');
    expect(result.namespace).toBe(OE09_NAMESPACE);
    expect(result.schema).toBe(OE09_SCHEMA);
    expect(result.currentVersion).toBe('v1.1');
    expect(result.approvedVersions).toEqual(['v1.0']);
    expect(result.unapprovedVersions).toEqual(['v1.1']);
    expect(result.supersededVersions).toEqual(['v1.0']);
    expect(result.quarantinedVersions).toEqual(['v1.0']);
    expect(result.activeVersions).toEqual([]);
    expect(result.counts).toEqual({
      authoritativeVersions: 2,
      derivedVersions: 2,
      matchedVersions: 2,
      discrepancies: 0,
      unresolved: 0,
      quarantined: 1,
      nonActive: 2,
      activeEligible: 0,
      byCode: {}
    });
    expect(result.audit.knowledgeProcessingCalls).toBe(0);
    expect(result.audit.foreignTenantFieldsDisclosed).toBe(0);
  });

  it('emits complete deterministic reconciliation and sanitized audit fields', () => {
    const result = run();
    const root = result.versionDetails.find((version) => version.version === 'v1.0');
    expect(result.sourceId).toBe(authoritative.sourceId);
    expect(result.registrationId).toBe(authoritative.registrationId);
    expect(result.tenantId).toBe(OE09_TENANT_A);
    expect(result.ownerId).toBe(authoritative.ownerId);
    expect(result.authoritativeCurrentVersion).toBe('v1.1');
    expect(result.nonActiveVersions).toEqual(['v1.0', 'v1.1']);
    expect(root).toMatchObject({
      tenantId: OE09_TENANT_A,
      sourceId: authoritative.sourceId,
      version: 'v1.0',
      active: false,
      approvalState: 'approved',
      supersessionState: 'superseded',
      quarantineState: 'quarantined',
      checksum: versionAt(authoritative, 0).checksum,
      lineageRoot: versionAt(authoritative, 0).lineageRoot,
      provenanceRef: versionAt(authoritative, 0).provenanceRef,
      approvalRef: versionAt(authoritative, 0).approvalRef,
      supersessionRef: versionAt(authoritative, 0).supersessionRef,
      quarantineRef: versionAt(authoritative, 0).quarantineRef
    });
    expect(result.inputManifest).toEqual(ACCEPTED_INPUTS);
    expect(result.inventorySummaries.authoritative).toMatchObject({
      versionCount: 2,
      sourceCount: 1,
      tenantCount: 1,
      inputRefs: authoritative.inputRefs.slice().sort()
    });
    expect(result.inventorySummaries.derived).toMatchObject({
      versionCount: 2,
      sourceCount: 1,
      tenantCount: 1,
      inputRefs: derived.inputRefs.slice().sort()
    });
    expect(result.inventorySummaries.authoritative.sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(result.inventorySummaries.derived.sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(result.audit).toMatchObject({
      requestId: `${correlationId}-request`,
      correlationId,
      traceId: `${correlationId}-trace`,
      actorId: 'sir02-test-reconciliation-actor',
      eventTimestamp: reconciliationTime,
      outcome: 'Reconciled / Non-Operational Test State',
      tenantScope: OE09_TENANT_A,
      affectedKeys: [],
      foreignTenantFieldsDisclosed: 0,
      knowledgeProcessingCalls: 0
    });
    expect(result.audit.inputChecksumReferences).toEqual(
      ACCEPTED_INPUTS.map((entry) => entry.sha256)
    );
    expect(serializeReconciliationResult(result)).toEqual(serializeReconciliationResult(run()));
  });

  it('keeps the same version in another tenant distinct from Tenant A', () => {
    derived.versions.push({ ...versionAt(derived, 0), tenantId: OE09_TENANT_B });
    const result = run();
    expect(result.decision).toBe('Blocked / Fail Closed');
    expect(result.counts.matchedVersions).toBe(2);
    expect(result.discrepancies.map((entry) => entry.code)).toContain('CROSS_TENANT_RECORD');
    expect(result.discrepancies.map((entry) => entry.code)).toContain('ORPHAN_DERIVED_RECORD');
    expect(result.discrepancies.map((entry) => entry.code)).not.toContain(
      'DUPLICATE_VERSION_RECORD'
    );
    expect(JSON.stringify(result.discrepancies)).not.toContain(OE09_TENANT_B);
  });

  it('keeps the same version in another canonical source distinct', () => {
    derived.versions.push({ ...versionAt(derived, 0), sourceId: 'sir02-km-source-a-002' });
    const result = run();
    expect(result.decision).toBe('Blocked / Fail Closed');
    expect(result.counts.matchedVersions).toBe(2);
    expect(result.discrepancies.map((entry) => entry.code)).toContain('SOURCE_ID_MISMATCH');
    expect(result.discrepancies.map((entry) => entry.code)).toContain('ORPHAN_DERIVED_RECORD');
    expect(result.discrepancies.map((entry) => entry.code)).not.toContain(
      'DUPLICATE_VERSION_RECORD'
    );
  });

  it.each(['tenantId', 'sourceId', 'version'] as const)(
    'fails closed when the %s identity component is missing',
    (field) => {
      versionAt(derived, 0)[field] = '';
      const result = run();
      expect(result.decision).toBe('Blocked / Fail Closed');
      expect(result.discrepancies.map((entry) => entry.code)).toContain(
        'WILDCARD_OR_MISSING_IDENTIFIER'
      );
      expect(result.counts.matchedVersions).toBe(1);
    }
  );

  it.each(['tenantId', 'sourceId', 'version'] as const)(
    'fails closed when the %s identity property is absent',
    (field) => {
      Reflect.deleteProperty(versionAt(derived, 0), field);
      const result = run();
      expect(result.decision).toBe('Blocked / Fail Closed');
      expect(result.discrepancies.map((entry) => entry.code)).toContain(
        'WILDCARD_OR_MISSING_IDENTIFIER'
      );
      expect(result.counts.matchedVersions).toBe(1);
    }
  );

  it('does not let a cross-tenant injected record alter the authoritative inventory', () => {
    const originalAuthority = JSON.stringify(authoritative);
    const originalHash = run().inventorySummaries.authoritative.sha256;
    derived.versions.push({ ...versionAt(derived, 0), tenantId: OE09_TENANT_B });
    const result = run();
    expect(result.decision).toBe('Blocked / Fail Closed');
    expect(JSON.stringify(authoritative)).toBe(originalAuthority);
    expect(result.inventorySummaries.authoritative.sha256).toBe(originalHash);
    expect(result.counts.authoritativeVersions).toBe(2);
    expect(result.counts.matchedVersions).toBe(2);
  });

  it.each(['reconcile', 'inspect', 'inject'] as const)(
    'returns zero Tenant A protected fields to a Tenant B %s attempt',
    (attempt) => {
      if (attempt === 'inject') {
        derived.versions.push({ ...versionAt(derived, 0), tenantId: OE09_TENANT_B });
      }
      const visible = reconcileForViewer(
        authoritative,
        derived,
        OE09_TENANT_B,
        reconciliationTime,
        correlationId
      );
      const encoded = JSON.stringify(visible);
      const root = versionAt(authoritative, 0);
      const protectedValues = [
        'Synthetic SIR-02 Knowledge Source A',
        authoritative.registrationId,
        root.sourceId,
        root.tenantId,
        root.ownerId,
        root.version,
        root.checksum,
        root.approvalRef,
        root.lineageRoot,
        root.provenanceRef,
        root.supersessionRef,
        root.quarantineRef
      ].filter((value): value is string => typeof value === 'string' && value.length > 0);
      const disclosed = protectedValues.filter((value) => encoded.includes(value)).length;
      expect(visible.decision).toBe('Blocked / Fail Closed');
      expect(Object.keys(visible).sort()).toEqual(
        ['correlationId', 'decision', 'protectedFieldsDisclosed'].sort()
      );
      expect(visible.protectedFieldsDisclosed).toBe(0);
      expect(disclosed).toBe(0);
    }
  );

  it('does not echo a caller correlation containing protected source identity', () => {
    const unsafeCorrelation = `${authoritative.sourceId}-${versionAt(authoritative, 0).checksum}`;
    const visible = reconcileForViewer(
      authoritative,
      derived,
      OE09_TENANT_B,
      reconciliationTime,
      unsafeCorrelation
    );
    expect(visible.decision).toBe('Blocked / Fail Closed');
    expect(visible.protectedFieldsDisclosed).toBe(0);
    expect(JSON.stringify(visible)).not.toContain(authoritative.sourceId);
    expect(JSON.stringify(visible)).not.toContain(versionAt(authoritative, 0).checksum);
  });

  const cases: ReadonlyArray<{
    name: string;
    mutate: (authority: Inventory, projection: Inventory) => void;
    code: string;
  }> = [
    {
      name: 'missing registration',
      mutate: (a) => {
        a.registrationId = '';
      },
      code: 'REGISTRATION_MISSING_OR_MISMATCHED'
    },
    {
      name: 'missing approval reference',
      mutate: (_a, d) => {
        versionAt(d, 0).approvalRef = null;
      },
      code: 'APPROVAL_REFERENCE_MISSING'
    },
    {
      name: 'missing lineage or provenance',
      mutate: (_a, d) => {
        versionAt(d, 0).provenanceRef = '';
      },
      code: 'LINEAGE_OR_PROVENANCE_MISSING'
    },
    {
      name: 'conflicting current version',
      mutate: (_a, d) => {
        d.currentVersion = 'v1.0';
      },
      code: 'CURRENT_VERSION_CONFLICT'
    },
    {
      name: 'conflicting approval state',
      mutate: (_a, d) => {
        versionAt(d, 0).approvalState = 'unapproved';
      },
      code: 'APPROVAL_STATE_CONFLICT'
    },
    {
      name: 'conflicting supersession state',
      mutate: (_a, d) => {
        versionAt(d, 0).supersessionState = 'none';
      },
      code: 'SUPERSESSION_STATE_CONFLICT'
    },
    {
      name: 'conflicting quarantine state',
      mutate: (_a, d) => {
        versionAt(d, 0).quarantineState = 'none';
      },
      code: 'QUARANTINE_STATE_CONFLICT'
    },
    {
      name: 'active plus superseded contradiction',
      mutate: (_a, d) => {
        versionAt(d, 0).active = true;
      },
      code: 'ACTIVE_SUPERSEDED_CONTRADICTION'
    },
    {
      name: 'active plus quarantined contradiction',
      mutate: (_a, d) => {
        versionAt(d, 0).active = true;
      },
      code: 'ACTIVE_QUARANTINED_CONTRADICTION'
    },
    {
      name: 'wrong tenant',
      mutate: (_a, d) => {
        d.tenantId = OE09_TENANT_B;
      },
      code: 'TENANT_MISMATCH'
    },
    {
      name: 'cross-tenant injected record',
      mutate: (_a, d) => {
        d.versions.push({ ...versionAt(d, 1), version: 'v2.0', tenantId: OE09_TENANT_B });
      },
      code: 'CROSS_TENANT_RECORD'
    },
    {
      name: 'owner substitution',
      mutate: (_a, d) => {
        d.ownerId = 'sir02-test-foreign-owner';
      },
      code: 'OWNER_SUBSTITUTION'
    },
    {
      name: 'checksum or content identity mismatch',
      mutate: (_a, d) => {
        versionAt(d, 0).checksum = 'f'.repeat(64);
      },
      code: 'CONTENT_CHECKSUM_MISMATCH'
    },
    {
      name: 'chronology conflict',
      mutate: (_a, d) => {
        versionAt(d, 0).quarantineAt = '2026-09-25T05:22:58Z';
      },
      code: 'CHRONOLOGY_CONFLICT'
    },
    {
      name: 'wildcard identifier',
      mutate: (_a, d) => {
        d.ownerId = '*';
      },
      code: 'WILDCARD_OR_MISSING_IDENTIFIER'
    },
    {
      name: 'ambiguous authoritative state',
      mutate: (a) => {
        a.currentVersion = 'v9.0';
      },
      code: 'AMBIGUOUS_AUTHORITATIVE_STATE'
    },
    {
      name: 'orphan derived version',
      mutate: (_a, d) => {
        d.versions.push({ ...versionAt(d, 1), version: 'v2.0' });
      },
      code: 'ORPHAN_DERIVED_RECORD'
    },
    {
      name: 'duplicate derived version',
      mutate: (_a, d) => {
        d.versions.push({ ...versionAt(d, 1) });
      },
      code: 'DUPLICATE_VERSION_RECORD'
    },
    {
      name: 'missing derived version',
      mutate: (_a, d) => {
        d.versions.pop();
      },
      code: 'DERIVED_RECORD_MISSING'
    },
    {
      name: 'withdrawn state conflict',
      mutate: (_a, d) => {
        versionAt(d, 0).withdrawn = true;
      },
      code: 'WITHDRAWAL_STATE_CONFLICT'
    }
  ];

  it.each(cases)('blocks $name with a stable discrepancy', ({ mutate, code }) => {
    mutate(authoritative, derived);
    const result = run();
    expect(result.decision).toBe('Blocked / Fail Closed');
    expect(result.discrepancies.map((entry) => entry.code)).toContain(code);
    expect(result.counts.unresolved).toBeGreaterThan(0);
    expect(result.counts.discrepancies).toBe(result.discrepancies.length);
    expect(result.counts.byCode[code]).toBeGreaterThan(0);
    expect(result.currentVersion).toBeNull();
    expect(result.activeVersions).toEqual([]);
    expect(result.audit.reasonCodes).toEqual(result.discrepancies.map((entry) => entry.code));
    expect(result.audit.affectedKeys).toEqual(
      result.discrepancies.map((entry) => entry.affectedId)
    );
    expect(result.audit.knowledgeProcessingCalls).toBe(0);
    expect(result.audit.foreignTenantFieldsDisclosed).toBe(0);
    if (code === 'CROSS_TENANT_RECORD' || code === 'TENANT_MISMATCH') {
      expect(JSON.stringify(result)).not.toContain(OE09_TENANT_B);
    }
  });

  it('rejects a broken immutable artifact checksum before materializing either inventory', () => {
    const altered = ACCEPTED_INPUTS.map((entry) =>
      entry.id === 'SIR02-KM-OE-01' ? { ...entry, sha256: '0'.repeat(64) } : entry
    );
    expect(() => loadAcceptedEvidence(altered)).toThrow('IMMUTABLE_CHECKSUM_MISMATCH');
  });

  it.each([
    {
      name: 'missing immutable commit',
      override: { evidenceCommit: '' },
      error: 'INVALID_IMMUTABLE_REFERENCE'
    },
    {
      name: 'invalid immutable commit representation',
      override: { evidenceCommit: 'not-a-commit' },
      error: 'INVALID_IMMUTABLE_REFERENCE'
    },
    {
      name: 'nonexistent immutable commit',
      override: { evidenceCommit: '0'.repeat(40) },
      error: 'IMMUTABLE_REFERENCE_UNRESOLVED'
    },
    {
      name: 'missing immutable artifact path',
      override: { path: '' },
      error: 'INVALID_IMMUTABLE_PATH'
    },
    {
      name: 'invalid artifact path representation',
      override: { path: '../not-an-evidence-path.json' },
      error: 'INVALID_IMMUTABLE_PATH'
    },
    {
      name: 'nonexistent artifact path',
      override: {
        path: 'docs/governance/sir-02/operational-evidence/oe-01/NO-SUCH-ARTIFACT-v1.0.json'
      },
      error: 'IMMUTABLE_REFERENCE_UNRESOLVED'
    },
    {
      name: 'commit and path mismatch',
      override: { evidenceCommit: ACCEPTED_INPUTS[1]?.evidenceCommit ?? '' },
      error: 'EVIDENCE_NOT_ACCEPTED'
    }
  ])('rejects $name without substituting evidence', ({ override, error }) => {
    const altered = ACCEPTED_INPUTS.map((entry) =>
      entry.id === 'SIR02-KM-OE-01' ? { ...entry, ...override } : entry
    );
    expect(() => loadAcceptedEvidence(altered)).toThrow(error);
  });

  it('never infers successor approval or selects the newest conflicting record', () => {
    versionAt(derived, 1).approvalState = 'approved';
    versionAt(derived, 1).approvalRef = null;
    derived.currentVersion = 'v1.0';
    const result = run();
    expect(result.decision).toBe('Blocked / Fail Closed');
    expect(result.approvedVersions).toEqual([]);
    expect(result.discrepancies.map((entry) => entry.code)).toContain('APPROVAL_STATE_CONFLICT');
    expect(result.discrepancies.map((entry) => entry.code)).toContain('CURRENT_VERSION_CONFLICT');
  });
});
