# SIR-02 Knowledge Management Operational Evidence Execution Plan

## Document control

| Field                        | Value                                                                     |
| ---------------------------- | ------------------------------------------------------------------------- |
| Document                     | `SIR-02-KM-OPERATIONAL-EVIDENCE-EXECUTION-PLAN`                           |
| Version                      | `v1.0`                                                                    |
| Status                       | `Approved for Controlled Evidence Execution / Not Executed`               |
| Evidence subject             | `SIR02-DEF-02`                                                            |
| Owner                        | **GANTUMUR Erdenedalai — Founder / Administrator**                        |
| Reviewer                     | **SODBILEG Erkhembayar — Administrator**                                  |
| Decision date                | `2026-09-25`                                                              |
| Approval status              | `Approved for Controlled Evidence Execution`                              |
| Immutable artifact reference | `37212d5869709f85256618e6b03fffb0622a2049`                                |
| Immutable approval reference | `4d18b54180ebe0d34b147d769c5d906fc8c3b960`                                |
| Control baseline             | `SIR-02 Knowledge Management Lifecycle-Control Baseline v1.0`             |
| Baseline reference           | `48407614af13e8f8239a9e63454c013dc43e432b`                                |
| Governance approval          | `c48a40d58c9235621ace82ad0c6440f69b8f2ad5`                                |
| Governance linkage           | `9f9ab7b94f669581ef107aefddc2f10dff4b7516`                                |
| Gate A artifact reference    | `437612dfe56fb4903f8132bef2971089bdb374aa`                                |
| Gate A approval reference    | `84a05702b744a6a710644299381e30e9a9a7aefb`                                |
| Environment                  | Isolated deterministic fixtures or separately approved non-live test only |
| Live ingestion/RAG authority | `None`                                                                    |

## Formal governance approval

**Approval statement:**

> The SIR-02 Knowledge Management Operational Evidence Execution Plan v1.0 and Acceptance Matrix v1.0 are approved as the controlling plan for producing and reviewing the 15 mandatory operational-evidence items required by SIR02-DEF-02.

**Approval conditions:**

- Execution is limited to isolated, deterministic, non-live test fixtures and approved non-live operational evidence.
- No production or live Shadow ingestion may be enabled.
- RAG, embeddings, indexing, vector-store population, retrieval, and production traffic remain disabled.
- Test data must be synthetic or explicitly approved for test use.
- No cross-tenant data use is permitted.
- Tenant isolation and fail-closed behavior remain mandatory.
- `OE-08` and `OE-15` require separately approved non-live operational-environment controls before execution.
- Evidence must not be marked `Passed`, `Accepted`, or equivalent until the actual execution result and immutable evidence reference exist.
- Existing repository evidence may only be reused where the approved Acceptance Matrix explicitly permits it.
- Any required code change must be test-only unless separately approved through the normal implementation/change process.
- This approval does not authorize SIR-02 closure, ingestion reopening, Shadow activation, or production use.

Gate A approved controlled evidence execution under the immutable Gate A approval reference above. OE-01, OE-02, and corrected OE-03 sequence `0003` are independently reviewed and accepted; OE-04 is `Executed / Awaiting Independent Review`; the other 11 evidence items remain `Not Executed`.

## Purpose

This plan defines how the 15 mandatory operational-evidence items for `SIR02-DEF-02` are to be produced, verified, independently reviewed, checksummed, and linked. It records no test result and authorizes no runtime, configuration, deployment, credential, storage, traffic, ingestion, or RAG change.

## Execution safety controls

- Production and live Shadow ingestion remain disabled.
- RAG, embedding, indexing, vector-store population, retrieval, and production traffic remain disabled.
- Execution is limited to isolated deterministic fixtures or a separately approved non-live controlled environment.
- Test data must be synthetic or explicitly approved for test use and carry a dedicated test classification.
- Tenant A evidence and artifacts must never be visible to Tenant B.
- Missing tenant, owner, approval, provenance, version, checksum, or authorization evidence must fail closed before artifact creation.
- No persistent live knowledge artifact may be created. Temporary test artifacts must use an isolated namespace and be destroyed and reconciled after the run.
- The controlled reopening test verifies gates and denial behavior only. It must not enable ingestion or RAG.
- Every run must use a unique `evidence_run_id`, immutable test definition version, trusted test tenant scope, request/correlation/trace IDs, deterministic clock where applicable, and normalized audit evidence.
- A failed, missing, duplicated, inconsistent, untrusted, or unreviewed artifact cannot satisfy an evidence item.

