# SIR-02 KM OE-12 Criterion Amendment v1.3 — Coordinated D2 Successor Draft

**Status:** `Proposed / Not Approved / Not Effective`

**Proposed set ID:** SIR02-KM-OE12-D2-SAFETY-2026-09-30-01

**Historical source draft:** SIR-02-KM-OE-12-CRITERION-AMENDMENT-v1.2.md; its prior proposed-set membership is not operative in this set.

**Change-set member:** SIR-02-KM-OE-12-CRITERION-AMENDMENT-v1.3.md.

**Owner provenance:** The owner's instruction in this conversation on 2026-09-30 directs preparation of six drafts only. It is not approval or activation of controlled termination.

**Predecessor:** `SIR-02-KM-OE-12-CRITERION-AMENDMENT-v1.1.md`, scoped OE-12 overlay effected by `da524cb006253fb0b6a2df79651b830febc5acdd`. Its historical proposal header does not negate that later effect.

**Historical reviewed redline:** `SIR-02-KM-OE-12-D2-CONTROLLED-TERMINATION-SAFETY-CONTRACT-AMENDMENT-PROPOSAL-v1.0.md` at `bbed96a4e730c2e3595f08745406c4770b6b8dc0`, C1; technical review `077cb9b4d6e6f61f6eba799cb1b8b6542020d429`, decision `Suitable for Owner Decision — Not Effective`.

**Indivisible change set:** SIR-02-KM-OE-12-CRITERION-AMENDMENT-v1.3.md; SIR-02-KM-OPERATIONAL-EVIDENCE-ACCEPTANCE-MATRIX-AMENDMENT-v1.3.md; SIR-02-KM-OPERATIONAL-EVIDENCE-EXECUTION-PLAN-AMENDMENT-v1.3.md; SIR-02-KM-OE-12-AUTHORITATIVE-VALIDATION-BOUNDARY-DETAILED-DESIGN-v1.2.md; SIR-02-KM-OE-12-WORKER-HOST-RD-PLAN-v1.3.md; SIR-02-KM-OE-12-BOUNDED-WORKER-ISOLATION-DISPOSAL-DESIGN-v1.3.md. No member becomes effective alone. All six require exact-byte technical review, publication, separate owner approval/effect and governance linkage as one coordinated package. Until then, effective predecessors remain authoritative.

If later effected, this draft changes only the scoped clause below; all other predecessor requirements carry forward.

## C1 — Proposed scoped criterion addition

**Current effective text, exact excerpt from v1.1 quoted criterion:**

> The worker/isolation boundary must have a proven finite lifetime and deterministic resource disposal; success, timeout, exception, cancellation, partial-result, provider-failure, late-result, stale-generation, outer/watchdog-timeout, and `finally` paths require independently reviewed executable mappings and retained evidence. No destructive fallback against an unknown or unverified process is permitted, and fallback cannot have broader authority than the primary path. Closure and cleanup outcomes require immutable, independent audit evidence.

**Proposed successor operation:** retain the quoted sentences and append exactly the following conditional paragraph, subject to the indivisible effect rule above:

> For the separately governed D2 path only, after an approved Worker/provider timeout and expiration of the approved cooperative grace, an independently authorized **outer isolation owner** may be eligible to initiate **controlled termination** of one fully verified, exclusive, single-run-owned isolation boundary. This is not “non-destructive termination.” Before action, independent creation/admission evidence must account for every actual Node, Worker, identity-helper, conhost where present, and host-managed member; bind the boundary and members to one run/generation and retained handles; and freshly revalidate `PID + image path + parent PID + creation time + run token + creation/assignment event`, plus applicable handle/session/Job and boundary identity, immediately before the call. Prove that no unidentified or unrelated process or resource, including a host or sibling boundary, can be affected. The approved action must fit within the existing non-resetting disposal and total-run deadlines; retain exact reviewed source/API branch, native result, independent post-action boundary/member/handle/session state, and external immutable evidence. Missing, stale, mismatched, reused or unexpected identity, unknown outside effect, unavailable evidence, unbounded action, or failed post-action verification is `STOP — Disposition Unproven`; no fallback may expand authority. A paused-but-live boundary is temporary isolation only and does not count as Worker/helper exit, resource disposal, or finite completion. This paragraph becomes usable only after its versioned amendment is reviewed, published and owner-effected and the exact mechanism is separately approved.

This is a **material proposed safety-contract change**, not a clarification of current permission. The active `Authoritative Validation-Boundary Quiescence` criterion still does not assert physical CIM-provider quiescence. Exactly one immutable terminal state, Accepted Result Cutoff, zero post-closure authoritative mutation, GAP-A independent receipt and fresh ownership checks, tenant/security controls, exact-source review and independent audit remain mandatory. No unknown or unrelated process may be affected. `GAP Closure = Approved Applicable Design/Boundary AND Newly Authorized Direct Evidence` remains unchanged.

**Unresolved:** the independent outer-owner trust root, precise authorized timeout trigger, complete actual admission and exclusivity, safe native mechanism, bounded post-action disposition and direct negative-path proof. No VM/container API name or pause establishes them. This draft supplies no mechanism, source change, environment change, R&D execution or GAP closure. `Controlled termination = NOT APPROVED`; `Technical Preflight = REJECTED`; `R&D Execution = NOT AUTHORIZED`; `Attempt = NOT STARTED`; `OE-12 = Not Executed`; `SIR-02 = Blocking`.
