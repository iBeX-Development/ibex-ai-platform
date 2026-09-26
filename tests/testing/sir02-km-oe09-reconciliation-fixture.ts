import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

type JsonRecord = Record<string, unknown>;

export const OE09_NAMESPACE = 'sir02-km-evidence-v1';
export const OE09_SCHEMA = 'SIR02-KM-EVIDENCE-FIXTURE v1.0';
export const OE09_TENANT_A = 'sir02-test-tenant-a';
export const OE09_TENANT_B = 'sir02-test-tenant-b';

export interface ImmutableEvidenceInput {
  readonly id: string;
  readonly path: string;
  readonly evidenceCommit: string;
  readonly reviewCommit: string;
  readonly sha256: string;
}

const evidenceRoot = 'docs/governance/sir-02/operational-evidence';
const evidenceFile = (number: string, name: string): string =>
  `${evidenceRoot}/oe-${number}/${name}`;

export const ACCEPTED_INPUTS: readonly ImmutableEvidenceInput[] = [
  {
    id: 'SIR02-KM-OE-01',
    path: evidenceFile('01', 'SIR-02-KM-OE-01-APPROVED-SOURCE-REGISTRATION-v1.0.json'),
    evidenceCommit: '44a97a9b387235c67ae70cce24fb32cda0adfe70',
    reviewCommit: 'a33c8220e595fafad317610e94d09d4f21ecc882',
    sha256: 'd60717e22cbcabd58363fafcb177aca8e2e33592464af958540e2a87a2eea38b'
  },
  {
    id: 'SIR02-KM-OE-02',
    path: evidenceFile('02', 'SIR-02-KM-OE-02-SOURCE-OWNER-TENANT-BINDING-v1.0.json'),
    evidenceCommit: '9d4bc50d885e50b4fef8580918398f6764742b74',
    reviewCommit: '3328353ea04298729b6e68ca46061393edce2148',
    sha256: '16c9758d8467d05ee7bb2f640eb9880e21374c94ec170b1a481e3b172e4abc71'
  },
  {
    id: 'SIR02-KM-OE-03',
    path: evidenceFile('03', 'SIR-02-KM-OE-03-SOURCE-APPROVAL-RECONSTRUCTION-0003-v1.0.json'),
    evidenceCommit: '74c8eff31a88ab7de1e693b7dad0ca8e8e91a51a',
    reviewCommit: '77ae9c99b2601ec58a50bd20c772326688268e5d',
    sha256: '5ac5536574a3bca7c3c13af007b7f26e4fe81c621dd5b0ef58d5cd0495edd345'
  },
  {
    id: 'SIR02-KM-OE-04',
    path: evidenceFile('04', 'SIR-02-KM-OE-04-SOURCE-VERSION-LINEAGE-v1.0.json'),
    evidenceCommit: 'eefc0cd3dcb74761af91bd17cfe271e872d88264',
    reviewCommit: 'f5ce491bfe3a98af66031a64b9b9620c3bc51420',
    sha256: 'f41a346e56da9bb5f6661d68eddece8201641ce2991a8e78eae65e2c5cac856f'
  },
  {
    id: 'SIR02-KM-OE-05',
    path: evidenceFile('05', 'SIR-02-KM-OE-05-PROVENANCE-TRACE-v1.0.json'),
    evidenceCommit: 'a46a7018a54f2beb918ed9fe72403a6a769644df',
    reviewCommit: '3e8d3e1bcf24ccbc52a244bb728964e5cbd340a2',
    sha256: '8984b8afaa647c43be312dd65aa8c8ad4a195a74c7fffdd4f0d150850ad64045'
  },
  {
    id: 'SIR02-KM-OE-06',
    path: evidenceFile('06', 'SIR-02-KM-OE-06-SUPERSESSION-TEST-v1.0.json'),
    evidenceCommit: 'f5cd7cc043c3bb99d9a745a1e546e2be30e7ddcc',
    reviewCommit: '6c821280369760a4fc8cdf10b611282ca332dea4',
    sha256: '1e6fd46db60e257c326a56156f2288c0a135ce499760fa6c95d36a6bfc343f43'
  },
  {
    id: 'SIR02-KM-OE-07',
    path: evidenceFile('07', 'SIR-02-KM-OE-07-STALE-CONTENT-QUARANTINE-TEST-v1.0.json'),
    evidenceCommit: '03791c7096adaa0ee5874110f7dae291858efd37',
    reviewCommit: 'b7932b282833487b1a3eb2ccc6d7ca56015740a5',
    sha256: 'c742d695e6ef7609255d39c3caa3ccdb3996115949a276405907484a3b65aef4'
  }
];

