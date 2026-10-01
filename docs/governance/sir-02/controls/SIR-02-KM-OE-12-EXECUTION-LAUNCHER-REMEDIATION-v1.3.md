# SIR-02 KM OE-12 Execution-Launcher Remediation v1.3

## Document control and boundary

| Field | Value |
| --- | --- |
| Version | v1.3; process-lifecycle amendment to v1.2 |
| Failed Smoke v3 | `SIR02-KM-OE-12-LAUNCHER-SMOKE-V3-20260927T120119Z`; `8af764bbf9e8525d33637e7e9291cc3dbb052994`; FAIL; immutable |
| Earlier lineage | Formal attempts 0001/0002 and Smoke v1/v2 remain unchanged |
| Accepted OE-12 implementation | `826376cc84521a5d648462fdcc985cd2d412a24c`; unchanged |
| Smoke v4 authorization | Proposed separately; Not Authorized by this design |
| Formal retry 0003 | Not Authorized; no Run ID allocated |
| OE-12 operational-evidence status | Not Executed |

This is a design for **temporary, non-formal test-execution tooling**, not an implementation or execution approval. It changes only the launcher process-lifecycle method needed to prove S7/S8. No repository fixture, integration test, production/runtime source, dependency, migration, configuration, Git setting, `.gitattributes`, or accepted evidence change is proposed.

## Failure being remediated

Smoke v3 used Windows PowerShell `5.1.26100.9444` and `C:\Program Files\nodejs\node.exe` `v22.23.2`. T0 passed, including the `12/12` echo decoded vector, deliberate empty element, duplicates, and probe path. The echo child reported exact `13/13` `process.argv`; S1–S6, S9, and S10 passed. The synthetic process-tree scenario began, but its external tree-termination call raised `ERROR: Access denied` before a deterministic termination result was returned. The retained raw result marks S7/S8 `Not Reached`. Two synthetic Node processes remained active until targeted manual cleanup; that cleanup is not S7/S8 evidence. Classify the result as **Launcher Process-Tree Termination Tooling Failure**, not an OE-12 implementation or lifecycle-acceptance failure. Do not merge v3's partial passes with any later smoke to claim one passing launcher.

## Job Object implementation design

The future temporary Windows PowerShell 5.1 launcher may load a narrowly scoped C# interop helper with `Add-Type` from temporary test-execution material. It must use installed .NET/Windows APIs only, write no repository code, install no package or service, and require no Administrator elevation, execution-policy change, or Windows security-policy change. The helper's source, exact invocation, native results, and cleanup results must be retained with Smoke v4. The host's ability to call these APIs is **unverified**; an unavailable API, access denial, incompatible parent job, or unsafe containment result stops the attempt and cannot be classified PASS.

Required native calls and purpose:

| API / structure | Required use and recorded result |
| --- | --- |
| `CreateJobObjectW` | Create a new anonymous job with a non-inheritable handle; record success or immediate Win32 error. The launcher alone owns its job handle. |
| `SetInformationJobObject` with `JobObjectExtendedLimitInformation` and `JOBOBJECT_EXTENDED_LIMIT_INFORMATION` | Set `BasicLimitInformation.LimitFlags` to include `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` (`0x00002000`), without breakaway flags. Record the returned status and error; query back with `QueryInformationJobObject` to verify the effective flag. |
| `CreateProcessW` with `CREATE_SUSPENDED` | Start the exact synthetic child suspended so it cannot execute or spawn a descendant before job assignment. Use an absolute `lpApplicationName`, mutable quoted command line, and only intentional standard-stream handles. Retain `PROCESS_INFORMATION` parent PID and process/thread handles. |
| `AssignProcessToJobObject`, `IsProcessInJob` | Assign the still-suspended parent and verify membership before `ResumeThread`. Record status and Win32 error; an assignment or verification failure is fatal. |
| `ResumeThread` | Resume only after assignment and membership verification; record the previous suspend count and reject an error or unexpected count. |
| `QueryInformationJobObject` with `JobObjectBasicProcessIdList` | Before forced cleanup, capture the complete job PID list, including parent and synthetic descendant; resize the buffer when required and reject incomplete/truncated results. |
| `OpenProcess`, `GetProcessTimes`, `WaitForSingleObject`, `GetExitCodeProcess` | Retain process handles and creation times for the descendant, prove both processes are alive immediately before timeout cleanup, then verify both exited within a bounded post-close wait. PID absence alone is not enough because of PID reuse. |
| `CloseHandle` | Close stream, thread, process, and job handles deterministically. The last job-handle close is the primary timeout kill-on-close action; record its return status. Do not duplicate or inherit the job handle. |
| `TerminateJobObject`, `TerminateProcess` | Safety cleanup only if the primary path fails. `TerminateProcess` may target only the exact newly created process handles. Any fallback prevents Smoke v4 PASS and records both the original and cleanup errors. No `taskkill /T`, broad process-name kill, or unrelated PID selection is permitted. |
| `CreatePipe`, `SetHandleInformation`, `STARTUPINFO`/`STARTF_USESTDHANDLES` | Supply only bounded stdin/stdout/stderr channels needed for the probe; parent read ends and job handle are non-inheritable. Drain stdout/stderr concurrently to avoid pipe deadlock; close parent write copies promptly. |
| `InitializeProcThreadAttributeList`, `UpdateProcThreadAttribute` with `PROC_THREAD_ATTRIBUTE_HANDLE_LIST`, `DeleteProcThreadAttributeList`, and `STARTUPINFOEX` | Use `EXTENDED_STARTUPINFO_PRESENT` when inheritable standard-stream handles are needed, and restrict child inheritance to exactly those handles. Reject inability to establish the allowlist rather than inheriting unrelated host handles. |

