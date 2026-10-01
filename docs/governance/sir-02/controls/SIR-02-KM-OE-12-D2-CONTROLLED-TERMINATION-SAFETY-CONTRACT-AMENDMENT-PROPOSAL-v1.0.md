# SIR-02 / OE-12 — D2 Controlled-Termination Safety-Contract Amendment Proposal v1.0

**Status:** `Proposed / Not Approved / Not Effective / Owner Decision Required`

**Date:** 2026-09-30 (Asia/Ulaanbaatar)

**Scope:** Proposed OE-12-only safety-contract redline for owner review. This file is not an amendment to the active documents and supplies no process, environment, source, or execution authority.

## 1. Exact authority and drafting rule

The published D2 clarification proposal at `e948e26ec09158dbc62f31d10e8a89d9a4880a96` has committed SHA-256 `7cd955a596a4ba68f71317eada114c4d9715f50a113e7c4c3b1fc2cd01a564fe`. Its published technical review at `1cfaa471cf5656122c2965f21291ad1ff2b77574` has SHA-256 `5e2d54e19ee2c680cdf5c78a6864d65f7235ccea3eabd8b2f86b400fdc01fe2a` and decision **`Amendment Proposal Suitable for Owner Review`**. That finding permits owner consideration, not controlled termination. The Option B isolation design `38ea2a1620f910310611397da4e58de255af1aa6` and its review `5e3b60e0cbb1f3979caeb75921f4c908703a1a3b` retain **Design STOP**. The Worker-Host exact-source preflight `a1e14fbff39984345484cf59a8c828a5aa3f35c7` remains **REJECTED**.

The six redlined files below are the current committed versions at this proposal's parent commit. The four scoped OE-12 overlay artifacts were published at `c9dcd460902f5f4de7ec548a3b54026d85bd4c0f` and made effective, within their stated scope, by the published baseline activation owner decision `da524cb006253fb0b6a2df79651b830febc5acdd` §§2–3. Their historical “Proposed / Not Approved” headers remain in immutable bytes; the later activation supplies the effect. The Worker-Host R&D Plan v1.0 was separately approved for **source/configuration preparation only** at `f526f845539193ab03db0a7eccb25ca319b29866`. The bounded-worker design v1.0 was published as an unimplemented resolution direction, with no mechanism or R&D authority. Original lifecycle baseline, Acceptance Matrix v1.0 and Execution Plan v1.0 provisions outside the scoped overlay remain authoritative.

**Redline convention:** “Current” quotes the exact relevant existing sentence or cell, not the whole surrounding document. “Proposed” is text for a *future separately reviewed versioned successor*; it is not inserted now. All unquoted portions of the existing clauses remain in force. A proposed paragraph must not be lifted into executable authority without the complete governance sequence in §4.

## 2. Clause-by-clause proposed redline

### C1 — Active OE-12 criterion: finite lifetime and unknown-process protection

**Source:** `SIR-02-KM-OE-12-CRITERION-AMENDMENT-v1.1.md`, §“Proposed replacement, without current effect”, quoted criterion at line 18; active only through the later activation decision.

**Current text (exact excerpt):**

> The worker/isolation boundary must have a proven finite lifetime and deterministic resource disposal; success, timeout, exception, cancellation, partial-result, provider-failure, late-result, stale-generation, outer/watchdog-timeout, and `finally` paths require independently reviewed executable mappings and retained evidence. No destructive fallback against an unknown or unverified process is permitted, and fallback cannot have broader authority than the primary path. Closure and cleanup outcomes require immutable, independent audit evidence.

**Proposed text — retain the current sentences and append:**

