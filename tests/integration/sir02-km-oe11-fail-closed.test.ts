import { beforeAll, describe, expect, it } from 'vitest';
import {
  OE11_NAMESPACE,
  OE11_SCHEMA,
  OE11_TENANT_A,
  OE11_TENANT_B,
  createFixture,
  createProcessingSpies,
  executeValidation,
  loadOe11Inputs,
  recordAt,
  type FixtureState,
  type ProcessingCallCounters
} from '../testing/sir02-km-oe11-fail-closed-fixture.js';

type Accepted = ReturnType<typeof loadOe11Inputs>;
interface NegativeCase {
  id: string;
  label: string;
  mutate: (state: FixtureState) => void;
}

const zeroCalls: ProcessingCallCounters = {
  parsingChunking: 0,
  embedding: 0,
  indexing: 0,
  vectorStorage: 0,
  retrievalPreparation: 0,
  otherKnowledgeProcessing: 0
};

function firstManifest(state: FixtureState): (typeof state.manifest)[number] {
  const item = state.manifest[0];
  if (!item) throw new Error('MISSING_TEST_MANIFEST');
  return item;
}
function firstHop(state: FixtureState): Record<string, unknown> {
  const hops = recordAt(state, '05', 'provenance_record').immutable_repository_evidence_references;
  if (!Array.isArray(hops) || typeof hops[0] !== 'object' || hops[0] === null)
    throw new Error('MISSING_TEST_HOP');
  return hops[0] as Record<string, unknown>;
}

