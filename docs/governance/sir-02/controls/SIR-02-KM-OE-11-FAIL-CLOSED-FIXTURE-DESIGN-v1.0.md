# SIR-02 KM OE-11 Test-Only Fail-Closed Fixture Design

## Document control

| Field                            | Value                                                                        |
| -------------------------------- | ---------------------------------------------------------------------------- |
| Document                         | `SIR-02-KM-OE-11-FAIL-CLOSED-FIXTURE-DESIGN`                                 |
| Version                          | `v1.0`                                                                       |
| Status                           | `Authorized for Test-Only Implementation`                                    |
| Evidence item                    | `SIR02-KM-OE-11 — Missing Approval / Version / Provenance Fail-Closed Tests` |
| Environment                      | `Isolated Non-Live Evidence Execution`                                       |
| Namespace                        | `sir02-km-evidence-v1`                                                       |
| Fixture schema                   | `SIR02-KM-EVIDENCE-FIXTURE v1.0`                                             |
| Data classification              | `Synthetic` only                                                             |
| Owner                            | GANTUMUR Erdenedalai — Founder / Administrator                               |
| Reviewer                         | SODBILEG Erkhembayar — Administrator                                         |
| Decision date                    | `2026-09-26`                                                                 |
| Immutable design reference       | `1d17f0c1f51386fc8b0161b60a6f30804e0aa9a2`                                   |
| Authorization decision reference | `8689da1fa3e3edf2846c267d0a9103d7eb4cfbc0`                                   |

The owner authorized implementation of the exact `v1.0` design in the immutable reference above, limited to the two test-only files below. The companion authorization record contains the exact owner statement and conditions. This design records no OE-11 execution result and grants no runtime or live-operation authority.

## Controlling references and prerequisite assessment

- Approved Lifecycle-Control Baseline: `48407614af13e8f8239a9e63454c013dc43e432b`. Mandatory tenant, owner, approval, version, provenance, and checksum evidence must fail closed when missing or conflicting; caller or AI assertions cannot supply authority.
- Approved Operational Evidence Plan/Matrix: `37212d5869709f85256618e6b03fffb0622a2049`. OE-11 requires deterministic registry/governance adapters, artifact-call spies, independent negative cases, sanitized denial/audit evidence, and zero downstream calls before artifact creation.
- Gate A approval: `84a05702b744a6a710644299381e30e9a9a7aefb`. Only synthetic data, schema `v1.0`, namespace `sir02-km-evidence-v1`, deterministic run metadata, and independent review are permitted.
- OE-09 accepted independent review: `564d545c6ec0e0d52e43d758c0ba7ff8810df6aa`.

The accepted OE-01 through OE-07 artifacts provide immutable lifecycle inputs. The existing `tests/testing/sir02-km-oe09-reconciliation-fixture.ts` exports a read-only `loadAcceptedEvidence` function, pinned accepted-input manifest, namespace/schema constants, and inventory types. Those may be imported without editing the accepted OE-09 implementation. Its inventory reconciliation and constant `knowledgeProcessingCalls: 0` do not measure OE-11 processing boundaries or cover every mandatory approval/authority case. Phase 6 RAG tests and fixtures provide partial denial and spy patterns, but their generic tenant fixtures and runtime behavior are not the OE-11 lifecycle gate or approved Gate A evidence execution. No existing fixture satisfies the complete OE-11 precondition.

## Exact implementation boundary and authorized files

Only the following **new** test-only files are authorized for implementation:

| Path                                                  | Responsibility                                                                                                                                                                                                                    |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/testing/sir02-km-oe11-fail-closed-fixture.ts`  | Read-only accepted-input loading; deterministic synthetic registry, approval/governance, and provenance/lineage adapters; trusted validation gate; instrumented no-op downstream ports; sanitized denial and audit serialization. |
| `tests/integration/sir02-km-oe11-fail-closed.test.ts` | One positive control and isolated mutations for every required negative case; independent expected results; counter, disclosure, audit, cleanup, determinism, and safety assertions.                                              |

The companion decision record is `SIR-02-KM-OE-11-FAIL-CLOSED-FIXTURE-AUTHORIZATION-v1.0.md`. No other file is authorized for implementation. In particular, do not change the OE-09 fixture or tests, `apps/`, `packages/`, runtime configuration, dependencies, migrations, storage, deployment, credentials, secrets, or traffic. If implementation needs another file or a change to either existing runtime behavior or the accepted OE-09 code, stop and seek a new design and owner authorization.

Use the existing Vitest and Node facilities. The new fixture must import no live ingestion, RAG, embedding, indexing, vector-store, retrieval, or traffic adapter. It performs validation against in-memory synthetic projections only. The approved OE evidence artifacts are read from immutable Git commits and never changed. Each negative is a fresh in-memory copy of the valid input; mutations cannot leak between cases or modify the clean control.

## Test-only interfaces and adapter responsibilities

| Interface or structure      | Required content and behavior                                                                                                                                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PinnedEvidenceInput`       | Evidence ID, exact commit, artifact path, SHA-256, accepted review reference, schema, namespace, synthetic classification. Reuse OE-09's loader/manifest read-only where valid.                                                                               |
| `SourceKey`                 | Exact synthetic tenant ID, canonical source ID, registration ID, and source version; reject empty, wildcard, global, or ambiguous values.                                                                                                                     |
| `SourceRegistryAdapter`     | Return the registered source/version, tenant and owner binding, content checksum, and lifecycle state from immutable accepted evidence. Missing/duplicate/conflicting records produce a typed invalid result, never a chosen record.                          |
| `ApprovalGovernanceAdapter` | Return only an explicit exact-version human decision, approver identity, trusted authorization context, decision time, checksum, and immutable decision reference. It cannot infer approval from registration, lineage, provenance, recency, or caller input. |
| `ProvenanceLineageAdapter`  | Return authoritative source origin, provenance hop references, lineage root/predecessor, exact version/checksum, and immutable input links. A broken, circular, foreign-tenant, missing, or conflicting hop is invalid.                                       |
| `ValidationRequest`         | Synthetic caller tenant, exact source key, immutable input manifest, optional untrusted caller assertions for rejection tests, and sanitized correlation ID. Caller assertions are never adapter authority.                                                   |
| `ProcessingCallCounters`    | Separate integer counters for parsing/chunking, embedding, indexing, vector/storage writes, retrieval preparation, and other knowledge processing. Each no-op spy increments only if invoked; no spy calls a runtime port.                                    |
| `ValidationOutcome`         | `Valid / Non-Operational Test State` for the complete positive chain, or `Blocked / Fail Closed` with stable reason codes, zero downstream calls, sanitized caller view, and one audit result. Neither outcome enables knowledge use.                         |

The registry, approval, and provenance adapters must derive their respective facts from their own accepted OE records. Shared canonical ID parsing and immutable-input loading are permitted; an adapter must not copy another adapter's decision. The accepted chronology is preserved: OE-01's original approval timestamp is the approval event, OE-03 `0003` reconstructs that same event, OE-06 supersedes `v1.0`, and OE-07 quarantines it. The positive control validates the complete historical chain but does **not** mark `v1.0` active or approve `v1.1`.

## Deterministic fail-closed decision algorithm

1. Verify the Gate A namespace, schema, synthetic classification, exact tenant scope, and pinned evidence commit/path/SHA-256/review references before using any lifecycle fact. An input error is normalized to a safe denial and sanitized audit event; raw file paths, exception text, source content, or foreign-tenant facts are not returned to the caller.
2. Resolve exactly one registered source/version with one tenant and owner binding. Resolve the exact-version approval separately through the governance adapter. Resolve origin, provenance hops, lineage root, and checksum separately through the provenance adapter. Require exact agreement across all three. Reject missing, invalid, duplicate, conflicting, circular, wildcard, foreign-tenant, or ambiguous facts.
3. Check trusted approver authorization, decision, event chronology, immutable references, and source/content checksum. Never select the newest or “best available” record; never repair a conflict; never infer approval or provenance. Treat caller/AI supplied fields only as untrusted inputs and reject any attempt to substitute them for server-controlled evidence.
4. The **only** positive outcome is `Valid / Non-Operational Test State` when all required evidence is complete and consistent. This validates evidence without calling downstream ports, enabling an active source, or reopening ingestion. Every negative outcome is `Blocked / Fail Closed` at the earliest trusted boundary.
5. For every negative, assert all six downstream counter categories equal `0`, no partial artifact exists, a sanitized denial and audit event exist, and the caller-visible view contains no protected foreign-tenant field. Tenant B access to Tenant A evidence must yield exactly `0` protected fields disclosed.
6. Sort case results and reason codes by fixed case ID/code. The same accepted inputs and mutation produce byte-stable canonical results, apart from separately recorded Gate A run metadata. Any unexpected throw, missing audit event, spy invocation, counter mismatch, or cleanup failure is an execution failure, not a passing denial.

## Required case matrix

Each case starts from an independent, complete synthetic chain. Mutations are in-memory test inputs, never edits to accepted artifacts. Where a row names multiple field types, the integration test must exercise each type independently and report each subcase, including its own counters and audit output.

