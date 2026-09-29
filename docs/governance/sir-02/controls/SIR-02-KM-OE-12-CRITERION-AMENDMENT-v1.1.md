# SIR-02 KM OE-12 Criterion Amendment v1.1 — Proposal

| Field | Proposed record |
| --- | --- |
| Version / status | `v1.1` — **Proposed / Not Approved** |
| Scope | OE-12 CIM validation execution-safety criterion only; not the lifecycle-audit event coverage criterion |
| Owner direction | `126e689df2e14878f20fd343922b7db26dbf0163`; linkage `eba5aef2b0c6ef2446ddff4a8ccfc30d6b6299b8` |
| Reviewed change-control proposal | `SIR-02-KM-OE-12-CRITERION-BOUNDARY-CHANGE-CONTROL-REVIEW-v1.0.md` at `496ab2303009b2bed6250c9e1a01155390eb7916` |
| Alignment GAP | **OPEN** |
| Activation | Separate exact-byte governance review and owner approval required |

## Proposed replacement, without current effect

The current active OE-12 CIM validation execution-safety requirement remains **`bounded provider-level CIM quiescence`**. The owner approved preparation of a replacement direction for detailed design; the current criterion remains authoritative until a versioned amendment package is independently reviewed and separately approved.

**Proposed replacement criterion: `Authoritative Validation-Boundary Quiescence`.**

> For each uniquely identified OE-12 validation run and generation, an independently governed validation boundary must reach exactly one immutable terminal state — `Success`, `Fail`, `Timeout`, or `Cancelled` — within an approved finite bound. Boundary closure must atomically retain an explicit immutable **Accepted Result Cutoff**, the terminal reason and closure timestamp, final accepted result count, and authoritative state version/hash or equivalent immutable reference. No result, callback, event, or update from that run/generation may be accepted after the cutoff. Late or stale deliveries must be classified `Late / Rejected`, retained as non-authoritative audit metadata where applicable, and unable to change terminal status, accepted result set, ownership state, or audit decision. The accepted post-closure mutation count must equal `0`, and retained state references must prove `authoritative_state_after_closure == authoritative_state_at_closure` after observed late-result handling and disposal. The worker/isolation boundary must have a proven finite lifetime and deterministic resource disposal; success, timeout, exception, cancellation, partial-result, provider-failure, late-result, stale-generation, outer/watchdog-timeout, and `finally` paths require independently reviewed executable mappings and retained evidence. No destructive fallback against an unknown or unverified process is permitted, and fallback cannot have broader authority than the primary path. Closure and cleanup outcomes require immutable, independent audit evidence.

This proposed criterion **does not claim provider-level physical quiescence** or require proof that a shared CIM provider has stopped all internal work. It instead requires proof that late provider activity or result delivery **cannot change the authoritative OE-12 validation outcome after bounded boundary closure**. Boundary closure is not equivalent to provider completion.

## Terminal and trust invariants

- A terminal run cannot return to active, advance its Accepted Result Cutoff, reuse its run/generation identity, or revise its terminal reason or accepted result set. Reopening requires a separately governed new run/generation.
- Result acceptance and closure must have a single ordered decision point so a racing result cannot cross the cutoff. The later detailed design must prove this property; no mechanism is selected here.
- Non-authoritative rejection-audit metadata may grow after closure, but it must be separated from and unable to mutate the authoritative validation result.
- **GAP-A — Independent Receipt Trust Boundary remains OPEN and mandatory.** The future receipt must have an independent producer and probe-independent integrity anchor, bind `PID + image path + parent PID + creation time + run token + creation/assignment event` to the exact synthetic run, resist PID reuse, and support fresh ownership revalidation. Retained handle/session/Job evidence is required where applicable. This GAP-B amendment cannot close, waive, or weaken GAP-A.
- Tenant isolation, authorization, source ownership, tenant-safe denial, sanitization, and accepted OE evidence remain unchanged.

## Proposed evidence and approval gates

The future proof must retain the run/generation IDs, boundary open/closure state, terminal reason and timestamp, explicit cutoff, accepted count, closure and final authoritative state references, late-result/callback count and per-result rejection dispositions, accepted post-closure mutation count `0`, cleanup/disposal outcome, and immutable evidence references. A later implementation must map each executable success/failure/cleanup path to exact reviewed source and calls, match runnable bytes `100%` to the reviewed package, pass independent source-level safety review, and receive separate execution authorization. None is granted by this amendment proposal.

For every applicable future executable path, the source-level map must record `trigger → exact reviewed source → branch/function → exact API/call → state transition → ownership check → cleanup/disposal → retained evidence`. Record `Ownership Check = Required` or `Ownership Check = Not Applicable — <reason>` for each path. Before a process/resource-identity-affecting action, `Required` means fresh revalidation of `PID + image path + parent PID + creation time + run token + creation/assignment evidence`, plus handle/session/Job evidence where applicable. Any missing/mismatched/stale field, PID reuse, or unexpected member is `STOP — Ownership Revalidation Failed`; fallback cannot bypass the check.

The existing OE-12 lifecycle-audit acceptance requirements — 14 lifecycle event families, 20 negative cases, trusted tenant context, reconstruction, sink failures, sanitization, and the OE-08 synthetic audit-only boundary — are not replaced. No prior failure or accepted evidence is rewritten. For both GAP-A and GAP-B, **`GAP Closure = Approved Applicable Design/Boundary AND Newly Authorized Direct Evidence`** demonstrating that the approved boundary meets the applicable acceptance criteria. Design approval alone, evidence against an unapproved design, re-analysis of the same retained evidence, or inference from adjacent controls cannot close either GAP.

**Stop before implementation** if meeting this proposal would require production/runtime changes, tenant/security weakening, privilege elevation, Windows/CIM configuration changes, a new dependency, destructive cleanup, or a criterion change beyond this approved design direction. Such needs require separate change control. This document neither activates the new criterion nor authorizes source/code, probes, Diagnostic v4, launcher v1.4, Smoke v5, or formal retry `0003`.
