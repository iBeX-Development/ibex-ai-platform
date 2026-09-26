import { createHash } from 'node:crypto';
import {
  ACCEPTED_INPUTS,
  OE09_NAMESPACE,
  OE09_SCHEMA,
  OE09_TENANT_A,
  OE09_TENANT_B,
  loadAcceptedEvidence,
  type ImmutableEvidenceInput
} from './sir02-km-oe09-reconciliation-fixture.js';

type Evidence = ReturnType<typeof loadAcceptedEvidence>;
type RecordValue = Record<string, unknown>;
type MutableEvidenceInput = {
  -readonly [Key in keyof ImmutableEvidenceInput]: ImmutableEvidenceInput[Key];
};
type PortName =
  | 'parsingChunking'
  | 'embedding'
  | 'indexing'
  | 'vectorStorage'
  | 'retrievalPreparation'
  | 'otherKnowledgeProcessing';

export const OE11_NAMESPACE = OE09_NAMESPACE;
export const OE11_SCHEMA = OE09_SCHEMA;
export const OE11_TENANT_A = OE09_TENANT_A;
export const OE11_TENANT_B = OE09_TENANT_B;
export const OE11_EVALUATION_TIME = '2026-09-26T00:00:00Z';

const portNames: readonly PortName[] = [
  'parsingChunking',
  'embedding',
  'indexing',
  'vectorStorage',
  'retrievalPreparation',
  'otherKnowledgeProcessing'
];
const commitPattern = /^[a-f0-9]{40}$/u;
const hashPattern = /^[a-f0-9]{64}$/u;
const validId = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.trim() !== '' &&
  !/[?*]/u.test(value) &&
  !['all', 'global', 'any'].includes(value.toLowerCase());
const validUtc = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(value) &&
  !Number.isNaN(Date.parse(value));

const object = (value: unknown): RecordValue | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as RecordValue)
    : null;
const valueAt = (source: unknown, ...path: string[]): unknown =>
  path.reduce<unknown>((current, key) => object(current)?.[key], source);
const textAt = (source: unknown, ...path: string[]): string | null => {
  const value = valueAt(source, ...path);
  return typeof value === 'string' ? value : null;
};
const listAt = (source: unknown, ...path: string[]): unknown[] | null => {
  const value = valueAt(source, ...path);
  return Array.isArray(value) ? value : null;
};

class Denial extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
const requireId = (value: unknown, code: string): string => {
  if (!validId(value)) throw new Denial(code);
  return value;
};
const requireHash = (value: unknown, code: string): string => {
  if (typeof value !== 'string' || !hashPattern.test(value)) throw new Denial(code);
  return value;
};
const same = (actual: unknown, expected: unknown, code: string): void => {
  if (actual !== expected) throw new Denial(code);
};

export interface ProcessingCallCounters {
  parsingChunking: number;
  embedding: number;
  indexing: number;
  vectorStorage: number;
  retrievalPreparation: number;
  otherKnowledgeProcessing: number;
}

export interface ProcessingSpies {
  readonly ports: Record<PortName, () => void>;
  snapshot(): ProcessingCallCounters;
  reset(): void;
}

export function createProcessingSpies(): ProcessingSpies {
  const calls: ProcessingCallCounters = {
    parsingChunking: 0,
    embedding: 0,
    indexing: 0,
    vectorStorage: 0,
    retrievalPreparation: 0,
    otherKnowledgeProcessing: 0
  };
  const ports = {} as Record<PortName, () => void>;
  for (const name of portNames)
    ports[name] = () => {
      calls[name] += 1;
    };
  return {
    ports,
    snapshot: () => ({ ...calls }),
    reset: () => {
      for (const name of portNames) calls[name] = 0;
    }
  };
}

export interface ValidationRequest {
  tenantId: string;
  registrationId: string;
  sourceId: string;
  version: string;
  correlationId: string;
  untrustedApproval?: unknown;
  untrustedProvenance?: unknown;
}

