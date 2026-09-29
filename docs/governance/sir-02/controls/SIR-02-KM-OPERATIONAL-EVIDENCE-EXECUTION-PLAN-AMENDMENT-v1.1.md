# SIR-02 KM Operational Evidence Execution Plan Amendment v1.1 — Proposal

| Field | Proposed record |
| --- | --- |
| Version / status | `v1.1` — **Proposed / Not Approved** |
| Base | `SIR-02-KM-OPERATIONAL-EVIDENCE-EXECUTION-PLAN-v1.0.md` — remains authoritative |
| Affected item | `SIR02-KM-OE-12 — Lifecycle audit evidence` only |
| Owner direction | `126e689df2e14878f20fd343922b7db26dbf0163` |
| OE-12 operational status | `Not Executed`; unchanged |
| Alignment GAP | **OPEN** |

## Proposed OE-12 execution-plan insertion

The existing OE-12 objective, synthetic test classification, trusted tenant/request/correlation/trace constraints, Phase 7 lifecycle event reconstruction, redaction and sink-failure tests, checksum requirements, independent reviewer gate, and `Not Executed` status remain in force. If separately approved, add these prerequisites **before any further formal OE-12 execution authorization**:

1. Approve the versioned `Authoritative Validation-Boundary Quiescence` criterion and corresponding Acceptance Matrix and audit-evidence addenda. Until that occurs, `bounded provider-level CIM quiescence` remains the active execution-safety criterion.
2. Separately resolve mandatory GAP-A with an independent, run-bound creation/assignment receipt and probe-independent integrity anchor for the full ownership tuple. A PID list or probe-supplied receipt/hash is insufficient.
3. Independently review a detailed boundary design and exact source. Require an immutable source package, `100%` match of runnable bytes, actual executable/launcher path, and executable branch map for success, timeout, exception, cancellation, partial result, provider failure, late result, stale generation, outer/watchdog timeout, and `finally` cleanup. For each applicable path retain `trigger → exact reviewed source → branch/function → exact API/call → state transition → ownership check → cleanup/disposal → retained evidence`. Record `Ownership Check = Required` or `Ownership Check = Not Applicable — <reason>`. Before any process/resource-identity-affecting action, revalidate the full PID/image/parent/creation-time/run-token/creation-assignment tuple and applicable handle/session/Job evidence immediately; mismatch, staleness, PID reuse, missing identity, or unexpected membership is `STOP — Ownership Revalidation Failed`. No fallback may bypass this gate.
4. Prove an approved finite validation-boundary lifetime, exactly one immutable terminal state, atomic explicit Accepted Result Cutoff, run/generation fencing, rejection of later/stale results, accepted post-closure mutation count `0`, and closure/final authoritative state equality. Evidence must separately label non-authoritative rejection metadata.
5. Prove deterministic isolation/disposal and ownership-aware cleanup with no destructive action against unknown/unverified processes and no fallback authority beyond the primary path. Any destructive or environment-changing mechanism requires separate explicit change control.
6. Obtain a separate owner execution authorization only after the preceding reviewed gates pass. Preserve formal attempts `0001` and `0002` and their immutable failure classifications. Do not allocate or run formal sequence `0003` through this proposal.

## Proposed execution result and evidence handling

For a later authorized run, retain exact source/implementation/review references, run/generation IDs, synthetic classification, UTC start/end, bounded timeout, stdout/stderr/exit and launcher stages, full lifecycle event and negative-case outputs, normalized reconstruction, tenant-safe and sanitized audit evidence, and source/artifact SHA-256 integrity. Add independent closure evidence: terminal state/reason, closure timestamp, Accepted Result Cutoff, accepted count, closure/final authoritative state references, late-result dispositions, zero post-closure authoritative mutations, cleanup/disposal outcome, and immutable evidence reference. An unresolved boundary, incomplete ownership, unreviewed source byte, missing path mapping, or failed evidence integrity must fail closed and preserve the attempt without relabeling it successful.

The proposed criterion protects the **authoritative validation outcome** after closure; it does not assert physical completion of a shared CIM provider. The original lifecycle audit acceptance scope, OE-08 synthetic audit-only boundary, tenant isolation, authorization, and accepted OE evidence remain unchanged.

This document is a plan amendment proposal, not an authorization to implement or execute. No current baseline is changed; OE-12 remains `Not Executed`; the Alignment GAP remains **OPEN**. For both GAP-A and GAP-B, **`GAP Closure = Approved Applicable Design/Boundary AND Newly Authorized Direct Evidence`** demonstrating the applicable acceptance criteria. Design approval alone, evidence against an unapproved boundary, re-analysis of the same retained evidence, or inference from adjacent controls cannot close either GAP. Stop for separate change control if detailed design needs production/runtime modification, tenant/security weakening, elevation, Windows/CIM configuration changes, dependencies, destructive cleanup, or any criterion change beyond the owner-approved direction.
