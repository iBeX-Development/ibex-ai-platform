# SIR-02 KM OE-09 Test-Only Reconciliation Fixture Design

## Document control

| Field                               | Value                                           |
| ----------------------------------- | ----------------------------------------------- |
| Document                            | `SIR-02-KM-OE-09-RECONCILIATION-FIXTURE-DESIGN` |
| Version                             | `v1.0`                                          |
| Status                              | `Proposed / Not Authorized`                     |
| Evidence item                       | `SIR02-KM-OE-09 — Source Reconciliation Test`   |
| Environment                         | `Isolated Non-Live Evidence Execution`          |
| Namespace                           | `sir02-km-evidence-v1`                          |
| Fixture schema                      | `SIR02-KM-EVIDENCE-FIXTURE v1.0`                |
| Owner                               | GANTUMUR Erdenedalai — Founder / Administrator  |
| Reviewer                            | SODBILEG Erkhembayar — Administrator            |
| Decision date                       | `Owner Input Required`                          |
| Immutable design approval reference | `Owner Input Required`                          |

This document proposes an implementation. It records no execution result and grants no implementation, ingestion, RAG, deployment, or Shadow activation authority. The companion authorization record is `SIR-02-KM-OE-09-RECONCILIATION-FIXTURE-AUTHORIZATION-v1.0.md`.

## Controlling evidence

- Lifecycle-Control Baseline: `48407614af13e8f8239a9e63454c013dc43e432b`, especially source reconciliation, duplicate/conflict handling, tenant isolation, and fail-closed source use.
- Approved Operational Evidence Plan/Matrix: `37212d5869709f85256618e6b03fffb0622a2049`; OE-09 is `Deterministic test execution required` and currently `Not Executed`.
- Gate A approval: `84a05702b744a6a710644299381e30e9a9a7aefb` (synthetic-only data, approved schema and namespace, run identity, independent review).
- Accepted upstream reviews: OE-01 `a33c8220e595fafad317610e94d09d4f21ecc882`; OE-02 `3328353ea04298729b6e68ca46061393edce2148`; corrected OE-03 `77ae9c99b2601ec58a50bd20c772326688268e5d`; OE-04 `f5ce491bfe3a98af66031a64b9b9620c3bc51420`; OE-05 `3e8d3e1bcf24ccbc52a244bb728964e5cbd340a2`; OE-06 `6c821280369760a4fc8cdf10b611282ca332dea4`; OE-07 `b7932b282833487b1a3eb2ccc6d7ca56015740a5`.
- OE-07 linkage/status: `4b04c1ece0aac079e0a2046e0f4275ddb2f578a0`.

Existing Phase 6 contracts and `tests/testing/rag-runtime-fixtures.ts` provide partial fields and test patterns. They do not implement authoritative/derived lifecycle inventories or reconciliation. Accepted OE artifacts are inputs to this proposed fixture, not OE-09 results.

## Boundary and file plan

The implementation would add exactly two test-only TypeScript files:

