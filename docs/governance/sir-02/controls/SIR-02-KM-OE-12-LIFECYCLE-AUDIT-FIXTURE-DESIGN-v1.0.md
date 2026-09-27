# SIR-02 KM OE-12 Lifecycle Audit Fixture Design v1.0

## Document control and decision boundary

| Field | Value |
| --- | --- |
| Document | `SIR-02-KM-OE-12-LIFECYCLE-AUDIT-FIXTURE-DESIGN` |
| Design version | `v1.0` |
| Design status | `Prepared for Owner Decision / Implementation Not Authorized` |
| Evidence item | `SIR02-KM-OE-12 — Lifecycle Audit Evidence` |
| Owner | GANTUMUR Erdenedalai — Founder / Administrator |
| Reviewer | SODBILEG Erkhembayar — Administrator |
| Environment | `Isolated Non-Live Evidence Execution` |
| Namespace | `sir02-km-evidence-v1` |
| Fixture schema | `SIR02-KM-EVIDENCE-FIXTURE v1.0` |
| Data classification | `Synthetic` only |
| OE-12 status | `Not Executed` |

This is a design, not an implementation, test result, approval, or operational audit record. The companion authorization record remains `Proposed / Not Authorized`. Owner approval of this exact version and file scope is required before coding. Formal OE-12 execution and independent evidence review are later, separate steps.

## Authority and current sufficiency finding

- Lifecycle-Control Baseline: `48407614af13e8f8239a9e63454c013dc43e432b`.
- Operational Evidence Execution Plan and Acceptance Matrix: `37212d5869709f85256618e6b03fffb0622a2049`. OE-12 requires a normalized event set, transition coverage map, lifecycle reconstruction, and missing/unbound/duplicate/conflicting-event, redaction, and sink-failure negatives. It is `Not Executed`.
- Gate A approval: `84a05702b744a6a710644299381e30e9a9a7aefb`. Only synthetic data, the approved isolated namespace/schema, deterministic run identity, immutable references, and independent review are permitted.
- Phase 7 audit foundation and validation: `dad2cd09ab5adc0046d67db6a91917669198db93`. Generic normalization, trusted-context checks, redaction, sink health, and request-trace reconstruction are reusable read-only; they do not themselves prove KM lifecycle reconstruction.
- Phase 10 validation: `d0b5a174ed6f5635349186caace0642687fe7c86`. Regression support, not a substitute for direct lifecycle event evidence.
- Accepted OE-01 through OE-07, OE-09, OE-10, OE-11, and OE-13 are immutable upstream inputs. OE-10 final independent review is `02db21acd0faf8a90bcbf09f3a46657b0bd7eff8`; OE-13 final independent review is `f415701fe52eb4b0c347b6b96d3e3d2008343e23`.

Existing KM artifacts have separate sanitized audit observations, but no retained, single Phase 7 normalized stream that reconstructs all required lifecycle transitions. OE-08 remains `Not Executed` and has separate retention/deletion policy and non-live environment prerequisites. The fixture below fills the **audit-test** gap without asserting operational deletion or changing accepted evidence.

## Exact proposed implementation scope

| Proposed file to add | Sole responsibility |
| --- | --- |
| `tests/testing/sir02-km-oe12-lifecycle-audit-fixture.ts` | Read-only evidence pinning and projection, deterministic synthetic clock/event IDs, Phase 7-compatible test-only event adapter, in-memory audit sinks, transition reconstruction, negative-case mutation, tenant-safe output, and cleanup. |
| `tests/integration/sir02-km-oe12-lifecycle-audit.test.ts` | Independent expected-event/transition assertions, all positive and negative cases, sink/redaction/tenant tests, deterministic output and cleanup checks. |

These are the **only proposed implementation changes**. Existing accepted OE fixture, test, and evidence files and `packages/audit/src/**`, `packages/contracts/src/**`, and all other production/runtime files are read-only. No new dependency, migration, configuration, deployment, credential, secret, storage, ingestion, RAG, embedding, indexing, vector-store, retrieval, or traffic change is proposed. Use existing Node/Vitest and in-memory Phase 7 ports. If the public Phase 7 contract cannot carry the proposed normalized event envelope without a production modification, type bypass, or weakened validation, stop before coding and obtain a separate architecture/design/authorization decision; do not modify Phase 7 under this design.

### Read-only reuse plan