## Existing repository evidence assessment

The following evidence may be reused as supporting evidence, subject to independent review. It does not by itself satisfy lifecycle behavior that is absent from the repository.

| Repository evidence                                                                               | Immutable reference                        | Reusable coverage                                                                                                  |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `tests/integration/rag-runtime.test.ts` and `tests/tenant/rag-runtime-isolation.test.ts`          | `773baaf7a6f62580b3c111196965a3051c0e50dd` | Approved-document filtering, version selection, integrity, tenant/permission isolation, denial before store access |
| `tests/unit/rag-integrity-access.test.ts`                                                         | `773baaf7a6f62580b3c111196965a3051c0e50dd` | Checksum, citation binding, chunk identity, lifecycle status and access filtering                                  |
| `tests/contract/rag-runtime-contract.test.ts`                                                     | `90e389fc2720f7a95901bb94d7988a28e63ba9ea` | Explicit tenant scope, trusted-context separation, source-type and response evidence contracts                     |
| `tests/integration/gate-p7-audit-trace.test.ts` and `tests/unit/audit-telemetry-pipeline.test.ts` | `dad2cd09ab5adc0046d67db6a91917669198db93` | Trusted audit binding, reconstruction, redaction, unavailable/conflicting evidence rejection                       |
| `tests/evaluation/feature-control-enforcement.test.ts`                                            | `d0b5a174ed6f5635349186caace0642687fe7c86` | Direct RAG boundary default-off enforcement and fail-safe evidence                                                 |
| `docs/PHASE_6_VALIDATION.md`, `docs/PHASE_7_VALIDATION.md`, and `docs/PHASE_10_VALIDATION.md`     | `dcec56f...`, `dad2cd0...`, `d0b5a17...`   | Historical validation summaries; supporting evidence only                                                          |

Existing evidence is sufficient as the primary evidence for `SIR02-KM-OE-10` after its references and historical results are independently reviewed. It is partial supporting evidence for items 02, 04, 05, 06, 07, 11, 12, and 15. It does not demonstrate source registration governance, full lineage, lifecycle transitions, deletion propagation, reconciliation, RAG-specific idempotency, or controlled reopening readiness.

## Common evidence artifact envelope

Each produced evidence package must contain:

- evidence ID and `evidence_run_id`;
- plan, fixture, schema, control-baseline, and component versions;
- execution mechanism and environment classification;
- trusted synthetic tenant/test scope and data-approval reference;
- request, correlation, trace, actor, and reviewer identity references;
- test inputs identified by checksum without prohibited raw confidential content;
- expected result, observed result, pass/fail state, failure details, and timestamp;
- normalized audit-event references and reconstruction result;
- generated artifact inventory, cleanup/reconciliation result, and exception list;
- SHA-256 for each evidence artifact plus an immutable repository or approved evidence-store reference;
- independent reviewer decision: `Accepted`, `Needs Clarification`, or `Rejected`.

## Evidence execution specifications

### SIR02-KM-OE-01 — Approved source registration sample

- **Classification:** `Governance record required`
- **Objective:** Produce one complete, versioned, synthetic source-registration record governed by the approved baseline.
- **Baseline requirement:** Canonical non-wildcard source ID/version, owner, tenant, classification, approval state, provenance, checksum, dates, and audit linkage.
- **Preconditions:** Approved fixture schema, synthetic data approval, isolated tenant namespace, named registration authority.
- **Test/input data:** Synthetic source metadata and content checksum; no production or tenant content.
- **Tenant constraints:** Exact test tenant binding; no global or wildcard scope; Tenant B read must be denied.
- **Execution method:** Create the record through an isolated deterministic registry fixture; do not invoke live ingestion.
- **Expected result:** One immutable registration record is complete, schema-valid, non-wildcard, and traceable.
- **Fail condition:** Missing/ambiguous field, caller-controlled authority, wildcard, tenant mismatch, duplicate active identity, or derived artifact creation.
- **Required output:** Registration JSON, schema-validation result, audit event, negative-access result, cleanup manifest.
- **Checksum/reference:** SHA-256 per artifact and immutable evidence commit/store reference.
- **Reviewer:** SODBILEG Erkhembayar — Administrator.
- **Acceptance criterion:** Exact approved sample reconstructs source identity, version, ownership, tenant, provenance, checksum, status, and correlation without enabling ingestion.
- **Status:** `Accepted`
- **Execution evidence:** `operational-evidence/oe-01/SIR-02-KM-OE-01-APPROVED-SOURCE-REGISTRATION-v1.0.json`; SHA-256 `d60717e22cbcabd58363fafcb177aca8e2e33592464af958540e2a87a2eea38b`; immutable evidence commit `44a97a9b387235c67ae70cce24fb32cda0adfe70`.
- **Independent review:** `operational-evidence/oe-01/SIR-02-KM-OE-01-INDEPENDENT-REVIEW-v1.0.md`; result `Accepted`; immutable review commit `a33c8220e595fafad317610e94d09d4f21ecc882`.

