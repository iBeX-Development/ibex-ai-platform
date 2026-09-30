# SIR-02 KM Operational Evidence Acceptance Matrix Amendment v1.2 — Coordinated D2 Successor Draft

**Status:** `Proposed / Not Approved / Not Effective`

**Change-set member:** `SIR-02-KM-OPERATIONAL-EVIDENCE-ACCEPTANCE-MATRIX-AMENDMENT-v1.2.md`.

**Owner provenance:** The owner's 2026-09-30 instruction in this conversation authorizes preparation of drafts only; it neither approves nor activates controlled termination.

**Predecessor:** `SIR-02-KM-OPERATIONAL-EVIDENCE-ACCEPTANCE-MATRIX-AMENDMENT-v1.1.md`, scoped OE-12 overlay effected by `da524cb006253fb0b6a2df79651b830febc5acdd`; the v1.0 Matrix and unaffected provisions remain authoritative. The predecessor's historical proposal header does not reverse the later scoped effect.

**Reviewed redline:** `SIR-02-KM-OE-12-D2-CONTROLLED-TERMINATION-SAFETY-CONTRACT-AMENDMENT-PROPOSAL-v1.0.md` at `bbed96a4e730c2e3595f08745406c4770b6b8dc0`, M1; technical review `077cb9b4d6e6f61f6eba799cb1b8b6542020d429`, decision `Suitable for Owner Decision — Not Effective`.

**Indivisible change set:** `SIR-02-KM-OE-12-CRITERION-AMENDMENT-v1.2.md`; this Matrix v1.2; `SIR-02-KM-OPERATIONAL-EVIDENCE-EXECUTION-PLAN-AMENDMENT-v1.2.md`; `SIR-02-KM-OE-12-AUTHORITATIVE-VALIDATION-BOUNDARY-DETAILED-DESIGN-v1.1.md`; `SIR-02-KM-OE-12-WORKER-HOST-RD-PLAN-v1.1.md`; and `SIR-02-KM-OE-12-BOUNDED-WORKER-ISOLATION-DISPOSAL-DESIGN-v1.1.md`. **No member becomes effective alone.** All six require exact-byte technical review, publication, separate owner approval/effect and governance linkage as one coordinated package. Until then, effective predecessors remain authoritative. If later effected, this draft adds only the M1 OE-12 evidence row; all other Matrix requirements and statuses carry forward.

## M1 — Proposed OE-12 acceptance-row addition

**Current effective v1.1 cells, exact text:**

| Criterion dimension | Current required acceptance evidence |
| --- | --- |
| Authoritative Validation-Boundary Quiescence | A unique run/generation reaches one immutable `Success`, `Fail`, `Timeout`, or `Cancelled` state within a finite approved bound. Boundary closure, isolation lifetime, and deterministic disposal are directly measured. |
| Execution-path and cleanup safety | Exact reviewed source and `100%` runnable-byte match; reviewed success, timeout, exception, cancellation, partial-result, provider-failure, late-result, stale-generation, watchdog, and `finally` branch map; no destructive unknown-process fallback; cleanup authority no broader than primary path. |

**Proposed successor operation:** retain both cells and the remaining v1.1 OE-12 rows, then add this conditional row only after the indivisible effect rule is satisfied:

| Proposed criterion dimension | Required acceptance evidence |
| --- | --- |
| Controlled D2 termination — conditional, separately approved | Controlled D2 termination, if separately approved, requires independent proof of exclusive single-run boundary ownership and complete actual admission, fresh full boundary/member identity immediately before action, no unidentified/unrelated effect, measured completion inside approved disposal/total bounds, native API/operation result, observed post-action process/boundary/resource disposition, and externally retained immutable evidence. Pause alone, API initiation, a timeout, stream closure, `unref()`, or later PID absence never scores disposal PASS. Any missing proof is STOP and candidate FAIL. |

The current terminal state, Accepted Result Cutoff, late/stale fencing, GAP-A independent receipt, exact reviewed/runnable-byte identity, executable-path ownership check, independent audit and tenant-safe lifecycle evidence remain mandatory. This row is a **material proposed acceptance method**, not an acceptance finding. WH-03/08/09 prelaunch or synthetic STOP cases do not establish actual disposal or membership. The exact negative tests for outer-owner failure, incomplete actual membership, stale identity, native/API partial failure, failed post-action observation, external evidence failure, deadline overrun and no-collateral effect remain for separately governed source/R&D review. No criterion, evidence or operational OE-12 status changes now.

**Unresolved:** independently trusted admission/ownership evidence, an exclusive safe mechanism, measured finite disposition and external evidence under failure. No platform API name is operational proof. `Controlled termination = NOT APPROVED`; `Technical Preflight = REJECTED`; `R&D Execution = NOT AUTHORIZED`; `Attempt = NOT STARTED`; `OE-12 = Not Executed`; `SIR-02 = Blocking`.
