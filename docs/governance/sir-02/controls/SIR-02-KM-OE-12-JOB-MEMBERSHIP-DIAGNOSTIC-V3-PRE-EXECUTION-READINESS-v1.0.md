# SIR-02 KM OE-12 Job Membership Diagnostic v3 Pre-Execution Readiness v1.0

## Boundary and result

| Field | Value |
| --- | --- |
| Classification | **Non-Formal Tooling Diagnostic — Not OE-12 Operational Evidence** |
| Readiness result | **Ready for Authorized Diagnostic v3 Execution** |
| Execution in this preparation step | **Not performed**; no v3 token, Job, Node parent, conhost observation, or runtime capture was generated |
| Authorized attempt | One non-formal v3 diagnostic only, after the external exact-source integrity gate passes |
| Lifecycle forensic analysis / proposal | `4e3936491e56b0bec58afc28b43b5c3e0278bec8`; **Class B — Exit Chronology Not Retained** |
| Authorization decision | `320698beba43d2aab9af30e74f2c983b93a67f55` |
| Authorization linkage | `c98415be85397d2e0e118bd715d5b8df2395ad9f` |
| Immutable v3 source and bundle commit | `9f8480b6c8f44cba616ff2bf80094a8cb664de7a` |
| Diagnostic v2 | `Needs Clarification`; evidence `8b2977e2e14e93185cb9cafece80d35371209dcb`, unchanged |
| Accepted OE-12 implementation | `826376cc84521a5d648462fdcc985cd2d412a24c`, unchanged |

This is a static source/readiness decision. It does not observe a v3 lifecycle, consume the one authorized attempt, change the Diagnostic v2 decision, satisfy OE-12 operational evidence, or authorize launcher v1.4, Smoke v5, or formal retry `0003`. A changed, missing, or unverified source byte at execution time requires **STOP before any diagnostic process starts**.

## Exact committed source package

| Committed file | SHA-256 of exact committed bytes |
| --- | --- |
| `docs/governance/sir-02/controls/oe-12-job-membership-diagnostic-v3-source-v1.0/launcher.ps1` | `e20a642996832750a1dfcb2d535d680ae3477142e456993318ae7be0448ac1a3` |
| `docs/governance/sir-02/controls/oe-12-job-membership-diagnostic-v3-source-v1.0/native-helper.cs` | `befd43e31c0cd72c34bcaef95219632b22d7e1d1cbb0081eb5ee78a0d6272428` |
| `docs/governance/sir-02/controls/oe-12-job-membership-diagnostic-v3-source-v1.0/probe.cjs` | `5baa7badc3a6007630c1f2bfb05b2797ca6140e107767891a51d563913788ff1` |
| `docs/governance/sir-02/controls/SIR-02-KM-OE-12-JOB-MEMBERSHIP-DIAGNOSTIC-V3-EXACT-SOURCE-BUNDLE-v1.0.zip` | `82b047a85d3fec6cabd6e430c6225eee0ed46b0e7b92694f1703e3a4910249ab` |

The ZIP has exactly three root entries: `launcher.ps1`, `native-helper.cs`, and `probe.cjs`. Each entry matched its source file byte for byte. After source commit `9f8480b6c8f44cba616ff2bf80094a8cb664de7a`, each of the four Git blobs was read independently and compared byte for byte with its retained local file; all four matched. These are committed-byte SHA-256 values, not hashes inferred from Git object IDs.

## Required D0 integrity gate before the single authorized attempt

The later operator must independently verify the committed ZIP SHA-256, all three named committed source SHA-256 values, each ZIP entry, and each extracted runnable file against the values above. Preserve a separate receipt with `bundleSha256`, `launcherSha256`, `nativeHelperSha256`, `probeSha256`, and booleans `bundleVerified`, `committedSourceVerified`, and `extractedSourceVerified`; each boolean may be true only after its direct byte comparison. The launcher recalculates the three local source hashes and compares them with the receipt and expected bundle hash **before creating the Job or Node parent**. The current preparation did not generate a receipt or extract/run the ZIP.

Only after that independent D0 check, the planned bounded, noninteractive launcher invocation is:

```powershell
powershell.exe -NoProfile -NonInteractive -File "<verified-extracted-v3-source>\launcher.ps1" -IntegrityReceiptPath "<retained-D0-receipt.json>" -ExpectedBundleSha256 "82b047a85d3fec6cabd6e430c6225eee0ed46b0e7b92694f1703e3a4910249ab"
```

An independent finite watchdog must bound the whole invocation and retain stdout, stderr, exit code, start/end UTC timestamps, capture path, and any partial record. The launcher generates `SIR02-OE12-JOB-MEMBERSHIP-DIAGNOSTIC-V3-<UTC yyyyMMddTHHmmssfffZ>` only when invoked. No token or run ID is allocated here.

## Topology, identity, and retained-handle design

The model remains Windows PowerShell 5.1 launcher → in-process compiled native helper → exactly one explicitly assigned synthetic Node parent in a fresh anonymous Job → conditionally at most one attributed Windows `conhost.exe`. The helper is compiled in the launcher process, so there is no separate helper process. The Job limit flags are set to zero and read back; kill-on-close is not configured. The probe uses only local files, spawns no descendants, and has a ten-second independent natural-exit timer.

