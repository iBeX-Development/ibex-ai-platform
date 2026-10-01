# SIR-02 KM OE-13 Supplemental Evidence Instrumentation Design

## Document control and authority

| Field | Value |
| --- | --- |
| Document/version | `SIR-02-KM-OE-13-SUPPLEMENTAL-EVIDENCE-INSTRUMENTATION-DESIGN` / `v1.0` |
| Status | `Proposed / Not Approved` |
| Evidence item | `SIR02-KM-OE-13` |
| Owner | GANTUMUR Erdenedalai — Founder / Administrator |
| Reviewer | SODBILEG Erkhembayar — Administrator |
| Environment | `sir02-km-evidence-v1` / isolated non-live |
| Fixture schema | `SIR02-KM-EVIDENCE-FIXTURE v1.0` |
| Decision date | `Owner Input Required` |
| Immutable approved-design reference | `Owner Input Required` |

This design addresses the three evidence-sufficiency findings in clarification review commit `ca366ee8fd2814695051fa745c6f71236d9e1508`. The original formal run `SIR02-KM-OE-13-V1_0-20260926T131738Z-0001`, evidence commit `a0bcdb4ef646b0322cca6e30ef1f8c3b282501c9`, and linkage commit `49b3266a722ac9560f5f2a17ef56f54b7fb565b5` remain authoritative and immutable. A later supplemental execution captures values **not retained** by the original report. It is a separately timed observation, does not replace or relabel formal run `0001`, and must never backfill a missing original-run measurement by inference. The original artifacts and clarification review stay unchanged.

The accepted OE-13 implementation is `00810eb46123d83d22723f7bcf98d195a4c6da87`; its independent implementation review is `0490c87cc1fa1a7bacca21e90dbee0a2f27bd3e5`. The controlling OE-13 design is `92f08b23a77202a7773e09ff6b722db402d7c840`.

## Capability assessment and minimum change set

`executeSubmission` already returns `registryHashBefore/After`, `inventoryHashBefore/After`, counts, conflict codes, pair IDs, quarantine IDs, downstream spy counters, tenant-safe caller output, and cleanup status. The current integration test checks those values but does not retain them in the Vitest JSON report. Its result has `conflictingRecordReferences` and `affectedPairIds` as separate lists: multiple pairs of one type cannot be unambiguously mapped back to their **left/right** references. The classifier has the exact pairs internally, so only a narrow addition to its **internal result** is justified. No classifier decision, accepted scenario expectation, or caller-visible result may change.

Proposed code change set, subject to separate owner authorization:

1. **Modify** `tests/testing/sir02-km-oe13-duplicate-conflict-fixture.ts` only to expose each already computed conflict observation as `{ conflictType, pairId, leftReferenceId, rightReferenceId }` in the internal `SubmissionResult`. Preserve deterministic sort and unique-pair semantics; do not expose this field to `callerVisible` or the tenant-facing audit. Do not change classification, authority, denial, quarantine, or cleanup behavior.
2. **Modify** `tests/integration/sir02-km-oe13-duplicate-conflict.test.ts` to capture the existing raw per-case result values, the newly exposed pair mapping, and observer snapshots for every applicable approved scenario and subcase. Keep the existing assertions; add checks that capture and scenario coverage agree. Write the deterministic supplemental report only after all assertions pass and after the observer is disarmed.
3. **Add** `tests/testing/sir02-km-oe13-live-operation-observer.ts` as a test-only, fail-closed observer. It owns the explicit counters, case-scoped interception, self-tests, and cleanup. No production/runtime import may use it.

The separate observer module is necessary to keep process interception, restoration, and counter validation out of the accepted fixture's lifecycle logic. No additional code file, dependency, migration, production adapter, or configuration is proposed. If these three files prove insufficient, stop and seek a revised design and owner decision before coding.

## Measurement boundary and observer architecture

