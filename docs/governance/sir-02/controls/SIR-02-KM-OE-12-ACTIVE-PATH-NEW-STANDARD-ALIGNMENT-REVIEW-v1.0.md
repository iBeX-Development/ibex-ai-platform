# SIR-02 KM OE-12 Active-Path New-Standard Alignment Review v1.0

| Field | Finding |
| --- | --- |
| Scope | Active OE-12 execution/tooling/governance lineage only; retrospective read-only review |
| Canonical owner decision | `a022627d25edb9197d834431a759b616caaf9bf1` |
| Canonical linkage | `30f3d3477c8c7a4d626452459c292445d8ab9c88` |
| Current decision | `Neither — Additional Analysis Required` |
| Alignment Review | **GAP — Remediation Required Before Next Execution Planning** |
| Probe/test/diagnostic executed for this review | **None** |

## Reviewed immutable records

- Exact retained Diagnostic v3 source at `9f8480b6c8f44cba616ff2bf80094a8cb664de7a`: `docs/governance/sir-02/controls/oe-12-job-membership-diagnostic-v3-source-v1.0/launcher.ps1` and `native-helper.cs`.
- Diagnostic v3 Class C forensic analysis at `b112e94e87ccfab9b5850890ab64ffe744144009`, including the three retained `CimException` events with no message/HRESULT/provider details and the preserved `FAIL — Lifecycle Attribution Not Supported` result.
- Smoke v4 Class B forensic analysis at `fa656ca968129bbb6dea05e853c66d859ae5f1b1`, including unresolved Job member PID `45200` and the retained safety finding that `TerminateJobObject` ran in fallback without a complete member allowlist. Smoke v4 remains `FAIL`; S7/S8 are not upgraded.
- Owner decision `a022627d25edb9197d834431a759b616caaf9bf1` and linkage `30f3d3477c8c7a4d626452459c292445d8ab9c88`: Option A `Not Currently Feasible`; Option B `Needs Clarification` and unapproved; Diagnostic v4 `Not Proposed`; Smoke v5/formal retry `0003` `Not Authorized`.
- Proposed CIM environment-validation plan and authorization at `d80e67f06c13b1c203522e143b4787287aef0746`: the authorization is `Proposed / Not Authorized`. The plan explicitly calls itself a **call-level design, not an executable script**, and makes exact-source review and bounded cancellation/disposal a future STOP gate. It contains no validated probe source or source-branch line map.

This review does not treat earlier failed attempts as accepted evidence and does not reopen earlier accepted OE items. It asks whether the **next active design** is source-complete under the new standard.

## 1. Mandatory path preflight

The table records the required `condition → exact source branch → exact call → cleanup → evidence retained` chain. A named candidate API in prose is not an exact source branch. References to v3 describe **historical** behavior, not an approved future CIM probe implementation.

| Path / condition | Exact retained source branch and call found | Cleanup and retained evidence found | Active future-source result |
| --- | --- | --- | --- |
| Success — complete, stable local CIM result | Historical v3 `launcher.ps1:50–61` invokes `Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = $memberPid" -OperationTimeoutSec 2 -ErrorAction Stop`; `:116–159` checks each member. The proposed plan names `PowerShell.BeginInvoke`/`EndInvoke` and P0–P3 calls. | Historical v3 writes `diagnostic-raw.json` at `launcher.ps1:294`; native `CloseHandle` is in helper `Dispose()`. | **GAP:** no exact future source branch, arguments, field validation, disposal, or retained-output implementation to inspect. |
| CIM operation timeout | Historical v3 uses `-OperationTimeoutSec 2` at `launcher.ps1:53` and `:219`, with catch at `:59`/`:222`. Proposed plan names a timeout category. | Historical evidence retained exception **type only**, not exact message/HRESULT/provider/operation timestamps, as Class C forensics records. | **GAP:** no exact future timeout catch, error capture, and `finally` source. |
| Other exception | Historical v3 outer `try/catch` is `launcher.ps1:81–181`; `CimMember` catches at `:59`. Proposed plan lists APIs to wrap. | Historical catch records type; outer `finally` starts at `:181`. | **GAP:** future exception branches and independent cleanup/error retention are not source-defined. |
| Unknown/unallowlisted Job member | Historical v3 classifies unknown at `launcher.ps1:123`, checks `unknownCount` at `:165–177`, and rejects pre-release. Proposed read-only plan rejects unexplained membership in prose. | Historical v3 still enters `finally` at `:181`; output records member rows and gate result. | **GAP:** no exact future branch proving immediate stop, no action on the unknown member, and cleanup behavior for that branch. |
| Partial result or provider failure | Historical v3 rejects record count other than one at `launcher.ps1:54`; `CimException` type is captured at `:59`. Proposed plan names `PowerShell.Streams.Error` and field completeness. | Historical provider message/HRESULT/status and per-query timestamp were not retained. | **GAP:** no future branch for null fields, mixed output/error streams, provider failure, or partial serialization with exact retained fields. |
| Watchdog/outer timeout | The proposed plan suggests `IAsyncResult.AsyncWaitHandle.WaitOne(deadline)` followed by candidate `.BeginStop`/`.EndStop` at plan Section 3. It explicitly says Windows PowerShell 5.1 overload and bounded-stop behavior remain unverified. | Plan states to stop if quiescence cannot be proved; no executable branch proves pipeline and handle disposal after a failed stop. | **GAP:** outer-timeout exit and bounded non-destructive cancellation/disposal are not implemented or proven. |
| Fallback | Historical v3 `launcher.ps1:209–215` invokes `TerminateVerifiedOwnedParentOnly()` after cooperative wait; helper `native-helper.cs:457–464` calls `TerminateProcess(parent, 97)`. This `finally` branch is reachable regardless of the pre-release unknown-member result. Proposed CIM plan forbids destructive actions. | Historical v3 records `exactOwnedHandleFallbackUsed`; fallback prevents diagnostic PASS. Smoke v4's distinct Job-wide fallback safety finding remains preserved. | **GAP:** no future exact-source branch proving no destructive fallback; historical fallback cannot be reused under the new ownership gate. |
| Native/process handle disposal | Historical v3 helper `native-helper.cs:467–495` closes thread, parent, companion, then non-destructive Job handle; `launcher.ps1:279–281` invokes `Dispose()`. Proposed plan names `CloseHandle` and `PowerShell.Dispose()`. | Historical native cleanup result is retained, but future pipeline/handle ownership and ordering have no exact source. | **GAP** for active future execution; historical ordering is not automatically inherited. |
| Temporary-file/resource cleanup | Historical v3 creates a capture directory at `launcher.ps1:15–20` and writes release/record files at `:200`/`:294`; the proposed plan names `Remove-Item -LiteralPath` and `Test-Path`. | No exact future `finally` branch or verified path list exists. Historical retained files are governed evidence and must not be deleted. | **GAP:** future temporary-file creation, retention, removal, and exception paths are prose only. |
| Final cleanup / cleanup failure | Historical v3 cleanup catch is `launcher.ps1:278`, followed by `Dispose()` at `:279` and final record write at `:294`. Proposed plan requires independent cleanup result. | Historical source has no separately reviewed future CIM cleanup branch; if `Dispose()` or final record write fails, the planned future behavior is unspecified. | **GAP:** no exact future finalization and dual-error evidence path. |

