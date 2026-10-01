# SIR-02 KM OE-12 Smoke v4 Job Membership Forensic Analysis v1.0

## Scope and evidence basis

This is a read-only analysis of the failed **non-formal** Smoke v4 run `SIR02-KM-OE-12-LAUNCHER-SMOKE-V4-20260927T125158Z`, retained at commit `98bb5c30fd1619efbc0fba99d5062f258a65d811`. It is not OE-12 operational evidence and does not change any execution result. The exact source bundle `operational-evidence/oe-12/SIR-02-KM-OE-12-NON-FORMAL-LAUNCHER-SMOKE-V4-EXACT-SOURCE-BUNDLE-20260927T125158Z-v1.0.zip` has verified SHA-256 `55621ae501ada5b9a232e99c1053b1dc3661b809331f5de046e7477c85a4489a`. Each of its four source entries matched its separately retained text copy byte for byte. The retained launcher, native runner, probe, watchdog, raw result, validation record, watchdog result, and post-run PID check were inspected. No process or test was run for this analysis.

## Finding and decision

**PID 45200 identity: `Unresolved from retained evidence`.** The retained Job Object query reports members `[45408, 45200]`, but records no image path, command line, parent PID, creation time, process role, source creation event, assignment event, synthetic run token, or first-membership timestamp for PID 45200. The query timestamp establishes only that the PID was listed at that moment. Its later absence does not identify it. Neither an intended descendant nor a helper, watchdog, unrelated process, or OS-created process can be named conclusively.

**Next remediation class: Class B — Identity Not Recoverable.** A separately governed, non-formal Job Membership Diagnostic must capture the identity and ownership of every member before any termination experiment. Smoke v5 and formal retry `0003` cannot proceed from this evidence. A deterministic member allowlist and launcher remediation v1.4 cannot be specified safely until the extra member is identified or a revised containment boundary is separately designed. Job membership alone is not proof of safe synthetic-run ownership.

## Reconstructed process topology

| Role | Creator and executable | Expected parent | Job membership and timing | Retained PID evidence |
| --- | --- | --- | --- | --- |
| Outer watchdog | Existing PowerShell session runs retained `watchdog-v4.ps1`; it starts `powershell.exe` via `System.Diagnostics.Process.Start` | External invoking session | The anonymous Job Object does not exist yet; no retained watchdog source path assigns this process to it | Watchdog PID not retained |
| PowerShell launcher | Watchdog starts `C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe` with `-EncodedCommand` | Outer watchdog | Runs outside the new Job Object in the retained source; creates that Job later | `24620` in watchdog result |
| Native helper | `Add-Type -Path native-runner.cs` loads `SmokeV4.NativeRunner` inside the launcher | Same launcher process | In-process code, not a separately created helper process; creates and owns the new Job handle | No separate PID is expected |
| Echo Node process | `NativeRunner.Run("echo")` calls `CreateProcessW` for `C:\Program Files\nodejs\node.exe` | Launcher `24620` | Suspended, assigned to its own newly created anonymous Job, verified, then resumed; exited | `48040`, retained in earlier case |
| Nonzero Node process | `NativeRunner.Run("nonzero")` uses the same sequence with another new Job | Launcher `24620` | Separate Job from hold; exited | `19620`, retained in earlier case |
| Hold Node parent | `NativeRunner.Run("hold")` calls `CreateProcessW` for `node.exe` with the synthetic probe and `hold` argument | Launcher `24620` | Suspended, explicitly assigned to the hold Job, verified before `ResumeThread`; alive at timeout | `45408`, with creation time `134349871188785270` |
| Synthetic Node descendant | Probe calls `spawn(process.execPath, [__filename, 'hold-child'])` only in `tree` mode | Tree Node parent | A descendant could inherit Job membership unless breakaway is allowed, but `tree` never started after S7 failed. The hold branch has no `spawn` call | `descendantPid=0`; no tree PID retained |
| Additional Job member | No creator or executable is established in retained source or result | Unknown | Listed by the hold Job query at `2026-09-27T12:52:00.3901442Z`; source of membership unknown | `45200` only |

The watchdog's **launcher child** is PID `24620`, so PID `45200` is not that recorded launcher PID. The outer watchdog's own PID was not captured. This distinction does not establish what PID `45200` was.

## Source-level assignment and handle trace

