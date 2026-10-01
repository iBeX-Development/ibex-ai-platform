# SIR-02 KM OE-12 Job Membership Diagnostic Pre-Execution Readiness v1.0

## Classification and decision

**Non-Formal Tooling Diagnostic — Not OE-12 Operational Evidence.** This record reviews exact temporary source for the **one** diagnostic authorized at decision `70755e8571e8c2ccf8bdf182064993f1a91511e1`, linked by `209f84a30c80bfe9ab8683273e1893b64618f3a9`. The immutable Class B forensic basis is `fa656ca968129bbb6dea05e853c66d859ae5f1b1`. The diagnostic has **not** been executed. Smoke v4 `SIR02-KM-OE-12-LAUNCHER-SMOKE-V4-20260927T125158Z` remains **FAIL**; its evidence remains at `98bb5c30fd1619efbc0fba99d5062f258a65d811`.

**Readiness result: Ready for Authorized Diagnostic Execution.** This is a static source and safety assessment. It does not claim that Windows APIs, local CIM access, member attribution, cooperative exit, or the diagnostic itself have passed. Any runtime identity, API, or cleanup uncertainty must be captured as `FAIL — Unknown or Unsafe Member Present` or `Needs Clarification`; it cannot become PASS by inference. The one-time execution must first verify the extracted runnable source matches the retained bundle and committed copies byte for byte. If that gate fails, do not start the launcher.

## Exact source package and integrity

| Retained source | Role | SHA-256 |
| --- | --- | --- |
| `oe-12-job-membership-diagnostic-source-v1.0/launcher.ps1` | Windows PowerShell 5.1 launcher, identity collection, allowlist, cooperative cleanup, result capture | `a7ef17603b9813da8123c3921915bf2a79c364513c45df208be106e06ed2bcc1` |
| `oe-12-job-membership-diagnostic-source-v1.0/native-helper.cs` | In-process `Add-Type` native Job/process API wrapper; no separate helper process | `debeb08b020025ccb54f14597378619caea2a060609bcf478dbf63048137f8e5` |
| `oe-12-job-membership-diagnostic-source-v1.0/probe.cjs` | Synthetic Node parent; no descendant spawn, network call, or production access | `a10bcd3cdf67dad050104c53628a551041be42cb3218580836a270c452844175` |

All paths above are relative to `docs/governance/sir-02/controls/`. The exact three-entry source package is `SIR-02-KM-OE-12-JOB-MEMBERSHIP-DIAGNOSTIC-EXACT-SOURCE-BUNDLE-v1.0.zip` in that same directory; **SHA-256 `36078a74ee4dc28ded28c955a498dee5b2d7d1a0d1032b3c0a85e5fbf4db6160`**. Entry names are `launcher.ps1`, `native-helper.cs`, and `probe.cjs`, in that order, with fixed ZIP entry timestamps. No separate watchdog source exists. The native helper is loaded in the launcher process and has no independent PID.

The three source worktree byte hashes matched their staged Git-index blob IDs before bundling; the ZIP was made from those same bytes. A later execution must independently verify the published bundle hash, extract to a new diagnostic-only temporary directory, compare each extracted entry to its committed source byte for byte, and invoke only that verified `launcher.ps1`. The intended noninteractive form is `powershell.exe -NoProfile -NonInteractive -File <verified-extraction-directory>\launcher.ps1`; the extraction path and complete invocation must be retained with the actual diagnostic. No source file is executed or extracted by this readiness step.

Static checks on the retained sources passed: Windows PowerShell parser for `launcher.ps1`; `Add-Type` compilation of `native-helper.cs` without creating a `NativeSession`; and `node.exe --check` of `probe.cjs` without running the probe. These checks did **not** create a Job Object or run a diagnostic scenario.

## Expected topology and token

| Role | Executable/creator | Expected PID and Job membership | Cleanup |
| --- | --- | --- | --- |
| Diagnostic launcher | Windows PowerShell 5.1; existing invoking shell | Runtime `$PID` retained; outside the newly created Job | Natural exit after writing result |
| Native helper | `Add-Type -Path native-helper.cs` within launcher | Same PID as launcher; not a Job member | No separate process to clean |
| Watchdog | None created by this source | No watchdog PID or Job membership | Not applicable |
| Synthetic parent | Existing `C:\Program Files\nodejs\node.exe`; created by launcher through `CreateProcessW(CREATE_SUSPENDED)` | PID returned by `CreateProcessW`; **only explicit assignment** to the new Job before resume | Cooperative release file, independent 10-second natural exit, bounded wait; exact owned-handle process fallback only if necessary, which prevents PASS |
| Synthetic descendant | None: `probe.cjs` contains no `spawn` | Not expected; any extra Job member fails the allowlist gate | No unknown PID is signalled or terminated |

At actual start the launcher derives one diagnostic-specific token as `SIR02-OE12-JOB-MEMBERSHIP-DIAGNOSTIC-<UTC yyyyMMddTHHmmssfffZ>`. The token is passed only in the synthetic Node parent's command line and written in its `parent-ready.json` record; it contains no tenant/customer information and is not a formal OE-12 run ID. A preexisting token-named capture directory fails before launch. The token and parent PID/creation identity are retained in the raw result.

## Membership evidence and decision

The new anonymous Job is configured with **zero Job limit flags** and a read-back requires exactly zero. Thus it has neither kill-on-close nor breakaway configured. No process is created with inherited handles. The only `AssignProcessToJobObject` call receives the exact suspended synthetic parent handle; `IsProcessInJob` must verify it before `ResumeThread`. `JobObjectBasicProcessIdList` then supplies the observed member PID set read-only.