### SIR02-KM-OE-02 — Source owner and tenant binding

- **Classification:** `Deterministic test execution required`
- **Objective:** Prove server-controlled owner/tenant binding and cross-tenant default denial.
- **Baseline requirement:** Trusted tenant and owner binding precedes any source use; caller input cannot widen scope.
- **Preconditions:** OE-01 record, trusted test contexts for Tenant A and Tenant B, deterministic authorization adapter.
- **Test/input data:** Synthetic Tenant A source, authorized Tenant A actor, unauthorized Tenant B actor, owner mismatch and missing-owner variants.
- **Tenant constraints:** Tenant B receives no source existence or metadata disclosure.
- **Execution method:** Run positive Tenant A binding plus cross-tenant, spoofed tenant, missing owner, and conflicting owner negatives.
- **Expected result:** Only exact authorized Tenant A/owner binding succeeds; all negatives fail before artifact processing.
- **Fail condition:** Any cross-tenant visibility, caller override, information leak, or derived artifact.
- **Required output:** Input manifest, denial/allow observations, adapter-call proof, normalized audit evidence.
- **Checksum/reference:** Checksummed results linked to OE-01 and immutable test commit/run.
- **Reviewer:** SODBILEG Erkhembayar — Administrator.
- **Acceptance criterion:** Existing Phase 6 tenant tests plus new owner-binding cases prove complete default-deny behavior.
- **Status:** `Accepted`
- **Successful execution evidence:** `operational-evidence/oe-02/SIR-02-KM-OE-02-SOURCE-OWNER-TENANT-BINDING-v1.0.json`; SHA-256 `16c9758d8467d05ee7bb2f640eb9880e21374c94ec170b1a481e3b172e4abc71`; immutable evidence commit `9d4bc50d885e50b4fef8580918398f6764742b74`.
- **Preserved failed attempt:** `operational-evidence/oe-02/SIR-02-KM-OE-02-EXECUTION-ATTEMPT-0001-FAILED-v1.0.json`; SHA-256 `4c5664e232e2fb6bb4e1ad6637db05ba9569a5b29e413c95b50df77f3a6ce336`; run `SIR02-KM-OE-02-V1_0-20260925T065015Z-0001`; harness aggregate error with no acceptance-criteria failure.
- **Independent review:** `operational-evidence/oe-02/SIR-02-KM-OE-02-INDEPENDENT-REVIEW-v1.0.md`; result `Accepted`; immutable review commit `3328353ea04298729b6e68ca46061393edce2148`.

### SIR02-KM-OE-03 — Source approval record

