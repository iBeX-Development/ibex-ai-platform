# OE-12 D2 Six-Document Safety Amendment — Exact-Byte Technical Review v1.0

**Review status:** Technical review completed; drafts remain non-effective.
**Review date:** 2026-09-30 (Asia/Ulaanbaatar).
**Scope:** Read-only review of the six documents added by `4df85800f6b6ba9c8e4f8429694aaf1aa79cddf7`. This record does not select an owner outcome or change the active safety contract.

## 1. Authority and exact-byte preflight

Commit `4df85800f6b6ba9c8e4f8429694aaf1aa79cddf7` adds exactly the six files below. Its diff has no modification to an effective predecessor, source, configuration, dependency or historical evidence. All six are marked `Proposed / Not Approved / Not Effective`, cross-reference the same amendment proposal and six-member indivisible change set, and deny partial effect. Committed file bytes, rather than a restatement of the earlier review, were checked.

All paths in this table are under `docs/governance/sir-02/controls/`.

| New draft | Committed SHA-256 | Check |
|---|---|---|
| `SIR-02-KM-OE-12-CRITERION-AMENDMENT-v1.2.md` | `8f42f71c04b3fdeccf2207f062cd5bd5cf4c66209a11710632566f3cc4f6b13c` | MATCH |
| `SIR-02-KM-OPERATIONAL-EVIDENCE-ACCEPTANCE-MATRIX-AMENDMENT-v1.2.md` | `45bb39650ca9f4c038f974007353e6bcc1785a2e8fbeda97c77cb9cbc9a26a8d` | MATCH |
| `SIR-02-KM-OPERATIONAL-EVIDENCE-EXECUTION-PLAN-AMENDMENT-v1.2.md` | `1b9cb926fdc64e30a57a21c3865da268343d7a8ebe9d70a6b1b5f6b8e7df7e39` | MATCH |
| `SIR-02-KM-OE-12-AUTHORITATIVE-VALIDATION-BOUNDARY-DETAILED-DESIGN-v1.1.md` | `9be3679178feb59571bb59a2e1972ba4187feb5533d5052fd3af3e7d51065d09` | MATCH |
| `SIR-02-KM-OE-12-WORKER-HOST-RD-PLAN-v1.1.md` | `a491415bfb7f986f21eae295884c7f0a02b6d72b73f0e40d0098d56e1b9afbf3` | MATCH |
| `SIR-02-KM-OE-12-BOUNDED-WORKER-ISOLATION-DISPOSAL-DESIGN-v1.1.md` | `69e2c55f3525391d3b161b95063e45729d033bcc583c71c06c804b15069a2e76` | MATCH |

The reviewed redline is `SIR-02-KM-OE-12-D2-CONTROLLED-TERMINATION-SAFETY-CONTRACT-AMENDMENT-PROPOSAL-v1.0.md`, commit `bbed96a4e730c2e3595f08745406c4770b6b8dc0`, SHA-256 `26f8fae5557447c2e2854c78e1ba88067627d204cded662fcca372e405eb34d5`. Its published technical review is `SIR-02-KM-OE-12-D2-CONTROLLED-TERMINATION-SAFETY-CONTRACT-AMENDMENT-TECHNICAL-REVIEW-v1.0.md`, commit `077cb9b4d6e6f61f6eba799cb1b8b6542020d429`, SHA-256 `58615ed76c392e73dd97bcf9eefc7181b9629bd48127465a3da7e2f164c8e340`. That review found the *proposal* suitable for owner consideration; it did not review these six successor bytes or approve effect. Its §4 requires all six successors to be technically reviewed, published at reviewed bytes, and separately owner-effected with governance linkage together.

The effective predecessor texts compared here are the corresponding criterion amendment v1.1, Acceptance Matrix amendment v1.1, Execution Plan amendment v1.1, Authoritative Validation-Boundary Detailed Design v1.0, Worker-Host R&D Plan v1.0, and Bounded Worker Isolation/Disposal Design v1.0 in the same directory. The first four are scoped active overlays through `SIR-02-KM-OE-12-BASELINE-ACTIVATION-OWNER-DECISION-v1.0.md` §§2–3 and its immutable publication. The latter two retain their separately governed planning/design status, with no R&D execution authority. An older file header reading “Proposed” does not undo a later scoped activation decision.

## 2. Eight-gate alignment — authority for this review action only

These results apply to reading the six non-effective drafts and writing this review. They do **not** evaluate activation, mechanism approval, source change, environment change or R&D execution; those gates remain closed.

