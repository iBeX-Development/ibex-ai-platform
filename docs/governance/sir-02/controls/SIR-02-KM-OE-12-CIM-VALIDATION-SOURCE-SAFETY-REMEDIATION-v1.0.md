# SIR-02 KM OE-12 CIM Validation Source-Safety Remediation v1.0

| Field | Value |
| --- | --- |
| Purpose | Define the minimum controls needed to remediate the two rejected exact-source safety gaps; proposal only |
| Exact source | `61aa0e575fc52f121f9fd24cb41a575ccc55c120` — unchanged |
| Safety review | `76e20519b3395faf012c6231d818eaf9e8532690` — `Rejected — Source Remediation Required` |
| Active-path alignment review | `023b43614e7584d8f92d07a51ea32c8419a45e71` — Alignment GAP open |
| GAP-A | `GAP — Receipt Trust Boundary Unproven` |
| GAP-B | `GAP — Stalled CIM Quiescence Unproven` |
| Remediation decision | **STOP — Current Boundary Cannot Close Required Gaps** |
| Source/probe execution | Not authorized and not performed by this proposal |

## 1. Preflight and scope

The reviewed source and safety-review results are unchanged. No source-remediation authorization or CIM validation execution authorization exists. The current environment-validation authorization remains `Proposed / Not Authorized`; the exact-source preparation decision authorized only preparation for review. Option B remains `Needs Clarification`, Diagnostic v4 is not proposed, Smoke v5 and formal retry `0003` are not authorized, and OE-12 remains `Not Executed`. This proposal changes no canonical status or acceptance criterion.

This document defines requirements, not an implementation selection. A future design must identify exact source bytes, trust boundaries, API behavior, all exit branches, and evidence before an owner can consider source-remediation authorization. A working timeout or a matching self-supplied hash does not satisfy the rejected controls.

## 2. GAP-A — independent creation/assignment receipt trust

**Feasibility classification: `Requires expanded trust boundary/change control`.** The current probe accepts both `receiptPath` and `receiptSha256` through its input and compares that receipt with fields from the same input (`validate-cim-environment.ps1`:47-71). It has no independent receipt producer or pre-probe integrity anchor. The source can check consistency, not independent provenance.

Minimum future contract:

1. A separately accountable receipt producer must observe and record the synthetic process creation and assignment events **before** the CIM probe begins. The process under evaluation and the probe must not be the sole authors of their own ownership claim. The producer identity, authority, time, and source/version must be retained.
2. The receipt must bind the exact run ID/token and role to **PID, image path, parent PID, creation time, and creation/assignment event**. Where applicable, it must also bind retained process-handle identity, session, and Job membership/assignment evidence. It must identify the synthetic Node and conhost instances separately.
3. The producer must seal the receipt before probe validation. An integrity digest/reference must be anchored by a write authority outside probe-controlled input and later verified from an independently trusted, read-only channel. The probe may receive an identifier for lookup, but may not supply both the authoritative receipt and its sole trusted digest. A caller-controlled file plus caller-controlled hash is insufficient.
4. The probe must verify the producer/anchor, sealed timestamp or ordering, run token, complete identity tuple, and creation/assignment references before querying. A missing, conflicting, future-created, rewritten, reused, or unanchored receipt must fail closed. The receipt must be bound to a retained process instance so PID reuse cannot satisfy it.
5. Immediately before any future process-affecting action, the source must freshly revalidate the complete tuple, exact synthetic role, retained handle/session/Job identity where applicable, and current membership against the sealed receipt. This read-only validation should require **no process-affecting action**; if one is proposed, it needs separate change control.

The producer, anchor, and authority channel are **not selected here**. Their independent write ownership and immutability cannot be inferred from naming, an ACL claim, a local path, or an input-supplied checksum. A new test-only producer/controller and its governance authorization would be required. If producing or anchoring the receipt requires production/runtime changes, elevation, Windows/CIM configuration, network access, or an OE-12 criterion change, the future work must stop for separate change control.

## 3. GAP-B — bounded quiescence, not timeout detection

**Feasibility classification: `Not currently feasible` within the reviewed in-process PowerShell/CIM boundary.** At source lines 92-107, the current path detects an outer timeout, calls `BeginStop`, waits a second finite period, calls `EndStop`, then checks `IsCompleted`. It can record an unresolved pipeline and fail closed, but it does not prove the underlying CIM provider operation, implicit session, callback, or result stream is quiescent within a finite bound. `BeginStop`, `EndStop`, and `Dispose` themselves are not protected by an independent end-to-end bound. The cancellation flag is observed before queries, not during an in-flight call. Microsoft documents `Get-CimInstance -OperationTimeoutSec` as the time the cmdlet waits for a response, and describes `BeginStop` as an asynchronous stop request; neither description proves this source's required provider-level quiescence. See [Get-CimInstance](https://learn.microsoft.com/en-us/powershell/module/cimcmdlets/get-ciminstance?view=powershell-5.1), [PowerShell.BeginStop](https://learn.microsoft.com/en-us/dotnet/api/system.management.automation.powershell.beginstop?view=powershellsdk-7.6.0), and [PowerShell.EndStop](https://learn.microsoft.com/en-us/dotnet/api/system.management.automation.powershell.endstop?view=powershellsdk-7.6.0).