For each observed PID, `OpenProcess` with query/synchronize rights, `GetProcessTimes`, `QueryFullProcessImageNameW`, `IsProcessInJob`, and bounded **local** `Win32_Process` CIM lookup collect: PID, image path, parent PID, native creation FILETIME, CIM creation UTC where available, command line, token presence, expected role, explicit/inherited classification, Job membership, allowlist classification, evidence sources, and sanitized API/CIM error categories. Missing or inaccessible fields remain missing and fail closed. The synthetic ready record provides an additional PID/token check. The source never classifies an extra PID as inherited without a retained synthetic creation path; this probe has none.

`Expected Synthetic Member PID Set = {CreateProcessW parent PID}`. The record retains intended parent, expected set, observed set, unexpected set, missing set, and per-member classifications. PASS requires exactly that one member and conclusive agreement among the created handle's PID/creation time, Node image, local CIM parent PID and token-bearing command line, ready record, and Job membership. Any other member, missing parent, failed identity query, or contradiction yields `Unknown / Not Allowlisted` and a failing allowlist. Job membership alone never proves ownership.

## Safe cleanup and prohibited paths

The probe accepts a diagnostic-owned release-file signal and exits normally; it also exits naturally after 10 seconds if the launcher fails before signalling. The launcher waits up to 12 seconds, then may use `TerminateProcess` **only** on its retained exact synthetic parent handle after rechecking the parent creation identity. That targeted fallback is recorded as a cleanup failure and disqualifies diagnostic PASS. It never selects a process by name or an unverified PID. The source does not call `TerminateJobObject` or configure kill-on-close. After cleanup, it checks the original parent's PID/creation/liveness identity; a failed verification cannot be reported as PASS. Closing the verified **non-kill-on-close** Job handle is non-destructive to any unidentified member.

An unexpected or unidentified member is never signalled, killed, or made collateral to a Job-wide cleanup. The raw record retains the unknown membership, its available identity fields, API results, and the outcome of owned-parent cleanup. If safe owned-parent cleanup or recording fails, the diagnostic cannot PASS. No unidentified-member destructive path remains in the prepared source. The one-time execution must stop and preserve any partial result rather than silently retry.

The source contains no formal OE-12 test invocation or artifact creation, formal Run ID allocation, Smoke v5 launcher, v1.4 remediation, network request, privilege elevation, UAC request, policy/Git/dependency/configuration mutation, or OE-12 implementation modification. It uses synthetic temporary files only. Smoke v4 S7/S8 cannot be satisfied by this diagnostic.

## Native/API review

| API or local query | Purpose and input | Expected return; failure handling | Type |
| --- | --- | --- | --- |
| `CreateJobObjectW` | New anonymous Job; null security attributes | Valid handle; otherwise record Win32 error and stop | Containment creation |
| `SetInformationJobObject` / `QueryInformationJobObject(JobObjectExtendedLimitInformation)` | Set zero limit flags; read back exact effective flags | Both succeed and flags equal zero before any child creation; otherwise stop | Non-destructive containment configuration |
| `CreateProcessW` | Existing Node executable, synthetic token/probe arguments, suspended and with no inherited handles | Valid exact process/thread handles and PID; otherwise stop | Synthetic process creation |
| `GetProcessTimes` | Created parent handle and read-only member handles | Nonzero creation FILETIME; otherwise unresolved/fail closed | Read-only identity |
| `AssignProcessToJobObject` / `IsProcessInJob` | Assign only created parent handle; verify parent and later queried member handles | Success and verified membership; otherwise stop or classify member unknown | Containment / read-only verification |
| `ResumeThread` | Release verified synthetic parent after assignment | Previous suspend count exactly one; failure retains error, with cleanup limited to exact owned parent | Containment sequencing |
| `QueryInformationJobObject(JobObjectBasicProcessIdList)` | Read complete PID list from the newly created Job | Stable complete list or bounded failure; never infer members | Read-only membership |
| `OpenProcess` / `QueryFullProcessImageNameW` | Query each observed PID with query/synchronize rights; obtain image | Missing/access-denied evidence is retained and cannot be allowlisted | Read-only identity |
| `WaitForSingleObject` | Bounded wait for exact owned parent and liveness check | Signalled exit required for successful cleanup; failed/timeout result is retained | Read-only wait / cleanup check |
| `TerminateProcess` | Optional **exact owned parent handle only**, reverified by creation time after cooperative timeout | Never Job-wide, never unknown PID; use disqualifies PASS; record Win32 error on failure | Targeted owned-process cleanup fallback |
| `CloseHandle` | Release owned process/thread/read-only member handles and zero-flag Job handle | Retain native result/error; Job close has no kill-on-close semantics | Non-destructive handle cleanup |
| Local `Get-CimInstance Win32_Process` | Bounded 2-second local query for parent PID, command line, creation time | Missing/error is retained as sanitized category and prevents allowlisting | Read-only local identity |

No `TerminateJobObject`, kill-on-close test, descendant termination test, or unidentified PID kill appears in the source.

## Governance invariants

The diagnostic result later must be exactly one of `PASS — All Job Members Conclusively Identified`, `FAIL — Unknown or Unsafe Member Present`, or `Needs Clarification`. A PASS may inform a future v1.4 design only; v1.4 and Smoke v5 remain **Not Authorized**. Formal retry `0003` remains **Not Authorized**. OE-12 remains **Not Executed**; operational evidence remains **11 Accepted / 0 Awaiting Independent Review / 4 Not Executed**. Formal attempts `0001`/`0002`, Smoke v1–v4, accepted implementation `826376cc84521a5d648462fdcc985cd2d412a24c`, OE-08/OE-14/OE-15, and `SIR02-DEF-02` at `Missing / Not Reviewed` are unchanged. SIR-02 remains **Blocking**.
