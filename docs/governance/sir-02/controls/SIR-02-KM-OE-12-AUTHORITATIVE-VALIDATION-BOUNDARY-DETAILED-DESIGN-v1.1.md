# SIR-02 KM OE-12 Authoritative Validation-Boundary Detailed Design v1.1 — Coordinated D2 Successor Draft

**Status:** `Proposed / Not Approved / Not Effective`

**Change-set member:** `SIR-02-KM-OE-12-AUTHORITATIVE-VALIDATION-BOUNDARY-DETAILED-DESIGN-v1.1.md`.

**Owner provenance:** The owner's 2026-09-30 instruction in this conversation directs preparation of drafts only. It neither approves a termination mechanism nor activates this design.

**Predecessor:** `SIR-02-KM-OE-12-AUTHORITATIVE-VALIDATION-BOUNDARY-DETAILED-DESIGN-v1.0.md`, scoped conceptual OE-12 overlay effected by `da524cb006253fb0b6a2df79651b830febc5acdd`. Its historical proposal header does not negate the later scoped effect.

**Reviewed redline:** `SIR-02-KM-OE-12-D2-CONTROLLED-TERMINATION-SAFETY-CONTRACT-AMENDMENT-PROPOSAL-v1.0.md` at `bbed96a4e730c2e3595f08745406c4770b6b8dc0`, D3/D5; technical review `077cb9b4d6e6f61f6eba799cb1b8b6542020d429`, decision `Suitable for Owner Decision — Not Effective`.

**Indivisible change set:** `SIR-02-KM-OE-12-CRITERION-AMENDMENT-v1.2.md`; `SIR-02-KM-OPERATIONAL-EVIDENCE-ACCEPTANCE-MATRIX-AMENDMENT-v1.2.md`; `SIR-02-KM-OPERATIONAL-EVIDENCE-EXECUTION-PLAN-AMENDMENT-v1.2.md`; this Detailed Design v1.1; `SIR-02-KM-OE-12-WORKER-HOST-RD-PLAN-v1.1.md`; and `SIR-02-KM-OE-12-BOUNDED-WORKER-ISOLATION-DISPOSAL-DESIGN-v1.1.md`. **No member becomes effective alone.** All six require exact-byte technical review, publication, separate owner approval/effect and governance linkage as one coordinated package. Until then, effective predecessors remain authoritative. If later effected, this draft adds only D3/D5 below; all other v1.0 component, cutoff, audit and safety contracts carry forward.

## D3 — Separate component authority

**Current effective §3 Controller and Worker failure-behavior excerpts, exact text:**

> On trust failure, timeout, exception, or cancellation, fail closed. It owns bounded observation and cooperative signalling, not Job-wide or unknown-process termination; retains timestamps, trigger, controller decision, and cleanup state.

> Missing fields, partial results, provider failure, or stall produce tagged fail-closed observations. Worker owns only approved cooperative/natural exit and disposable resources; unresolved work is recorded. No physical-provider-stop claim.

**Proposed successor operation:** retain both rows unchanged and add this separately owned component row, conditional on the indivisible effect rule:

> **Independent D2 outer disposition owner**, distinct from Controller, Worker, watchdog and candidate caller: only after separate versioned safety and mechanism approval, verify the T1 decision/consumed attempt, P1 sealed complete creation/admission receipt, exclusive run/generation-bound boundary and fresh actual member/boundary identities; then, after approved timeout and grace, either withhold action or invoke only the reviewed scoped controlled-termination API. Record native result, independent external evidence, affected-member/outside-boundary checks, and bounded observed final resource state. E1 retains failure evidence if primary audit or action fails; M1 verifies all source/image/executable/configuration bytes. It has no authority over an unknown or unrelated process, and cannot delegate termination to the Controller, Worker or watchdog.

## D5 — Watchdog and executable cleanup paths

**Current effective §5 paragraph, exact text:**

> The watchdog may observe, signal cooperative cancellation, and capture evidence only. It cannot silently terminate an unknown process, close a Job handle as a destructive test with unresolved membership, call `TerminateJobObject`, `TerminateProcess`, `Stop-Process`, or `taskkill`, or bypass ownership gates. A future mechanism requiring destructive action, privilege elevation, Windows/CIM configuration, new dependency, or production/runtime change must stop for separate change control. No cleanup or fallback path may have broader authority than the primary path. A bounded validation decision must not be misreported as a proven bounded worker disposal if the latter is unresolved.

**Proposed successor operation:** retain the paragraph and append:

> No watchdog, Worker or Controller gains process-termination authority from this design. If a later owner-effected criterion and independently approved outer D2 mechanism permit controlled termination, source-level review must map its exact success, refusal, timeout, native/API exception, partial operation, observer failure and `finally` paths to fresh ownership checks, one deadline, bounded independent post-action verification, handle/session cleanup and external immutable evidence. Unknown membership or incomplete post-action proof remains STOP; no Job-wide or environment-wide fallback may exceed the reviewed exclusive boundary.

The additional outer role is a **proposed contract, not an implemented topology or grant of authority**. T1 independent verifier/atomic attempt claim, P1 independent receipt and complete membership, E1 protected failure evidence and M1 externally anchored manifest remain unselected or unproven across the prospective boundary. The exact approved timeout trigger, owner trust root, native API, outside-effect isolation, failure sink and finite post-action observation require separate design, change control and later direct proof. Authoritative `Success | Fail | Timeout | Cancelled`, Accepted Result Cutoff, late/stale fencing, zero post-closure mutation and independent audit remain unchanged. Pause is temporary isolation, not disposal; documented platform controls are not operational proof.

`Controlled termination = NOT APPROVED`; `Technical Preflight = REJECTED`; `R&D Execution = NOT AUTHORIZED`; `Attempt = NOT STARTED`; `OE-12 = Not Executed`; `SIR-02 = Blocking`.