export interface InventoryVersion {
  registrationId: string;
  sourceId: string;
  tenantId: string;
  ownerId: string;
  version: string;
  checksum: string;
  approvalState: 'approved' | 'unapproved';
  approvalRef: string | null;
  lineageRoot: string;
  predecessor: string | null;
  provenanceRef: string;
  supersessionState: 'none' | 'superseded' | 'successor';
  supersessionRef: string | null;
  quarantineState: 'none' | 'quarantined';
  quarantineRef: string | null;
  active: boolean;
  withdrawn: boolean;
  createdAt: string;
  approvalAt: string | null;
  supersessionAt: string | null;
  quarantineAt: string | null;
}

export interface Inventory {
  kind: 'authoritative' | 'derived';
  registrationId: string;
  sourceId: string;
  tenantId: string;
  ownerId: string;
  currentVersion: string;
  versions: InventoryVersion[];
  inputRefs: string[];
}

export interface Discrepancy {
  code: string;
  affectedId: string;
  blocked: true;
}

export interface ReconciliationResult {
  decision: 'Reconciled / Non-Operational Test State' | 'Blocked / Fail Closed';
  namespace: typeof OE09_NAMESPACE;
  schema: typeof OE09_SCHEMA;
  reconciliationTimestamp: string;
  sourceId: string;
  registrationId: string;
  currentVersion: string | null;
  approvedVersions: string[];
  unapprovedVersions: string[];
  supersededVersions: string[];
  quarantinedVersions: string[];
  activeVersions: string[];
  discrepancies: Discrepancy[];
  counts: {
    authoritativeVersions: number;
    derivedVersions: number;
    matchedVersions: number;
    discrepancies: number;
    unresolved: number;
    byCode: Record<string, number>;
  };
  audit: {
    requestId: string;
    correlationId: string;
    traceId: string;
    eventType: 'km_source_reconciliation_evaluated';
    tenantScope: string;
    reasonCodes: string[];
    foreignTenantFieldsDisclosed: 0;
    knowledgeProcessingCalls: 0;
  };
}

const object = (value: unknown, label: string): JsonRecord => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`INVALID_EVIDENCE_STRUCTURE:${label}`);
  }
  return value as JsonRecord;
};
const valueAt = (source: unknown, ...path: string[]): unknown =>
  path.reduce<unknown>((current, key) => object(current, path.join('.'))[key], source);
const textAt = (source: unknown, ...path: string[]): string => {
  const value = valueAt(source, ...path);
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`MISSING_EVIDENCE_FIELD:${path.join('.')}`);
  }
  return value;
};
const nullableTextAt = (source: unknown, ...path: string[]): string | null => {
  const value = valueAt(source, ...path);
  return value === null ? null : textAt(source, ...path);
};
const listAt = (source: unknown, ...path: string[]): unknown[] => {
  const value = valueAt(source, ...path);
  if (!Array.isArray(value)) throw new Error(`INVALID_EVIDENCE_LIST:${path.join('.')}`);
  return value;
};
const booleanAt = (source: unknown, ...path: string[]): boolean => {
  const value = valueAt(source, ...path);
  if (typeof value !== 'boolean') throw new Error(`INVALID_EVIDENCE_BOOLEAN:${path.join('.')}`);
  return value;
};
const requireSame = (left: string, right: string, code: string): void => {
  if (left !== right) throw new Error(`UPSTREAM_LIFECYCLE_CONFLICT:${code}`);
};