const negativeCases: NegativeCase[] = [
  {
    id: 'N01',
    label: 'missing approval record',
    mutate: (s) => {
      delete recordAt(s, '03').original_approval_event;
    }
  },
  {
    id: 'N02',
    label: 'missing approval decision',
    mutate: (s) => {
      delete recordAt(s, '03', 'original_approval_event').approval_decision;
    }
  },
  {
    id: 'N03',
    label: 'missing approver identity',
    mutate: (s) => {
      delete recordAt(s, '03', 'original_approval_event', 'approver_identity').approver_id;
    }
  },
  {
    id: 'N04',
    label: 'missing approver authorization context',
    mutate: (s) => {
      delete recordAt(s, '03', 'original_approval_event').approver_authorization_context;
    }
  },
  {
    id: 'N04',
    label: 'untrusted approver authorization context',
    mutate: (s) =>
      void (recordAt(s, '03', 'original_approval_event', 'approver_authorization_context').role =
        'caller')
  },
  {
    id: 'N05',
    label: 'missing source version',
    mutate: (s) => {
      delete recordAt(s, '01', 'source_registration', 'source_version').source_version;
    }
  },
  { id: 'N06', label: 'unknown source version', mutate: (s) => void (s.request.version = 'v9.9') },
  {
    id: 'N07',
    label: 'missing provenance origin',
    mutate: (s) => {
      delete recordAt(s, '05', 'provenance_record').original_source_origin_reference;
    }
  },
  {
    id: 'N08',
    label: 'missing provenance reference',
    mutate: (s) => {
      delete recordAt(s, '05', 'provenance_record').provenance_record_id;
    }
  },
  {
    id: 'N09',
    label: 'broken provenance hop',
    mutate: (s) => void (firstHop(s).commit = 'f'.repeat(40))
  },
  {
    id: 'N10',
    label: 'missing lineage root',
    mutate: (s) => {
      delete recordAt(s, '05', 'provenance_record').lineage_root_id;
    }
  },
  {
    id: 'N11',
    label: 'missing source checksum',
    mutate: (s) => {
      delete recordAt(s, '01', 'source_registration', 'source_version').content_checksum;
    }
  },
  {
    id: 'N12',
    label: 'invalid source checksum',
    mutate: (s) =>
      void (recordAt(s, '01', 'source_registration', 'source_version').content_checksum = 'bad')
  },
  {
    id: 'N12',
    label: 'mismatched source checksum',
    mutate: (s) =>
      void (recordAt(s, '01', 'source_registration', 'source_version').content_checksum =
        'f'.repeat(64))
  },
  {
    id: 'N13',
    label: 'missing immutable commit',
    mutate: (s) => void (firstManifest(s).evidenceCommit = '')
  },
  {
    id: 'N13',
    label: 'invalid immutable commit',
    mutate: (s) => void (firstManifest(s).evidenceCommit = 'invalid-commit')
  },
  {
    id: 'N14',
    label: 'missing immutable artifact path',
    mutate: (s) => void (firstManifest(s).path = '')
  },
  {
    id: 'N14',
    label: 'invalid immutable artifact path',
    mutate: (s) => void (firstManifest(s).path = 'docs/invalid-artifact.json')
  },
  {
    id: 'N15',
    label: 'conflicting approval record',
    mutate: (s) => void s.injected.approvals.push({ decision: 'Rejected' })
  },
  {
    id: 'N15',
    label: 'conflicting version record',
    mutate: (s) => void s.injected.registry.push({ version: 'v9.9' })
  },
  {
    id: 'N15',
    label: 'conflicting provenance record',
    mutate: (s) => void s.injected.provenance.push({ origin: 'synthetic://conflict' })
  },
  {
    id: 'N16',
    label: 'wildcard approval identifier',
    mutate: (s) =>
      void (recordAt(s, '03', 'original_approval_event', 'approver_identity').approver_id = '*')
  },
  {
    id: 'N16',
    label: 'wildcard version identifier',
    mutate: (s) =>
      void (recordAt(s, '01', 'source_registration', 'source_version').source_version = '*')
  },
  {
    id: 'N16',
    label: 'wildcard provenance identifier',
    mutate: (s) => void (recordAt(s, '05', 'provenance_record').provenance_record_id = '*')
  },
  {
    id: 'N17',
    label: 'wrong-tenant approval evidence',
    mutate: (s) => void (recordAt(s, '03', 'original_approval_event').tenant_id = OE11_TENANT_B)
  },
  {
    id: 'N17',
    label: 'wrong-tenant version evidence',
    mutate: (s) => void (recordAt(s, '04', 'lineage_evidence').tenant_id = OE11_TENANT_B)
  },
  {
    id: 'N17',
    label: 'wrong-tenant provenance evidence',
    mutate: (s) => void (recordAt(s, '05', 'provenance_record').tenant_id = OE11_TENANT_B)
  },
  {
    id: 'N18',
    label: 'Tenant B attempts to use Tenant A evidence',
    mutate: (s) => void (s.request.tenantId = OE11_TENANT_B)
  },
  {
    id: 'N19',
    label: 'caller-supplied approval assertion',
    mutate: (s) => void (s.request.untrustedApproval = { decision: 'Approved' })
  },
  {
    id: 'N19',
    label: 'AI-supplied provenance assertion',
    mutate: (s) => void (s.request.untrustedProvenance = { origin: 'synthetic://claimed' })
  },
  {
    id: 'N20',
    label: 'ambiguous authoritative state',
    mutate: (s) => void s.injected.registry.push({ version: 'v1.0' }, { version: 'v1.0' })
  },
  {
    id: 'N21',
    label: 'missing tenant binding',
    mutate: (s) => {
      delete recordAt(s, '01', 'source_registration', 'tenant_binding').synthetic_tenant_id;
    }
  },
  {
    id: 'N22',
    label: 'missing owner binding',
    mutate: (s) => {
      delete recordAt(s, '01', 'source_registration', 'source_owner').source_owner_id;
    }
  }
];