The inherited v2 identity gate retains the exact CreateProcess-owned Node PID/handle, image, parent PID, creation FILETIME, session, command line with v3 token and probe path, synthetic ready record, explicit assignment, and Job membership. For any candidate conhost, it requires the trusted full path from `GetSystemDirectoryW`, exact Node parent PID, creation after Node and within five seconds, native/CIM creation agreement, session consistency, confirmed Job membership, and pre-release liveness. Two complete Job-member queries must agree; only the Node plus zero or one candidate conhost is allowed. Unknown or changing members fail closed. Conhost token absence is neutral.

The Node's CreateProcess-owned process handle and the candidate conhost's creation-bound query/synchronize handle remain open until both termination observations and required post-signal `GetProcessTimes` calls finish. Immediately before cooperative release, the source checks the exact retained Node handle and, if a candidate exists, the exact retained conhost handle as **nonsignaled**. It retains the PID and creation FILETIME of each. A required handle that cannot be established or identity that changes cannot yield PASS.

## Kernel lifecycle measurement and evaluation

The launcher writes only the synthetic Node release file. It records the release-write interval separately. The helper waits on the exact retained Node handle for up to **12,000 ms**, then on the exact retained conhost handle for a separate **5,000 ms**. If the conhost is already signaled at its first post-Node observation, the helper still queries that retained handle. A timeout records its wait result and observation timestamp; it **does not call `GetProcessTimes` as though termination occurred** or fabricate an exit time. A guarded, exact-owned-Node `TerminateProcess` fallback after timeout has a separate **2,000 ms** wait, is recorded, and always disqualifies PASS. No conhost or unknown member is terminated.

Only after each retained handle is signaled does the helper call `GetProcessTimes` on that **same handle**, retaining API success/failure, Win32 code, handle role/PID, kernel creation and exit FILETIMEs, and a distinct termination-observation UTC timestamp. It checks creation identity and exit-after-creation. The launcher converts exact FILETIME values to UTC, compares raw 100-nanosecond ticks before rounding, and retains signed `conhost_exit_time - node_exit_time` both in ticks and milliseconds. `parentExitUtc` and other launcher observation fields are explicitly **observation times**, not kernel process exit times.

Measurement and evaluation are separate retained objects. The existing lifecycle criterion requires the conhost kernel exit to occur **after** the Node kernel exit, after cooperative release, and within the bounded lifecycle observation. A complete measured contradiction is preserved and yields `FAIL — Lifecycle Attribution Not Supported`; missing or inaccessible kernel timing yields `Needs Clarification`. PASS requires complete source integrity, the confirmed member/identity model, valid nonsignaled pre-release handles, cooperative shutdown, both valid exact-handle kernel exit times, ordering satisfying that existing criterion, successful cleanup, and zero prohibited destructive actions. The only possible diagnostic results are `PASS — Exit Chronology Conclusively Established`, `FAIL — Lifecycle Attribution Not Supported`, and `Needs Clarification`.

## Native/API inventory and static validation

The retained native call set is `CreateJobObjectW`, `SetInformationJobObject`, `QueryInformationJobObject` for limits and member PIDs, `CreateProcessW`, `AssignProcessToJobObject`, `IsProcessInJob`, `ResumeThread`, `OpenProcess` with query/synchronize access, `QueryFullProcessImageNameW`, `ProcessIdToSessionId`, `GetSystemDirectoryW`, `WaitForSingleObject`, `GetProcessTimes`, and `CloseHandle`. The only `TerminateProcess` call is the guarded exact-owned-Node cleanup fallback; its use prevents PASS. PowerShell's local `Get-CimInstance` supplies process identity and PID absence checks; local file writes supply ready/release/capture records. Relevant native calls retain API name, PID/handle role, result, success/failure, Win32 code, and sanitized error/category. Handles close after timing queries and cleanup.

| Static check, without diagnostic execution | Result |
| --- | --- |
| Windows PowerShell parser on `launcher.ps1` | **PASS**; zero parse errors; launcher not invoked |
| Windows PowerShell 5.1 `Add-Type -Path native-helper.cs` | **PASS**; helper compiled with no `NativeSession` instance |
| Existing `node.exe --check probe.cjs` | **PASS**; syntax only; probe not invoked |
| ZIP entry and committed-byte integrity | **PASS**; 3/3 ZIP entries byte matched; 4/4 committed blobs byte matched; SHA-256 values above |
| Prohibited-operation source scan | **PASS** for unauthorized paths: no `TerminateJobObject`, kill-on-close acceptance behavior, conhost/unknown-PID termination, formal OE-12 execution path, probe process spawn, or network operation. The sole exact-owned-Node fallback is bounded and cannot yield PASS |

No Diagnostic v3, smoke, Vitest, or formal OE-12 scenario was run. No implementation, dependency, migration, production/runtime source, repository configuration, Git setting, or `.gitattributes` changed. Diagnostic v1/v2, Smokes v1–v4, and formal attempts `0001`/`0002` remain unchanged. Diagnostic v2 remains **Needs Clarification**; launcher v1.4 remains blocked; Smoke v5 and formal retry `0003` remain **Not Authorized**. OE-12 remains **Not Executed**; operational evidence remains **11 Accepted / 0 Awaiting Independent Review / 4 Not Executed**. `SIR02-DEF-02` remains **Missing / Not Reviewed**; SIR-02 remains **Blocking**.