- **Classification:** `Governance record required`
- **Objective:** Produce explicit human approval evidence for one exact synthetic source version.
- **Baseline requirement:** Approval records approver authority, exact source/version/checksum, decision, conditions, date, and correlation; AI cannot approve.
- **Preconditions:** OE-01, verified human approval role, approval schema and immutable governance channel.
- **Test/input data:** Registered synthetic source plus rejected, wrong-version, checksum-conflict, AI/caller-supplied approval variants.
- **Tenant constraints:** Approval authority and source tenant must match; cross-tenant approver is denied without disclosure.
- **Execution method:** Record an authorized test approval and execute deterministic negative validation only; no ingestion.
- **Expected result:** Exact-version approval is immutable; all forged or mismatched approvals fail closed.
- **Fail condition:** Approval inheritance, AI mutation, ambiguous approver authority, mismatch acceptance, or processing side effect.
- **Required output:** Approval record, authority evidence, integrity proof, negative results, audit linkage.
- **Checksum/reference:** SHA-256 and immutable governance/evidence reference.
- **Reviewer:** SODBILEG Erkhembayar — Administrator.
- **Acceptance criterion:** Approval is independently verifiable and valid for one exact tenant/source/version/checksum only.
- **Status:** `Accepted`
- **Execution evidence:** `operational-evidence/oe-03/SIR-02-KM-OE-03-SOURCE-APPROVAL-RECORD-v1.0.json`; SHA-256 `5a87f1f0e0dbfca6a56e53d0bb1485d2ee10bd59cf0d6efa796c56a271b3858c`; immutable evidence commit `fa51d26ab43abd53f354d544da7ab5bfca394276`.
- **Execution lineage:** pre-artifact attempt sequence `0001` stopped at final aggregate validation because PowerShell did not resolve ordered observation properties; no artifact was written and no acceptance-criteria failure was observed. Corrected explicit aggregation ran under sequence `0002` and the tooling failure remains recorded in the evidence artifact.
- **Independent review:** `operational-evidence/oe-03/SIR-02-KM-OE-03-INDEPENDENT-REVIEW-v1.0.md`; result `Needs Clarification`; immutable review commit `79f2d74ab31335e2487fa4e6c7dce4158c9a7b1f`.
- **Corrected reconstruction evidence:** `operational-evidence/oe-03/SIR-02-KM-OE-03-SOURCE-APPROVAL-RECONSTRUCTION-0003-v1.0.json`; SHA-256 `5ac5536574a3bca7c3c13af007b7f26e4fe81c621dd5b0ef58d5cd0495edd345`; run `SIR02-KM-OE-03-V1_0-20260925T081239Z-0003`; immutable evidence commit `74c8eff31a88ab7de1e693b7dad0ca8e8e91a51a`.
- **Corrected result:** sequence `0003` reconstructs the original OE-01 approval at `2026-09-25T05:22:58Z`, records reconstruction separately at `2026-09-25T08:12:39Z`, creates zero new approval events, and passes chronology, duplicate prevention, 1/1 positive, and 17/17 negative validations. Independent review accepted the corrected evidence.
- **Corrected independent review:** `operational-evidence/oe-03/SIR-02-KM-OE-03-INDEPENDENT-REVIEW-0003-v1.0.md`; result `Accepted`; immutable review commit `77ae9c99b2601ec58a50bd20c772326688268e5d`.

### SIR02-KM-OE-04 — Source version and lineage evidence

- **Classification:** `Deterministic test execution required`
- **Objective:** Prove explicit predecessor/successor lineage and no silent approval inheritance.
- **Baseline requirement:** Every content change creates a version/checksum and preserves predecessor plus change reason.
- **Preconditions:** OE-01 and OE-03; at least two synthetic versions.
- **Test/input data:** v1, changed v2, unchanged duplicate, missing predecessor, checksum mismatch, ambiguous lineage.
- **Tenant constraints:** All lineage nodes share the exact trusted tenant; foreign lineage is rejected.
- **Execution method:** Build deterministic version graph and validate positive and negative transitions.
- **Expected result:** v2 links to v1, requires separate approval, and every mismatch is quarantined.
- **Fail condition:** Silent approval inheritance, cross-tenant lineage, ambiguous active version, or untraceable checksum.
- **Required output:** Version graph, checksums, validation report, quarantine evidence, audit trace.
- **Checksum/reference:** Checksummed graph/results and immutable run reference.
- **Reviewer:** SODBILEG Erkhembayar — Administrator.
- **Acceptance criterion:** Complete exact-version lineage is reconstructable and invalid lineage fails closed.
- **Status:** `Executed / Awaiting Independent Review`
- **Execution evidence:** `operational-evidence/oe-04/SIR-02-KM-OE-04-SOURCE-VERSION-LINEAGE-v1.0.json`; SHA-256 `f41a346e56da9bb5f6661d68eddece8201641ce2991a8e78eae65e2c5cac856f`; run `SIR02-KM-OE-04-V1_0-20260925T085207Z-0001`; immutable evidence commit `eefc0cd3dcb74761af91bd17cfe271e872d88264`.
- **Execution result:** One valid two-node lineage and 17/17 negative cases passed. The accepted `v1.0` approval remains exact and unchanged; the synthetic `v1.1` successor remains unapproved; zero new approval events, cross-tenant disclosures, negative processing calls, live calls, or persistent artifacts occurred. Independent review remains required.

