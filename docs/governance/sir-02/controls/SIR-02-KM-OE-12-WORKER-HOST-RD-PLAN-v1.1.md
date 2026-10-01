# SIR-02 KM OE-12 Dedicated Non-Interactive Worker-Host R&D Plan v1.1 — Coordinated D2 Successor Draft

**Status:** `Proposed / Not Approved / Not Effective`

**Change-set member:** `SIR-02-KM-OE-12-WORKER-HOST-RD-PLAN-v1.1.md`.

**Owner provenance:** The owner's 2026-09-30 instruction in this conversation directs six draft documents only. It does not approve controlled termination or a Worker-Host R&D execution.

**Predecessor:** `SIR-02-KM-OE-12-WORKER-HOST-RD-PLAN-v1.0.md`, published plan approved by `f526f845539193ab03db0a7eccb25ca319b29866` for exact source/configuration preparation only. Its historical proposal status does not create R&D execution authority.

**Reviewed redline:** `SIR-02-KM-OE-12-D2-CONTROLLED-TERMINATION-SAFETY-CONTRACT-AMENDMENT-PROPOSAL-v1.0.md` at `bbed96a4e730c2e3595f08745406c4770b6b8dc0`, W6/W7–W8/W9; technical review `077cb9b4d6e6f61f6eba799cb1b8b6542020d429`, decision `Suitable for Owner Decision — Not Effective`.

**Indivisible change set:** `SIR-02-KM-OE-12-CRITERION-AMENDMENT-v1.2.md`; `SIR-02-KM-OPERATIONAL-EVIDENCE-ACCEPTANCE-MATRIX-AMENDMENT-v1.2.md`; `SIR-02-KM-OPERATIONAL-EVIDENCE-EXECUTION-PLAN-AMENDMENT-v1.2.md`; `SIR-02-KM-OE-12-AUTHORITATIVE-VALIDATION-BOUNDARY-DETAILED-DESIGN-v1.1.md`; this Worker-Host R&D Plan v1.1; and `SIR-02-KM-OE-12-BOUNDED-WORKER-ISOLATION-DISPOSAL-DESIGN-v1.1.md`. **No member becomes effective alone.** All six require exact-byte technical review, publication, separate owner approval/effect and governance linkage as one coordinated package. Until then, the approved predecessor direction remains unchanged. If later effected, this draft adds only W6/W7–W8/W9 below; RQ-1–RQ-5, WH-01–WH-10, SC-1–SC-8 and all other v1.0 gates carry forward.

## W6 — Numeric bounds and temporary isolation

**Current §6 exact excerpts:**

> Approved cooperative cancellation request → observed acknowledgement/natural exit or grace expiry

> Post-closure safe cleanup begins (including `T_cancel`) → independently verified `Disposed` or qualifying safe, finite-lifetime isolation

> An `Isolated` label qualifies for SC-6 only if exact reviewed source and independent evidence prove complete ownership/containment, **finite worker-boundary lifetime**, no result or collateral authority, and a deterministic safe disposal outcome within `T_dispose`.

**Proposed successor operation:** retain all original numeric bounds and §6 isolation rule, and append:

> After an approved timeout and the already included cooperative grace, any separately approved controlled-termination call and its independently observed process/boundary/handle/session disposition must finish inside the original non-resetting `T_dispose` and `T_total` deadlines; `finally` may not restart them. Pause is temporary isolation and never establishes `Disposed`, Worker/helper exit or the required finite final resource state. The identity-helper `≤5,000 ms` ceiling remains an unproven design target and may not extend either active deadline.

The unchanged bounds are `T_start = 8 s`, `T_provider = 10 s`, `T_close = 2 s`, `T_cancel = 2 s` within `T_dispose = 5 s`, `T_fresh ≤ 500 ms`, and `T_total = 45 s`. Their existing measurement start/end events and expiry consequences remain mandatory; no clock reset or new attempt is created by this draft. The exact outer-owner trigger and native action timing still require independently reviewed design/source and direct R&D evidence.