The observer measures **attempted calls inside the isolated OE-13 test worker during a bracketed scenario invocation**. It is installed before `executeSubmission`, records an initial zero snapshot, and remains armed until that invocation and its synchronous cleanup finish. Each case gets fresh counters. Installation and restoration use `try/finally`; a hook, audit, or cleanup failure makes that case fail. Test-runner startup, accepted evidence file loading, report writing, and Git operations occur outside the bracket and are not represented as measured scenario actions. The report must state this boundary; it must not claim to measure unrelated processes, historical run `0001`, or all host activity.

The observer must combine: (a) the accepted OE-11 processing-spy snapshot already used by the OE-13 fixture; (b) explicit test-only forbidden-operation ports for each live category; and (c) process I/O guards over the relevant Node test-worker entry points during the bracket, including network/traffic requests, child-process/deployment commands, and filesystem writes. A guarded attempt is counted and blocked **before** the action. The proposed implementation design must map each guarded entry point to a category; unmapped potentially live I/O is counted as an `unknown_prohibited_action` and fails the case. A before/after snapshot of the scoped test process environment and guarded configuration paths detects configuration, credential, or secret mutation attempts where applicable. The observer must not itself call a live service, open a socket, spawn a deployment process, or write production storage. It may never claim that a category is measured merely because a counter was initialized to zero.

Self-tests must deliberately invoke each observer category through a **synthetic blocked attempt**, prove that the matching counter increments, prove the operation did not happen, and prove restoration and reset. No synthetic probe is a live call. For each real supplemental case, the explicit measured counters must all be zero. If an operation can bypass the defined in-process boundary, if a hook cannot be installed or restored, or if a category lacks a working probe, the supplemental capture fails and must not publish zero as a measurement. The result must distinguish `measured_zero`, `observed_attempt_blocked`, `measurement_unavailable`, and `not_in_scope`; only `measured_zero` satisfies the zero requirement.

The live-operation counter schema uses nonnegative integer fields: `live_ingestion`, `live_parsing_chunking`, `live_embedding`, `live_indexing`, `live_vector_store_write_population`, `live_retrieval_preparation`, `live_production_storage`, `deployment_action`, `configuration_mutation`, `credential_operation`, `secret_operation`, `traffic_network_action`, and `unknown_prohibited_action`. Retain the separate existing downstream-spy counters for parsing/chunking, embedding, indexing, vector/storage, retrieval preparation, and other knowledge processing. Every category must include its observation source and probe result in the report. Zero values are accepted only after boundary installation and probe validation pass.

## Per-case capture and deterministic comparison

Capture one internal object for each approved OE-13 scenario and applicable subcase, with a stable `scenario_id` and `subcase_id`, namespace/schema, synthetic `tenant_id + canonical_source_id + version` composite identity, input manifest reference, original accepted lifecycle timestamps, and separate supplemental capture timestamp. Source IDs and references must be synthetic or immutable governance references only. Do not serialize raw content or a real tenant identifier.

### Raw state hashes

| Field | Meaning |
| --- | --- |
| `hash_algorithm` | `SHA-256` |
| `authoritative_registry_sha256` | Registry state immediately before the candidate submission |
| `observed_registry_sha256` | Registry state immediately after the submission and before cleanup |
| `authoritative_artifact_inventory_sha256` | Logical inventory immediately before submission |
| `observed_artifact_inventory_sha256` | Logical inventory immediately after submission and before cleanup |
| `expected_relation` | `equal` for exact replay/conflict; explicitly defined for valid distinct scoped identity |
| `relation_result` | Comparison of retained raw hashes, not a substitute for the raw values |

These are the accepted fixture's before/after hashes, not a claim of a separately constructed derived inventory. Any future independent derivation must be labeled separately. Validate 64 lowercase hexadecimal characters, stable ordering, repeatability, and consistency with exact artifact counts. Hash calculation must use the fixture's existing deterministic SHA-256 canonicalization; no new hash basis may silently change the accepted result.

### Affected pairs and quarantine

For each conflict observation retain `conflict_type`, deterministic `pair_id`, `left_record_or_reference_id`, `right_record_or_reference_id`, and the immutable/synthetic references from which the pair was formed. Retain `per_type_unique_pair_count`, `total_unique_pair_count`, `quarantine_conflict_record_id`, `human_decision_required: true`, and the human-decision hold reference. Stable sorting and pair-ID deduplication must match the fixture. The new internal pair mapping must be checked against the existing `affectedPairIds`, `exactConflictCount`, `conflictCounts`, and `totalConflicts`; any disagreement fails the capture. Affected references from a foreign tenant remain **internal governance evidence** and never enter caller-visible denial or tenant-facing audit. Exact no-op and valid distinct identity cases explicitly record an empty pair set and no quarantine hold.