export function loadAcceptedEvidence(
  manifest: readonly ImmutableEvidenceInput[] = ACCEPTED_INPUTS
): Record<string, JsonRecord> {
  if (manifest.length !== 7 || new Set(manifest.map((item) => item.id)).size !== 7) {
    throw new Error('INCOMPLETE_IMMUTABLE_MANIFEST');
  }
  const loaded: Record<string, JsonRecord> = {};
  for (const item of manifest) {
    if (!/^SIR02-KM-OE-0[1-7]$/.test(item.id) || !/^[a-f0-9]{40}$/.test(item.evidenceCommit)) {
      throw new Error('INVALID_IMMUTABLE_REFERENCE');
    }
    const bytes = execFileSync('git', ['show', `${item.evidenceCommit}:${item.path}`]);
    // Historical .sha256 files were calculated over Windows checkout bytes. Git stores
    // normalized LF blobs; verify only the exact documented LF/CRLF checkout forms.
    const canonical = bytes.toString('utf8');
    const crlf = canonical.replace(/\r?\n/gu, '\r\n');
    const checkoutForms = [bytes, Buffer.from(crlf), Buffer.from(crlf.replace(/\r\n$/u, '\n'))];
    if (
      !checkoutForms.some((form) => createHash('sha256').update(form).digest('hex') === item.sha256)
    ) {
      throw new Error(`IMMUTABLE_CHECKSUM_MISMATCH:${item.id}`);
    }
    const number = item.id.slice(-2);
    const reviewPath = evidenceFile(
      number,
      number === '03'
        ? 'SIR-02-KM-OE-03-INDEPENDENT-REVIEW-0003-v1.0.md'
        : `SIR-02-KM-OE-${number}-INDEPENDENT-REVIEW-v1.0.md`
    );
    const review = execFileSync('git', ['show', `${item.reviewCommit}:${reviewPath}`], {
      encoding: 'utf8'
    });
    if (
      !review.includes(`| Evidence ID | \`${item.id}\``) ||
      !/\| Review result \| `Accepted` \|/.test(review) ||
      !review.includes(item.evidenceCommit) ||
      !review.includes(item.sha256)
    ) {
      throw new Error(`EVIDENCE_NOT_ACCEPTED:${item.id}`);
    }
    const parsed = object(JSON.parse(bytes.toString('utf8')) as unknown, item.id);
    const classification = valueAt(parsed, 'evidence_run', 'test_data_classification');
    const syntheticClassification =
      classification === 'Synthetic' ||
      (Array.isArray(classification) &&
        classification.length > 0 &&
        classification.every(
          (entry) =>
            typeof entry === 'string' &&
            /^(SYNTHETIC_|DETERMINISTIC_|TEST_ONLY_|SANITIZED_TEST_)/u.test(entry)
        ));
    if (
      textAt(parsed, 'evidence_run', 'evidence_id') !== item.id ||
      textAt(parsed, 'evidence_run', 'fixture_schema_id') !== 'SIR02-KM-EVIDENCE-FIXTURE' ||
      textAt(parsed, 'evidence_run', 'fixture_schema_version') !== 'v1.0' ||
      textAt(parsed, 'evidence_run', 'test_namespace') !== OE09_NAMESPACE ||
      !syntheticClassification
    ) {
      throw new Error(`GATE_A_INPUT_MISMATCH:${item.id}`);
    }
    loaded[item.id] = parsed;
  }
  return loaded;
}

const oe = (inputs: Record<string, JsonRecord>, number: string): JsonRecord =>
  object(inputs[`SIR02-KM-OE-${number}`], `OE-${number}`);