> For the separately governed D2 path only, after an approved Worker/provider timeout and expiration of the approved cooperative grace, an independently authorized **outer isolation owner** may be eligible to initiate **controlled termination** of one fully verified, exclusive, single-run-owned isolation boundary. This is not “non-destructive termination.” Before action, independent creation/admission evidence must account for every actual Node, Worker, identity-helper, conhost where present, and host-managed member; bind the boundary and members to one run/generation and retained handles; and freshly revalidate `PID + image path + parent PID + creation time + run token + creation/assignment event`, plus applicable handle/session/Job and boundary identity, immediately before the call. Prove that no unidentified or unrelated process or resource, including a host or sibling boundary, can be affected. The approved action must fit within the existing non-resetting disposal and total-run deadlines; retain exact reviewed source/API branch, native result, independent post-action boundary/member/handle/session state, and external immutable evidence. Missing, stale, mismatched, reused or unexpected identity, unknown outside effect, unavailable evidence, unbounded action, or failed post-action verification is `STOP — Disposition Unproven`; no fallback may expand authority. A paused-but-live boundary is temporary isolation only and does not count as Worker/helper exit, resource disposal, or finite completion. This paragraph becomes usable only after its versioned amendment is reviewed, published and owner-effected and the exact mechanism is separately approved.

**Reason:** The current criterion forbids destructive action against unknown/unverified processes but does not expressly decide whether verified exclusive-boundary termination can ever qualify. This is a **material proposed safety-contract change**, not an interpretation that is already active.

**Safety effect:** Retains the original finite/disposal, no-unknown-member and no-wider-fallback protections while adding a narrow, independently provable action class. Failure is unresolved disposal and candidate ineligibility. Immutable terminal state, Accepted Result Cutoff, zero post-closure authoritative mutation, mandatory GAP-A, tenant isolation, and independent audit remain unchanged. **Conflict / Owner Decision Required** with the current bounded **non-destructive** worker-disposal direction until this and companion clauses are versioned and effected.

### M1 — OE-12 Acceptance Matrix safety row

**Source:** `SIR-02-KM-OPERATIONAL-EVIDENCE-ACCEPTANCE-MATRIX-AMENDMENT-v1.1.md`, §“Proposed OE-12 row delta”, rows “Authoritative Validation-Boundary Quiescence” and “Execution-path and cleanup safety”.

**Current text (exact cells):**

> A unique run/generation reaches one immutable `Success`, `Fail`, `Timeout`, or `Cancelled` state within a finite approved bound. Boundary closure, isolation lifetime, and deterministic disposal are directly measured.

> Exact reviewed source and `100%` runnable-byte match; reviewed success, timeout, exception, cancellation, partial-result, provider-failure, late-result, stale-generation, watchdog, and `finally` branch map; no destructive unknown-process fallback; cleanup authority no broader than primary path.

**Proposed text — retain both cells and add one conditional OE-12-only evidence row:**

> Controlled D2 termination, if separately approved, requires independent proof of exclusive single-run boundary ownership and complete actual admission, fresh full boundary/member identity immediately before action, no unidentified/unrelated effect, measured completion inside approved disposal/total bounds, native API/operation result, observed post-action process/boundary/resource disposition, and externally retained immutable evidence. Pause alone, API initiation, a timeout, stream closure, `unref()`, or later PID absence never scores disposal PASS. Any missing proof is STOP and candidate FAIL.

**Reason:** A new acceptance method needs directly observable proof rather than a platform-name inference.

**Safety effect:** Existing terminal/cutoff, GAP-A receipt, exact-byte, branch-map, independent audit and no-broader-authority rows remain mandatory. **Material addition**; a successor OE-12 Matrix overlay requires review and owner effect, with no whole-document supersession.

### P3 — Execution Plan item 3: source and ownership gate

**Source:** `SIR-02-KM-OPERATIONAL-EVIDENCE-EXECUTION-PLAN-AMENDMENT-v1.1.md`, §“Proposed OE-12 execution-plan insertion”, item 3.

**Current text (exact excerpt):**

> Independently review a detailed boundary design and exact source. Require an immutable source package, `100%` match of runnable bytes, actual executable/launcher path, and executable branch map for success, timeout, exception, cancellation, partial result, provider failure, late result, stale generation, outer/watchdog timeout, and `finally` cleanup.

> Before any process/resource-identity-affecting action, revalidate the full PID/image/parent/creation-time/run-token/creation-assignment tuple and applicable handle/session/Job evidence immediately; mismatch, staleness, PID reuse, missing identity, or unexpected membership is `STOP — Ownership Revalidation Failed`. No fallback may bypass this gate.

**Proposed text — retain item 3 and append:**