export interface FixtureState {
  inputs: Evidence;
  manifest: MutableEvidenceInput[];
  request: ValidationRequest;
  injected: {
    registry: unknown[];
    approvals: unknown[];
    provenance: unknown[];
  };
  spies: ProcessingSpies;
  auditEvents: AuditResult[];
  disposed: boolean;
}

export interface AuditResult {
  eventType: 'km_lifecycle_evidence_validated';
  eventTimestamp: typeof OE11_EVALUATION_TIME;
  actorId: 'sir02-test-validator';
  tenantScope: string;
  requestId: string;
  correlationId: string;
  traceId: string;
  outcome: 'Blocked / Fail Closed' | 'Valid / Non-Operational Test State';
  reasonCodes: string[];
  inputReferenceIds: string[];
  protectedFieldsDisclosed: number;
  processingCalls: ProcessingCallCounters;
}

export interface ValidationResult {
  decision: 'Blocked / Fail Closed' | 'Valid / Non-Operational Test State';
  reasonCodes: string[];
  callerVisible: {
    decision: 'Blocked / Fail Closed' | 'Valid / Non-Operational Test State';
    reason: 'KNOWLEDGE_SOURCE_DENIED' | 'VALIDATION_ONLY';
    correlationId: string;
  };
  protectedFieldsDisclosed: number;
  processingCalls: ProcessingCallCounters;
  audit: AuditResult;
  artifactCount: 0;
  cleanup: 'Passed';
  namespace: typeof OE11_NAMESPACE;
  schema: typeof OE11_SCHEMA;
  classification: 'Synthetic';
}

export class FixtureExecutionFailure extends AggregateError {
  readonly cleanup = 'Failed' as const;

  constructor(
    readonly primaryError: unknown,
    readonly cleanupError: unknown
  ) {
    super(
      primaryError === null ? [cleanupError] : [primaryError, cleanupError],
      'OE11_CLEANUP_FAILED'
    );
    this.name = 'FixtureExecutionFailure';
  }
}

export function loadOe11Inputs(): Evidence {
  // The accepted OE-09 loader verifies every immutable artifact, checksum, review,
  // schema, namespace, and synthetic classification. It is imported read-only.
  return loadAcceptedEvidence();
}

export function createFixture(accepted: Evidence): FixtureState {
  const registration = valueAt(accepted['SIR02-KM-OE-01'], 'source_registration');
  return {
    inputs: structuredClone(accepted),
    manifest: ACCEPTED_INPUTS.map((entry) => ({ ...entry })),
    request: {
      tenantId: OE11_TENANT_A,
      registrationId: textAt(registration, 'registration_id') ?? '',
      sourceId: textAt(registration, 'source_id') ?? '',
      version: textAt(registration, 'source_version', 'source_version') ?? '',
      correlationId: 'sir02-oe11-test-correlation'
    },
    injected: { registry: [], approvals: [], provenance: [] },
    spies: createProcessingSpies(),
    auditEvents: [],
    disposed: false
  };
}

// Exposes only in-memory copies for deterministic negative mutations in tests.
export function recordAt(state: FixtureState, number: string, ...path: string[]): RecordValue {
  const record = object(valueAt(state.inputs[`SIR02-KM-OE-${number}`], ...path));
  if (!record) throw new Error(`MISSING_TEST_RECORD:${number}:${path.join('.')}`);
  return record;
}

interface RegistryFact {
  registrationId: string;
  sourceId: string;
  tenantId: string;
  ownerId: string;
  version: string;
  checksum: string;
}
interface ApprovalFact {
  version: string;
  tenantId: string;
  sourceId: string;
  ownerId: string;
  checksum: string;
  approverId: string;
  timestamp: string;
  reviewCommit: string;
}
interface ProvenanceFact {
  registrationId: string;
  sourceId: string;
  tenantId: string;
  ownerId: string;
  version: string;
  checksum: string;
  origin: string;
  root: string;
  approvalReviewCommit: string;
}

