# SIR-02 KM OE-12 Implementation Technical Review v1.0

## Review control

| Field | Value |
| --- | --- |
| Evidence item | `SIR02-KM-OE-12 — Lifecycle Audit Evidence` |
| Implementation reviewed | `048baf7e3444713937318c7150df0e712898c2f1` |
| Design | `997be74295dd826cb93b370b51fcfb1d56a0d689` |
| Authorization decision | `50479eaabfb25e388941253e2451e717785f16cc` |
| Authorization linkage | `a2573cd4ccf5a89f4b4c13f027e962c7b9586744` |
| Designated independent reviewer | SODBILEG Erkhembayar — Administrator |
| Technical assessment author | Codex; this record does not claim to be SODBILEG's personal attestation or decision |
| Exact-commit reviewer attestation | **Absent / independence not established** |
| Single technical implementation-review result | **Rejected** |
| Formal OE-12 execution | **Not authorized** |
| OE-12 operational status | `Not Executed` — unchanged |

This review records reproducible code findings against the authorized design. SODBILEG's personal review and exact-commit independence attestation have not been supplied. No statement in this record attributes the technical findings or decision to SODBILEG. The implementation is rejected on mandatory technical criteria independently of that missing attestation.

## Scope and compatible reuse

The diff from authorization linkage `a2573cd4ccf5a89f4b4c13f027e962c7b9586744` to the reviewed commit contains exactly:

- `tests/testing/sir02-km-oe12-lifecycle-audit-fixture.ts`
- `tests/integration/sir02-km-oe12-lifecycle-audit.test.ts`

No production/runtime, dependency, migration, or configuration file changed in that diff. The fixture imports public Phase 7 audit interfaces, `AuditTelemetryPipeline`, `InMemoryAuditEvidenceStore`, and the public security context helper. It defines a strict test-only extension of the base audit schema and uses read-only pinned accepted OE artifacts. These scope and public-interface checks **pass**. No code, accepted evidence, or runtime setting was changed during this review.

## Technical findings requiring remediation

### F1 — Reconstructor does not enforce the approved transition map

The fixture defines a family-specific `transitions` array for event **construction** at lines 361–375. `reconstructLifecycle` checks only `source.state_before === state` and that `state_after` is nonempty at lines 666–667, then assigns `state = source.state_after` at line 686. It does not compare the observed pair with the allowed pair for that event family.

For example, changing the binding event from `registered → registered` to `registered → approved`, and the following approval event from `registered → approved` to `approved → approved`, preserves continuity, event order, references, and the final `quarantined` state. The reconstruction path would classify that invalid approval chronology as complete. The N09/N15 tests mutate only one side of the chain, so they exercise a continuity mismatch rather than enforcement of the allowed transition map. This fails the design's explicit transition-validation and fail-closed requirements.

### F2 — Referenced lifecycle chronology is not reconstructed

At lines 669–678, the reconstructor verifies that each `source_event_time` is no later than its OE-12 projection time, and checks the original approval timestamp for the approval family. It does not compare the supersession time against the approved version/lineage event or the quarantine time against supersession. A supersession event dated before the original approval can satisfy the current checks if it remains before projection time. N10 tests a timestamp in 2030, which is later than projection time; it does not test an impossible ordering among the pinned lifecycle events. This fails the required source/version chronology and deterministic lifecycle reconstruction checks.

### F3 — Several required negatives are tested only after persistence

N02–N15 and N20 mutate already persisted `CanonicalAuditEvent` objects and call `reconstructLifecycle` directly (`tests/integration/sir02-km-oe12-lifecycle-audit.test.ts`, lines 179–321). In particular, N02's missing trusted tenant, N03's missing source, N04's missing actor, N05/N06's missing correlation, and N07's missing immutable reference do not establish the design-required rejection **before authoritative persistence**. The separate caller-tenant substitution test checks one pre-persistence path, but it does not cover those cases. The nominal `20/20` case labels are present; the approved expected boundary is not directly exercised for these cases.

### F4 — Sink failure evidence lacks the required retained detail

`ExecutionObservation` exposes attempted and committed **counts**, `healthCount`, generic `pipelineHealth`, and retained canonical events (fixture lines 817–829). It does not retain attempted and committed event-ID lists, the failed sink/phase, partial-write flag, or sanitized health records required by the design's `AuditSinkObservation`. The sink-failure tests assert counts and degraded status (integration test lines 350–399), but do not inspect the content of sanitized health evidence. The fixture clears the in-memory health buffers during cleanup, leaving the returned observation unable to prove the specific failure component or health record. The result fails closed, but the required traceable, sanitized sink-failure evidence is incomplete.

## Other review results

| Criterion | Result |
| --- | --- |
| Authorized two-file boundary; no production/runtime change | **PASS** |
| Public Phase 7 interface and in-memory sink reuse | **PASS** |
| Normalized envelope and 14 event-family labels in persisted canonical events | **PASS for presence; reconstruction semantics fail F1/F2** |
| 20 named negative cases | **Present; boundary coverage fails F1/F2/F3** |
| Tenant-bound generated IDs and caller-visible generic denial | **PASS for tested paths** |
| Sensitive-key rejection and no retained prohibited payload in tested paths | **PASS** |
| Sink failure and partial write return blocked status | **PASS for status; retained detail fails F4** |
| Cleanup after normal, failed, and injected cleanup-error paths | **PASS for tested state** |
| OE-08 synthetic audit-only label and `operational_oe08_evidence: false` | **PASS; OE-08 status unchanged** |
| Reported OE-12 tests `27/27`, Phase 7 compatibility `60/60`, repository tests `477/477`, lint/typecheck/formatting | **Reported in implementation turn; not rerun or converted into formal evidence in this review** |
| Reviewer independence | **Not established; exact-commit SODBILEG attestation absent** |

## Decision and next control step

**One technical implementation-review result: `Rejected`.** F1 and F2 independently fail mandatory lifecycle reconstruction criteria; F3 and F4 leave additional acceptance requirements incomplete. A passing test count cannot establish those untested invariants. Formal controlled OE-12 execution is **not authorized** by this review.

Remediation remains restricted to the two already authorized OE-12 test files unless an exact change outside their scope is first designed and authorized. A remediated implementation requires a new exact-commit technical review and SODBILEG's personal independence attestation before it can be accepted for formal execution. Do not rewrite this review or represent it as SODBILEG's personal decision.

OE-12 remains `Not Executed`. The operational-evidence tally remains **11 Accepted / 0 Awaiting Independent Review / 4 Not Executed**. OE-08, OE-14, OE-15, all accepted OE evidence, and `SIR02-DEF-02` at `Missing / Not Reviewed` remain unchanged. SIR-02 remains **Blocking**. No formal OE-12 run or operational evidence artifact was created.