| Existing component | Proposed use and limit |
| --- | --- |
| `packages/audit/src/index.ts` and `packages/audit/src/pipeline.ts` | Import exported normalization/pipeline types, `AuditTelemetryPipeline`, and `InMemoryAuditEvidenceStore` where the public contract supports KM test events. Reuse redaction, tenant-context validation, sink-health, and failure semantics. No edits or private API access. |
| `tests/unit/audit-telemetry-pipeline.test.ts`; `tests/integration/gate-p7-audit-trace.test.ts` | Read-only assertion examples for trusted context, cross-tenant mismatch, redaction, and sink failure. Their generic request-trace result is not counted as OE-12 lifecycle proof. |
| `tests/testing/sir02-km-oe09-reconciliation-fixture.ts` | Read-only accepted OE-01–OE-07 immutable-input loader, exact path/commit/checksum checks, schema, namespace, and synthetic tenant constants where compatible. Do not edit or treat inventory reconciliation as audit reconstruction. |
| Accepted OE-01–OE-07, OE-09, OE-10, OE-11, OE-13 artifacts | Load by pinned commit/path/SHA-256 and accepted-review reference. Preserve original timestamps, decisions, failed/remediated attempts, and artifact bytes. Do not convert test outcomes into claims of historical Phase 7 emission. |
| Existing Phase 1/6 tenant tests and OE-10 evidence index; OE-11/OE-13 fixtures | Read-only tenant-denial, audit, cleanup, and conflict examples where compatible. The OE-12 adapter owns its own event and reconstruction results. |

The loader must fail closed on a missing path, unavailable commit, checksum mismatch, unaccepted upstream review, namespace/schema mismatch, real or wildcard tenant, ambiguous version, or inconsistent chronology. An accepted artifact is a **source for a labeled test-only projection**, not proof that it historically emitted an OE-12 normalized event. OE-03 sequence `0001 → 0002 → clarification → 0003`, OE-06's pre-artifact tooling attempt, OE-11's attempt lineage, and OE-13's formal/supplemental/correction lineage remain visible and are not collapsed into one success record.

## Proposed interfaces and data structures

| Type | Required fields and invariant |
| --- | --- |
| `PinnedEvidenceInput` | Evidence ID, exact repository path, immutable evidence commit, SHA-256, accepted-review commit, original lifecycle timestamp, namespace/schema, synthetic tenant. Verify bytes before projection. |
| `TrustedSyntheticContext` | Server-side test tenant, actor, request/correlation/trace IDs, namespace and schema. Caller-provided tenant/identity fields are separate untrusted input and never become audit authority. |
| `KmLifecycleAuditEvent` | The normalized event envelope below, plus `projection_kind`, original source timestamp, test emission timestamp, and provenance of each asserted field. Immutable after normalization. |
| `TransitionEdge` | Tenant/source/version key, before/after states, event ID/type/time, immutable input reference, decision and actor; a denied event is recorded but creates no accepted state edge. |
| `AuditSinkObservation` | Attempted/committed event IDs, failed sink/phase, sanitized health record, partial-write flag, final health, caller-safe result. A partial write is never reported as a complete successful audit set. |
| `ReconstructionResult` | Deterministic ordered events, type counts, transition map, gaps/conflicts, tenant and owner consistency, chronology, immutable-reference resolution, accepted/blocked result, sink result, cleanup status, and SHA-256-ready canonical serialization. |

### Required normalized event envelope

Every applicable test event must retain: `event_id`, `event_type`, trusted `tenant_id`, `canonical_source_id` or exact resource ID, `source_version` when applicable, accountable `actor_id`/executor, `decision` and outcome, `state_before`, `state_after`, `request_id`, `correlation_id`, `trace_id` where applicable, immutable `evidence_id`/commit/path/checksum reference, UTC `event_timestamp`, sanitized bounded metadata, `audit_sink_result`, and tenant-safe caller-visible result where applicable. Record original lifecycle time separately from OE-12 projection/emission time. Use explicit `not_applicable` only for genuinely inapplicable state/version fields; a missing required value fails closed. Prohibit raw customer content, prompts, chain-of-thought, secret/credential material, and untrusted tenant assertions in retained output. Hash canonical sorted UTF-8 output with SHA-256 at formal execution; this design records no artifact checksum.

The test-only adapter must retain typed KM lifecycle details without evading Phase 7 trusted-context, sanitization, or sink validation. Tests must inspect **persisted canonical events**, not merely constructed input objects or PASS flags. The fixture must separately label `source_event_time`, `projection_time`, and `test_emission_time`, so reconstructing an old event does not create a second approval or change its accepted chronology.

## Positive lifecycle event and transition coverage