export function resolveRegistry(state: FixtureState): RegistryFact {
  if (state.injected.registry.length !== 0) throw new Denial('AMBIGUOUS_AUTHORITATIVE_STATE');
  const registration = valueAt(state.inputs['SIR02-KM-OE-01'], 'source_registration');
  const binding = valueAt(state.inputs['SIR02-KM-OE-02'], 'binding_manifest');
  const lineage = valueAt(state.inputs['SIR02-KM-OE-04'], 'lineage_evidence');
  const registrationId = requireId(
    valueAt(registration, 'registration_id'),
    'REGISTRATION_MISSING'
  );
  const sourceId = requireId(valueAt(registration, 'source_id'), 'SOURCE_ID_MISSING');
  const tenantId = requireId(
    valueAt(registration, 'tenant_binding', 'synthetic_tenant_id'),
    'TENANT_BINDING_MISSING'
  );
  const ownerId = requireId(
    valueAt(registration, 'source_owner', 'source_owner_id'),
    'OWNER_BINDING_MISSING'
  );
  const version = requireId(
    valueAt(registration, 'source_version', 'source_version'),
    'VERSION_MISSING'
  );
  const checksum = requireHash(
    valueAt(registration, 'source_version', 'content_checksum'),
    'CONTENT_CHECKSUM_INVALID'
  );
  const tenantBindings = listAt(binding, 'tenant_bindings');
  const ownerBindings = listAt(binding, 'owner_bindings');
  if (tenantBindings?.length !== 1) throw new Denial('TENANT_BINDING_MISSING');
  if (ownerBindings?.length !== 1) throw new Denial('OWNER_BINDING_MISSING');
  same(valueAt(tenantBindings[0], 'tenant_id'), tenantId, 'TENANT_BINDING_CONFLICT');
  same(valueAt(ownerBindings[0], 'owner_id'), ownerId, 'OWNER_BINDING_CONFLICT');
  same(valueAt(lineage, 'source_registration_id'), registrationId, 'REGISTRATION_CONFLICT');
  same(valueAt(lineage, 'canonical_source_id'), sourceId, 'SOURCE_ID_CONFLICT');
  same(valueAt(lineage, 'tenant_id'), tenantId, 'TENANT_BINDING_CONFLICT');
  same(valueAt(lineage, 'source_owner'), ownerId, 'OWNER_BINDING_CONFLICT');
  same(valueAt(lineage, 'approved_source_version'), version, 'VERSION_CONFLICT');
  const nodes = listAt(lineage, 'version_nodes');
  if (!nodes || nodes.filter((node) => valueAt(node, 'version') === version).length !== 1)
    throw new Denial('VERSION_UNKNOWN_OR_AMBIGUOUS');
  const root = nodes.find((node) => valueAt(node, 'version') === version);
  same(valueAt(root, 'content_checksum'), checksum, 'CONTENT_CHECKSUM_CONFLICT');
  same(valueAt(root, 'tenant_id'), tenantId, 'TENANT_BINDING_CONFLICT');
  same(valueAt(root, 'owner_id'), ownerId, 'OWNER_BINDING_CONFLICT');
  return { registrationId, sourceId, tenantId, ownerId, version, checksum };
}