### SIR02-KM-OE-05 — Provenance trace

- **Classification:** `Deterministic test execution required`
- **Objective:** Reconstruct origin-to-derived-artifact custody for an approved synthetic source.
- **Baseline requirement:** Origin, owner, tenant, version, checksum, approval, lifecycle events, processing links, and trusted audit correlation are preserved.
- **Preconditions:** OE-01 through OE-04 and normalized Phase 7 audit adapter.
- **Test/input data:** Synthetic source with deterministic origin/custody events and tampered/missing provenance variants.
- **Tenant constraints:** Trace is scoped to one tenant; cross-tenant event linkage fails reconstruction.
- **Execution method:** Reconstruct the lifecycle trace without persisting content; validate tampered, missing, duplicate, and conflicting events.
- **Expected result:** One complete trusted trace reconstructs; every invalid variant fails closed.
- **Fail condition:** Missing link accepted, cross-tenant event accepted, prohibited content logged, or unbound evidence counted.
- **Required output:** Provenance manifest, normalized event set, reconstruction report, redaction report.
- **Checksum/reference:** Event-set and report hashes with immutable run reference.
- **Reviewer:** SODBILEG Erkhembayar — Administrator.
- **Acceptance criterion:** Independent reviewer can reconstruct source origin, custody, approval, version, and lifecycle without raw sensitive content.
- **Status:** `Not Executed`

### SIR02-KM-OE-06 — Supersession test

- **Classification:** `Deterministic test execution required`
- **Objective:** Prove an approved replacement disables its predecessor and reconciles all test artifacts.
- **Baseline requirement:** Superseded content cannot remain active or retrievable; ambiguous coexistence fails closed.
- **Preconditions:** OE-04 lineage, two approved synthetic versions, isolated artifact inventory.
- **Test/input data:** v1 active, v2 replacement, missing supersession link, dual-active conflict, foreign-tenant replacement.
- **Tenant constraints:** Replacement and predecessor must share trusted tenant; cross-tenant supersession is rejected.
- **Execution method:** Simulate lifecycle transition using non-live deterministic adapters; verify eligibility and reconciliation only.
- **Expected result:** v1 becomes ineligible/quarantined, v2 is the sole eligible version, artifacts reconcile exactly.
- **Fail condition:** v1 remains active, conflict silently resolves, foreign tenant affects state, or orphan artifact remains.
- **Required output:** Before/after inventory, transition record, denial checks, reconciliation and audit evidence.
- **Checksum/reference:** Checksummed inventories/results and immutable run reference.
- **Reviewer:** SODBILEG Erkhembayar — Administrator.
- **Acceptance criterion:** Supersession is exact, tenant-bound, auditable, and leaves no active predecessor artifact.
- **Status:** `Not Executed`

### SIR02-KM-OE-07 — Stale-content quarantine test

- **Classification:** `Deterministic test execution required`
- **Objective:** Prove each defined staleness signal blocks use and requires authorized review before restoration.
- **Baseline requirement:** Expired review, revoked ownership, source change, checksum conflict, reconciliation failure, or supersession triggers quarantine.
- **Preconditions:** OE-01, OE-04, quarantine state fixture, deterministic clock.
- **Test/input data:** One case per staleness trigger plus unauthorized restoration attempts.
- **Tenant constraints:** Quarantine state and evidence are tenant-bound and non-disclosing across tenants.
- **Execution method:** Trigger each condition and attempt retrieval/processing, fallback bypass, cache bypass, and unauthorized restoration.
- **Expected result:** Every stale source and derived artifact is unavailable until exact-version reapproval.
- **Fail condition:** Any stale result is active, fallback/cache bypass works, or restoration occurs without approval.
- **Required output:** Trigger matrix, quarantine inventory, denial results, restoration negative, audit events.
- **Checksum/reference:** Checksummed matrix/evidence and immutable run reference.
- **Reviewer:** SODBILEG Erkhembayar — Administrator.
- **Acceptance criterion:** All staleness signals fail closed and quarantine cannot be bypassed.
- **Status:** `Not Executed`

### SIR02-KM-OE-08 — Retention/deletion test