// This projection reads registration/decision records. It never receives a derived inventory.
export function buildAuthoritativeInventory(inputs: Record<string, JsonRecord>): Inventory {
  const registration = valueAt(oe(inputs, '01'), 'source_registration');
  const approval = valueAt(oe(inputs, '03'), 'original_approval_event');
  const lineage = valueAt(oe(inputs, '04'), 'lineage_evidence');
  const supersession = valueAt(oe(inputs, '06'), 'supersession_record');
  const quarantine = valueAt(oe(inputs, '07'), 'quarantine_record');
  const rootVersion = textAt(registration, 'source_version', 'source_version');
  const successor = textAt(supersession, 'superseding_source_version', 'version');
  requireSame(
    textAt(approval, 'source_registration_id'),
    textAt(registration, 'registration_id'),
    'approval-registration'
  );
  requireSame(textAt(approval, 'source_id'), textAt(registration, 'source_id'), 'approval-source');
  requireSame(
    textAt(approval, 'tenant_id'),
    textAt(registration, 'tenant_binding', 'synthetic_tenant_id'),
    'approval-tenant'
  );
  requireSame(
    textAt(approval, 'source_owner'),
    textAt(registration, 'source_owner', 'source_owner_id'),
    'approval-owner'
  );
  requireSame(textAt(approval, 'source_version'), rootVersion, 'approval-version');
  requireSame(
    textAt(approval, 'source_content_checksum'),
    textAt(registration, 'source_version', 'content_checksum'),
    'approval-checksum'
  );
  requireSame(
    textAt(supersession, 'superseded_source_version', 'version'),
    rootVersion,
    'supersession-root'
  );
  requireSame(
    textAt(supersession, 'tenant_id'),
    textAt(registration, 'tenant_binding', 'synthetic_tenant_id'),
    'supersession-tenant'
  );
  requireSame(textAt(quarantine, 'source_version'), rootVersion, 'quarantine-version');
  requireSame(
    textAt(quarantine, 'source_content_checksum'),
    textAt(registration, 'source_version', 'content_checksum'),
    'quarantine-checksum'
  );
  requireSame(
    textAt(supersession, 'lifecycle_state_after', 'predecessor'),
    'superseded-non-active-test-only',
    'supersession-state'
  );
  requireSame(
    textAt(supersession, 'lifecycle_state_after', 'successor'),
    'successor-unapproved-non-active-test-only',
    'successor-state'
  );
  requireSame(
    textAt(quarantine, 'quarantine_state'),
    'quarantined-stale-superseded-test-only',
    'quarantine-state'
  );
  const nodes = listAt(lineage, 'version_nodes');
  const successorNode = nodes.find((node) => textAt(node, 'version') === successor);
  if (!successorNode) throw new Error('MISSING_SUCCESSOR_LINEAGE');
  const supersessionRef = textAt(supersession, 'supersession_record_id');
  const quarantineRef = textAt(quarantine, 'quarantine_record_id');
  return {
    kind: 'authoritative',
    registrationId: textAt(registration, 'registration_id'),
    sourceId: textAt(registration, 'source_id'),
    tenantId: textAt(registration, 'tenant_binding', 'synthetic_tenant_id'),
    ownerId: textAt(registration, 'source_owner', 'source_owner_id'),
    currentVersion: textAt(lineage, 'current_source_version'),
    versions: [
      {
        registrationId: textAt(registration, 'registration_id'),
        sourceId: textAt(registration, 'source_id'),
        tenantId: textAt(registration, 'tenant_binding', 'synthetic_tenant_id'),
        ownerId: textAt(registration, 'source_owner', 'source_owner_id'),
        version: rootVersion,
        checksum: textAt(registration, 'source_version', 'content_checksum'),
        approvalState:
          textAt(approval, 'approval_decision') === 'Approved' ? 'approved' : 'unapproved',
        approvalRef: textAt(lineage, 'exact_approved_version_reference', 'oe03_review_commit'),
        lineageRoot: textAt(lineage, 'lineage_root_identifier'),
        predecessor: null,
        provenanceRef: textAt(registration, 'provenance', 'authoritative_origin_ref'),
        supersessionState: 'superseded',
        supersessionRef,
        quarantineState: 'quarantined',
        quarantineRef,
        active: false,
        withdrawn: false,
        createdAt: textAt(registration, 'registered_at'),
        approvalAt: textAt(approval, 'original_approval_event_timestamp'),
        supersessionAt: textAt(supersession, 'effective_supersession_timestamp'),
        quarantineAt: textAt(quarantine, 'stale_detection_timestamp')
      },
      {
        registrationId: textAt(registration, 'registration_id'),
        sourceId: textAt(supersession, 'superseding_source_version', 'source_id'),
        tenantId: textAt(supersession, 'tenant_id'),
        ownerId: textAt(supersession, 'source_owner'),
        version: successor,
        checksum: textAt(supersession, 'superseding_source_version', 'checksum'),
        approvalState: 'unapproved',
        approvalRef: null,
        lineageRoot: textAt(lineage, 'lineage_root_identifier'),
        predecessor: rootVersion,
        provenanceRef: textAt(successorNode, 'provenance_reference', 'authoritative_origin_ref'),
        supersessionState: 'successor',
        supersessionRef,
        quarantineState: 'none',
        quarantineRef: null,
        active: false,
        withdrawn: false,
        createdAt: textAt(successorNode, 'created_at'),
        approvalAt: null,
        supersessionAt: textAt(supersession, 'effective_supersession_timestamp'),
        quarantineAt: null
      }
    ],
    inputRefs: ['01', '03', '04', '06', '07'].map((n) => `SIR02-KM-OE-${n}`)
  };
}

