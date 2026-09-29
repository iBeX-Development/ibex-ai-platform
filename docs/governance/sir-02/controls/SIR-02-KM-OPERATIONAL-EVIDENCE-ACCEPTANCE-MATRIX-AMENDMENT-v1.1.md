# SIR-02 KM Operational Evidence Acceptance Matrix Amendment v1.1 — Proposal

| Field | Proposed record |
| --- | --- |
| Version / status | `v1.1` — **Proposed / Not Approved** |
| Base | `SIR-02-KM-OPERATIONAL-EVIDENCE-ACCEPTANCE-MATRIX-v1.0.md` — remains authoritative |
| Affected item | `SIR02-KM-OE-12` only |
| Owner direction | `126e689df2e14878f20fd343922b7db26dbf0163` |
| Criterion proposal | `SIR-02-KM-OE-12-CRITERION-AMENDMENT-v1.1.md` — also Proposed / Not Approved |
| Alignment GAP | **OPEN** |

## Proposed OE-12 row delta

The current matrix classifies OE-12 as `Deterministic test execution required`, with Phase 7 pipeline and reconstruction tests as reusable foundation and lifecycle-specific transition, sink-failure, redaction, and conflict negatives still required. Its trusted lifecycle reconstruction criterion and `Not Executed` status remain unchanged. This proposal adds the following **execution-safety/evidence gate** to OE-12 only, effective only after separate amendment approval:

| Proposed criterion dimension | Required acceptance evidence |
| --- | --- |
| Authoritative Validation-Boundary Quiescence | A unique run/generation reaches one immutable `Success`, `Fail`, `Timeout`, or `Cancelled` state within a finite approved bound. Boundary closure, isolation lifetime, and deterministic disposal are directly measured. |
| Accepted Result Cutoff | Explicit immutable cutoff, closure timestamp, terminal reason, final accepted count, and closure authoritative state version/hash are retained; no post-cutoff result enters authoritative state. |
| Late/stale fencing | Run/generation mismatch and post-cutoff delivery are `Late / Rejected`; retain late-result/callback counts and rejection dispositions. Accepted post-closure mutation count is `0`; final authoritative state version/hash equals closure state, excluding separately labeled non-authoritative rejection-audit metadata. |
| Independent receipt trust — GAP-A | Separate producer and probe-independent integrity anchor bind PID, image, parent PID, creation time, run token, and creation/assignment event; preserve PID-reuse resistance and fresh pre-action ownership revalidation. GAP-A stays open until direct separately reviewed evidence proves it. |
| Execution-path and cleanup safety | Exact reviewed source and `100%` runnable-byte match; reviewed success, timeout, exception, cancellation, partial-result, provider-failure, late-result, stale-generation, watchdog, and `finally` branch map; no destructive unknown-process fallback; cleanup authority no broader than primary path. |
| Independent audit | Immutable closure and cleanup evidence tied to run/generation, cutoff, terminal state, final state comparison, and sanitized immutable evidence reference. |

For each applicable source-level path behind these proposed criteria, retain `trigger → exact reviewed source → branch/function → exact API/call → state transition → ownership check → cleanup/disposal → retained evidence`. The ownership field must say `Ownership Check = Required` or `Ownership Check = Not Applicable — <reason>`. A process/resource-identity-affecting action requires fresh full-tuple and applicable handle/session/Job revalidation immediately beforehand; mismatch, staleness, PID reuse, missing identity, or unexpected membership is `STOP — Ownership Revalidation Failed`. Fallback cannot bypass this gate.

The proposed gate proves authoritative result isolation after closure; it **does not claim shared CIM provider physical quiescence**. It would explicitly replace the active provider-level CIM safety criterion only upon separate approval. It cannot serve as a shortcut around the existing OE-12 lifecycle audit, tenant, authorization, sink-failure, redaction, or OE-08 boundary requirements. No operational result, matrix status, or reviewer decision changes now.

## Impact and change-control boundary

| Related artifact | Treatment |
| --- | --- |
| OE-12 safety/acceptance criterion | Required versioned amendment; proposed in the companion criterion document. |
| Operational Evidence Execution Plan | Required versioned OE-12 execution addendum; proposed separately. |
| OE-12 audit-evidence wording | Required addendum for closure/cutoff/rejection evidence; proposed separately. |
| Lifecycle-audit fixture design | Conditional later addendum only if detailed design changes test measurement or capture; existing accepted two-file implementation remains untouched. |
| Evaluation/golden criteria | Conditional later amendment only upon demonstrated dependency. |
| Audit & Observability Architecture | Conditional later amendment only if a separately approved design changes its public audit contract. |
| Production/runtime implementation | No change authorized; any need triggers separate change control. |

For both GAP-A and GAP-B, **`GAP Closure = Approved Applicable Design/Boundary AND Newly Authorized Direct Evidence`** demonstrating the applicable acceptance criteria. Design approval alone, evidence against an unapproved boundary, re-analysis of the same retained evidence, and inference from adjacent controls cannot close either GAP. The current v1.0 matrix remains authoritative. This proposal authorizes no implementation, execution, or canonical OE/SIR status change; the Alignment GAP remains **OPEN**.