const expectedReasonByCase: Record<string, string> = {
  'missing approval record': 'APPROVAL_RECORD_MISSING',
  'missing approval decision': 'APPROVAL_DECISION_MISSING_OR_INVALID',
  'missing approver identity': 'APPROVER_ID_MISSING',
  'missing approver authorization context': 'APPROVER_AUTHORITY_MISSING',
  'untrusted approver authorization context': 'APPROVER_AUTHORITY_INVALID',
  'missing source version': 'VERSION_MISSING',
  'unknown source version': 'VERSION_UNKNOWN_OR_AMBIGUOUS',
  'missing provenance origin': 'PROVENANCE_ORIGIN_MISSING',
  'missing provenance reference': 'PROVENANCE_REFERENCE_MISSING',
  'broken provenance hop': 'PROVENANCE_CHAIN_BROKEN',
  'missing lineage root': 'LINEAGE_ROOT_MISSING',
  'missing source checksum': 'CONTENT_CHECKSUM_INVALID',
  'invalid source checksum': 'CONTENT_CHECKSUM_INVALID',
  'mismatched source checksum': 'CONTENT_CHECKSUM_CONFLICT',
  'missing immutable commit': 'IMMUTABLE_REFERENCE_INVALID',
  'invalid immutable commit': 'IMMUTABLE_REFERENCE_INVALID',
  'missing immutable artifact path': 'IMMUTABLE_PATH_MISSING',
  'invalid immutable artifact path': 'IMMUTABLE_REFERENCE_MISMATCH',
  'conflicting approval record': 'CONFLICTING_APPROVAL_RECORDS',
  'conflicting version record': 'AMBIGUOUS_AUTHORITATIVE_STATE',
  'conflicting provenance record': 'CONFLICTING_PROVENANCE_RECORDS',
  'wildcard approval identifier': 'APPROVER_ID_MISSING',
  'wildcard version identifier': 'VERSION_MISSING',
  'wildcard provenance identifier': 'PROVENANCE_REFERENCE_MISSING',
  'wrong-tenant approval evidence': 'APPROVER_AUTHORITY_INVALID',
  'wrong-tenant version evidence': 'TENANT_BINDING_CONFLICT',
  'wrong-tenant provenance evidence': 'PROVENANCE_TENANT_CONFLICT',
  'Tenant B attempts to use Tenant A evidence': 'TENANT_ACCESS_DENIED',
  'caller-supplied approval assertion': 'UNTRUSTED_AUTHORITY_ASSERTION',
  'AI-supplied provenance assertion': 'UNTRUSTED_AUTHORITY_ASSERTION',
  'ambiguous authoritative state': 'AMBIGUOUS_AUTHORITATIVE_STATE',
  'missing tenant binding': 'TENANT_BINDING_MISSING',
  'missing owner binding': 'OWNER_BINDING_MISSING'
};