// This projection parses binding, lineage, and provenance separately; it does not copy the authority.
export function buildDerivedInventory(inputs: Record<string, JsonRecord>): Inventory {
  const binding = valueAt(oe(inputs, '02'), 'binding_manifest', 'binding_integrity');
  const lineage = valueAt(oe(inputs, '04'), 'lineage_evidence');
  const provenance = valueAt(oe(inputs, '05'), 'provenance_record');
  const supersession = valueAt(oe(inputs, '06'), 'supersession_record');
  const quarantine = valueAt(oe(inputs, '07'), 'quarantine_record');
  const nodes = listAt(lineage, 'version_nodes');
  const rootNode = nodes.find((node) => valueAt(node, 'predecessor_version') === null);
  if (!rootNode) throw new Error('MISSING_LINEAGE_ROOT');
  const root = textAt(rootNode, 'version');
  requireSame(
    textAt(provenance, 'source_registration_id'),
    textAt(binding, 'registration_id'),
    'derived-registration'
  );
  requireSame(
    textAt(provenance, 'canonical_source_id'),
    textAt(binding, 'source_id'),
    'derived-source'
  );
  requireSame(textAt(provenance, 'tenant_id'), textAt(binding, 'tenant_id'), 'derived-tenant');
  requireSame(textAt(provenance, 'source_owner'), textAt(binding, 'owner_id'), 'derived-owner');
  requireSame(textAt(provenance, 'source_version'), root, 'derived-version');
  requireSame(textAt(quarantine, 'source_version'), root, 'derived-quarantine-version');
  requireSame(
    textAt(supersession, 'superseded_source_version', 'version'),
    root,
    'derived-supersession-version'
  );
  requireSame(
    textAt(supersession, 'lifecycle_state_after', 'predecessor'),
    'superseded-non-active-test-only',
    'derived-supersession-state'
  );
  requireSame(
    textAt(quarantine, 'quarantine_state'),
    'quarantined-stale-superseded-test-only',
    'derived-quarantine-state'
  );
  const leaves = nodes.filter(
    (node) =>
      !nodes.some((child) => valueAt(child, 'predecessor_version') === valueAt(node, 'version'))
  );
  if (leaves.length !== 1) throw new Error('AMBIGUOUS_LINEAGE_LEAF');
  const leaf = leaves[0];
  if (!leaf) throw new Error('MISSING_LINEAGE_LEAF');
  const successor = textAt(leaf, 'version');
  const supersessionRef = textAt(supersession, 'supersession_record_id');
  return {
    kind: 'derived',
    registrationId: textAt(provenance, 'source_registration_id'),
    sourceId: textAt(provenance, 'canonical_source_id'),
    tenantId: textAt(binding, 'tenant_id'),
    ownerId: textAt(binding, 'owner_id'),
    currentVersion: successor,
    versions: [
      {
        registrationId: textAt(provenance, 'source_registration_id'),
        sourceId: textAt(provenance, 'canonical_source_id'),
        tenantId: textAt(binding, 'tenant_id'),
        ownerId: textAt(binding, 'owner_id'),
        version: root,
        checksum: textAt(provenance, 'source_content_checksum'),
        approvalState:
          textAt(provenance, 'approval_record_reference', 'approved_version') === root
            ? 'approved'
            : 'unapproved',
        approvalRef: textAt(provenance, 'approval_record_reference', 'immutable_review_commit'),
        lineageRoot: textAt(provenance, 'lineage_root_id'),
        predecessor: nullableTextAt(rootNode, 'predecessor_version'),
        provenanceRef: textAt(provenance, 'original_source_origin_reference'),
        supersessionState: 'superseded',
        supersessionRef,
        quarantineState: 'quarantined',
        quarantineRef: textAt(quarantine, 'quarantine_record_id'),
        active: booleanAt(quarantine, 'active_knowledge_eligible'),
        withdrawn: false,
        createdAt: textAt(rootNode, 'created_at'),
        approvalAt: textAt(provenance, 'approval_timestamp'),
        supersessionAt: textAt(supersession, 'effective_supersession_timestamp'),
        quarantineAt: textAt(quarantine, 'stale_detection_timestamp')
      },
      {
        registrationId: textAt(provenance, 'source_registration_id'),
        sourceId: textAt(leaf, 'parent_reference', 'source_id'),
        tenantId: textAt(leaf, 'tenant_id'),
        ownerId: textAt(leaf, 'owner_id'),
        version: successor,
        checksum: textAt(leaf, 'content_checksum'),
        approvalState: valueAt(leaf, 'approval_reference') === null ? 'unapproved' : 'approved',
        approvalRef:
          valueAt(leaf, 'approval_reference') === null
            ? null
            : textAt(leaf, 'approval_reference', 'oe03_review_commit'),
        lineageRoot: textAt(lineage, 'lineage_root_identifier'),
        predecessor: nullableTextAt(leaf, 'predecessor_version'),
        provenanceRef: textAt(leaf, 'provenance_reference', 'authoritative_origin_ref'),
        supersessionState: 'successor',
        supersessionRef,
        quarantineState: 'none',
        quarantineRef: null,
        active: booleanAt(supersession, 'lifecycle_state_after', 'successor_active'),
        withdrawn: false,
        createdAt: textAt(leaf, 'created_at'),
        approvalAt: null,
        supersessionAt: textAt(supersession, 'effective_supersession_timestamp'),
        quarantineAt: null
      }
    ],
    inputRefs: ['02', '04', '05', '06', '07'].map((n) => `SIR02-KM-OE-${n}`)
  };
}