> Any separately approved D2 controlled-termination path must identify the independently authorized outer entry, exact reviewed source and executable, concrete native/API call and return/operation-result checks, full expected/actual member and boundary admission receipt, fresh pre-action revalidation, one monotonic deadline, exception/timeout/`finally` behavior, post-action independent observation and external evidence sink. Neither Worker nor watchdog may mint authority or invoke that action. A source comment or prose assertion is not an executable path map.

**Reason:** The new action would create additional source/API paths; existing exact-source and ownership gates must cover them.

**Safety effect:** No runnable-byte mismatch, direct-entry bypass, stale identity or unreviewed cleanup branch can proceed. This is **additional path coverage**, not a reduction of current item 3; it belongs in a versioned OE-12 Execution Plan successor.

### P5 — Execution Plan item 5: cleanup authority

**Source:** same Execution Plan Amendment v1.1, §“Proposed OE-12 execution-plan insertion”, item 5.

**Current text (exact):**

> Prove deterministic isolation/disposal and ownership-aware cleanup with no destructive action against unknown/unverified processes and no fallback authority beyond the primary path. Any destructive or environment-changing mechanism requires separate explicit change control.

**Proposed text — retain item 5 and append:**

> A fully verified, exclusive, single-run-owned boundary may enter a separately approved controlled-termination path only after the authorized timeout and cooperative grace, under an independently authorized outer owner. The action is not a general destructive fallback: its scope and authority are fixed in the approved D2 design, cannot expand in timeout/exception/`finally`, and are withheld if any member or outside effect is unknown. Record native result and independently observed finite post-action disposition. A paused-but-live boundary is temporary isolation, not disposal. Separate criterion/baseline effect, mechanism/environment change control, source review and R&D execution authorization remain mandatory.

**Reason:** Item 5 already calls for separate change control, but does not authorize the proposed action.

**Safety effect:** The no-unknown-process and no-wider-fallback constraints remain strict. This is a **material action-class amendment** requiring a versioned OE-12 Execution Plan successor and separate owner approval; current item 5 remains authoritative until then.

### D3 — Detailed Design component authority

**Source:** `SIR-02-KM-OE-12-AUTHORITATIVE-VALIDATION-BOUNDARY-DETAILED-DESIGN-v1.0.md`, §3 “Conceptual component contracts”, Controller and Worker rows.

**Current text (exact excerpts):**

> On trust failure, timeout, exception, or cancellation, fail closed. It owns bounded observation and cooperative signalling, not Job-wide or unknown-process termination; retains timestamps, trigger, controller decision, and cleanup state.

> Worker owns only approved cooperative/natural exit and disposable resources; unresolved work is recorded. No physical-provider-stop claim.

**Proposed text — retain both rows and add a separately owned component row:**

> **Independent D2 outer disposition owner**, distinct from Controller, Worker, watchdog and candidate caller: only after separate versioned safety and mechanism approval, verify the T1 decision/consumed attempt, P1 sealed complete creation/admission receipt, exclusive run/generation-bound boundary and fresh actual member/boundary identities; then, after approved timeout and grace, either withhold action or invoke only the reviewed scoped controlled-termination API. Record native result, independent external evidence, affected-member/outside-boundary checks, and bounded observed final resource state. E1 retains failure evidence if primary audit or action fails; M1 verifies all source/image/executable/configuration bytes. It has no authority over an unknown or unrelated process, and cannot delegate termination to the Controller, Worker or watchdog.

**Reason:** A conditional termination action needs an independent authority and explicit trust/handle lifecycle. The existing controller/worker rows cannot silently acquire it.

**Safety effect:** Preserves independent receipt, authoritative-result fencing, no physical-provider-quiescence claim and fail-closed behavior. This is a **material design revision** requiring a reviewed versioned Detailed Design successor.

### D5 — Detailed Design executable cleanup and watchdog rule

**Source:** same Detailed Design v1.0, §5 “Future executable path contract”, paragraph following the path table.

**Current text (exact excerpt):**

> The watchdog may observe, signal cooperative cancellation, and capture evidence only. It cannot silently terminate an unknown process, close a Job handle as a destructive test with unresolved membership, call `TerminateJobObject`, `TerminateProcess`, `Stop-Process`, or `taskkill`, or bypass ownership gates. A future mechanism requiring destructive action, privilege elevation, Windows/CIM configuration, new dependency, or production/runtime change must stop for separate change control. No cleanup or fallback path may have broader authority than the primary path. A bounded validation decision must not be misreported as a proven bounded worker disposal if the latter is unresolved.

