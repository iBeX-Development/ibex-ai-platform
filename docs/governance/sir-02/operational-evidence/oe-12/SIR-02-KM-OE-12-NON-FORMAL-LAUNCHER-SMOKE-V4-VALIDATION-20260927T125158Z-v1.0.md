# OE-12 non-formal launcher Smoke v4 — failed validation

## Decision and lineage

| Field | Retained result |
| --- | --- |
| Classification | **Non-Formal Launcher Smoke Validation — Not OE-12 Operational Evidence** |
| Smoke v4 ID | `SIR02-KM-OE-12-LAUNCHER-SMOKE-V4-20260927T125158Z` |
| Overall result | **FAIL** |
| Remediation v1.3 | `13d8623bf9c4b4dacf268f963558eebfe91a537a` |
| One-time authorization decision | `3bec178eef5978600d28a7b5344fe9fc78390ded` |
| Authorization linkage | `b92e5c79a7fc4664787f73fbf3c9e50c44c965fb` |
| Accepted OE-12 implementation | `826376cc84521a5d648462fdcc985cd2d412a24c`; unchanged |
| Smoke start / end UTC | `2026-09-27T12:51:58.0352032Z` / `2026-09-27T12:52:00.5202440Z` |
| Smoke elapsed | `2485 ms` |
| Outer watchdog start / end UTC | `2026-09-27T12:51:56.6473184Z` / `2026-09-27T12:52:00.5614499Z` |
| Outer watchdog | `30000 ms`; no timeout; launcher process exited `0`, but its retained result is `FAIL` |
| Windows PowerShell | `5.1.26100.9444`; process policy was not changed |
| Node | `C:\Program Files\nodejs\node.exe`; `v22.23.2` |
| Formal OE-12 Run ID | Not allocated |

The one-time invocation used a Windows PowerShell 5.1 child with a retained `-EncodedCommand` loader for the temporary `launcher-v4.ps1` source. The exact encoded arguments, stdout, stderr, exit code, and watchdog timestamps are in the retained watchdog result. The launcher used only temporary local tooling and synthetic arguments; it requested no network or elevation. Compile and parser preflight passed before the one authorized smoke attempt.

## T0 and S1–S10

| Check | Result | Retained observation |
| --- | --- | --- |
| T0 | PASS | Echo `12/12`, nonzero `2/2`, and hold `2/2` vectors decoded and matched by index. The empty and duplicate arguments and probe path were preserved. |
| S1 | PASS | Echo probe exited `0`; its parent was assigned to and verified in the Job Object before resume. |
| S2 | PASS | Child `process.argv` matched all `13/13` expected elements. |
| S3 | PASS | Executable, probe, and synthetic path with spaces were preserved. |
| S4 | PASS | The expected stdout marker and structured argument line were captured. |
| S5 | PASS | The separate stderr marker was captured. |
| S6 | PASS | Nonzero exit `23` was captured and classified as a failed exit. |
| S7 | **FAIL** | Hold parent PID `45408` timed out after a configured `1500 ms` (`1514 ms` case elapsed). The Job Object PID list contained `45408` **and unexpected PID `45200`**. The launcher rejected the ambiguous containment before closing the job as its primary kill-on-close action. Automatic S7 cleanup was therefore not proven. |
| S8 | Not Reached | The parent/descendant tree scenario was not started after S7 failed. |
| S9 | PASS | Shell-significant payload arrived as literal argument data; no marker or unexpected temporary file appeared during the echo case. |
| S10 | PASS | Repository HEAD, worktree status, guarded files, and prior OE-12 artifact hashes matched before and after the smoke. No formal OE-12 artifact, Run ID, manifest, sidecar, success linkage, or status change was created. |

## Native containment and cleanup finding

For the hold case, `CreateJobObjectW`, `SetInformationJobObject`, and a read-back query verified `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` (`8192`) with no breakaway flag. `CreateProcessW(CREATE_SUSPENDED)` created parent PID `45408`; `AssignProcessToJobObject` and `IsProcessInJob` passed before `ResumeThread`. The parent was alive at the `WAIT_TIMEOUT` result. `QueryInformationJobObject(JobObjectBasicProcessIdList)` returned the two-PID list `[45408, 45200]`. The identity and cause of PID `45200` were not established by this attempt, so the launcher failed closed. It did not select or terminate that PID individually and did not classify the PID-list query as S7 or S8 success.

The launcher then invoked **fallback safety cleanup**, which cannot satisfy S7/S8. `TerminateJobObject` returned success. A subsequent targeted `TerminateProcess` call on the parent handle returned Win32 error `5` (`Access denied`) while termination was in progress; the raw launcher result set `manualSafetyCleanupRequired=true` at its immediate check. No manual process kill was performed. A later read-only check found PIDs `48040`, `19620`, `45408`, and `45200` absent. That check establishes only the later observed absence; it does not retroactively prove primary kill-on-close or identify the unexpected member. The native call trace, errors, PIDs, wait result, flags, and cleanup results remain in the raw capture.

## Retained artifacts

- [Raw Smoke v4 result](SIR-02-KM-OE-12-NON-FORMAL-LAUNCHER-SMOKE-V4-RAW-20260927T125158Z-v1.0.json)
- [Temporary PowerShell launcher source](SIR-02-KM-OE-12-NON-FORMAL-LAUNCHER-SMOKE-V4-LAUNCHER-20260927T125158Z-v1.0.ps1.txt)
- [Temporary native interop source](SIR-02-KM-OE-12-NON-FORMAL-LAUNCHER-SMOKE-V4-NATIVE-RUNNER-20260927T125158Z-v1.0.cs.txt)
- [Synthetic Node probe source](SIR-02-KM-OE-12-NON-FORMAL-LAUNCHER-SMOKE-V4-PROBE-20260927T125158Z-v1.0.cjs.txt)
- [Outer watchdog source](SIR-02-KM-OE-12-NON-FORMAL-LAUNCHER-SMOKE-V4-WATCHDOG-20260927T125158Z-v1.0.ps1.txt)
- [Byte-preserving source bundle](SIR-02-KM-OE-12-NON-FORMAL-LAUNCHER-SMOKE-V4-EXACT-SOURCE-BUNDLE-20260927T125158Z-v1.0.zip), SHA-256 `55621ae501ada5b9a232e99c1053b1dc3661b809331f5de046e7477c85a4489a`
- [Watchdog result](SIR-02-KM-OE-12-NON-FORMAL-LAUNCHER-SMOKE-V4-WATCHDOG-RESULT-20260927T125158Z-v1.0.json), [stdout](SIR-02-KM-OE-12-NON-FORMAL-LAUNCHER-SMOKE-V4-WATCHDOG-STDOUT-20260927T125158Z-v1.0.txt), and [stderr](SIR-02-KM-OE-12-NON-FORMAL-LAUNCHER-SMOKE-V4-WATCHDOG-STDERR-20260927T125158Z-v1.0.txt)
- [Post-run PID check](SIR-02-KM-OE-12-NON-FORMAL-LAUNCHER-SMOKE-V4-POST-RUN-PID-CHECK-20260927T125158Z-v1.0.json)

Smoke v1, v2, v3, formal attempts `0001`/`0002`, and the accepted OE-12 implementation remain unchanged. This **FAIL** does not authorize formal retry `0003`; it requires a new governance decision before any further launcher attempt. OE-12 remains `Not Executed`. Operational evidence remains **11 Accepted / 0 Awaiting Independent Review / 4 Not Executed**. OE-08, OE-14, OE-15, and `SIR02-DEF-02` at `Missing / Not Reviewed` are unchanged. SIR-02 remains **Blocking**.