describe('SIR02-KM-OE-11 authorized test-only lifecycle validation fixture', () => {
  let accepted: Accepted;
  let acceptedSnapshot: string;

  beforeAll(() => {
    accepted = loadOe11Inputs();
    acceptedSnapshot = JSON.stringify(accepted);
  });

  it('covers exactly P01 and all 22 designed negative categories with required subcases', () => {
    expect(new Set(negativeCases.map((entry) => entry.id))).toEqual(
      new Set(Array.from({ length: 22 }, (_, index) => `N${String(index + 1).padStart(2, '0')}`))
    );
    expect(Object.keys(expectedReasonByCase)).toHaveLength(negativeCases.length);
    expect(negativeCases.filter((entry) => entry.id === 'N15')).toHaveLength(3);
    expect(negativeCases.filter((entry) => entry.id === 'N16')).toHaveLength(3);
    expect(negativeCases.filter((entry) => entry.id === 'N17')).toHaveLength(3);
    expect(negativeCases.filter((entry) => entry.id === 'N19')).toHaveLength(2);
    for (const id of ['N04', 'N12', 'N13', 'N14'])
      expect(negativeCases.filter((entry) => entry.id === id)).toHaveLength(2);
  });

  it('uses measured no-op processing spies rather than hard-coded counter claims', () => {
    const spies = createProcessingSpies();
    for (const port of Object.values(spies.ports)) port();
    expect(spies.snapshot()).toEqual({
      parsingChunking: 1,
      embedding: 1,
      indexing: 1,
      vectorStorage: 1,
      retrievalPreparation: 1,
      otherKnowledgeProcessing: 1
    });
    spies.reset();
    expect(spies.snapshot()).toEqual(zeroCalls);
  });

  it('P01 validates the complete accepted historical chain without enabling processing', () => {
    const state = createFixture(accepted);
    const result = executeValidation(state, accepted);
    expect(result.decision).toBe('Valid / Non-Operational Test State');
    expect(result.callerVisible.reason).toBe('VALIDATION_ONLY');
    expect(result.reasonCodes).toEqual([]);
    expect(result.processingCalls).toEqual(zeroCalls);
    expect(result.audit.processingCalls).toEqual(zeroCalls);
    expect(result.audit.reasonCodes).toEqual([]);
    expect(state.auditEvents).toHaveLength(0);
    expect(result.artifactCount).toBe(0);
    expect(result.protectedFieldsDisclosed).toBe(0);
    expect(result.cleanup).toBe('Passed');
    expect(result.namespace).toBe(OE11_NAMESPACE);
    expect(result.schema).toBe(OE11_SCHEMA);
    expect(result.classification).toBe('Synthetic');
    expect(state.disposed).toBe(true);
    expect(state.inputs).toEqual({});
    expect(JSON.stringify(accepted)).toBe(acceptedSnapshot);
  });

  it.each(negativeCases)(
    '$id $label fails closed before every processing port',
    ({ label, mutate }) => {
      const state = createFixture(accepted);
      mutate(state);
      const result = executeValidation(state, accepted);
      expect(result.decision).toBe('Blocked / Fail Closed');
      expect(result.reasonCodes).toEqual([expectedReasonByCase[label]]);
      expect(result.callerVisible.correlationId).toMatch(/^sir02-oe11-[a-f0-9]{16}$/u);
      expect(result.callerVisible).toEqual({
        decision: 'Blocked / Fail Closed',
        reason: 'KNOWLEDGE_SOURCE_DENIED',
        correlationId: result.callerVisible.correlationId
      });
      expect(result.processingCalls).toEqual(zeroCalls);
      expect(result.audit.processingCalls).toEqual(zeroCalls);
      expect(result.audit.reasonCodes).toEqual(result.reasonCodes);
      expect(result.audit.eventType).toBe('km_lifecycle_evidence_validated');
      expect(result.audit.outcome).toBe('Blocked / Fail Closed');
      expect(state.auditEvents).toHaveLength(0);
      expect(result.artifactCount).toBe(0);
      expect(result.protectedFieldsDisclosed).toBe(0);
      expect(result.audit.protectedFieldsDisclosed).toBe(0);
      expect(result.cleanup).toBe('Passed');
      expect(state.disposed).toBe(true);
      expect(state.inputs).toEqual({});
      expect(JSON.stringify(accepted)).toBe(acceptedSnapshot);
    }
  );

  it('returns no Tenant A protected lifecycle field to Tenant B', () => {
    const state = createFixture(accepted);
    state.request.tenantId = OE11_TENANT_B;
    const result = executeValidation(state, accepted);
    const visible = JSON.stringify(result.callerVisible);
    expect(result.decision).toBe('Blocked / Fail Closed');
    expect(result.protectedFieldsDisclosed).toBe(0);
    expect(result.audit.inputReferenceIds).toEqual([]);
    expect(result.audit.tenantScope).toBe(OE11_TENANT_B);
    expect(visible).not.toContain(OE11_TENANT_A);
    expect(visible).not.toContain('sir02-km-source-a-001');
    expect(visible).not.toContain('sir02-test-source-owner-a');
  });

  it('returns byte-stable validation results for identical synthetic inputs', () => {
    const first = executeValidation(createFixture(accepted), accepted);
    const second = executeValidation(createFixture(accepted), accepted);
    expect(first).toEqual(second);
    expect(first.audit.correlationId).toBe(first.callerVisible.correlationId);
  });
});