export function resolveApproval(state: FixtureState): ApprovalFact {
  if (state.injected.approvals.length !== 0) throw new Denial('CONFLICTING_APPROVAL_RECORDS');
  const approval = valueAt(state.inputs['SIR02-KM-OE-03'], 'original_approval_event');
  if (!object(approval)) throw new Denial('APPROVAL_RECORD_MISSING');
  if (valueAt(approval, 'approval_decision') !== 'Approved')
    throw new Denial('APPROVAL_DECISION_MISSING_OR_INVALID');
  const approverId = requireId(
    valueAt(approval, 'approver_identity', 'approver_id'),
    'APPROVER_ID_MISSING'
  );
  const context = valueAt(approval, 'approver_authorization_context');
  if (!object(context)) throw new Denial('APPROVER_AUTHORITY_MISSING');
  const role = requireId(valueAt(context, 'role'), 'APPROVER_AUTHORITY_MISSING');
  const authorityRef = requireId(
    valueAt(context, 'authority_reference'),
    'APPROVER_AUTHORITY_MISSING'
  );
  if (
    role !== 'synthetic-knowledge-source-approver' ||
    authorityRef !== '84a05702b744a6a710644299381e30e9a9a7aefb' ||
    valueAt(context, 'approval_scope') !== 'exact-source-version' ||
    valueAt(context, 'decision_origin') !== 'authorized-synthetic-human' ||
    valueAt(approval, 'approver_identity', 'wildcard') !== false
  )
    throw new Denial('APPROVER_AUTHORITY_INVALID');
  const version = requireId(valueAt(approval, 'source_version'), 'APPROVAL_VERSION_MISSING');
  const tenantId = requireId(valueAt(approval, 'tenant_id'), 'APPROVAL_TENANT_INVALID');
  const sourceId = requireId(valueAt(approval, 'source_id'), 'APPROVAL_SOURCE_INVALID');
  const ownerId = requireId(valueAt(approval, 'source_owner'), 'APPROVAL_OWNER_INVALID');
  const checksum = requireHash(
    valueAt(approval, 'source_content_checksum'),
    'APPROVAL_CHECKSUM_INVALID'
  );
  same(valueAt(context, 'tenant_id'), tenantId, 'APPROVER_AUTHORITY_INVALID');
  same(valueAt(context, 'source_id'), sourceId, 'APPROVER_AUTHORITY_INVALID');
  same(valueAt(context, 'source_version'), version, 'APPROVER_AUTHORITY_INVALID');
  same(valueAt(context, 'source_checksum'), checksum, 'APPROVER_AUTHORITY_INVALID');
  const timestamp = valueAt(approval, 'original_approval_event_timestamp');
  if (!validUtc(timestamp)) throw new Denial('APPROVAL_CHRONOLOGY_INVALID');
  if (valueAt(approval, 'reconstructed_from_prior_approved_event') !== true)
    throw new Denial('APPROVAL_EVENT_INVALID');
  if (valueAt(approval, 'new_approval_event_created') !== false)
    throw new Denial('DUPLICATE_APPROVAL_EVENT');
  const reviewCommit = ACCEPTED_INPUTS.find((entry) => entry.id === 'SIR02-KM-OE-03')?.reviewCommit;
  if (!reviewCommit) throw new Denial('APPROVAL_REFERENCE_MISSING');
  return { version, tenantId, sourceId, ownerId, checksum, approverId, timestamp, reviewCommit };
}