Minimum future contract for **every** CIM operation:

`timeout/cancellation → stop admission of new CIM work → cooperative cancellation request → confirmed termination of the exact operation and all result/callback delivery → stable resource state → disposal of every owned operation/session/pipeline object → retained proof`.

The future source must show a finite, enforced bound covering the cancellation call, completion acknowledgement, callback/result drain, provider/operation-state verification, and disposal—not just a bounded `WaitOne`. After that bound, no query result may arrive, no callback may mutate retained state, no active CIM operation may remain, and no owned session may be left undisposed. A timeout with unresolved work must be `STOP / Validation Not Executed`, never a feasibility PASS. It also cannot be represented as completed bounded cleanup.

Only non-destructive boundaries may be evaluated. Candidate classes for **separate analysis**, not selected implementations, are a supported cooperative CIM operation lifecycle with independently verifiable completion semantics or an isolated worker whose natural/cooperative exit and complete resource quiescence can both be proved within a finite bound. Isolation alone does not solve the case of an indefinitely hung worker. If no supported non-destructive lifecycle can guarantee the required bound, record **`STOP — Bounded Quiescence Not Feasible in Current Boundary`**. No process/Job termination, service/configuration change, or invented fallback may be used to claim a PASS.

## 4. Exit, ownership, and cleanup contract for any later source version

Every applicable branch must be mapped as `trigger → exact executable source branch → exact PowerShell/.NET/native call → operation/process/resource state → cooperative cleanup and finite bound → retained evidence`. Comments or prose alone cannot satisfy a branch. Required branches are success, CIM exception, provider/service failure, missing/partial result, cancellation, inner timeout, outer/watchdog timeout, launcher exception if an isolated worker is proposed, cleanup failure, and outer `finally` from every exit.

Each branch must stop new work on rejection, retain the primary result/error before cleanup, preserve independent cleanup errors, and prove final state before a successful disposal claim. An unresolved operation, unknown owner, stale/full-identity mismatch, failed callback drain, failed handle/session disposal, or incomplete owned-temp cleanup must fail closed. A future launcher or isolation worker adds creation, early-exit, cancellation, natural completion, handle, session, and finalization branches; it cannot be treated as N/A merely because the present source has no launcher.

Cleanup remains cooperative, bounded, ownership-aware, and non-destructive. Neither primary logic nor fallback/`finally` may invoke `TerminateProcess`, `Stop-Process`, `taskkill`, `TerminateJobObject`, kill-on-close, or unknown-PID termination. Fallback may not have broader authority than the primary path. Fresh complete identity and Job membership, when applicable, are required immediately before any process-affecting action. A watchdog may observe, signal approved cooperative cancellation, and retain evidence; it cannot broaden cleanup authority.

## 5. Minimum future source/change boundary

| File or component | Minimum future change needed | Present authorization |
| --- | --- | --- |
| `docs/governance/sir-02/controls/oe-12-cim-environment-validation-source-v1.0/validate-cim-environment.ps1` | Replace same-boundary receipt/hash trust, add independently anchored receipt verification, and replace/guard the timeout and disposal path with a proven quiescence contract. Must be a **new version**, preserving v1.0 immutably. | None |
| `docs/governance/sir-02/controls/oe-12-cim-environment-validation-source-v1.0/input.template.json` | Version the input contract so untrusted selectors cannot redefine authoritative receipt content or digest. Preserve the inert v1.0 template. | None |
| `docs/governance/sir-02/controls/oe-12-cim-environment-validation-source-v1.0/native-readonly.cs` | No change established by these gaps. Re-review or version it only if a later approved handle/session/identity contract requires a new native call. | None |
| Independent receipt producer/controller and integrity anchor | **Required as a new trust boundary.** Exact file path and mechanism cannot be authorized until its producer, immutability, and run-binding model are selected and reviewed. | None |
| Separate CIM operation/isolation boundary | May be required, but no bounded non-destructive design has been established. Exact helper/source path is therefore **undetermined**, not silently included in this proposal. | None |

No dependency, repository configuration, Windows/CIM setting, migration, production/runtime code, elevation, network operation, or OE-12 criterion change is established as necessary by this proposal. Whether a future non-destructive isolation boundary can avoid environment or dependency changes remains **undetermined**. None is authorized or proposed as an assumed fix; any such requirement triggers **`STOP — Separate Change Control Required`**.

## 6. Decision and next gate

**Exactly one remediation decision: `STOP — Current Boundary Cannot Close Required Gaps`.** GAP-A needs an expanded independently governed receipt trust boundary. GAP-B has no currently proven bounded, non-destructive quiescence mechanism. A concrete design for both is required before `Ready for Source-Remediation Authorization` can be recorded; this proposal does not satisfy that threshold.

The Alignment GAP remains **OPEN**. The next permissible governance work is a separately scoped feasibility/architecture decision for the independent receipt producer and the non-destructive CIM completion boundary, with exact trust ownership and supported API guarantees. It must occur before any source-remediation authorization, source modification, probe, Option B selection, Diagnostic v4, Smoke v5, or formal retry `0003`.