| Gate | Result | Exact applicable clause and action affected |
|---|---|---|
| Master Architecture / Baseline | **PASS** | `docs/baseline/README.md` §§“v1.x minor update rule”, “v2.0 major update rule”, “Architecture change procedure” requires versioned review and approval rather than silent reinterpretation; `01-master-ai-policy-v1.0.md` §2 retains the `Core iBeX → AI Gateway → AI Platform` boundary. This action only reviews proposed OE-12 wording and changes no active architecture. A later material architecture change would need its own baseline procedure. |
| Implementation Plan | **PASS** | `docs/baseline/17-implementation-plan-v1.0.md` §§1–2 sets the approved `Build → Local Test → Integration → Security Validation → Evaluation → Shadow Mode → Controlled Pilot → Production Readiness` sequence and approved-baseline authority. This action performs no build, test, pilot or implementation. |
| SIR / Shadow Readiness Plan | **PASS** | `docs/baseline/15-implementation-readiness-review-v1.0.md` §§23–24 retain readiness and release STOP gates; `docs/governance/sir-02/responses/product-response-v1.0.md` `SIR02-GOV-02` says the reduced Shadow-scope approval does not authorize Shadow entry. Draft review does not change SIR-02 or Shadow readiness. |
| Operational Evidence Execution Plan | **PASS** | `SIR-02-KM-OPERATIONAL-EVIDENCE-EXECUTION-PLAN-v1.0.md` §“Formal governance approval” and §“SIR02-KM-OE-12 — Lifecycle audit evidence” distinguish controlled evidence execution from accepted results; its scoped v1.1 amendment insertion items 3 and 5 retain exact-source and ownership/cleanup gates. This action runs no OE-12 evidence or R&D case. |
| Scope / Change Control | **PASS** | Published D2 amendment technical review §4 requires coordinated six-document effect and forbids partial activation. The six drafts each repeat that rule. This action creates only a technical review; it cannot effect the drafts or approve a mechanism. |
| Exit / Next-step | **PASS** | Published D2 amendment technical review §4 separates technical review, exact-byte publication, owner effect/linkage, mechanism/environment change control, source review and execution authority. This action may record a technical decision and a required correction; it cannot skip to owner effect or execution. |
| Evidence Integrity / Traceability | **PASS** | `4df85800f6b6ba9c8e4f8429694aaf1aa79cddf7` adds only the six named files; the six committed hashes above match their recorded values. This review cites immutable proposal/review inputs and introduces no replacement historical evidence. |
| Capability Boundary / Environment | **PASS** | Worker-Host R&D Plan v1.0 §§3, 6–9 and OE Execution Plan v1.0 §“Formal governance approval” require separately governed capability, ownership, configuration and execution controls. This read-only review installs, configures, imports and executes nothing. |

**Gate scope:** all eight permit this read-only review. The normative contradiction below blocks suitability of these exact drafts for an owner effect decision. It does not turn a review gate into implementation authority.

## 3. Coordinated six-document contract check

| Draft and affected clause | Consistency finding |
|---|---|
| Criterion v1.2, proposed D2 paragraph | Conditional outer-owner action is expressly a material change and says, “This is not ‘non-destructive termination.’” It requires complete independently anchored admission of actual Node/Worker/helper/conhost/host-managed members, fresh full identity, no outside effect, non-resetting bounds, native result and independently observed final state. Unknown evidence fails closed. It supplies no mechanism or permission now. **Internally conditional; conflicts with retained non-destructive obligations in the two planning/design successors.** |
| Acceptance Matrix v1.2, M1 row | Requires direct proof of exclusive run ownership, admission, freshness, no unrelated effect, measured native completion, final resource state and immutable external evidence. Pause, API initiation, timeout, stream closure, `unref()` and later PID absence cannot score disposal PASS. **Consistent as a proposed evidence row; no evidence exists yet.** |
| Execution Plan v1.2, P3/P5 | Requires an exact outer entry/API/path map, independent owner, one clock, complete receipt, fresh checks and exception/timeout/`finally` coverage. It withholds action on unknown members or outside effects and denies Worker/watchdog authority. **Consistent as a conditional path; no source or execution grant.** |
| Detailed Design v1.1, D3/D5 | Adds a distinct outer disposition owner while retaining Controller/Worker/watchdog restrictions; records refusal, native/observer failure and cleanup with external evidence. It preserves immutable terminal state and says pause is temporary. **Design role is clear, but no mechanism, trust root or bounded disposition is proven.** The retained v1.0 §7 non-destructive design-gap wording needs explicit cross-check when correcting the six-document set. |
| Worker-Host R&D Plan v1.1, W6/W7–W8/W9 | Retains `T_cancel = 2 s` inside `T_dispose = 5 s`, `T_total = 45 s`, and `T_fresh ≤ 500 ms`; controlled action and observation cannot reset clocks. WH-03/08/09 direct negative tests, helper hang, no collateral effect and E1 evidence remain future proof. Yet its effect rule carries forward v1.0 §1, RQ-4, §6, §8 and §9, including non-destructive wording. It expressly labels this an unresolved cross-clause conflict. **Normative contradiction.** |
| Bounded Worker Isolation/Disposal Design v1.1, B3 | Replaces only the v1.0 §3 call-ban sentence with a conditional, independently authorized outer-owner exception. Its effect rule carries forward all other v1.0 design/evidence obligations; its own final paragraph identifies retained §3 and §4 non-destructive wording as unresolved. **Normative contradiction.** |

