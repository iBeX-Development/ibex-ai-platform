# SIR-02 KM OE-12 Implementation Remediation Design v1.0

## Control and purpose

| Field | Value |
| --- | --- |
| Evidence item | `SIR02-KM-OE-12 — Lifecycle Audit Evidence` |
| Design version | `v1.0` |
| Original implementation | `048baf7e3444713937318c7150df0e712898c2f1` |
| Rejected technical review | `6ce397b29fb72531ecfedbe051ed7eace8204c93` |
| Original fixture design | `997be74295dd826cb93b370b51fcfb1d56a0d689` |
| Original implementation authorization | `50479eaabfb25e388941253e2451e717785f16cc` |
| Remediation authorization | `Proposed / Not Authorized` |
| OE-12 status | `Not Executed` |

This design addresses only findings F1–F4 in the preserved rejected review. The authorized two-file boundary, public Phase 7 reuse, 14 event-family labels, 20 named negative cases, tenant-safe denial, sanitization, cleanup, and OE-08 audit-only boundary remain valid and must not be weakened. Existing accepted OE evidence and the rejected review remain immutable. No implementation, test run, or formal evidence execution occurs in this design step.

## Exact implementation boundary and feasibility

The remediation can be implemented entirely in these existing test-only files:

1. `tests/testing/sir02-km-oe12-lifecycle-audit-fixture.ts` — preflight validator, explicit transition/dependency graph, lifecycle reconstruction, and sanitized sink-attempt observation.
2. `tests/integration/sir02-km-oe12-lifecycle-audit.test.ts` — independent positive/negative expectations, pre-persistence assertions, causal-order cases, and sink-failure evidence assertions.

The existing fixture owns event construction, validation, reconstruction, in-memory sink adapters, and the execution observation. It can capture attempted/committed IDs and a sanitized failure record at those test-only adapters before cleanup. Public Phase 7 ports can remain read-only. No additional file, dependency, migration, production/runtime modification, configuration change, validation bypass, schema change, or non-public coupling is identified as necessary. If implementing this design proves impossible through the public Phase 7 contract without a validation bypass or modification outside the two files, stop before that change and obtain separate design and authorization.

## F1 — Family-specific transition enforcement

Use one explicit, immutable test-only rule table keyed by the 14 approved event families. Both pre-persistence validation and post-persistence reconstruction must consult the same rule table. Tests must define expected pairs independently of the fixture table; they must not merely mirror the implementation. The current projected `v1.0` path has the following exact allowed pairs and decisions:

| Event family | Allowed before → after | Required meaning |
| --- | --- | --- |
| `source_registration` | `unregistered → registered` | Creates the synthetic registered source identity. |
| `tenant_owner_binding` | `registered → registered` | Binds the same tenant and owner; no approval. |
| `source_approval` | `registered → approved` | Reconstructs the original OE-01 approval timestamp for exact `v1.0`; no new approval. |
| `source_rejection` | `approved → approved` | Audits the OE-03 denied attempt without changing the already approved source. |
| `version_lineage` | `approved → approved` | Records exact `v1.0` lineage and unapproved `v1.1`; no inherited approval. |
| `provenance` | `approved → approved` | Adds a traceable origin/reference without changing approval. |
| `supersession` | `approved → superseded` | Supersedes `v1.0`; `v1.1` remains unapproved. |
| `stale_quarantine` | `superseded → quarantined` | Quarantines exact superseded `v1.0`. |
| `duplicate_conflict` | `quarantined → quarantined` | Exact repeat is no-op; divergent record is held, never merged. |
| `human_decision_hold` | `quarantined → quarantined` | Refers to a qualifying conflict/quarantine, without release. |
| `fail_closed_denial` | `quarantined → quarantined` | Denial cannot mutate lifecycle state. |
| `permission_tenant_denial` | `quarantined → quarantined` | Tenant-safe denial cannot mutate lifecycle state. |
| `reconciliation` | `quarantined → quarantined` | Audits the accepted OE-09 outcome without repair. |
| `synthetic_withdrawal_retention` | `quarantined → quarantined` | Audit-only projection; no operational deletion or retention action. |

Reject an unknown family, any before/after pair outside its rule, a mismatch between event decision and transition kind, state skipping, re-entry to an earlier state, an unauthorized release/reactivation, and a family/state mismatch even when adjacent events remain continuous. For no-op or denied families, require `before === after`; for state-changing families require the exact edge. Enforce tenant, owner, canonical source, registration ID, exact version, and immutable reference identity with the transition. Validate the entire proposed event set before the first authoritative sink write. Revalidate retained canonical events during reconstruction so a persisted or tampered stream cannot be declared complete solely because preflight once passed.

Tests must include valid exact edges, invalid nonadjacent jumps, a two-event coordinated mutation that preserves continuity but violates the family map, invalid re-entry, unauthorized `quarantined → approved`, and a wrong-family transition. Each invalid submission must leave the in-memory authoritative audit store unchanged and return a tenant-safe, sanitized fail-closed result.