| Event family | Basis and required assertion |
| --- | --- |
| Source registration | OE-01 registration ID, tenant, owner, exact `v1.0`, origin and original timestamp; emit a labeled test-only registration projection. |
| Tenant/source-owner binding | OE-02 exact binding and denied substitutions; owner and tenant remain stable for the source/version. |
| Source approval | OE-01 original approval time plus OE-03 corrected reconstruction; one original version-specific approval event, **zero** new approval decisions. |
| Source rejection | A synthetic rejected approval attempt tied to a recorded negative outcome; never state that a second historical approval/rejection was enacted. Denial leaves approved state unchanged. |
| Version/lineage | OE-04 exact `v1.0` root and unapproved `v1.1` successor; no inherited approval. |
| Provenance | OE-05 exact origin/hop/version/reference chain. |
| Supersession | OE-06 exact predecessor/successor, authorized reason, chronology, and non-active predecessor. |
| Stale/quarantine | OE-07 exact `v1.0` stale trigger and quarantine; no unauthorized reactivation. |
| Duplicate/conflict decision | OE-13 exact-repeat no-op and typed divergent conflict; no silent merge, overwrite, or newest-wins. |
| Human-decision/quarantine hold | OE-13 typed hold and unique affected-pair references; hold is not an approval or active content. |
| Fail-closed lifecycle denial | OE-11 invalid/missing approval, version, or provenance cases; zero downstream processing and tenant-safe outcome. |
| Permission/tenant-isolation denial | OE-02 exact Tenant B denial and accepted OE-10 permission index; protected-field disclosure `0`. |
| Reconciliation | OE-09 clean and blocked discrepancy outcomes; input/checksum references preserved. |
| Synthetic withdrawal/deletion/retention **audit-only** transition | A clearly labeled generated metadata event used only to test normalization, trusted correlation, chronology, sanitization, and reconstruction. No actual deletion, retention policy, derived-artifact propagation, or OE-08 operational claim. |

One event type is not sufficient merely because its source artifact exists. The integration test must inspect the retained canonical event, its direct immutable reference, and its transition edge or explicit denied/no-op outcome. Build expected coverage independently from the projection algorithm. A complete positive reconstruction requires all applicable event families, exact state order, stable tenant/owner/source binding, and resolved immutable references; the synthetic audit-only OE-08 boundary is reported separately.

### OE-08 boundary

OE-08 remains `Not Executed`. Its approved numeric retention/legal-hold/deletion policy, authorized non-live stores, propagation receipts, and operational reconciliation are separate prerequisites. The OE-12 synthetic audit-only event must carry `synthetic_audit_only: true` and `operational_oe08_evidence: false`, use only logical metadata, and be excluded from any count or statement of operational deletion. It may verify that an audit transition *would* normalize and reconstruct; it cannot prove that a source, chunk, embedding, index, vector, cache, or retrieval artifact was removed. The formal OE-12 package must show this limitation prominently.

## Deterministic construction and reconstruction algorithm

1. Verify every pinned upstream artifact's Git object, path, SHA-256, accepted review, synthetic classification, and exact tenant/version. No mutable runtime state is an authority.
2. Select only source facts proved by accepted evidence. Mark every generated scenario or projection as test-only and identify its immutable basis. Preserve the original OE-01 approval timestamp and all later source-event times; assign a separate deterministic OE-12 synthetic clock for generated audit events.
3. From trusted synthetic context, construct one immutable event per required type and deterministic event IDs derived from OE-12 event type, scoped source key, stable sequence, and fixed synthetic clock. Reject duplicate IDs. Do not derive authority from caller assertions or pick a newer record to resolve conflict.
4. Submit events through compatible exported Phase 7 pipeline interfaces into test-only in-memory sinks. Record attempted and actually persisted IDs, sanitized health/output, and any rejection. Verify the persisted canonical envelope, including source/version and original immutable evidence reference.
5. Reconstruct by trusted tenant + canonical source + exact version and event dependency order. Compare timestamps and before/after states; denied/no-op events produce audit outcomes but do not advance approved state. Validate transition and reference graphs, and retain attempt/remediation lineage as separate nodes.
6. Require the exact event set and per-type counts, no missing edge, no conflicting or cross-tenant edge, and no sink gap. Any ambiguity, missing reference, duplicate, unsanitized value, or partial sink result produces an explicit blocked reconstruction and tenant-safe caller denial; never silently fill gaps.
7. Serialize with fixed field order and sorted identifiers, compute SHA-256 during the later formal run, and discard all test-only mutable state in `finally`. Cleanup failure must be reported alongside the primary failure without masking it.