**Proposed text — retain the current paragraph and append:**

> No watchdog, Worker or Controller gains process-termination authority from this design. If a later owner-effected criterion and independently approved outer D2 mechanism permit controlled termination, source-level review must map its exact success, refusal, timeout, native/API exception, partial operation, observer failure and `finally` paths to fresh ownership checks, one deadline, bounded independent post-action verification, handle/session cleanup and external immutable evidence. Unknown membership or incomplete post-action proof remains STOP; no Job-wide or environment-wide fallback may exceed the reviewed exclusive boundary.

**Reason:** The new path cannot be implemented through an existing watchdog or cleanup catch/finally branch.

**Safety effect:** Preserves the existing watchdog ban and no-broader-fallback rule. A versioned Detailed Design successor and separate source change control are required; this draft supplies neither.

### W6 — Worker-Host R&D Plan §6 bounds and isolation state

**Source:** `SIR-02-KM-OE-12-WORKER-HOST-RD-PLAN-v1.0.md`, §6 “Separate state domains and proposed numeric bounds”, `T_cancel`, `T_dispose`, `T_total` rows and following `Isolated` rule.

**Current text (exact excerpts):**

> Approved cooperative cancellation request → observed acknowledgement/natural exit or grace expiry

> Post-closure safe cleanup begins (including `T_cancel`) → independently verified `Disposed` or qualifying safe, finite-lifetime isolation

> An `Isolated` label qualifies for SC-6 only if exact reviewed source and independent evidence prove complete ownership/containment, **finite worker-boundary lifetime**, no result or collateral authority, and a deterministic safe disposal outcome within `T_dispose`.

**Proposed text — retain `T_cancel = 2 s`, `T_dispose = 5 s`, `T_total = 45 s` and append:**

> After an approved timeout and the already included cooperative grace, any separately approved controlled-termination call and its independently observed process/boundary/handle/session disposition must finish inside the original non-resetting `T_dispose` and `T_total` deadlines; `finally` may not restart them. Pause is temporary isolation and never establishes `Disposed`, Worker/helper exit or the required finite final resource state. The identity-helper `≤5,000 ms` ceiling remains an unproven design target and may not extend either active deadline.

**Reason:** The proposed method must not gain extra time or convert a live paused guest into a disposal PASS.

**Safety effect:** A missed bound or unresolved resource fails SC-6 and remains immutable failure evidence. This is a **material disposal-method change** and a stricter pause classification for a versioned Worker-Host R&D Plan successor.

### W7–W8 — Worker-Host WH and SC negative evidence

**Source:** same R&D Plan v1.0, §§7–8: WH-03, WH-08, WH-09, WH-10 and SC-2, SC-5, SC-6, SC-7, SC-8.

**Current text (exact excerpts):**

> **WH-03 — Worker/provider unresponsive** | Cooperative cancellation does not complete; Controller still closes by `T_close`; safe, finite-lifetime disposal/isolation must be independently proven or case fails.

> **WH-08 — Unexpected helper/member** | Actual resource set contains an unknown or unverified member; no Job-wide or other unknown-member action occurs.

> **WH-09 — Disposal failure** | Approved safe cleanup cannot establish `Disposed` or qualifying finite safe isolation within `T_dispose`; candidate fails SC-6.

> **SC-6** | Worker-host boundary reaches independently proven `Disposed` or qualifying finite safe isolation within `T_dispose = 5 s`, including the unresponsive path, without unknown-resource effect.

> **SC-7** | Independent observations establish **zero** effect on unrelated processes/resources, other tenants/runs and Core iBeX.

**Proposed text — retain all WH-01–WH-10 and SC-1–SC-8 requirements; add conditional negative evidence:**