Authority is limited to the independently authorized outer owner after a separately effected safety amendment and separately approved exact mechanism. T1/P1/E1/M1 names do not themselves create independent authority or prove admission. Complete actual membership, fresh identity immediately before action, exclusive boundary scope, no unidentified or unrelated effect, external evidence, non-resetting finite deadlines, and observed post-action disposal remain mandatory. Every missing fact or failed guard is STOP; timeout, native failure, observer failure, exception and `finally` cannot widen fallback authority. A paused live boundary is temporary isolation, never worker/helper exit or disposal. WH-03/08/09 prelaunch or synthetic STOP evidence remains **nonproof** of real hang disposal or complete membership.

## 4. Exact non-destructive conflict and required correction

The proposed criterion v1.2 calls the candidate action **“controlled termination”** and says exactly, “This is not ‘non-destructive termination.’” It cannot be renamed to satisfy an existing non-destructive obligation. The following effective predecessor clauses are retained by the successor drafts unless explicitly revised:

1. Worker-Host R&D Plan v1.0 §1: “**bounded, non-destructive worker-boundary disposal**” is part of the R&D objective. Its v1.1 successor says “all other v1.0 gates carry forward.”
2. Worker-Host R&D Plan v1.0 §2, RQ-4 asks whether disposition can occur “without PID-only action, unknown-member action, **destructive fallback**, broader cleanup authority, elevation or global OS/CIM configuration change.” §6 `T_cancel` expiry says “no destructive fallback”; `T_dispose` expiry says “no unknown-member or destructive cleanup.” §8 STOP gate includes “destructive or broader-authority fallback.” §9 permits cooperative/natural exit unless a separately approved safe boundary proves another method, while prohibiting destructive fallback. The proposed outer-owner action might be framed as a separately approved primary method rather than fallback, but the §1 objective and §6 disposal wording remain operative and cannot be reconciled by that label alone.
3. Bounded Worker Isolation/Disposal Design v1.0 §3 is headed “**Non-destructive worker disposal and unresolved boundary**” and its Design GAP says the current topology does not establish “true bounded, **non-destructive disposal** for an unresponsive CIM worker.” §4 requires “**separate bounded non-destructive worker/boundary disposal**” as direct evidence. Its v1.1 successor replaces **only** the §3 call-ban sentence and carries forward all other v1.0 obligations.

Consequently, effecting all six current drafts together would both permit a scoped termination action and retain a mandatory non-destructive disposal objective/evidence test. The two v1.1 drafts themselves flag the contradiction. An explicit warning that a conflict is unresolved is good disclosure, but it is not a coherent operative rule. No owner choice on these bytes can silently supply the missing redline, and partial effect is prohibited.

**Exact versioned correction required before a new technical review:** revise the Worker-Host R&D Plan successor to state how §1 objective, §2 RQ-4, §6 expiry consequences, §8 STOP gate and §9 cleanup distinguish the existing cooperative/non-destructive path from a separately approved controlled outer-owner action, without weakening unknown-member, no-collateral, deadline or no-broader-fallback prohibitions. Revise the Bounded Worker Isolation/Disposal Design successor’s §3 heading/Design GAP and §4 direct-evidence obligation so the permitted method and proof standard are unambiguous; do not merely replace the call-ban sentence. Cross-check the retained Detailed Design v1.0 §7 wording and all other successor references for the same distinction. Keep controlled termination named as termination, with distinct independent authorization, source/environment change control, exact-source review and later direct R&D proof. Recompute and independently review the corrected exact bytes as one indivisible set before publication or owner effect consideration. This review does not make those edits.

## 5. Decision and unchanged state

**Technical decision: `Revision Required`.** The committed bytes pass the six hash checks and the eight gates for read-only review, and most proposed protections align. The retained non-destructive requirements create an unresolved normative contradiction across the coordinated set, so these six exact drafts are not suitable for owner effect as written. The earlier proposal-level technical finding did not approve these successor clauses.

| Control | State after this review |
|---|---|
| Controlled termination | `NOT APPROVED` |
| Six successor drafts | `Proposed / Not Approved / Not Effective` |
| Technical Preflight | `REJECTED` |
| R&D Execution | `NOT AUTHORIZED` |
| Attempt | `NOT STARTED` |
| GAP-A | `OPEN / mandatory` |
| GAP-B operational closure | `NOT ESTABLISHED` |
| Worker disposal | `OPEN proof obligation` |
| OE-12 | `Not Executed` |
| SIR-02 | `Blocking` |

No safety-contract activation, mechanism approval, environment/source change, process/CIM action, R&D case or formal OE-12 attempt follows from this record. The next permissible governance action is to prepare coordinated versioned corrections for the identified non-destructive clauses and submit the corrected six-document set for exact-byte technical re-review.