| Case  | Mutation and required fail-closed observation                                                                                                                                                         |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `P01` | Complete accepted registration, tenant/owner binding, exact-version approval, provenance, lineage, checksum, and immutable refs validate as `Valid / Non-Operational Test State`; no processing call. |
| `N01` | Approval record absent.                                                                                                                                                                               |
| `N02` | Approval decision absent.                                                                                                                                                                             |
| `N03` | Approver identity absent.                                                                                                                                                                             |
| `N04` | Approver authorization context absent or untrusted.                                                                                                                                                   |
| `N05` | Source version absent.                                                                                                                                                                                |
| `N06` | Source version unknown to registry/lineage.                                                                                                                                                           |
| `N07` | Provenance origin absent.                                                                                                                                                                             |
| `N08` | Provenance reference absent.                                                                                                                                                                          |
| `N09` | Provenance hop broken or unresolved.                                                                                                                                                                  |
| `N10` | Required lineage/root reference absent.                                                                                                                                                               |
| `N11` | Source/content checksum absent.                                                                                                                                                                       |
| `N12` | Source/content checksum invalid or mismatched.                                                                                                                                                        |
| `N13` | Immutable evidence commit/reference absent or invalid.                                                                                                                                                |
| `N14` | Evidence artifact path/reference absent or invalid.                                                                                                                                                   |
| `N15` | Conflicting approval, version, and provenance records, each as a distinct subcase.                                                                                                                    |
| `N16` | Wildcard approval, version, and provenance identifiers, each as a distinct subcase.                                                                                                                   |
| `N17` | Wrong-tenant approval, version, and provenance evidence, each as a distinct subcase.                                                                                                                  |
| `N18` | Tenant B requests/claims Tenant A lifecycle evidence; `0` protected fields disclosed.                                                                                                                 |
| `N19` | Caller/AI supplied approval and provenance assertions, each as a distinct subcase.                                                                                                                    |
| `N20` | Ambiguous authoritative state or competing equally plausible records.                                                                                                                                 |
| `N21` | Required tenant binding absent.                                                                                                                                                                       |
| `N22` | Required source owner binding absent.                                                                                                                                                                 |

Every `N` case must return `Blocked / Fail Closed`, a tenant-safe caller-visible denial, a sanitized audit record, no artifact, and **zero** parsing/chunking, embedding, indexing, vector/storage, retrieval-preparation, and other downstream calls. The positive case validates only; it also leaves those counters at zero. Existing OE-09 tests may be cited for overlapping reconciliation properties but cannot substitute for these case measurements.

## Output schemas and cleanup

**Per-case result:** `case_id`, mutation label, expected/observed decision, stable reason code(s), pass/fail, synthetic scoped identifiers in internal evidence only, public-denial snapshot, protected-field disclosure count, six `ProcessingCallCounters`, artifact count, audit reference, and cleanup result. Counts must be numeric measurements from test spies, not hard-coded claims.

**Caller-visible denial:** fixed blocked decision, generic safe reason, opaque sanitized correlation ID; no source title/content, owner, approval, version, provenance, checksum, artifact path, or foreign-tenant state. Internal case output may identify synthetic affected IDs only within the authorized evidence package.

**Audit output:** UTC timestamp, event type, scoped synthetic actor and tenant, request/correlation/trace IDs, stable reason code(s), `Blocked / Fail Closed` or positive validation outcome, zero-disclosure count, per-port call counts, and immutable input-reference IDs. Exclude raw document content, secret material, real tenant IDs, untrusted assertion payloads, and protected Tenant A fields from Tenant B caller output. An audit-write failure cannot be recorded as a successful validation.

**Future formal evidence artifact:** under `docs/governance/sir-02/operational-evidence/oe-11/`, include Gate A run ID and UTC execution timestamp, executor/reviewer, repository baseline commit, approved plan/schema/namespace references, synthetic classification, immutable input manifest, positive result, full case matrix and subcase counts, every counter and disclosure measurement, public-denial snapshots, sanitized audit/correlation evidence, cleanup and live-operation counters, overall execution result, and `acceptance_status: Not Reviewed`. Compute SHA-256 for each completed artifact and preserve the exact bytes in an immutable evidence commit. Do not put a self-referential checksum inside the file being hashed. A later independent review alone may mark OE-11 `Accepted`.

Cleanup discards all in-memory copies and spy state after each case and after the run. No test fixture calls a live processing adapter or creates a persistent knowledge artifact. Preserve only separately authorized governance evidence when formal execution is later approved. A failed formal attempt must receive a separate run ID and immutable record; prior attempts are never overwritten.

## Review and hold

The companion authorization record documents the explicit owner decision on this immutable `v1.0` design. After implementation, an independent review must verify the exact file scope, all case/subcase assertions, real spy measurements, deterministic output, tenant-safe denial, sanitized audit, and cleanup before a formal OE-11 run. Authorization covers implementation only; it does not authorize formal OE-11 execution or evidence acceptance. OE-11 remains `Not Executed`; `SIR02-DEF-02` remains `Missing / Not Reviewed`; the other operational-evidence items and later SIR-02 stages remain unchanged.