> A later separately authorized direct R&D case must cause a real unresponsive Worker and a timed-out identity helper; independently capture actual Node, helper, conhost where present and host-managed membership before provider influence and before any process action. WH-08 must introduce or detect a real unexpected/unverified member and prove the action is withheld. WH-09 must retain the native failure/timeout, all remaining resources and candidate ineligibility if disposition is not observed. WH-10 must cover exception and `finally` without a broader fallback. For any approved controlled action, retain fresh ≤500 ms full ownership/boundary revalidation, exact reviewed call/API result, monotonically measured start/end, independently observed exit/final resource state, zero effect on unrelated processes/tenants/runs/Core iBeX, and E1 evidence integrity. Prelaunch WH-03/09 STOP and synthetic WH-08 STOP remain nonproof.

**Reason:** The new path requires real negative-path evidence; API availability and static design cannot demonstrate operational safety.

**Safety effect:** No automatic SC PASS or GAP closure. All existing tests remain mandatory, and any absent external evidence fails candidate eligibility. A versioned R&D Plan case/evidence successor requires independent review; the tests cannot run under this draft.

### W9 — Worker-Host R&D Plan cleanup contract

**Source:** same R&D Plan v1.0, §9 “Future evidence schema and cleanup/disposal contract”.

**Current text (exact excerpts):**

> Future reviewed source must use only governed cooperative/natural exit, bounded observation, read-only verification and deterministic disposal of controller-owned handles, channels, temporary files and sessions unless a separately approved safe boundary proves another method.

> No PID-only termination, unknown-member termination, Job-wide action on unresolved membership, destructive fallback, authority expansion or unreviewed watchdog path is permitted.

**Proposed text — retain both sentences and append:**

> The only proposed “another method” is a separately reviewed and owner-approved D2 outer-owner action after the active safety-contract amendment is effected. It is not a Controller, Worker or watchdog fallback. Complete independent receipt/membership and immediately fresh full identity must pass before action; if any fact or external evidence sink is unavailable, withhold action and record unresolved disposal. Exception, timeout and `finally` paths may not broaden the action or restart the deadline. No unidentified/unrelated process may be affected, and disposal is never inferred from pause, stream closure, `unref()`, API start or later PID absence.

**Reason:** §9's exception cannot be read as current approval of controlled termination.

**Safety effect:** Preserves fail-closed cleanup and requires a versioned R&D Plan successor, approved exact D2 mechanism and separate source/R&D authorization. **Conflict / Owner Decision Required** with the existing no-destructive-fallback direction until those gates are completed.

### B3 — Bounded Worker Isolation/Disposal Design's explicit call ban

**Source:** `SIR-02-KM-OE-12-BOUNDED-WORKER-ISOLATION-DISPOSAL-DESIGN-v1.0.md`, §3 “Non-destructive worker disposal and unresolved boundary”. This published design proposal was approved only as a **resolution direction**, not a mechanism.

**Current text (exact):**

> No PID-only action, unknown-member action, destructive Job-wide action, kill-on-close, `TerminateJobObject`, `TerminateProcess`, `Stop-Process`, `taskkill`, or fallback with broader authority is permitted.

**Proposed text — replace only that sentence in a future separately approved versioned design:**

> No PID-only action, unknown-member action, destructive Job-wide action on unresolved membership, kill-on-close of an unverified Job, or fallback with broader authority is permitted. The Controller, Worker and watchdog may not invoke `TerminateJobObject`, `TerminateProcess`, `Stop-Process`, `taskkill` or equivalent force action. A distinct independent outer owner may be considered for one exact reviewed controlled-termination mechanism **only after** an owner-effected OE-12 safety-contract amendment, an independently reviewed and owner-approved exclusive-boundary design, separate mechanism/environment and source change control, and fresh complete run-bound member/boundary ownership checks. The action must affect no unidentified or unrelated process and must be followed by bounded independent exit/disposal and external evidence verification. Any missing guard or failed observation is STOP; no alternative destructive fallback is inferred.

**Reason:** A blanket ban on these calls cannot silently coexist with a later proposal for controlled termination. The specific permissible API/mechanism remains undecided and may still be impossible under the protected constraints.

**Safety effect:** This is a **direct material conflict with a published design-direction clause — `Conflict / Owner Decision Required`**. Do not apply this redline until a versioned design revision, technical review, exact-byte publication and separate owner approval reconcile it. No unknown-member or collateral action becomes eligible.

## 3. Unchanged higher controls and unresolved proof