export function resolveProvenance(state: FixtureState): ProvenanceFact {
  if (state.injected.provenance.length !== 0) throw new Denial('CONFLICTING_PROVENANCE_RECORDS');
  const provenance = valueAt(state.inputs['SIR02-KM-OE-05'], 'provenance_record');
  const lineage = valueAt(state.inputs['SIR02-KM-OE-04'], 'lineage_evidence');
  const provenanceId = requireId(
    valueAt(provenance, 'provenance_record_id'),
    'PROVENANCE_REFERENCE_MISSING'
  );
  if (!provenanceId.startsWith('sir02-km-provenance-'))
    throw new Denial('PROVENANCE_REFERENCE_INVALID');
  const origin = requireId(
    valueAt(provenance, 'original_source_origin_reference'),
    'PROVENANCE_ORIGIN_MISSING'
  );
  const root = requireId(valueAt(provenance, 'lineage_root_id'), 'LINEAGE_ROOT_MISSING');
  same(valueAt(lineage, 'lineage_root_identifier'), root, 'LINEAGE_ROOT_CONFLICT');
  const hops = listAt(provenance, 'immutable_repository_evidence_references');
  if (!hops || hops.length !== 4) throw new Denial('PROVENANCE_CHAIN_BROKEN');
  for (const [index, hop] of hops.entries()) {
    const pinned = ACCEPTED_INPUTS[index];
    if (
      !pinned ||
      valueAt(hop, 'sequence') !== index + 1 ||
      valueAt(hop, 'evidence_id') !== pinned.id ||
      valueAt(hop, 'commit') !== pinned.evidenceCommit ||
      valueAt(hop, 'review_commit') !== pinned.reviewCommit ||
      valueAt(hop, 'artifact_sha256') !== pinned.sha256
    )
      throw new Denial('PROVENANCE_CHAIN_BROKEN');
  }
  const version = requireId(valueAt(provenance, 'source_version'), 'PROVENANCE_VERSION_INVALID');
  const tenantId = requireId(valueAt(provenance, 'tenant_id'), 'PROVENANCE_TENANT_INVALID');
  const sourceId = requireId(
    valueAt(provenance, 'canonical_source_id'),
    'PROVENANCE_SOURCE_INVALID'
  );
  const ownerId = requireId(valueAt(provenance, 'source_owner'), 'PROVENANCE_OWNER_INVALID');
  const registrationId = requireId(
    valueAt(provenance, 'source_registration_id'),
    'PROVENANCE_REGISTRATION_INVALID'
  );
  const checksum = requireHash(
    valueAt(provenance, 'source_content_checksum'),
    'PROVENANCE_CHECKSUM_INVALID'
  );
  const approvalReviewCommit = requireId(
    valueAt(provenance, 'approval_record_reference', 'immutable_review_commit'),
    'PROVENANCE_APPROVAL_REFERENCE_MISSING'
  );
  same(
    valueAt(provenance, 'approval_record_reference', 'approved_version'),
    version,
    'PROVENANCE_APPROVAL_VERSION_CONFLICT'
  );
  same(
    valueAt(provenance, 'approval_record_reference', 'approved_checksum'),
    checksum,
    'PROVENANCE_APPROVAL_CHECKSUM_CONFLICT'
  );
  same(
    valueAt(lineage, 'provenance_source_origin_reference'),
    origin,
    'PROVENANCE_ORIGIN_CONFLICT'
  );
  same(valueAt(lineage, 'approved_source_version'), version, 'PROVENANCE_VERSION_CONFLICT');
  return {
    registrationId,
    sourceId,
    tenantId,
    ownerId,
    version,
    checksum,
    origin,
    root,
    approvalReviewCommit
  };
}

function validateManifest(manifest: readonly ImmutableEvidenceInput[]): void {
  if (manifest.length !== ACCEPTED_INPUTS.length) throw new Denial('IMMUTABLE_MANIFEST_INCOMPLETE');
  for (const [index, expected] of ACCEPTED_INPUTS.entries()) {
    const actual = manifest[index];
    if (!actual || actual.id !== expected.id) throw new Denial('IMMUTABLE_REFERENCE_INVALID');
    if (!commitPattern.test(actual.evidenceCommit) || !commitPattern.test(actual.reviewCommit))
      throw new Denial('IMMUTABLE_REFERENCE_INVALID');
    if (!actual.path) throw new Denial('IMMUTABLE_PATH_MISSING');
    if (!hashPattern.test(actual.sha256)) throw new Denial('IMMUTABLE_CHECKSUM_INVALID');
    if (
      actual.evidenceCommit !== expected.evidenceCommit ||
      actual.reviewCommit !== expected.reviewCommit ||
      actual.path !== expected.path ||
      actual.sha256 !== expected.sha256
    )
      throw new Denial('IMMUTABLE_REFERENCE_MISMATCH');
  }
}