## W7–W8 — Direct negative-path evidence

**Current §§7–8 exact excerpts:**

> **WH-03 — Worker/provider unresponsive** | Cooperative cancellation does not complete; Controller still closes by `T_close`; safe, finite-lifetime disposal/isolation must be independently proven or case fails.

> **WH-08 — Unexpected helper/member** | Actual resource set contains an unknown or unverified member; no Job-wide or other unknown-member action occurs.

> **WH-09 — Disposal failure** | Approved safe cleanup cannot establish `Disposed` or qualifying finite safe isolation within `T_dispose`; candidate fails SC-6.

> **SC-6** | Worker-host boundary reaches independently proven `Disposed` or qualifying finite safe isolation within `T_dispose = 5 s`, including the unresponsive path, without unknown-resource effect.

> **SC-7** | Independent observations establish **zero** effect on unrelated processes/resources, other tenants/runs and Core iBeX.

**Proposed successor operation:** retain every WH-01–WH-10 and SC-1–SC-8 requirement and append:

> A later separately authorized direct R&D case must cause a real unresponsive Worker and a timed-out identity helper; independently capture actual Node, helper, conhost where present and host-managed membership before provider influence and before any process action. WH-08 must introduce or detect a real unexpected/unverified member and prove the action is withheld. WH-09 must retain the native failure/timeout, all remaining resources and candidate ineligibility if disposition is not observed. WH-10 must cover exception and `finally` without a broader fallback. For any approved controlled action, retain fresh ≤500 ms full ownership/boundary revalidation, exact reviewed call/API result, monotonically measured start/end, independently observed exit/final resource state, zero effect on unrelated processes/tenants/runs/Core iBeX, and E1 evidence integrity. Prelaunch WH-03/09 STOP and synthetic WH-08 STOP remain nonproof.

Before any future case runs, the separately reviewed exact-source and negative-path plan must also define observable failures for outer-owner crash/lost response after action, partial native operation, failed post-action observer, primary audit plus E1 failure, stale boundary identity, unexpected host-managed member and deadline overrun. These are **unproven obligations**; this draft neither runs nor authorizes WH cases.

## W9 — Cleanup authority

**Current §9 exact excerpts:**

> Future reviewed source must use only governed cooperative/natural exit, bounded observation, read-only verification and deterministic disposal of controller-owned handles, channels, temporary files and sessions unless a separately approved safe boundary proves another method.

> No PID-only termination, unknown-member termination, Job-wide action on unresolved membership, destructive fallback, authority expansion or unreviewed watchdog path is permitted.

**Proposed successor operation:** retain both sentences and append:

> The only proposed “another method” is a separately reviewed and owner-approved D2 outer-owner action after the active safety-contract amendment is effected. It is not a Controller, Worker or watchdog fallback. Complete independent receipt/membership and immediately fresh full identity must pass before action; if any fact or external evidence sink is unavailable, withhold action and record unresolved disposal. Exception, timeout and `finally` paths may not broaden the action or restart the deadline. No unidentified/unrelated process may be affected, and disposal is never inferred from pause, stream closure, `unref()`, API start or later PID absence.

This material proposed method remains **inoperative** until the complete six-document package and separate mechanism/environment/source/R&D gates are satisfied. GAP-A remains open and mandatory; GAP-B operational closure and bounded worker disposal remain unproven. `Controlled termination = NOT APPROVED`; `Technical Preflight = REJECTED`; `R&D Execution = NOT AUTHORIZED`; `Attempt = NOT STARTED`; `OE-12 = Not Executed`; `SIR-02 = Blocking`.

**Unresolved cross-clause conflict before effect:** The retained v1.0 §1 objective expressly asks for bounded **non-destructive** disposal, and §6/§8 still use “no destructive” expiry/STOP language. W6/W7–W8/W9 alone do not rewrite those clauses. A later technical review must determine the exact coordinated versioned reconciliation and owner approval; this draft cannot take effect while it leaves a contradictory operative instruction. Controlled termination must not be relabeled “non-destructive” to bypass this gate.