- **Classification:** `Operational environment evidence required`
- **Objective:** Prove approved withdrawal/deletion propagates across every isolated derived-artifact class while preserving only authorized audit metadata.
- **Baseline requirement:** Approved retention/legal-hold policy, deletion authority, complete propagation, reconciliation, and immutable exceptions.
- **Preconditions:** Approved numeric retention/deletion policy and legal-hold rules; approved non-live storage technologies; OE-01 through OE-05.
- **Test/input data:** Synthetic source and document/chunk/embedding/index/vector/cache/retrieval artifacts in an isolated namespace; hold and no-hold cases.
- **Tenant constraints:** Deletion authority and inventory are exact-tenant; foreign tenant cannot view or delete.
- **Execution method:** Execute withdrawal/deletion in a controlled non-live environment, then reconcile all stores and audit remnants.
- **Expected result:** Active access ends; governed artifacts are removed; only approved minimum audit metadata remains.
- **Fail condition:** Orphan or accessible artifact, cross-tenant effect, unapproved metadata retention, missing exception, or unreconciled count.
- **Required output:** Policy reference, pre/post inventories, deletion receipts, reconciliation, access negatives, audit evidence.
- **Checksum/reference:** Per-artifact hashes, environment/run identity, immutable evidence-store reference.
- **Reviewer:** SODBILEG Erkhembayar — Administrator plus required Data Governance/Platform Operations review.
- **Acceptance criterion:** Approved policy and controlled-environment evidence prove complete, tenant-safe, auditable deletion propagation.
- **Status:** `Not Executed`

### SIR02-KM-OE-09 — Source reconciliation test

- **Classification:** `Deterministic test execution required`
- **Objective:** Prove inventory reconciliation detects and blocks every governed discrepancy.
- **Baseline requirement:** Detect orphan, duplicate, missing, stale, superseded, withdrawn, cross-tenant, and checksum-mismatched records.
- **Preconditions:** OE-01, OE-04, isolated authoritative and derived inventories.
- **Test/input data:** One synthetic discrepancy per required type plus a clean control inventory.
- **Tenant constraints:** Reconciliation operates within exact tenant partitions and flags foreign records without exposing their content.
- **Execution method:** Compare deterministic inventories, resolve approved cases, rerun, and verify exact final counts.
- **Expected result:** Every discrepancy is detected and blocked; clean inventory reconciles; unresolved items remain quarantined.
- **Fail condition:** Missed discrepancy, silent repair, cross-tenant content leak, or count mismatch.
- **Required output:** Input inventories, discrepancy report, resolutions, final counts, audit evidence.
- **Checksum/reference:** Inventory/report hashes and immutable run reference.
- **Reviewer:** SODBILEG Erkhembayar — Administrator.
- **Acceptance criterion:** Reconciliation is complete, deterministic, tenant-safe, and reconstructable.
- **Status:** `Not Executed`

### SIR02-KM-OE-10 — Permission and tenant-isolation test

- **Classification:** `Existing repository evidence sufficient`
- **Objective:** Demonstrate exact authorized access and default-deny behavior before source processing or semantic search.
- **Baseline requirement:** Trusted tenant, permission, entitlement, role, ownership, agent, domain, and scope checks execute server-side first.
- **Preconditions:** Independent review of immutable Phase 6 test definitions/results and validation report.
- **Test/input data:** Existing synthetic Tenant A/B fixtures and authorization-negative cases.
- **Tenant constraints:** Tenant A artifacts never reach Tenant B ranking, response, error, or audit content.
- **Execution method:** Reuse immutable Phase 6 test evidence; rerun only under a separately approved evidence-run procedure if freshness is required.
- **Expected result:** Authorized exact scope succeeds; all cross-tenant and authorization negatives fail before store/ranker access.
- **Fail condition:** Missing immutable result, incomplete case mapping, disclosure, caller override, or reviewer rejection.
- **Required output:** Evidence index linking test names, commits, historical validation, and independent review decision.
- **Checksum/reference:** Existing immutable commits plus checksum of the evidence index.
- **Reviewer:** SODBILEG Erkhembayar — Administrator.
- **Acceptance criterion:** Reviewer confirms existing tests cover all required dimensions and evidence is immutable and reconstructable.
- **Status:** `Not Executed`

### SIR02-KM-OE-11 — Missing approval/version/provenance fail-closed tests

