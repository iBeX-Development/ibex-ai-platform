# SIR-02 KM OE-12 Audit-Evidence Addendum v1.0 — Proposal

| Field | Proposed record |
| --- | --- |
| Version / status | `v1.0` — **Proposed / Not Approved** |
| Scope | Test-only OE-12 validation-boundary closure and late-result evidence |
| Owner direction | `126e689df2e14878f20fd343922b7db26dbf0163` |
| Related criterion | `SIR-02-KM-OE-12-CRITERION-AMENDMENT-v1.1.md` — Proposed / Not Approved |
| Existing architecture | Phase 7 and `docs/baseline/08-audit-observability-architecture-v1.0.md` remain unchanged |
| Alignment GAP | **OPEN** |

## Proposed independently retained record set

| Record | Mandatory sanitized fields and meaning |
| --- | --- |
| Boundary opening | Unique synthetic run ID, generation ID, approved timeout bound, trusted synthetic tenant/source context, immutable input/source reference, controller identity, opening timestamp, and independent receipt reference. This is not the receipt itself. |
| Terminal closure | Run/generation ID; exactly one `Success`, `Fail`, `Timeout`, or `Cancelled` terminal state; terminal reason; closure timestamp; explicit immutable Accepted Result Cutoff; final accepted result count; authoritative state version/hash or equivalent immutable closure reference; closure decision identity and immutable evidence reference. |
| Late/stale rejection | Run/generation and result/callback reference; observed timestamp; rejection category (`Late / Rejected` or stale generation); boundary cutoff and terminal reference; sanitized rejection disposition. Retain late-result/callback count and per-delivery references where applicable. These records are **non-authoritative audit metadata**, not changes to the accepted validation result. |
| Final integrity and cleanup | Final authoritative state version/hash after observed late-result handling and disposal; comparison to closure reference; accepted post-closure mutation count `0`; cleanup/disposal outcome and timestamp; bounded wait/timeout outcome; sanitized exception/provider category where applicable; immutable evidence reference. |

The required invariant is `authoritative_state_after_closure == authoritative_state_at_closure`, excluding separately designated non-authoritative rejection-audit metadata. A later audit record may report a rejected delivery but cannot alter terminal reason, cutoff, accepted result set, ownership state, or the authoritative audit decision. The cutoff is recorded at closure, not reconstructed later from logs. The independent evidence channel must not allow the read-only worker/probe to redefine or reseal its own closure or ownership claims; the detailed design must prove that separation.

## Event chronology, privacy, and integrity

- Retain ordered opening, accepted-result cutoff/terminal closure, each observed late/stale rejection, and final cleanup/integrity observations with deterministic synthetic timestamps and run/generation correlation. A late event may be logged after terminal closure while remaining non-authoritative.
- Tenant, request, correlation, and trace IDs must come from trusted context and remain tenant-bound. Denial and failure records are tenant-safe. Do not record protected cross-tenant fields, credentials, secrets, prompts, chain-of-thought, raw customer data, or uncontrolled command-line payloads.
- Retain event IDs, bounded reason codes, counts, immutable references, and SHA-256 integrity for later authorized artifacts. A missing or failed independent audit/closure write is a fail-closed evidence failure, never proof of successful validation.
- Every success, timeout, exception, cancellation, partial/provider failure, late/stale delivery, outer/watchdog timeout, and `finally` path must later retain `trigger → exact reviewed source → branch/function → exact API/call → state transition → ownership check → cleanup/disposal → retained evidence`. For each applicable path record `Ownership Check = Required` or `Ownership Check = Not Applicable — <reason>`. Before a process/resource-identity-affecting action, require fresh full-tuple and applicable handle/session/Job revalidation; mismatch, staleness, PID reuse, missing identity, or unexpected membership is `STOP — Ownership Revalidation Failed`, including in fallback. This proposed addendum is not that source-level proof.

This addendum does not claim provider-level physical quiescence. It does not amend the production Audit & Observability Architecture or authorize a production audit pipeline change. The existing OE-12 lifecycle event reconstruction, sanitization, sink failure, tenant-isolation, and OE-08 synthetic audit-only requirements remain mandatory. GAP-A remains **OPEN**; the proposed B1 criterion and this addendum remain inactive until separately approved. No source/code or execution is authorized; the Alignment GAP remains **OPEN**.

For both GAP-A and GAP-B, **`GAP Closure = Approved Applicable Design/Boundary AND Newly Authorized Direct Evidence`** demonstrating the applicable acceptance criteria. Design approval alone, evidence against an unapproved boundary, re-analysis of the same retained evidence, or inference from adjacent controls cannot close either GAP.