| Proposed path                                            | Purpose                                                                                                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/testing/sir02-km-oe09-reconciliation-fixture.ts`  | Immutable-input loader, two independent in-memory projections, schema checks, deterministic reconciliation, sanitized result serialization. |
| `tests/integration/sir02-km-oe09-reconciliation.test.ts` | Clean control and discrepancy scenarios, independent expectations, safety assertions, and test-run evidence generation.                     |

No `apps/`, `packages/`, runtime configuration, migration, deployment, credential, or secret file needs modification. Use the existing Vitest runner and Node facilities; add no dependency. The fixture must not import or call a live ingestion, RAG, embedding, indexing, vector-store, retrieval, cache, or traffic adapter. It must not create persistent production storage or change existing application behavior. Test inputs exist only in the approved namespace, in memory or explicitly approved ephemeral test storage. Only the eventual reviewed evidence package may be retained under `docs/governance/sir-02/operational-evidence/oe-09/` after separately authorized execution.

## Input and projection design

1. Load the exact OE-01 through OE-07 evidence artifacts from their immutable evidence commits. Pin each path, commit, and SHA-256 in an input manifest. Verify bytes and JSON structure before interpretation. Reject missing, mutable-only, mismatched, or unreviewed references. Preserve the corrected OE-03 `0003` approval reconstruction and its original OE-01 approval timestamp; do not treat OE-03 `0002` as accepted evidence.
2. Construct the **authoritative inventory** from registration, exact-version approval, supersession, and quarantine lifecycle records. Keep immutable event IDs, timestamps, tenant/owner identity, and citations. Do not infer a new approval, active state, or lifecycle transition from an execution timestamp.
3. Construct the **derived inventory independently** from accepted tenant/owner binding, version/lineage, and provenance records, with independently parsed supersession/quarantine references where they appear. The derived projection must read its own input fields and use its own builder. It must never clone, spread, serialize/deserialize, or otherwise copy the authoritative inventory. Shared canonical identifier validation is permitted; shared state selection is not. If a required derived fact cannot be reconstructed from accepted records, report a missing-evidence conflict rather than fill it from the authoritative projection.
4. Keep both inventories in separate read-only maps keyed by exact `(tenant ID, canonical source ID, source version)` and retain source registration and lineage-root relationships. Synthetic Tenant A and Tenant B are separate partitions with no cross-tenant lookup fallback.
5. Model accepted history exactly: approved `v1.0` is historically approved but is superseded, stale, quarantined, and non-active after OE-06/OE-07; synthetic successor `v1.1` is unapproved and does not inherit approval. No active knowledge version is inferred from this history.

### Proposed structures/interfaces

The following names describe the minimum test-only contract; they are not current repository types.

| Structure                | Required fields                                                                                                                                                                                                                                                                                                                        |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ImmutableEvidenceInput` | evidence ID, artifact path, evidence commit, review commit, SHA-256, source event IDs/timestamps, schema version, namespace, synthetic classification                                                                                                                                                                                  |
| `SourceVersionKey`       | exact synthetic tenant ID, canonical source ID, source version; no wildcard or empty component                                                                                                                                                                                                                                         |
| `InventoryVersion`       | registration ID, key, owner, content checksum, approval state/reference, lineage root/predecessor, provenance reference, supersession state/reference, stale/quarantine state/reference, active flag, immutable event references                                                                                                       |
| `Inventory`              | projection kind (`authoritative` or `derived`), immutable input references, keyed versions, explicit current-version assertion if evidenced, source/tenant counts                                                                                                                                                                      |
| `Discrepancy`            | stable type/code, affected synthetic key, conflicting reference IDs, expected/observed summary, blocked flag; no foreign-tenant content                                                                                                                                                                                                |
| `ReconciliationResult`   | run metadata, scope, canonical source/registration/tenant/owner, current/approved/unapproved/superseded/quarantined versions, active state, lineage/provenance/approval/supersession/quarantine refs, checksum identity, separately recorded reconciliation timestamp, decision, sorted discrepancies, exact counts, audit correlation |

`current version` describes the exact latest governed lineage version, not automatic approval or active eligibility. Missing or competing authoritative current-version assertions are conflicts. Approval is exact-version and independently evidenced. No wildcard, global fallback, newest-record selection, or caller-supplied authority is permitted.

## Deterministic comparison and fail-closed rules

1. Validate input commit/path/hash, accepted review, Gate A namespace/schema, synthetic classification, canonical non-wildcard IDs, and UTC event chronology. Halt with a typed conflict on invalid input.
2. Sort immutable lifecycle events by their _event_ timestamps with stable ID tie-breaking only for reporting. Validate permitted transitions; do not use evidence-run or reconstruction time as a new lifecycle event. Reject competing events rather than silently choosing one.
3. Build the two projections separately. Compare exact key sets and every governed field: registration, tenant, owner, version, approval, lineage/root, provenance, checksum, supersession, quarantine, active eligibility, and reference validity. Detect duplicate and orphan records, missing expected records, withdrawn records, and derived-artifact inventory mismatches as required by the approved matrix.
4. Emit each discrepancy once with a stable code and synthetic key. Sort by code and key. Counts include input records per projection, matched versions, discrepancies by type, unresolved discrepancies, quarantined/non-active versions, and eligible active versions. Re-run the same immutable inputs to verify byte-stable canonical output apart from separately identified run metadata.
5. Decision is `Reconciled / Non-Operational Test State` only when there is exactly one interpretation and zero unresolved discrepancies. Any missing, conflicting, unverifiable, ambiguous, or cross-tenant record yields `Blocked / Fail Closed`; affected source use remains ineligible. Never repair, merge, infer approval, choose the newest record, or rewrite evidence.
6. If an approved resolution record exists, test it as a distinct cited input and rerun; the fixture itself must not create one. The clean control requires no resolution. Unresolved discrepancies remain explicitly blocked/quarantined. Exact final counts and resolution references are output, including zero where appropriate.
7. Audit output exposes only scoped synthetic IDs, stable conflict codes, counts, immutable reference IDs, and correlation identifiers. A Tenant B view of a Tenant A conflict reveals zero Tenant A metadata fields.

## Scenario matrix for implementation