- **Classification:** `Deterministic test execution required`
- **Objective:** Prove missing or conflicting mandatory lifecycle evidence produces denial before artifact creation.
- **Baseline requirement:** Missing tenant, owner, approval, provenance, version, or checksum fails closed.
- **Preconditions:** OE-01 schema, deterministic registry/governance adapters, artifact-call spies.
- **Test/input data:** Separate missing approval, version, provenance, owner, tenant, checksum and conflicting-metadata cases.
- **Tenant constraints:** Errors and audit events must not disclose another tenant or source state.
- **Execution method:** Execute each negative independently and assert zero parsing/embedding/index/store calls and sanitized audit denial.
- **Expected result:** Every case returns normalized tenant-safe denial and creates no artifact.
- **Fail condition:** Any adapter call, partial artifact, fail-open result, sensitive diagnostic, or missing audit event.
- **Required output:** Case matrix, call-count evidence, public-error snapshots, sanitized audit evidence.
- **Checksum/reference:** Checksummed results and immutable run reference.
- **Reviewer:** SODBILEG Erkhembayar — Administrator.
- **Acceptance criterion:** All mandatory-missing and conflict cases fail closed at the earliest trusted boundary.
- **Status:** `Not Executed`

### SIR02-KM-OE-12 — Lifecycle audit evidence

- **Classification:** `Deterministic test execution required`
- **Objective:** Prove normalized, reconstructable audit coverage for all knowledge lifecycle transitions.
- **Baseline requirement:** Registration, review, approval/rejection, revision, supersession, quarantine, reconciliation, withdrawal/deletion, and denial events retain trusted context and outcomes.
- **Preconditions:** OE-01 through OE-11 event producers, Phase 7 pipeline, deterministic event IDs and clock.
- **Test/input data:** Synthetic successful and rejected transition events, unavailable context, duplicate/conflicting events, sensitive alias fields.
- **Tenant constraints:** Tenant/request/correlation/trace must be consistent; cross-tenant or unbound events cannot satisfy reconstruction.
- **Execution method:** Emit through the Phase 7 pipeline, reconstruct lifecycle, test sink failure, redaction, duplication, and mismatch denial.
- **Expected result:** Complete trusted lifecycle reconstructs; invalid evidence fails; sink failure remains observable and fail-safe.
- **Fail condition:** Missing transition, unbound event accepted, sensitive content exported, high-cardinality leak, or silent sink loss.
- **Required output:** Normalized event set, reconstruction report, redaction/health evidence, transition coverage map.
- **Checksum/reference:** Event-set hashes and immutable run/evidence-store reference.
- **Reviewer:** SODBILEG Erkhembayar — Administrator.
- **Acceptance criterion:** Every required lifecycle event is complete, sanitized, tenant-bound, and reconstructable.
- **Status:** `Not Executed`

### SIR02-KM-OE-13 — Duplicate/conflict handling test

- **Classification:** `Deterministic test execution required`
- **Objective:** Prove duplicate suppression and human-governed quarantine of conflicts.
- **Baseline requirement:** Detect exact duplicate, divergent duplicate, ownership, version, tenant, approval-state, and content-hash conflicts; AI cannot silently resolve.
- **Preconditions:** OE-01, OE-04, isolated registry and artifact inventory.
- **Test/input data:** One case for each conflict type plus repeated exact duplicate.
- **Tenant constraints:** Cross-tenant conflict is blocked without revealing foreign metadata.
- **Execution method:** Submit deterministic cases and verify no duplicate artifacts and no automatic precedence.
- **Expected result:** Exact duplicate is idempotently suppressed; unresolved conflicts are quarantined for human decision.
- **Fail condition:** Duplicate artifact, silent overwrite, AI resolution, cross-tenant disclosure, or active conflicting record.
- **Required output:** Case inputs, registry outcomes, artifact counts, quarantine records, audit evidence.
- **Checksum/reference:** Checksummed results and immutable run reference.
- **Reviewer:** SODBILEG Erkhembayar — Administrator.
- **Acceptance criterion:** Every duplicate/conflict path is deterministic, tenant-safe, auditable, and fail closed.
- **Status:** `Not Executed`

### SIR02-KM-OE-14 — Re-ingestion/re-indexing idempotency test