### Other per-case fields

Retain decision/classification, original and observed logical authoritative/active/downstream artifact counts, downstream-spy snapshot, complete live-operation counter snapshot and boundary/probe status, protected-field disclosure count, sanitized audit/correlation ID, cleanup status, and pass/fail with exact failure reason. Preserve the original accepted immutable input manifest and lifecycle chronology; no new approval event is created.

## Supplemental artifact and integrity contract

The future artifact is a versioned JSON file under `docs/governance/sir-02/operational-evidence/oe-13/`, headed exactly **`Supplemental Clarification Evidence — does not replace formal run 0001`**. It contains a unique supplemental capture ID, UTC start/end times and duration distinct from the 2026-09-26 formal-run timestamps, executor/reviewer, repository commit, proposed instrumentation implementation and independent-review commits, original formal run/evidence/review references, namespace/schema and `Synthetic` classification, capture boundary/probe report, complete case inventory, hashes, pairs, counters, audit and cleanup results, and `acceptance_status: Not Reviewed`. It must explicitly say which original-run facts are reused and which values were observed only in the later supplement. Do not assign a new formal OE-13 run ID to this supplement or rewrite the original sequence.

The report is serialized with stable key and array ordering and UTF-8 encoding. Calculate SHA-256 over the completed report; retain a separate checksum record and immutable repository commit. Never embed a self-referential checksum. A bounded, noninteractive controlled supplemental execution must retain command, UTC start/end, elapsed time, timeout, exit code, stdout/stderr or test report, and SHA-256 for every retained artifact. On test, boundary, coverage, audit, or cleanup failure, retain an explicit failure artifact and do not publish a successful supplement.

## Safety, review, and status gates

Only synthetic test data and Gate A synthetic tenant identifiers are allowed. No cross-tenant reuse or caller-visible foreign lifecycle values are permitted; Tenant B protected-field disclosure stays `0`. The observer's internal records must be sanitized before publication: no secrets, credentials, real paths to live resources, raw source content, or real tenant data. Request/correlation IDs are deterministic or opaque synthetic values. Cleanup discards in-memory registry, inventory, pairs, audit buffers, counters, request identity, hooks, and temporary files; it records cleanup independently without hiding the primary failure. A second case must not inherit state from the first.

The accepted OE-09 and OE-11 implementation files and tests, all original OE-13 formal artifacts, clarification review, production/runtime files, configuration, deployment, credentials, secrets, storage, ingestion, RAG, embeddings, indexing, vector store, retrieval, traffic, dependencies, migrations, and later-stage governance files **must remain unchanged**. Only the three proposed test-only code paths above may be changed after explicit owner authorization. The original OE-13 fixture may be modified solely for the internal pair mapping stated above; its accepted behavior and public denial output must remain byte-for-byte equivalent in validation.

Required order: owner approves this exact design and file list; implement only authorized test-only changes; rerun OE-13 and repository regression validation, lint, typecheck, formatting, isolation and observer self-tests; obtain independent implementation review; obtain separate controlled supplemental-execution authorization; perform bounded supplemental capture; independently review the supplemental evidence **and** SODBILEG's personal attestation for the formal review before any final OE-13 acceptance decision. No approval in one stage implies the next. The three clarification findings are **capable of being addressed by this design if the observer boundary is demonstrably complete and all raw per-case values are retained**; this document neither claims the original run measured them nor pre-accepts a future supplement.

Until those gates complete, OE-13 remains `Executed / Awaiting Independent Review`; the clarification review remains open; the other 14 operational evidence items remain unchanged; `SIR02-DEF-02` remains `Missing / Not Reviewed`; SIR-02 remains `Blocking`. No ingestion reopening, Shadow activation, production use, or next OE item is authorized here.