function validate(state: FixtureState): void {
  if (state.disposed) throw new Error('TEST_FIXTURE_DISPOSED');
  validateManifest(state.manifest);
  const { request } = state;
  if (request.tenantId !== OE11_TENANT_A) throw new Denial('TENANT_ACCESS_DENIED');
  requireId(request.registrationId, 'REGISTRATION_MISSING');
  requireId(request.sourceId, 'SOURCE_ID_MISSING');
  requireId(request.version, 'VERSION_MISSING');
  if (request.untrustedApproval !== undefined || request.untrustedProvenance !== undefined)
    throw new Denial('UNTRUSTED_AUTHORITY_ASSERTION');
  const registry = resolveRegistry(state);
  same(request.registrationId, registry.registrationId, 'REGISTRATION_CONFLICT');
  same(request.sourceId, registry.sourceId, 'SOURCE_ID_CONFLICT');
  same(request.version, registry.version, 'VERSION_UNKNOWN_OR_AMBIGUOUS');
  same(registry.tenantId, request.tenantId, 'TENANT_ACCESS_DENIED');
  const approval = resolveApproval(state);
  same(approval.tenantId, registry.tenantId, 'APPROVAL_TENANT_CONFLICT');
  same(approval.sourceId, registry.sourceId, 'APPROVAL_SOURCE_CONFLICT');
  same(approval.ownerId, registry.ownerId, 'APPROVAL_OWNER_CONFLICT');
  same(approval.version, registry.version, 'APPROVAL_VERSION_CONFLICT');
  same(approval.checksum, registry.checksum, 'APPROVAL_CHECKSUM_CONFLICT');
  same(
    approval.timestamp,
    valueAt(state.inputs['SIR02-KM-OE-01'], 'source_registration', 'approval', 'decision_at'),
    'APPROVAL_CHRONOLOGY_CONFLICT'
  );
  same(
    approval.approverId,
    valueAt(state.inputs['SIR02-KM-OE-01'], 'source_registration', 'approval', 'approver_id'),
    'APPROVER_ID_CONFLICT'
  );
  const provenance = resolveProvenance(state);
  same(provenance.registrationId, registry.registrationId, 'PROVENANCE_REGISTRATION_CONFLICT');
  same(provenance.sourceId, registry.sourceId, 'PROVENANCE_SOURCE_CONFLICT');
  same(provenance.tenantId, registry.tenantId, 'PROVENANCE_TENANT_CONFLICT');
  same(provenance.ownerId, registry.ownerId, 'PROVENANCE_OWNER_CONFLICT');
  same(provenance.version, registry.version, 'PROVENANCE_VERSION_CONFLICT');
  same(provenance.checksum, registry.checksum, 'PROVENANCE_CHECKSUM_CONFLICT');
  same(provenance.approvalReviewCommit, approval.reviewCommit, 'PROVENANCE_APPROVAL_CONFLICT');
  same(
    provenance.origin,
    valueAt(
      state.inputs['SIR02-KM-OE-01'],
      'source_registration',
      'provenance',
      'authoritative_origin_ref'
    ),
    'PROVENANCE_ORIGIN_CONFLICT'
  );
  // A valid historical v1.0 approval remains non-active after OE-06 and OE-07.
  same(
    valueAt(state.inputs['SIR02-KM-OE-07'], 'quarantine_record', 'source_version'),
    registry.version,
    'QUARANTINE_VERSION_CONFLICT'
  );
  same(
    valueAt(state.inputs['SIR02-KM-OE-07'], 'quarantine_record', 'quarantine_state'),
    'quarantined-stale-superseded-test-only',
    'QUARANTINE_STATE_CONFLICT'
  );
}

function protectedFieldCount(publicOutput: string, accepted: Evidence): number {
  const registration = valueAt(accepted['SIR02-KM-OE-01'], 'source_registration');
  const protectedValues = [
    textAt(registration, 'registration_id'),
    textAt(registration, 'source_id'),
    textAt(registration, 'tenant_binding', 'synthetic_tenant_id'),
    textAt(registration, 'source_owner', 'source_owner_id'),
    textAt(registration, 'source_version', 'source_version'),
    textAt(registration, 'source_version', 'content_checksum'),
    textAt(registration, 'provenance', 'authoritative_origin_ref')
  ];
  return [...new Set(protectedValues)].filter(
    (value) => typeof value === 'string' && value.length > 0 && publicOutput.includes(value)
  ).length;
}