Each row requires a separate deterministic synthetic mutation of the independent derived input or an explicitly invalid authoritative assertion, with an unchanged clean control. All failures must be blocked before any knowledge-processing call.

| Scenario                                        | Required observation                                                                                                                            |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Clean reconciliation                            | One authoritative interpretation, exact inventory/count agreement; `v1.0` historical approval remains non-active and `v1.1` remains unapproved. |
| Missing registration; orphan record             | Missing root or derived record with no registered root is reported and blocked.                                                                 |
| Missing approval reference                      | Claimed approval without exact-version approval reference is blocked.                                                                           |
| Missing lineage or provenance                   | Missing/broken hop or root is reported and blocked.                                                                                             |
| Conflicting current version                     | Competing current-version assertions are blocked; no newest-record choice.                                                                      |
| Conflicting approval state                      | Approval disagreement or inherited approval is blocked.                                                                                         |
| Conflicting supersession state                  | Predecessor/successor disagreement is blocked.                                                                                                  |
| Conflicting quarantine state                    | Stale/quarantine disagreement is blocked.                                                                                                       |
| Active plus superseded; active plus quarantined | Each contradictory active state is blocked.                                                                                                     |
| Wrong tenant; cross-tenant injected record      | Foreign record cannot enter the partition; zero foreign fields disclosed.                                                                       |
| Owner substitution                              | Mismatched accountable owner is blocked.                                                                                                        |
| Checksum/content mismatch                       | Different checksum for an exact version is blocked.                                                                                             |
| Broken immutable reference                      | Missing commit/path or hash mismatch is blocked.                                                                                                |
| Chronology conflict                             | Event order inconsistent with accepted lifecycle is blocked.                                                                                    |
| Wildcard identifier                             | Wildcard in source, version, tenant, or owner is blocked.                                                                                       |
| Ambiguous authoritative state                   | Two plausible interpretations are both rejected.                                                                                                |
| Duplicate record                                | Duplicate exact key or conflicting duplicate is reported and blocked.                                                                           |
| Missing derived record                          | Expected inventory member absent from the derived projection is reported and blocked.                                                           |
| Withdrawn record                                | Withdrawn state cannot remain active or eligible; missing withdrawal authority is blocked.                                                      |

The withdrawn scenario uses a synthetic _negative test case_ only. It does not assert that OE-01 through OE-07 contain an actual withdrawal event. It must not create a new accepted lifecycle event. Likewise, derived-artifact inventories are test-only metadata; no document, chunk, embedding, index, vector, cache, or retrieval artifact is created.

## Expected execution artifact and audit schemas

The future versioned JSON evidence artifact under `operational-evidence/oe-09/` must contain: Gate A run metadata (`evidence_id`, deterministic `evidence_run_id`, plan/schema versions and immutable refs, namespace, executor, reviewer, UTC execution timestamp, clean repository commit, synthetic classification); a pinned input manifest; independently materialized authoritative and derived inventory summaries with SHA-256; clean and negative scenario observations (`expected`, `observed`, stable conflict codes, affected synthetic IDs, blocked state, zero processing calls); one reconciliation result per scenario; exact counts and exceptions; chronology and tenant-isolation checks; cleanup/reconciliation result; and `acceptance_status: Not Reviewed`. Record original lifecycle event timestamps separately from reconciliation time.

The audit section must contain `request_id`, `correlation_id`, `trace_id`, synthetic actor ID, scoped tenant ID, event type, event UTC timestamp, outcome, stable reason codes, sanitized affected-key references, zero-disclosure measurement, and artifact checksum references. No raw content, secrets, credentials, real tenant IDs, or unscoped foreign-tenant metadata may appear. Compute SHA-256 over each finished artifact and commit the exact bytes before independent review; do not embed a self-referential hash inside the hashed file. Use immutable commit references for the evidence and later review.

Cleanup must discard the in-memory/test-only inventories and mutations after the run, confirm zero live processing calls and zero persistent live artifacts, and retain only the authorized governance evidence package. Execution failure preserves a distinct failed-attempt record and sequence; it must not overwrite prior attempts.

## Acceptance and hold

Implementation review must verify the two builders are independent, scenario expectations are separate from the comparison logic, all listed discrepancies fail closed, deterministic output is reproducible, tenant disclosure is zero, and no production/runtime file or behavior changes. The implementation may begin only after the companion authorization record contains an explicit owner decision, decision date, exact approved design version/scope, and an immutable approval reference. Implementation approval will not itself mark OE-09 executed or accepted. OE-09 remains `Not Executed`; `SIR02-DEF-02` remains `Missing / Not Reviewed`.