## F2 — Referenced-event dependencies and causal chronology

Represent dependencies as typed edges between deterministic event IDs and pinned immutable source references. A prerequisite must be present, match tenant/source/version/owner as applicable, and already be validated before its dependent event. The graph must be acyclic, unambiguous, and independently reconstructable; sorting timestamps alone cannot satisfy an edge. Require these minimum dependencies:

| Dependent event | Required predecessor or evidence condition |
| --- | --- |
| `tenant_owner_binding` | Registered source identity from `source_registration`. |
| `source_approval` or `source_rejection` | Registered source and explicit tenant/owner binding; decision applies to the exact source/version and authorized actor/context. The rejected attempt creates no approval edge. |
| `version_lineage` | Registered canonical source, matching tenant/owner, and exact approval state of each referenced version; `v1.1` remains unapproved. |
| `provenance` | Existing source/version and valid lineage/root/origin/reference chain. |
| `supersession` | Existing approved predecessor `v1.0`, existing unapproved successor `v1.1`, valid lineage/provenance, same tenant/source/owner, and the accepted OE-06 authorization. |
| `stale_quarantine` | Existing superseded `v1.0` and exact OE-06 trigger. |
| `duplicate_conflict` | Existing comparable registration/version or immutable reference and the accepted OE-13 conflict/duplicate basis. |
| `human_decision_hold` | Qualifying divergent conflict or quarantine reference; matching deterministic pair/hold reference. |
| `fail_closed_denial` | Existing source/version context and accepted OE-11 denied-case reference; no state edge. |
| `permission_tenant_denial` | Existing tenant-scoped source and accepted OE-10 permission evidence; no protected foreign disclosure. |
| `reconciliation` | Existing referenced source/version inventory and accepted OE-09 reconciliation evidence. |
| `synthetic_withdrawal_retention` | Existing quarantined synthetic `v1.0` and an explicitly labeled synthetic audit-only precursor; no OE-08 operational action. |

Validate original source-event times separately from OE-12 projection/emission times. Preserve the original OE-01 approval timestamp exactly. Enforce causal ordering where the source events are linked: registration/binding before approval; version creation and provenance before supersession; supersession before stale/quarantine; qualifying conflict before its hold. For distinct lifecycle actions require the documented strict later relation; allow equal timestamps only when immutable evidence identifies the same original event or an explicitly permitted simultaneous projection. Denial and reconciliation observations may have independent historical timestamps and must be ordered by their explicit dependency/reference edges, not forced into a false global source-time sequence. Projection order and event IDs remain deterministic and separate from historical chronology.

Preflight and reconstruction must reject a missing prerequisite, reference to an unseen/future event, inversion, wrong tenant/source/owner/version or lineage root, circular graph, conflicting parent, ambiguous duplicate edge, and a source-event time inconsistent with its actual causal predecessor. Tests must include an earlier supersession than its version/provenance basis while still before projection time, quarantine before supersession, a future/unseen predecessor, a cross-tenant predecessor, a cycle, and coordinated state edits that preserve continuity but violate dependencies.

## F3 — Pre-persistence fail-closed validation

Add a deterministic whole-batch preflight before any call to the Phase 7 audit pipeline or authoritative in-memory sink. Check required envelope fields and trusted context, public-contract compatibility, tenant/owner/source/version binding, immutable commit/path/checksum, exact family transition, dependency graph, chronology, duplicate IDs, ambiguity, metadata sanitization, and the OE-08 audit-only marker. Use a prospective in-memory state machine; do not persist an event to discover whether a later event makes the batch invalid. A rejected preflight yields attempted authoritative sink writes `0`, committed events `0`, unchanged authoritative audit state, downstream lifecycle-processing calls `0`, and a sanitized tenant-safe denial with protected-field disclosure `0`. The rejection itself may be represented in a separate sanitized test observation, never as an authoritative accepted lifecycle event.

