# OE-12 CIM validation exact-source safety review v1.0

| Field | Review finding |
| --- | --- |
| Exact-source package | `61aa0e575fc52f121f9fd24cb41a575ccc55c120` |
| Bundle SHA-256 | `f531cdcaba814875946786e6b8e2d43a8904839736443da5a0ea0e0cb2743bc3` — MATCH |
| Review scope | Only receipt authentication (GAP-A), stalled-CIM quiescence (GAP-B), and their cleanup/ownership bypass paths |
| Readiness at review | `STOP — Source/Safety Gap` |
| Execution authorization | None; source preparation was authorized for review only |
| Probe execution | None in this review; no retained CIM validation result exists in the repository |
| Reviewer independence | This technical review is recorded by the source-preparing Codex agent. It does not assert an independent human review or personal reviewer attestation. No acceptance is issued. |
| Final review decision | **Rejected — Source Remediation Required** |

## Preflight integrity

The committed ZIP has exactly three entries: `validate-cim-environment.ps1`, `native-readonly.cs`, and `input.template.json`. Each entry was compared byte for byte with the corresponding blob at the exact package commit; all three matched. The ZIP SHA-256 matched the value above. The committed branch map and readiness record were inspected without alteration. The preparation authorization grants source preparation for review only, the CIM environment-validation authorization remains `Proposed / Not Authorized`, and the readiness record and Alignment GAP remain open. No source file was invoked or modified during this review.

## GAP-A — independent creation/assignment receipt authentication

**Result: `GAP — Receipt Trust Boundary Unproven`.**

The exact source does not create a receipt. It receives `receiptPath` and `receiptSha256` from the same input object as the target PIDs, images, parent PIDs, creation times, run token, and creation/assignment reference strings (`validate-cim-environment.ps1`:47-69). It checks the supplied file hash with `Get-FileHash`, parses that file, and compares the receipt tuple with the input tuple. The inert template contains only replaceable placeholders and zero PIDs. Neither the source nor the bundle identifies a separate receipt creator, creation event, approval authority, pre-probe immutable commit, or independently anchored digest.

The script does not itself write the receipt, but a caller able to supply both the input and its referenced file/hash can provide a self-consistent ownership assertion. The hash detects a mismatch between those supplied values; it does not authenticate their origin. The source therefore cannot prove when the receipt became immutable or whether the process under evaluation was the sole source of its ownership claim. The native helper binds a read-only handle to the observed PID and reads image/creation/session/exit state (`native-readonly.cs`:49-80); the CIM query checks the current parent/creation and Node command-line token/probe path (`validate-cim-environment.ps1`:142-151, 183-208). Those live comparisons do not authenticate the historical creation/assignment event. The conhost run token is compared to the supplied receipt, not independently observed in its CIM command line.

**Minimum missing control:** independently created, pre-probe immutable creation/assignment evidence, anchored outside caller-controlled input, with an independently verified digest/reference bound to the exact synthetic run token and full Node/conhost identity tuple. This review does not design or implement that control.

## GAP-B — bounded quiescence of a stalled CIM pipeline

**Result: `GAP — Stalled CIM Quiescence Unproven`.**

| Required trace | Exact source behavior | Proof limit |
| --- | --- | --- |
| Timeout trigger | `Invoke-BoundedPowerShell` starts `PowerShell.BeginInvoke()` at `validate-cim-environment.ps1`:92; `AsyncWaitHandle.WaitOne(OuterTimeoutMs)` returns false at :93. | This bounds one wait, not the complete operation or cleanup. |
| Cancellation call | Sets `stopQueries=true` at :94 and calls `PowerShell.BeginStop($null,$null)` at :96. It waits `StopTimeoutMs` at :97, calls `EndStop` at :101, and checks the original invocation's `IsCompleted` at :102. | `BeginStop` and `EndStop` are not themselves enclosed by an independently enforced wall-clock bound. A completed stop request or invocation flag is not a retained census of underlying CIM provider/session work or later callbacks. |
| Pending state | If the second wait or `IsCompleted` check fails, it sets `unresolvedPipeline=true`, throws, and stops new queries (:97-107, :117-122). | It correctly refuses to call this PASS, but the CIM operation can remain unresolved; no finite quiescence proof is recorded. |
| Disposal | The inner `finally` disposes the `PowerShell` object if `$async` is null, `$quiesced`, or `$async.IsCompleted` (:123-130). Otherwise it leaves the pipeline registered. The outer `finally` marks incomplete disposal and STOP (:218-245). | `IsCompleted` can permit `Dispose()` without a separate check that underlying CIM work and callbacks are quiescent. `Dispose()` itself has no independent bound in this source. |
| Retained evidence | B09/B14 and errors record timeout and unresolved-pipeline state; the final cleanup record prevents a successful result (:95, :128-129, :225-245). | The record documents failure, not absence of pending work or later state mutation. |

`Get-CimInstance -OperationTimeoutSec 2` at :195 is a response-wait setting, not source-level proof that a nonresponsive provider and all callbacks have stopped. The cancellation flag is checked before commands/queries (:74-84, :191-195), not while a CIM call is already in flight. The outer watchdog is implemented inside the same script; it cannot independently establish quiescence if its stop/disposal calls stall. [Microsoft's PowerShell 5.1 `Get-CimInstance` documentation](https://learn.microsoft.com/en-us/powershell/module/cimcmdlets/get-ciminstance?view=powershell-5.1) defines `OperationTimeoutSec` as a wait for a response; [the `BeginStop` API description](https://learn.microsoft.com/en-us/dotnet/api/system.management.automation.powershell.beginstop?view=powershellsdk-7.6.0) describes an asynchronous stop result, without providing this source's missing provider-quiescence proof.

As written, this in-process PowerShell/CIM mechanism cannot prove bounded quiescence for a provider that hangs or ignores cooperative cancellation. No process termination, service/configuration change, or destructive fallback is permitted. **Minimum missing control:** a separately reviewed, non-destructive isolation or API-level completion boundary that can prove within a finite bound that the exact CIM operation, callbacks, and owned session/pipeline state have ended before disposal and success are possible. This review does not design or implement that boundary.

## Cleanup and ownership bypass cross-check

The source scan found no `TerminateJobObject`, kill-on-close, `TerminateProcess`, `Stop-Process`, `taskkill`, launcher, or Job-wide fallback in the PowerShell or native helper. The outer `catch` stops new queries; the outer `finally` downgrades unresolved pipelines, handle-close failure, scratch-cleanup failure, and unverified resource state to STOP (`validate-cim-environment.ps1`:212-253). Partial/missing CIM rows reject at :143-146; repeated disagreement rejects at :204-207. These fail-closed paths prevent a false PASS but **cannot supply an independent receipt origin or make an unquiesced CIM operation quiescent**. The native identity reads before/after each query help detect PID reuse and image/creation mismatch, but cannot replace the missing historical receipt trust boundary. No fallback, watchdog, `finally`, disposal, stale-identity, or partial-result path closes either GAP.

## Decision and boundary

**Decision: `Rejected — Source Remediation Required`.** GAP-A and GAP-B both remain open; `Accepted — Both Source Safety Gaps Closed` is unavailable. The Alignment GAP remains **OPEN**. Source execution, Option B selection, Diagnostic v4, launcher v1.4, Smoke v5, and formal OE-12 retry `0003` remain unauthorized. No canonical OE/SIR status changes. The next permissible action is a separately governed, minimum-scope source-safety remediation proposal addressing the two controls above, followed by preparation and independent review of new exact source bytes. The immutable package reviewed here remains unchanged.