- **Classification:** `Deterministic test execution required`
- **Objective:** Prove repeated exact-version operation is safe only under an approved idempotent contract.
- **Baseline requirement:** Current approval, tenant, authorization and exact version are revalidated; repeats cannot duplicate artifacts; stale operations fail.
- **Preconditions:** OE-01 through OE-05, explicit test-only idempotency contract, deterministic artifact store.
- **Test/input data:** First run, exact repeat, concurrent repeat, interrupted recovery, changed version, revoked approval, stale and foreign-tenant requests.
- **Tenant constraints:** Idempotency keys bind tenant/source/version/operation; no cross-tenant key collision or replay.
- **Execution method:** Execute test-only adapter calls and compare receipts, artifact counts, revalidation evidence, and recovery state.
- **Expected result:** Approved exact repeat returns one logical result; invalid/stale/replayed requests create nothing.
- **Fail condition:** Duplicate artifact, cross-tenant collision, skipped revalidation, unsafe retry, or inconsistent receipt.
- **Required output:** Contract reference, execution receipts, inventories, collision/replay negatives, audit trail.
- **Checksum/reference:** Receipt/inventory hashes and immutable run reference.
- **Reviewer:** SODBILEG Erkhembayar — Administrator.
- **Acceptance criterion:** Idempotency is exact, tenant-bound, revalidated, and produces no duplicate knowledge artifact.
- **Status:** `Not Executed`

### SIR02-KM-OE-15 — Controlled reopening test

- **Classification:** `Operational environment evidence required`
- **Objective:** Prove every reopening prerequisite gates authorization while all executable ingestion/RAG boundaries remain disabled.
- **Baseline requirement:** Explicit approvals, operational evidence, exact allowlists, approved configuration/change, health, rollback, and no Critical/High findings precede reopening.
- **Preconditions:** OE-01 through OE-14 accepted; approved non-live test environment; proposed enablement config isolated from live systems; rollback/stop controls.
- **Test/input data:** Complete synthetic prerequisite set plus one missing/conflicting case for every gate.
- **Tenant constraints:** Exact test allowlist only; missing or foreign tenant denies; no wildcard or fallback.
- **Execution method:** Evaluate the authorization gate and boundary controls without changing active feature flags or invoking ingestion, embedding, indexing, storage, retrieval, or traffic.
- **Expected result:** Complete set yields only `eligible_for_separate_reopening_decision`; every incomplete set yields denial; runtime remains disabled.
- **Fail condition:** Any capability activates, approval is inferred, wildcard passes, missing evidence passes, or rollback/health evidence is absent.
- **Required output:** Gate matrix, authorization-only outcomes, unchanged-feature-state proof, rollback/health evidence, audit reconstruction.
- **Checksum/reference:** Checksummed gate/state evidence and immutable controlled-environment run reference.
- **Reviewer:** SODBILEG Erkhembayar — Administrator plus required governance and operational owners.
- **Acceptance criterion:** Gating is complete and fail closed while the test proves zero runtime enablement or live artifact creation.
- **Status:** `Not Executed`

## Dependencies and execution order

Recommended sequence:

1. Approve test-data classification, evidence schema, isolated namespace, reviewer independence, and non-live execution authorization.
2. OE-01 → OE-03 establishes registration, binding, and human approval records.
3. OE-04 → OE-05 establishes lineage and provenance.
4. OE-06 → OE-07 and OE-13 exercises lifecycle replacement, quarantine, duplicate, and conflict behavior.
5. OE-09 and OE-11 proves reconciliation and fail-closed mandatory evidence.
6. OE-10 indexes and independently reviews reusable Phase 6 security evidence.
7. OE-12 reconstructs audit evidence from the preceding lifecycle operations.
8. OE-14 validates exact-version idempotency after lifecycle identity is stable.
9. OE-08 runs only after retention/deletion governance and non-live storage are approved.
10. OE-15 runs last, after OE-01 through OE-14 are accepted, and verifies authorization gating only.

## Implementation impact assessment

No code was changed or test executed in preparing this plan. Future evidence production will require new deterministic test fixtures and tests for registry records, approval records, lineage, supersession, quarantine, reconciliation, missing-evidence denial, lifecycle audit coverage, duplicate/conflict behavior, and RAG-specific idempotency. It may also require test-only lifecycle ports/adapters where the current Phase 6 foundation has no interface. OE-08 and OE-15 additionally require approved non-live environment, storage, policy, and operational controls. Any production runtime change requires separate scope and approval.

## Evidence status protection

`SIR02-DEF-02` remains `Missing / Not Reviewed`. This plan and matrix are planning artifacts only and cannot be used as executed operational evidence.