| Case | Approved negative | Classification and required boundary |
| --- | --- | --- |
| N01 | Missing required lifecycle event | **Pre-persistence validation required:** whole-batch completeness fails before the first write. |
| N02 | Missing trusted tenant binding | **Pre-persistence validation required:** reject unavailable/unbound trusted context. |
| N03 | Missing source/resource identity | **Pre-persistence validation required:** no inferred or wildcard source. |
| N04 | Missing actor/executor | **Pre-persistence validation required:** no inferred actor. |
| N05 | Missing request ID | **Pre-persistence validation required:** reject uncorrelated event. |
| N06 | Missing correlation ID | **Pre-persistence validation required:** reject uncorrelated event. |
| N07 | Missing immutable evidence reference | **Pre-persistence validation required:** reject unresolved commit/path/checksum. |
| N08 | Duplicate event ID | **Pre-persistence validation required:** reject conflicting duplicate; no last-write-wins. |
| N09 | Conflicting state transition | **Pre-persistence validation required:** enforce family map, not just continuity. |
| N10 | Out-of-order chronology/dependency | **Pre-persistence validation required:** validate causal source times and graph edges. |
| N11 | Cross-tenant injected event | **Pre-persistence validation required:** zero protected disclosure. |
| N12 | Spoofed trusted tenant context | **Pre-persistence validation required:** reject untrusted substitution. |
| N13 | Caller-supplied audit tenant override | **Pre-persistence validation required:** caller assertion never becomes authority. |
| N14 | Conflicting source/version event | **Pre-persistence validation required:** reject mixed lineage or version approval. |
| N15 | Invalid before/after transition | **Pre-persistence validation required:** reject forbidden family/state edge. |
| N16 | Unredacted sensitive field | **Pre-persistence validation required:** block protected payload. |
| N17 | Prohibited sensitive key/value | **Pre-persistence validation required:** block nested/alias secret, prompt, credential, or reasoning content. |
| N18 | Audit sink failure | **Persistence/sink failure scenario:** preflight passes; injected full failure retains sanitized failure observation and blocks completion. |
| N19 | Partial audit sink write | **Persistence/sink failure scenario:** preflight passes; injected committed prefix is reported and blocks completion. |
| N20 | Ambiguous authoritative state | **Pre-persistence validation required:** reject multiple possible states/dependency resolutions. |

Thus 18 cases require pre-persistence validation and 2 are deliberate persistence/sink failure cases. No original N01–N20 case is assigned solely to reconstruction-time validation, because whole-batch preflight must block an invalid proposed set. Add separate reconstruction-time tampering/incomplete-retained-stream tests for defense in depth; they do not replace the N01–N20 preflight and sink assertions. Keep previously passing tenant-safe denial, sanitization, and cleanup checks.

## F4 — Sanitized, retained sink-failure evidence

Extend the test-only execution observation with a typed `AuditSinkObservation`. The normal/failed/partial paths must retain, before deterministic cleanup, a snapshot containing:

| Field group | Required retained values |
| --- | --- |
| Attempt identity | Deterministic event ID; event type; tenant ID; canonical source/resource ID; request ID; correlation ID; trace ID where applicable; deterministic UTC attempt timestamp. |
| Attempted action | Exact attempted before/after state and decision; immutable evidence ID/commit/path/checksum; expected event count; attempted event IDs. |
| Sink outcome | Failed sink and phase; sanitized failure category/code; committed event IDs; persisted-item count; expected-item count; `write_occurred` and `partial_write` booleans; final health/degraded state. |
| Safe output | Bounded sanitized health record, generic tenant-safe caller-visible result, protected-field disclosure count `0`, and explicit failed-audit-operation edge for reconstruction. |

The fixture's public in-memory test ports can record attempted/committed IDs and failed adapter/phase without altering Phase 7. Snapshot only allowlisted identifiers and bounded error codes; never retain thrown error text if it may contain a payload, chain-of-thought, prompt, secret, credential, or cross-tenant protected field. Test the health path separately; if it is unavailable, report that fact as a sanitized failure instead of success. Preserve the primary failure and any cleanup failure independently. Cleanup still empties all mutable fixture buffers, while the immutable returned observation retains the sanitized snapshot needed for independent review.

Tests must assert full failure (`0` committed), a known partial prefix (exact attempted and committed IDs and counts), accurate `write_occurred`/`partial_write`, failed sink and phase, sanitized health and caller output, tenant disclosure `0`, and reconstruction that includes the failed attempt as blocked rather than silently complete. Never report a partial write as successful delivery.

## Verification and change control

After separate owner authorization, implement only the two named files; preserve public Phase 7 reuse and read-only accepted OE evidence. Run OE-12 tests, compatible Phase 7 tests, repository regressions, lint, typecheck, and formatting. Assert exactly the two authorized files changed and no production/runtime or dependency changes. Report new test counts without replacing the prior `27/27`, `60/60`, and `477/477` implementation history. A new exact-commit independent review and SODBILEG personal attestation are required for the remediated commit. The rejected review at `6ce397b29fb72531ecfedbe051ed7eace8204c93` remains preserved; no attestation for the old commit cures the new review.

The `synthetic_withdrawal_retention` event remains **Synthetic Audit-Only Transition — Not OE-08 Operational Evidence** with `synthetic_audit_only: true` and `operational_oe08_evidence: false`. It proves no real deletion, retention-policy enforcement, or propagated artifact removal, and cannot change OE-08 status. OE-12 remains `Not Executed`; operational evidence remains **11 Accepted / 0 Awaiting Independent Review / 4 Not Executed**. `SIR02-DEF-02` stays `Missing / Not Reviewed`; SIR-02 stays `Blocking`.
