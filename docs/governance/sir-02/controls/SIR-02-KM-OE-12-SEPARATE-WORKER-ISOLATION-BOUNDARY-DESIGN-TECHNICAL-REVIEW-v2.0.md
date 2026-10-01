# SIR-02 KM OE-12 Separate Worker Isolation-Boundary Design Technical Re-Review v2.0

| Field | Review record |
| --- | --- |
| Review date | 2026-09-29 |
| Canonical prior review | `57f0af5fc5edee5929aadafe487fe57387ea5ae5` — `Needs Clarification` |
| Exact corrected unpublished design | `SIR-02-KM-OE-12-SEPARATE-WORKER-ISOLATION-BOUNDARY-DESIGN-v1.0.md` |
| Corrected file-byte SHA-256 | `205d8e0e2d1633d8fa36576184994990b014ef8d981d22ac164a843fde73b6cc` — **MATCH** |
| Prior reviewed file-byte SHA-256 | `fbf3c3916f7884f289ffc18e9bb61452cbcacee93e7579a34121e173459bc4da` |
| Design status | `Proposed / Not Approved / No Implementation Authorization`; unpublished |
| Final technical review decision | **Accepted — Design STOP Valid / Owner Change-Control Required** |
| Reviewer attribution | Codex technical governance review; no personal independent human review or attestation is asserted |

## 1. Exact-byte preflight

The corrected local design exists, is still untracked/unpublished, and its exact file bytes hash to `205d8e0e2d1633d8fa36576184994990b014ef8d981d22ac164a843fde73b6cc`. The committed v1.0 technical review at `57f0af5fc5edee5929aadafe487fe57387ea5ae5` remains unchanged and records `Needs Clarification`. Its only failed subject was the ambiguity between worker lifecycle labels and authoritative validation terminal states; the isolation-mechanism finding and other gates passed. The corrected design still says **`Design STOP — No Compliant Isolation Boundary Identified`** and retains `Proposed / Not Approved / No Implementation Authorization`.

The approved/published remaining-obligations direction remains `6bcb62fbe03006164ffa289b636e03f337f28f97`. The scoped active criterion remains **Authoritative Validation-Boundary Quiescence**. **Alignment GAP = CLOSED** for governance consistency; **GAP-A = OPEN / mandatory**; **GAP-B operational closure = NOT ESTABLISHED**; **bounded non-destructive worker disposal = OPEN proof obligation**; **OE-12 = Not Executed**; **SIR-02 = Blocking**. No new isolation-boundary implementation, source or execution authorization is present. Preflight: **PASS**.

## 2. Scope-drift check against the prior reviewed bytes

The correction is confined to the state-domain language identified by the v1.0 review:

| Corrected location | Substantive change | Scope result |
| --- | --- | --- |
| Section 3, immediately after the conceptual flow | Added the explicit rule that worker lifecycle and authoritative terminal state are separate, only the Controller sets the terminal state, and `WorkerCompleted` does not imply `Success`. | **Within the sole prior GAP** |
| Section 3 worker component row | Replaced generic worker `Terminal` wording with a worker outcome observation and pointed to the separate worker labels. | **Within the sole prior GAP** |
| Section 5 lifecycle paragraph | Replaced ambiguous worker outcomes with `WorkerCompleted`, `WorkerTimedOut`, `WorkerFaulted`, `WorkerCancellationObserved`, `WorkerUnresponsive`, `DisposalPending`, `Disposed`, and `DisposalFailed / Isolated`; separately stated the authoritative `Success/Timeout/Fail/Cancelled` transition and immutability. | **Within the sole prior GAP** |
| Section 7 table preface and affected failure rows | Named worker observations separately from Controller-selected authoritative terminal states, and removed the ambiguous “close as `Succeeded`/`TimedOut`/`Failed`” wording. | **Within the sole prior GAP** |

The normative disposal object, eight-component architecture, candidate isolation assessment, full ownership tuple, GAP-A dependency, conditional bounded-disposal protocol, non-destructive safety constraints, Accepted Result Cutoff and late-result fence, direct-evidence contract, implementation order, and **Design STOP** conclusion remain semantically unchanged. No new mechanism or fallback is selected. **Scope-drift result: PASS — correction limited to terminal-state clarification.**

## 3. State and authority gates

| Gate | Result | Corrected-byte evidence |
| --- | --- | --- |
| State-domain separation | **PASS — Worker and Authoritative State Domains Explicitly Separated** | Section 3 says the domains `MUST NOT be used interchangeably`; section 5 gives distinct worker/resource observations and the separate authoritative terminal vocabulary. Worker/resource states do not represent validation acceptance. |
| Authoritative control | **PASS** | Only the Authoritative Controller may transition the validation boundary under governed acceptance rules to exactly one `Success`, `Timeout`, `Fail`, or `Cancelled`. `WorkerCompleted` does not automatically imply `Success`; `WorkerTimedOut` and `WorkerFaulted` do not directly write `Timeout` or `Fail`. Worker/provider output remains candidate data. Once terminal, the state cannot reopen, the Accepted Result Cutoff cannot advance, the generation cannot be reused, and later worker changes or results cannot alter the accepted set or reason. |
| Design STOP preservation | **PASS — Design STOP Preserved** | Section 4 still concludes `Design STOP — No Compliant Isolation Boundary Identified`. No class is newly selected; finite non-destructive disposal of a stalled worker remains unproven. There is no destructive, unknown-member, or broader-authority fallback. GAP-A remains an external mandatory dependency and implementation remains prohibited. |

The corrected section 7 still requires future executable evidence for every applicable path as `trigger → exact reviewed source → branch/function → exact API/call → state transition → ownership check → cleanup/disposal → retained evidence`. Its normal, timeout, cancellation, worker/provider failure, incomplete-result, and hang rows now state separately what was observed about the worker and what the Controller may decide under the governed rule. They do **not** impose an unreviewed one-to-one worker-to-validation mapping. **Failure-path contract after terminology correction: PASS.**

## 4. Previously passing gates and decision limit

The correction introduces no contradiction in the previously passing findings: **disposal object = PASS; architecture separation = PASS; ownership dependency = PASS; conditional bounded-disposal protocol = PASS; non-destructive safety = PASS; late-result/state controls = PASS; disposal-failure handling = PASS; newly authorized direct-evidence requirements = PASS; implementation ordering = PASS; higher-order tenant/security and Core/AI Gateway non-regression = PASS**. The mechanism assessment remains **PASS as a supported Design STOP**, not as a disposal solution.

**Final technical decision: `Accepted — Design STOP Valid / Owner Change-Control Required`.** This accepts the corrected governance *finding* that no currently compliant isolation-boundary mechanism has been identified under the active controls. It does **not** assert that such a mechanism is impossible, approve this proposal as an implementation, prove bounded worker disposal, close GAP-A or GAP-B, or authorize source, process/CIM execution, Diagnostic v4, launcher v1.4, Smoke v5 or formal retry `0003`.

The corrected design remains unpublished. **GAP-A = OPEN / mandatory; GAP-B operational closure = NOT ESTABLISHED; worker disposal = OPEN proof obligation; Alignment GAP = CLOSED; OE-12 = Not Executed; SIR-02 = Blocking.** No design, v1.0 review, active baseline, source, implementation, configuration, evidence or canonical status was modified by this technical re-review. The next permissible actions, in order, are **publish the exact corrected isolation-boundary design bytes**, then **perform a separate owner/change-control decision on the Design STOP constraint**.
