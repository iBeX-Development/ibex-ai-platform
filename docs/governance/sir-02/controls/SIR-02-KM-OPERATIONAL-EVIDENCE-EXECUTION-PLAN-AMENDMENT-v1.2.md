# SIR-02 KM Operational Evidence Execution Plan Amendment v1.2 — Coordinated D2 Successor Draft

**Status:** `Proposed / Not Approved / Not Effective`

**Change-set member:** `SIR-02-KM-OPERATIONAL-EVIDENCE-EXECUTION-PLAN-AMENDMENT-v1.2.md`.

**Owner provenance:** The owner's 2026-09-30 instruction in this conversation directs draft preparation only, not approval or activation of controlled termination.

**Predecessor:** `SIR-02-KM-OPERATIONAL-EVIDENCE-EXECUTION-PLAN-AMENDMENT-v1.1.md`, scoped OE-12 overlay effected by `da524cb006253fb0b6a2df79651b830febc5acdd`; unaffected v1.0 Plan provisions remain authoritative. The predecessor's historical proposal header does not reverse the later scoped effect.

**Reviewed redline:** `SIR-02-KM-OE-12-D2-CONTROLLED-TERMINATION-SAFETY-CONTRACT-AMENDMENT-PROPOSAL-v1.0.md` at `bbed96a4e730c2e3595f08745406c4770b6b8dc0`, P3/P5; technical review `077cb9b4d6e6f61f6eba799cb1b8b6542020d429`, decision `Suitable for Owner Decision — Not Effective`.

**Indivisible change set:** `SIR-02-KM-OE-12-CRITERION-AMENDMENT-v1.2.md`; `SIR-02-KM-OPERATIONAL-EVIDENCE-ACCEPTANCE-MATRIX-AMENDMENT-v1.2.md`; this Plan v1.2; `SIR-02-KM-OE-12-AUTHORITATIVE-VALIDATION-BOUNDARY-DETAILED-DESIGN-v1.1.md`; `SIR-02-KM-OE-12-WORKER-HOST-RD-PLAN-v1.1.md`; and `SIR-02-KM-OE-12-BOUNDED-WORKER-ISOLATION-DISPOSAL-DESIGN-v1.1.md`. **No member becomes effective alone.** All six require exact-byte technical review, publication, separate owner approval/effect and governance linkage as one coordinated package. Until then, the effective predecessors remain authoritative. If later effected, this draft appends only to OE-12 insertion items 3 and 5; all other Plan items and requirements carry forward.

## P3 — Exact-source and ownership gate

**Current effective v1.1 item 3, exact text:**

> Independently review a detailed boundary design and exact source. Require an immutable source package, `100%` match of runnable bytes, actual executable/launcher path, and executable branch map for success, timeout, exception, cancellation, partial result, provider failure, late result, stale generation, outer/watchdog timeout, and `finally` cleanup. For each applicable path retain `trigger → exact reviewed source → branch/function → exact API/call → state transition → ownership check → cleanup/disposal → retained evidence`. Record `Ownership Check = Required` or `Ownership Check = Not Applicable — <reason>`. Before any process/resource-identity-affecting action, revalidate the full PID/image/parent/creation-time/run-token/creation-assignment tuple and applicable handle/session/Job evidence immediately; mismatch, staleness, PID reuse, missing identity, or unexpected membership is `STOP — Ownership Revalidation Failed`. No fallback may bypass this gate.

**Proposed successor operation:** retain item 3 and append:

> Any separately approved D2 controlled-termination path must identify the independently authorized outer entry, exact reviewed source and executable, concrete native/API call and return/operation-result checks, full expected/actual member and boundary admission receipt, fresh pre-action revalidation, one monotonic deadline, exception/timeout/`finally` behavior, post-action independent observation and external evidence sink. Neither Worker nor watchdog may mint authority or invoke that action. A source comment or prose assertion is not an executable path map.

## P5 — Cleanup authority

**Current effective v1.1 item 5, exact text:**

> Prove deterministic isolation/disposal and ownership-aware cleanup with no destructive action against unknown/unverified processes and no fallback authority beyond the primary path. Any destructive or environment-changing mechanism requires separate explicit change control.

**Proposed successor operation:** retain item 5 and append:

> A fully verified, exclusive, single-run-owned boundary may enter a separately approved controlled-termination path only after the authorized timeout and cooperative grace, under an independently authorized outer owner. The action is not a general destructive fallback: its scope and authority are fixed in the approved D2 design, cannot expand in timeout/exception/`finally`, and are withheld if any member or outside effect is unknown. Record native result and independently observed finite post-action disposition. A paused-but-live boundary is temporary isolation, not disposal. Separate criterion/baseline effect, mechanism/environment change control, source review and R&D execution authorization remain mandatory.

P3 adds mandatory path coverage; P5 is a **material proposed action-class change**. Both remain inactive. The future source contract must preserve success, timeout, exception, cancellation, partial result, provider failure, outer/watchdog timeout, evidence-write failure and final/`finally` paths, plus complete admission and fresh identity before every resource-affecting action. Unknown or unrelated-process effect, unresolved post-action state, deadline overrun or missing external evidence is STOP; no fallback widens authority. Existing formal OE-12 attempts `0001`/`0002` and their classifications remain immutable; no `0003` is authorized.

**Unresolved:** exact outer trust owner, timeout trigger, process/member admission, safe native mechanism and externally observed finite disposal. This draft neither changes source nor authorizes environment change or execution. `Controlled termination = NOT APPROVED`; `Technical Preflight = REJECTED`; `R&D Execution = NOT AUTHORIZED`; `Attempt = NOT STARTED`; `OE-12 = Not Executed`; `SIR-02 = Blocking`.