**Preflight-path result: GAP.** The proposed CIM plan has useful call names and STOP rules, but its exact source has not been prepared or reviewed. In particular, the outer timeout, unknown-member, fallback prohibition, disposal, temporary-resource, and final-evidence paths cannot be verified as exact source behavior. Under the new standard, `Preflight Gate = STOP` for any such missing branch.

## 2. Ownership gate

The required combined identity is **PID + image path + parent PID + creation time + run token + creation/assignment evidence**, with retained handle/session/Job evidence where applicable. The proposed CIM plan states this and rejects PID-only ownership. Historical v3 member classification (`launcher.ps1:124–145`) attempts image, CIM parent, native/CIM creation, token/probe path for Node, assignment, handle/Job, session, and liveness checks; the retained Class C result shows mandatory CIM fields were unavailable, so it did **not** establish conhost attribution.

The historical destructive fallback has a narrower fresh check: `native-helper.cs:457–461` verifies retained parent handle, parent PID, and native creation time immediately before `TerminateProcess`. It does **not** freshly verify the image path, OS-observed parent PID, run token, creation/assignment receipt, or current complete Job membership immediately before that destructive call. In `launcher.ps1:209–215`, it can run from `finally` after a failed/unknown pre-release member gate. The fact that it targets the retained parent handle and never yields diagnostic PASS does not satisfy the new full-identity, fresh-membership safety rule. It must not be imported into a future launcher or diagnostic.

**Ownership-gate result: GAP** for any future design that reuses the historical destructive path. The proposed read-only CIM validation has no destructive action, but lacks exact reviewed source proving that boundary. A PID membership list remains insufficient proof.

## 3. Cleanup and fallback safety

Smoke v4's unknown member PID `45200` remains **unresolved**. Its fallback `TerminateJobObject` safety finding is not cured by later absence of the PID or by the v3 non-destructive Job setting. No future Job-wide destructive cleanup may occur with unidentified membership. The proposed CIM plan forbids Job-wide termination and process termination, but an exact-source guard and exception/fallback map do not yet exist. Historical v3 `TerminateProcess(parent, 97)` is limited to the retained parent handle but can bypass the earlier membership gate and lacks the new full fresh identity check. Historical v3 native handle close order is explicit; future PowerShell pipeline and temporary-resource cleanup order is not source-proven.

**Cleanup/fallback result: GAP.** No unidentified PID may be terminated, no unresolved Job may receive destructive cleanup, and fallback must obey the same fresh safety gate as the primary path. The next exact-source review must prove these properties rather than assume them from prose or prior failed runs.

## 4. Decision and boundary

**Exactly one alignment decision: `GAP — Remediation Required Before Next Execution Planning`.** The unresolved active design gap is absence of an exact, reviewable future CIM source and complete branch-to-call-to-cleanup-to-evidence mapping. The unverified bounded outer-timeout disposal path is independently blocking. Historical v3's destructive fallback is a concrete control that must not be carried forward without full fresh identity and membership revalidation; the read-only validation should have no such action at all.

**STOP.** Do not prepare or execute a CIM environment probe, create Diagnostic v4, authorize Smoke v5 or formal retry `0003`, or change the canonical owner decision. The next permissible work is a separately governed exact-source/path remediation and pre-execution review of the proposed read-only validation, including proof of bounded cancellation/disposal and an explicit no-destructive-fallback branch. It is **not** probe execution or Option B selection.

No contradiction affecting a previously **Accepted** OE item was found in this active OE-12 review; none requires reopening. Formal attempts `0001`/`0002`, Smoke v1–v4, Diagnostics v1–v3, and all retained results remain unchanged. Diagnostic v4 remains `Not Proposed`; Smoke v5/formal `0003` remain `Not Authorized`; OE-12 remains `Not Executed`. This review changes no OE/SIR status or acceptance criterion.