## Required negative-case matrix

Each case starts from a fresh synthetic baseline, changes only one specified dimension unless testing a deliberate conflict, and asserts a stable reason, fail-closed reconstruction, no unauthorized lifecycle action, tenant-safe output, sanitized audit/health evidence, and cleanup. Expected results must be independent of the fixture evaluator.

| ID | Negative case | Required observed result |
| --- | --- | --- |
| N01 | Missing required lifecycle event | Missing-transition failure; no reconstructed complete chain. |
| N02 | Missing trusted tenant binding | Reject before persistence as authoritative event. |
| N03 | Missing source/resource identity | Reject; no wildcard or inferred source. |
| N04 | Missing actor/executor | Reject; do not infer from owner or reviewer. |
| N05 | Missing request ID | Reject incomplete trusted correlation. |
| N06 | Missing correlation ID | Reject incomplete trusted correlation. |
| N07 | Missing immutable evidence reference | Reject untraceable transition. |
| N08 | Duplicate event ID | Reject or quarantine conflicting duplicate; no last-write-wins. |
| N09 | Conflicting state transition | Reject both ambiguous resolutions. |
| N10 | Out-of-order chronology | Reject impossible transition order. |
| N11 | Cross-tenant injected event | Reject without Tenant A protected-field disclosure. |
| N12 | Spoofed tenant context | Server-bound tenant wins; spoofed event cannot satisfy reconstruction. |
| N13 | Caller-supplied audit tenant override | Ignore as authority and fail closed on mismatch. |
| N14 | Conflicting source/version event | Reject mixed lineage or version approval. |
| N15 | Invalid before/after state transition | Reject; no automatic repair. |
| N16 | Unredacted sensitive field | Block persistence/export and retain sanitized health evidence. |
| N17 | Prohibited sensitive key or value | Block nested/alias variants, including prompt, secret, credential, and reasoning content. |
| N18 | Audit sink failure | Fail safe; health identifies failed sink without protected payload. |
| N19 | Partial audit sink write | Report attempted versus committed events and incomplete reconstruction; never mark delivery complete. |
| N20 | Ambiguous reconstruction result | Fail closed; no newest-event-wins or guessed authoritative state. |

### Audit sink and security decision rules

- Test evidence-store, audit-exporter, security-exporter, metrics-exporter, and health-exporter ports separately where applicable. Inject a deterministic failure before write and after a known committed prefix. Record which event IDs persisted and which did not; the prefix does not become a complete valid lifecycle.
- A sink failure must propagate an explicit failure, produce a sanitized health result on the independent health path, and leave the pipeline degraded where the Phase 7 contract requires it. If health output itself is unavailable, fail the test explicitly; never report silent success.
- An unavailable, caller-supplied, cross-tenant, or mismatched trusted context cannot supply an authoritative tenant. Tenant B must not see Tenant A source/owner/version/approval/provenance/hash/reference values or even an existence distinction. Caller-visible protected-field disclosure must equal `0`.
- Rejection must occur before any unauthorized lifecycle processing. Record test-only downstream call counters for parsing/chunking, embedding, indexing, vector/storage write, and retrieval preparation, all `0` for blocked cases. The positive audit test never invokes live downstream processing.
- Audit metadata is limited to synthetic identifiers, bounded reason codes/counts, immutable evidence refs, and correlation IDs. Verify redaction against nested and alias keys. Neither generated artifacts nor logs may contain chain-of-thought, raw prompt, secret, credential, or customer content.

## Formal evidence output contract and later review

The later, separately authorized formal run should retain: Gate A deterministic run ID and UTC execution time; exact repository/implementation/review references; test classification/namespace/schema; verified input commit/path/SHA-256 and review references; canonical normalized event set and its SHA-256; event IDs and counts by type; trusted request/correlation/trace map; transition coverage and reconstruction report; all N01–N20 expected/observed results; redaction/sink failure/tenant-isolation results; Tenant B disclosed-field count; attempted/committed sink counts and health; zero live-operation counters; cleanup/reconciliation; SHA-256 for every retained artifact; and an explicit `Executed / Awaiting Independent Review` or `Execution Failed` result. No output is created by this design step.

Implementation must pass independent scope/security review before formal OE-12 execution. Formal evidence cannot be `Accepted` until SODBILEG independently reviews the immutable run. `SIR02-DEF-02` remains `Missing / Not Reviewed`; OE-08, OE-14, OE-15 and all accepted evidence remain unchanged. No live/Shadow knowledge processing or production use is authorized.
