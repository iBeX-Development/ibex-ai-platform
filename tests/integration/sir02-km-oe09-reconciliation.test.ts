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
      byCode: {}
    });
    expect(result.audit.knowledgeProcessingCalls).toBe(0);
    expect(result.audit.foreignTenantFieldsDisclosed).toBe(0);
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
    expect(result.currentVersion).toBeNull();
    expect(result.activeVersions).toEqual([]);
    expect(result.audit.reasonCodes).toEqual(result.discrepancies.map((entry) => entry.code));
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