const validId = (value: string): boolean =>
  value.trim() !== '' && !/[?*]/u.test(value) && value !== 'all' && value !== 'global';
const validUtc = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(value) && !Number.isNaN(Date.parse(value));
const versionKey = (version: InventoryVersion): string => version.version;

export function reconcile(
  authoritative: Inventory,
  derived: Inventory,
  reconciliationTimestamp: string,
  correlationId: string
): ReconciliationResult {
  if (!validUtc(reconciliationTimestamp)) throw new Error('INVALID_RECONCILIATION_TIMESTAMP');
  const found = new Map<string, Discrepancy>();
  const add = (code: string, affectedId: string): void => {
    const safeId =
      authoritative.tenantId === OE09_TENANT_A &&
      validId(affectedId) &&
      affectedId !== OE09_TENANT_B
        ? affectedId
        : 'REDACTED';
    found.set(`${code}\u0000${safeId}`, { code, affectedId: safeId, blocked: true });
  };
  if (authoritative.kind !== 'authoritative' || derived.kind !== 'derived')
    add('INVALID_INVENTORY_KIND', authoritative.sourceId);
  for (const [name, value] of [
    ['registration', authoritative.registrationId],
    ['source', authoritative.sourceId],
    ['tenant', authoritative.tenantId],
    ['owner', authoritative.ownerId],
    ['current-version', authoritative.currentVersion],
    ['derived-registration', derived.registrationId],
    ['derived-source', derived.sourceId],
    ['derived-tenant', derived.tenantId],
    ['derived-owner', derived.ownerId],
    ['derived-current-version', derived.currentVersion]
  ] as [string, string][]) {
    if (!validId(value)) add('WILDCARD_OR_MISSING_IDENTIFIER', name);
  }
  if (authoritative.tenantId !== OE09_TENANT_A || derived.tenantId !== OE09_TENANT_A) {
    add('TENANT_MISMATCH', authoritative.sourceId);
  }
  if (authoritative.tenantId !== derived.tenantId)
    add('CROSS_TENANT_RECORD', authoritative.sourceId);
  if (authoritative.ownerId !== derived.ownerId) add('OWNER_SUBSTITUTION', authoritative.sourceId);
  if (authoritative.sourceId !== derived.sourceId)
    add('SOURCE_ID_MISMATCH', authoritative.sourceId);
  if (!authoritative.registrationId || authoritative.registrationId !== derived.registrationId) {
    add('REGISTRATION_MISSING_OR_MISMATCHED', authoritative.sourceId);
  }
  if (authoritative.currentVersion !== derived.currentVersion)
    add('CURRENT_VERSION_CONFLICT', authoritative.sourceId);

  const duplicates = (inventory: Inventory): void => {
    const seen = new Set<string>();
    for (const version of inventory.versions) {
      if (seen.has(version.version))
        add('DUPLICATE_VERSION_RECORD', `${authoritative.sourceId}@${version.version}`);
      seen.add(version.version);
    }
    if (!seen.has(inventory.currentVersion) || seen.size === 0)
      add('AMBIGUOUS_AUTHORITATIVE_STATE', authoritative.sourceId);
  };
  duplicates(authoritative);
  duplicates(derived);
  for (const inventory of [authoritative, derived]) {
    const leaves = inventory.versions.filter(
      (candidate) => !inventory.versions.some((child) => child.predecessor === candidate.version)
    );
    if (leaves.length !== 1 || leaves[0]?.version !== inventory.currentVersion) {
      add('AMBIGUOUS_AUTHORITATIVE_STATE', authoritative.sourceId);
    }
  }
  const aVersions = new Map(authoritative.versions.map((v) => [versionKey(v), v]));
  const dVersions = new Map(derived.versions.map((v) => [versionKey(v), v]));
  let matchedVersions = 0;
  for (const version of authoritative.versions) {
    const affected = `${authoritative.sourceId}@${version.version}`;
    if (!validId(version.version) || !validId(version.lineageRoot))
      add('WILDCARD_OR_MISSING_IDENTIFIER', affected);
    if (!version.provenanceRef) add('LINEAGE_OR_PROVENANCE_MISSING', affected);
    if (version.registrationId !== authoritative.registrationId)
      add('REGISTRATION_MISSING_OR_MISMATCHED', affected);
    if (version.sourceId !== authoritative.sourceId) add('SOURCE_ID_MISMATCH', affected);
    if (version.tenantId !== authoritative.tenantId) add('CROSS_TENANT_RECORD', affected);
    if (version.ownerId !== authoritative.ownerId) add('OWNER_SUBSTITUTION', affected);
    if (version.approvalState === 'approved' && !version.approvalRef)
      add('APPROVAL_REFERENCE_MISSING', affected);
    if (version.approvalState === 'unapproved' && version.approvalRef)
      add('APPROVAL_STATE_CONFLICT', affected);
    if (version.active && version.supersessionState === 'superseded')
      add('ACTIVE_SUPERSEDED_CONTRADICTION', affected);
    if (version.active && version.quarantineState === 'quarantined')
      add('ACTIVE_QUARANTINED_CONTRADICTION', affected);
    if (version.active && version.withdrawn) add('WITHDRAWN_ACTIVE_CONTRADICTION', affected);
    if (version.supersessionState === 'superseded' && !version.supersessionRef)
      add('SUPERSESSION_REFERENCE_MISSING', affected);
    if (version.quarantineState === 'quarantined' && !version.quarantineRef)
      add('QUARANTINE_REFERENCE_MISSING', affected);
    if (
      !validUtc(version.createdAt) ||
      (version.approvalAt !== null &&
        (!validUtc(version.approvalAt) ||
          Date.parse(version.approvalAt) < Date.parse(version.createdAt))) ||
      (version.supersessionAt !== null &&
        (!validUtc(version.supersessionAt) ||
          Date.parse(version.supersessionAt) < Date.parse(version.createdAt))) ||
      (version.quarantineAt !== null &&
        (!validUtc(version.quarantineAt) ||
          version.supersessionAt === null ||
          Date.parse(version.quarantineAt) < Date.parse(version.supersessionAt)))
    )
      add('CHRONOLOGY_CONFLICT', affected);
    const other = dVersions.get(version.version);
    if (!other) {
      add('DERIVED_RECORD_MISSING', affected);
      continue;
    }
    matchedVersions++;
    const comparisons: [keyof InventoryVersion, string][] = [
      ['registrationId', 'REGISTRATION_MISSING_OR_MISMATCHED'],
      ['sourceId', 'SOURCE_ID_MISMATCH'],
      ['tenantId', 'CROSS_TENANT_RECORD'],
      ['ownerId', 'OWNER_SUBSTITUTION'],
      ['checksum', 'CONTENT_CHECKSUM_MISMATCH'],
      ['approvalState', 'APPROVAL_STATE_CONFLICT'],
      ['approvalRef', 'APPROVAL_REFERENCE_CONFLICT'],
      ['lineageRoot', 'LINEAGE_OR_PROVENANCE_MISSING'],
      ['predecessor', 'LINEAGE_CONFLICT'],
      ['provenanceRef', 'LINEAGE_OR_PROVENANCE_MISSING'],
      ['supersessionState', 'SUPERSESSION_STATE_CONFLICT'],
      ['supersessionRef', 'SUPERSESSION_STATE_CONFLICT'],
      ['quarantineState', 'QUARANTINE_STATE_CONFLICT'],
      ['quarantineRef', 'QUARANTINE_STATE_CONFLICT'],
      ['active', 'ACTIVE_STATE_CONFLICT'],
      ['withdrawn', 'WITHDRAWAL_STATE_CONFLICT'],
      ['createdAt', 'CHRONOLOGY_CONFLICT'],
      ['approvalAt', 'CHRONOLOGY_CONFLICT'],
      ['supersessionAt', 'CHRONOLOGY_CONFLICT'],
      ['quarantineAt', 'CHRONOLOGY_CONFLICT']
    ];
    for (const [field, code] of comparisons)
      if (version[field] !== other[field]) add(code, affected);
    if (version.approvalState === 'approved' && !other.approvalRef)
      add('APPROVAL_REFERENCE_MISSING', affected);
    if (other.approvalState === 'unapproved' && other.approvalRef)
      add('APPROVAL_STATE_CONFLICT', affected);
    if (
      !validId(other.version) ||
      !validId(other.tenantId) ||
      !validId(other.ownerId) ||
      !validId(other.sourceId)
    )
      add('WILDCARD_OR_MISSING_IDENTIFIER', affected);
    if (other.tenantId !== OE09_TENANT_A) add('CROSS_TENANT_RECORD', affected);
    if (!other.provenanceRef || !other.lineageRoot) add('LINEAGE_OR_PROVENANCE_MISSING', affected);
    if (
      !validUtc(other.createdAt) ||
      (other.approvalAt !== null &&
        (!validUtc(other.approvalAt) ||
          Date.parse(other.approvalAt) < Date.parse(other.createdAt))) ||
      (other.supersessionAt !== null &&
        (!validUtc(other.supersessionAt) ||
          Date.parse(other.supersessionAt) < Date.parse(other.createdAt))) ||
      (other.quarantineAt !== null &&
        (!validUtc(other.quarantineAt) ||
          other.supersessionAt === null ||
          Date.parse(other.quarantineAt) < Date.parse(other.supersessionAt)))
    )
      add('CHRONOLOGY_CONFLICT', affected);
    if (other.active && other.supersessionState === 'superseded')
      add('ACTIVE_SUPERSEDED_CONTRADICTION', affected);
    if (other.active && other.quarantineState === 'quarantined')
      add('ACTIVE_QUARANTINED_CONTRADICTION', affected);
    if (other.active && other.withdrawn) add('WITHDRAWN_ACTIVE_CONTRADICTION', affected);
  }
  for (const version of derived.versions) {
    const affected = `${authoritative.sourceId}@${version.version}`;
    if (!aVersions.has(version.version)) add('ORPHAN_DERIVED_RECORD', affected);
    if (version.tenantId !== OE09_TENANT_A) add('CROSS_TENANT_RECORD', affected);
  }
  const discrepancies = [...found.values()].sort(
    (a, b) => a.code.localeCompare(b.code) || a.affectedId.localeCompare(b.affectedId)
  );
  const byCode: Record<string, number> = {};
  for (const item of discrepancies) byCode[item.code] = (byCode[item.code] ?? 0) + 1;
  const decision =
    discrepancies.length === 0
      ? 'Reconciled / Non-Operational Test State'
      : 'Blocked / Fail Closed';
  return {
    decision,
    namespace: OE09_NAMESPACE,
    schema: OE09_SCHEMA,
    reconciliationTimestamp,
    sourceId: authoritative.tenantId === OE09_TENANT_A ? authoritative.sourceId : 'REDACTED',
    registrationId:
      authoritative.tenantId === OE09_TENANT_A ? authoritative.registrationId : 'REDACTED',
    currentVersion: decision === 'Blocked / Fail Closed' ? null : authoritative.currentVersion,
    approvedVersions:
      decision === 'Blocked / Fail Closed'
        ? []
        : authoritative.versions
            .filter((v) => v.approvalState === 'approved')
            .map((v) => v.version)
            .sort(),
    unapprovedVersions:
      decision === 'Blocked / Fail Closed'
        ? []
        : authoritative.versions
            .filter((v) => v.approvalState === 'unapproved')
            .map((v) => v.version)
            .sort(),
    supersededVersions:
      decision === 'Blocked / Fail Closed'
        ? []
        : authoritative.versions
            .filter((v) => v.supersessionState === 'superseded')
            .map((v) => v.version)
            .sort(),
    quarantinedVersions:
      decision === 'Blocked / Fail Closed'
        ? []
        : authoritative.versions
            .filter((v) => v.quarantineState === 'quarantined')
            .map((v) => v.version)
            .sort(),
    activeVersions:
      decision === 'Blocked / Fail Closed'
        ? []
        : authoritative.versions
            .filter((v) => v.active)
            .map((v) => v.version)
            .sort(),
    discrepancies,
    counts: {
      authoritativeVersions: authoritative.versions.length,
      derivedVersions: derived.versions.length,
      matchedVersions,
      discrepancies: discrepancies.length,
      unresolved: discrepancies.length,
      byCode
    },
    audit: {
      requestId: `${correlationId}-request`,
      correlationId,
      traceId: `${correlationId}-trace`,
      eventType: 'km_source_reconciliation_evaluated',
      tenantScope: OE09_TENANT_A,
      reasonCodes: discrepancies.map((d) => d.code),
      foreignTenantFieldsDisclosed: 0,
      knowledgeProcessingCalls: 0
    }
  };
}

// Future controlled execution can hash these bytes without writing a live artifact.
export const serializeReconciliationResult = (result: ReconciliationResult): Buffer =>
  Buffer.from(`${JSON.stringify(result)}\n`, 'utf8');
export const reconciliationSha256 = (result: ReconciliationResult): string =>
  createHash('sha256').update(serializeReconciliationResult(result)).digest('hex');