function cleanup(state: FixtureState): 'Passed' {
  const failures: unknown[] = [];
  const attempt = (action: () => void): void => {
    try {
      action();
    } catch (error) {
      failures.push(error);
    }
  };

  attempt(() => {
    state.inputs = {};
  });
  attempt(() => {
    state.manifest.splice(0);
  });
  attempt(() => {
    state.injected.registry.splice(0);
  });
  attempt(() => {
    state.injected.approvals.splice(0);
  });
  attempt(() => {
    state.injected.provenance.splice(0);
  });
  attempt(() => {
    state.auditEvents.splice(0);
  });
  attempt(() => {
    state.request.tenantId = '';
    state.request.registrationId = '';
    state.request.sourceId = '';
    state.request.version = '';
    state.request.correlationId = '';
    delete state.request.untrustedApproval;
    delete state.request.untrustedProvenance;
  });
  attempt(() => {
    state.request = {
      tenantId: '',
      registrationId: '',
      sourceId: '',
      version: '',
      correlationId: ''
    };
  });
  attempt(() => {
    state.spies.reset();
  });
  attempt(() => {
    state.spies = createProcessingSpies();
  });
  state.disposed = true;
  if (failures.length !== 0) throw new AggregateError(failures, 'OE11_CLEANUP_STEP_FAILED');
  return 'Passed';
}

export function executeValidation(state: FixtureState, accepted: Evidence): ValidationResult {
  let result: Omit<ValidationResult, 'cleanup'> | undefined;
  let primaryError: unknown;
  let primaryFailed = false;
  let cleanupError: unknown;
  let cleanupFailed = false;
  try {
    let decision: ValidationResult['decision'] = 'Valid / Non-Operational Test State';
    let reasonCodes: string[] = [];
    try {
      validate(state);
    } catch (error) {
      if (!(error instanceof Denial)) throw error;
      decision = 'Blocked / Fail Closed';
      reasonCodes = [error.code];
    }
    const counts = state.spies.snapshot();
    if (portNames.some((name) => counts[name] !== 0)) throw new Error('DOWNSTREAM_PROCESSING_CALL');
    const correlationId = `sir02-oe11-${createHash('sha256')
      .update(state.request.correlationId)
      .digest('hex')
      .slice(0, 16)}`;
    const callerVisible = {
      decision,
      reason: decision === 'Blocked / Fail Closed' ? 'KNOWLEDGE_SOURCE_DENIED' : 'VALIDATION_ONLY',
      correlationId
    } as const;
    const protectedFieldsDisclosed = protectedFieldCount(JSON.stringify(callerVisible), accepted);
    if (protectedFieldsDisclosed !== 0) throw new Error('PROTECTED_FIELD_DISCLOSURE');
    const audit: AuditResult = {
      eventType: 'km_lifecycle_evidence_validated',
      eventTimestamp: OE11_EVALUATION_TIME,
      actorId: 'sir02-test-validator',
      tenantScope: state.request.tenantId === OE11_TENANT_B ? OE11_TENANT_B : OE11_TENANT_A,
      requestId: `${correlationId}-request`,
      correlationId,
      traceId: `${correlationId}-trace`,
      outcome: decision,
      reasonCodes,
      inputReferenceIds:
        state.request.tenantId === OE11_TENANT_B ? [] : state.manifest.map((entry) => entry.id),
      protectedFieldsDisclosed,
      processingCalls: counts
    };
    state.auditEvents.push(audit);
    if (state.auditEvents.length !== 1) throw new Error('AUDIT_EVENT_MISSING_OR_DUPLICATE');
    result = {
      decision,
      reasonCodes,
      callerVisible,
      protectedFieldsDisclosed,
      processingCalls: counts,
      audit,
      artifactCount: 0,
      namespace: OE11_NAMESPACE,
      schema: OE11_SCHEMA,
      classification: 'Synthetic'
    };
  } catch (error) {
    primaryError = error;
    primaryFailed = true;
  } finally {
    try {
      cleanup(state);
    } catch (error) {
      cleanupError = error;
      cleanupFailed = true;
    }
  }
  if (cleanupFailed)
    throw new FixtureExecutionFailure(primaryFailed ? primaryError : null, cleanupError);
  if (primaryFailed) throw primaryError;
  if (!result) throw new Error('OE11_VALIDATION_RESULT_MISSING');
  return { ...result, cleanup: 'Passed' };
}