For every native call, retain stage, UTC timestamp, success/failure, relevant synthetic PID/handle identity, and `Marshal.GetLastWin32Error()` captured immediately after failure. Also retain a bounded outer watchdog result. Never report an unverified native call as successful. `CreateJobObjectW`/`SetInformationJobObject` require ordinary job-handle rights; `AssignProcessToJobObject` requires job assignment and process quota/termination rights. The design asks for **no elevation**. If this host denies those rights or nested-job assignment, stop and record the environment limitation without changing sandbox or Windows policy.

### Launch, handle lifetime, and race control

Preserve v1.2's serialized JSON scalar input, indexed string-array decode, T0 comparisons, deterministic Windows quoting, and `ProcessStartInfo.FileName`/`ProcessStartInfo.Arguments` values. After T0 PASS, construct and retain those two values exactly as before. The temporary native helper uses the same absolute executable and quoted argument string as `CreateProcessW` inputs; `lpApplicationName` is explicit and the mutable command line contains the quoted executable followed by the retained `ProcessStartInfo.Arguments`. Child-observed `process.argv` must again match the expected vector. No shell interprets the payload.

The lifecycle change is that the child is created **suspended**, then assigned to the kill-on-close job, membership is verified, and only then its thread is resumed. This removes the scheduling race in a `Process.Start()`-then-assign sequence. If process creation succeeds but assignment fails, terminate only that suspended process by its retained handle, close all owned handles, record the failure, and do not run a smoke scenario. A failed resume or pipe setup receives the same fail-closed cleanup. The launcher must not assume a nested job is available merely because the Windows version supports it; it must verify assignment on the current host.

For Smoke v4 S8, the synthetic parent additionally waits on a one-time launcher release signal before spawning its descendant. The launcher sends that signal only after it has verified the parent's job membership. The parent and descendant then each report their PID and remain alive beyond the configured launcher timeout; neither has a natural exit path before forced cleanup. Retain the parent process handle, open and retain the exact reported descendant process handle, verify each creation time and live state, verify both job memberships and the complete job PID list, and reject a missing, extra, stale, or ambiguous identity. This gate is defense in depth; suspended creation is still required for the child launch path.

### Bounded timeout and termination decision

Use a finite per-case timeout and a separate finite outer watchdog. For S7/S8, require `WaitForSingleObject` on the parent to return `WAIT_TIMEOUT` at the configured bound while both retained process handles still indicate live processes. Record the configured bound and actual elapsed time. Close the **last** job handle as the primary kill-on-close action, then wait for both retained process handles with a short fixed cleanup bound. Require both waits to report termination, both exit codes to differ from `STILL_ACTIVE`, and a post-termination PID check to find neither original process. Record no-orphan evidence by handle and PID, while retaining the creation times to guard against PID reuse. The job must contain only the intended synthetic tree; compare a pre/post snapshot of unrelated processes and never terminate by image name. Closing an unrelated or unverified job is forbidden.

If close, wait, membership, stream drain, or PID verification fails, the result is FAIL or Needs Clarification, never PASS. Attempt narrowly targeted safety cleanup through the still-valid job or exact owned process handles where possible, record every result, and request a new governance decision before another smoke. Manual cleanup is never counted as S7/S8 success. If kill-on-close cannot be proven in this environment without elevation or a repository/product change, stop and report that limitation.

## Proposed Smoke v4 acceptance gate

After separate owner authorization, one new non-formal Smoke v4 must validate **the complete final v1.3 launcher**: T0 and S1–S10. T0 and S1–S6/S9/S10 repeat the already-passing v1.2 transport and output checks on the new launch path. S7 must prove a real bounded timeout, detected timeout, automatic job termination, bounded launcher return, and absence of the timed-out process. S8 must retain both distinct parent and descendant PIDs, prove both alive and in the job before cleanup, then prove both absent after automatic kill-on-close without manual cleanup or effect on unrelated processes. Any unproven containment or termination means Smoke v4 cannot PASS. The result is exactly one of `PASS`, `FAIL`, or `Needs Clarification`, preserved as **Non-Formal Launcher Smoke Validation — Not OE-12 Operational Evidence**. Smoke v4 has no capture ID until an authorized attempt begins.

The future formal retry's Git-index/committed-blob SHA-256 procedure remains a separate, unchanged integrity control. Formal retry `0003` remains **Not Authorized** until this v1.3 design is immutable, Smoke v4 is separately authorized, the complete v1.3 smoke passes and its PASS is preserved immutably, and the owner separately authorizes formal `0003`. No formal Run ID or evidence is created by this design.

## Official API basis

- [Microsoft: Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects) — child inheritance, kill-on-close, and job management.
- [Microsoft: AssignProcessToJobObject](https://learn.microsoft.com/en-us/windows/win32/api/jobapi2/nf-jobapi2-assignprocesstojobobject) — required rights, nested-job constraints, and child association.
- [Microsoft: CreateProcessW](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-createprocessw) and [suspended thread execution](https://learn.microsoft.com/en-us/windows/win32/procthread/suspending-thread-execution) — suspended creation before assignment.
- [Microsoft: Job process ID list](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-jobobject_basic_process_id_list) — complete membership verification.