The redline does **not** amend tenant isolation, trusted tenant/request/correlation scope, source ownership, authorization, sanitized denial, OE-12 lifecycle-audit event coverage, the OE-08 synthetic audit-only boundary, or the separate AI Platform / AI Gateway contract. GAP-A's independent receipt producer and probe-independent integrity anchor remain mandatory. T1 needs an independent verifier/key and protected atomic single-use attempt claim **before the first execution-relevant side effect**. P1 must authenticate complete creation and assignment, not a PID list or self-hashed receipt. E1's protected failure ledger must remain independent of primary audit and record its own failure; M1 must authenticate the full source/image/executable/configuration manifest outside caller/Worker control and prove `100%` reviewed-to-runnable bytes. One immutable terminal state, Accepted Result Cutoff, late/stale rejection, and zero accepted post-closure authoritative mutation remain mandatory. A controlled action must not change any of these acceptance rules.

No higher original v1.0 baseline clause was found that expressly authorizes or absolutely forbids termination of a *fully verified exclusive run-owned* OE-12 boundary. That absence is **not permission**. The currently effective scoped safety overlays, approved R&D Plan direction and published bounded-worker design still require the separate owner decision and versioned amendment above. If later technical review finds a contradictory higher Approved/Baseline requirement, record **`Conflict / Owner Decision Required`** and stop; do not override it by interpreting this draft.

**Still unproven:** existence of a truly exclusive VM or Hyper-V-isolated container; complete actual Controller/Supervisor/Worker/helper/conhost and host-managed admission; a separately trusted outer owner and cross-boundary T1/P1/E1/M1; exact safe native API and authority; real Worker and identity-helper hang behavior; completion within the 2 s/5 s/45 s bounds and helper ≤5,000 ms target; zero effect outside the boundary; immutable external evidence during primary audit or controller/host failure; independently observed process exit, final handle/session/environment disposition. A platform shutdown, pause or terminate API name is nonproof. Existing WH-03/09 prelaunch STOP and WH-08 synthetic STOP are nonproof.

**Future direct R&D proof path, separately gated:** after a specific exclusive-boundary design and this safety amendment are independently reviewed, exact-byte published and owner-approved/effected, obtain separate environment/dependency/privilege/configuration change control, bounded source-change authorization and exact-source safety acceptance. Only then may a separate owner authorize at most one candidate R&D attempt. Direct WH-03/08/09/10 plus associated WH/SC cases must independently capture trusted admission, fresh pre-action identity, real hangs, authorized/native call and result, monotonic timing, no outside impact, observed final state, external audit/failure evidence and fail-closed negative branches. A failed case remains failed. `GAP Closure = Approved Applicable Design/Boundary AND Newly Authorized Direct Evidence`; design approval or an R&D attempt alone closes neither GAP.

## 4. Owner outcomes and non-effect rule

| Owner outcome — none selected | Effect if separately recorded through governance |
| --- | --- |
| **Retain current criterion** | Reject or defer the controlled-termination redline. Current scoped OE-12 safety contract remains authoritative; no controlled termination is allowed, D2 `Design STOP` remains, and no VM/container mechanism/source/R&D work follows from this draft. |
| **Approve the specified versioned amendment** | Direct preparation, independent technical review, exact-byte publication, separate owner approval/effect and governance linkage for the scoped successor criterion, Matrix, Execution Plan, Detailed Design, Worker-Host R&D Plan and bounded-worker design clauses above. Approval of this **draft alone** does not change the baseline. Even an effected amendment would not select or approve a VM/container mechanism, key/store/service, environment/configuration change, source modification or execution; each needs separate change control and direct proof. |

**Current state:** `Controlled termination = NOT APPROVED`; `Technical Preflight = REJECTED`; `R&D Execution = NOT AUTHORIZED`; `Attempt = NOT STARTED`; `GAP-A = OPEN / mandatory`; `GAP-B operational closure = NOT ESTABLISHED`; `worker disposal = OPEN proof obligation`; `Alignment GAP = CLOSED`; `OE-12 = Not Executed`; `SIR-02 = Blocking`. The six governing documents and all historical evidence remain unchanged. This draft is not an owner decision, active amendment, implementation instruction or R&D authorization.