- `native-runner.cs` creates a new anonymous Job with `CreateJobObject(IntPtr.Zero, null)` and sets `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`. The read-back reported flag `8192` and no breakaway flag. The null security-attributes pointer makes the new Job handle non-inheritable in this source.
- `CreateProcessW` receives the Node executable, `CREATE_SUSPENDED | CREATE_NO_WINDOW | EXTENDED_STARTUPINFO_PRESENT`, and `bInheritHandles=true`. The `PROC_THREAD_ATTRIBUTE_HANDLE_LIST` supplies only the child stdin, stdout, and stderr pipe ends. The Job handle is absent; no `DuplicateHandle` path appears in the retained native source. The parent pipe ends are made non-inheritable.
- The only `AssignProcessToJobObject` invocation passes `pi.hProcess`, the suspended Node parent handle. For hold, that is PID `45408`. `IsProcessInJob` verifies this parent before `ResumeThread`; synthetic `GO` is sent afterward. There is no sourced assignment call or captured assignment event for PID `45200`.
- `OpenProcess` is used for a known synthetic tree descendant only in `tree` mode and for later PID/creation-time verification. Neither path opened PID `45200` during hold. The hold probe waits on stdin and sets a timer; it contains no descendant spawn. The tree probe's `spawn` path was not reached.
- `ReadJobPids` queries `JobObjectBasicProcessIdList`. It returned two members, `[45408, 45200]`, where `ExactPids` required only `[45408]` for hold. The mismatch threw **before** `CloseHandle(last job handle)`, so `jobClosedForTimeout=false` and the primary kill-on-close mechanism was not exercised.
- The outer watchdog started the launcher but never calls `AssignProcessToJobObject`; its targeted `Process.Kill()` branch did not run because its 30-second timeout was not reached. No retained source path deliberately puts a watchdog or in-process native helper into the new Job. An external or uninstrumented process-creation path cannot be excluded from the retained record.

## What Smoke v4 proved, and what it did not

The new Job was created; the kill-on-close flag was set and read back; PID `45408` was assigned while suspended and found in that Job before resumption; the timeout occurred at `1500 ms` (`1514 ms` hold-case elapsed); the parent was alive before attempted primary close; and the membership query succeeded. Thus **Job Object creation = PASS; kill-on-close configuration/read-back = PASS; explicit assignment of PID 45408 = PASS; intended-parent containment = PASS.** Safe identity of all Job members, S7 kill-on-close behavior, and S8 deterministic parent/descendant cleanup were **not proven**. This is containment/ownership distinction **B**, with actual kill-on-close termination efficacy still untested. The retained evidence does not establish that Windows Job Objects are unavailable or broken.

**Safety Finding — Job-wide fallback termination occurred without complete member allowlisting.** After the unknown-member guard threw, the `finally` block called **`TerminateJobObject(job, 97)`** against the Job still listing unexplained PID `45200`; the call returned success. This job-wide fallback must not be treated as an acceptable future cleanup method merely because no lasting harm was observed. It is not a safe basis for attributing PID `45200` or for declaring S7/S8 successful. It was followed by targeted `TerminateProcess(pi.hProcess, 98)` on the **owned parent handle for PID `45408`**, which returned Win32 error `5` (`Access denied`). No targeted `TerminateProcess` call against PID `45200` is recorded. The error is fallback-tooling information only, not proof that primary kill-on-close is unavailable. A later read-only check at about `12:53:44Z` found PIDs `48040`, `19620`, `45408`, and `45200` absent, but cannot prove which action caused their absence.

Smoke v4 remains **FAIL**. S7 remains **Failed / Unproven**; S8 remains **Not Reached / Unproven**. T0, S1–S6, S9, and S10 retain their recorded results. The unknown-member guard prevented the primary close, but the fallback job-wide termination must be addressed before any further diagnostic or smoke. Neither the raw result nor the failed smoke is reclassified here.

## Required next gate

Prepare a separate **non-formal Job Membership Diagnostic** under its own authorization. Before any destructive Job action, capture for every member: PID, executable/image path, command line where safely available, parent PID, creation time, expected role, current synthetic-run token, assignment versus inherited-membership evidence, Job membership, and allowlist result. Also retain the intended parent PID, expected member set, actual member set, unexpected member set, native query/API results, and sanitized native errors. Bind observations to one Job identity and one capture timestamp/sequence, and account for PID reuse or an exited process as unresolved unless creation identity is verified. Any missing or conflicting field must fail closed; Job membership alone is not an ownership attestation.

The diagnostic must not repeat the v4 job-wide fallback or close a kill-on-close Job while any member is unidentified. Its proposed execution and cleanup must be separately reviewed for a non-destructive path before authorization. If identity remains unresolved, stop for another governance decision. Do not infer an allowlist merely from PID counts. Only a conclusive identity result can support a v1.4 design decision; a newly proven unintended process path would instead require containment redesign.

## Unchanged governance state

Formal retry `0003`: **Not Authorized**. OE-12: **Not Executed**. Operational evidence: **11 Accepted / 0 Awaiting Independent Review / 4 Not Executed**. `SIR02-DEF-02`: **Missing / Not Reviewed**. SIR-02: **Blocking**. OE-08, OE-14, and OE-15 are unchanged. No OE-12 implementation, dependency, configuration, Git setting, or previous smoke/formal artifact was changed by this forensic assessment.
