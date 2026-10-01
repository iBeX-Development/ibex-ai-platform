# SIR-02 OE-12 Diagnostic v3 CIM Failure Forensic Analysis v1.0

| Field | Value |
| --- | --- |
| Analysis type | Read-only forensic analysis of retained non-formal tooling evidence |
| Analysis date | 2026-09-28 |
| Classification | **Class C — Mandatory Attribution Cannot Currently Be Established Without CIM** |
| Diagnostic v3 result | **FAIL — Lifecycle Attribution Not Supported** (unchanged) |
| Diagnostic v3 evidence commit | `27aeb464b2fd6aef2b63c7ed33743d75288126a7` |
| Diagnostic token | `SIR02-OE12-JOB-MEMBERSHIP-DIAGNOSTIC-V3-20260928T040954760Z` |
| Evidence integrity | `19/19 MATCH`; manifest SHA-256 `d7f647cfa749af7898dff4bad2cf158b93255c38b2ed12dafe97523fd9d93ea9` |

## Scope and immutable lineage

This analysis reads the retained Diagnostic v3 evidence and its exact source. It does not re-execute a diagnostic, establish OE-12 operational evidence, or revise the failed result. The controlling lineage is: lifecycle proposal `4e3936491e56b0bec58afc28b43b5c3e0278bec8`; source `9f8480b6c8f44cba616ff2bf80094a8cb664de7a`; readiness `2773025d84488f0b3d36732c643f96a7aa533296`; execution-policy remediation `d47669911c95eb539bb14e45ffc20ed74a5db100`; retry authorization `6ac9e21b41e1833386884e704c965f14d2cb37d0`; evidence `27aeb464b2fd6aef2b63c7ed33743d75288126a7`.

The exact source inspected is `docs/governance/sir-02/controls/oe-12-job-membership-diagnostic-v3-source-v1.0/launcher.ps1`, `native-helper.cs`, and `probe.cjs`. The primary retained result is `docs/governance/sir-02/operational-evidence/oe-12/job-membership-diagnostic-v3-retry-20260928T040954760Z/diagnostic-raw.json`. All 19 committed evidence artifacts match their manifest and sidecar. The repository working tree was clean before this analysis artifact was created.

## Exact CIM failure inventory

`launcher.ps1` lines 50–60 execute a local `Win32_Process` CIM query with a two-second operation timeout and `-ErrorAction Stop`. The function only retains `$_.Exception.GetType().Name`. It does **not** retain exception message, HRESULT, CIM status, PowerShell error record, native error, or the exact call timestamp. The later cleanup query at lines 217–222 has the same retention limit. No more specific provider, permission, timeout, or process-lifetime cause can be established from this record.

| Stage | Exact query | Fields requested or decision made | Retained failure | Timing and liveness |
| --- | --- | --- | --- | --- |
| Membership inspection: conhost PID `24432` | `Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = 24432" -OperationTimeoutSec 2 -ErrorAction Stop` | `CreationDate`, `ParentProcessId`, `CommandLine`; require exactly one record | `CimException`; message/HRESULT/error code **not retained**. `parentPid`, `cimCreationUtc`, and `commandLine` are null. | Per-call time **not retained**. Row observation after the call: `2026-09-28T04:09:55.5246312Z`. Native `WaitForSingleObject` reported alive before the CIM call; exact state at CIM invocation is unrecorded. |
| Membership inspection: Node PID `24588` | `Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = 24588" -OperationTimeoutSec 2 -ErrorAction Stop` | Same three fields and record-count requirement | `CimException`; message/HRESULT/error code **not retained**. `parentPid`, `cimCreationUtc`, and `commandLine` are null. | Per-call time **not retained**. Row observation after the call: `2026-09-28T04:09:55.5434143Z`. Native inspection reported alive before the call; exact state at CIM invocation is unrecorded. |
| Post-exit cleanup: Node PID `24588` | `Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = 24588" -OperationTimeoutSec 2 -ErrorAction Stop` | Record count for PID-absence check | `CimException`; message/HRESULT/error code **not retained**. `parentPidAbsent=false` means **unverified**, not proof that the process remained alive. | Per-call time **not retained**. It occurred after retained Node exit observation `2026-09-28T04:09:55.6246542Z` and before diagnostic end `2026-09-28T04:09:55.6512368Z`. The exact owned handle was signaled and native original-parent liveness check was false. |

The source's catch covers the whole `CimMember` function, including cmdlet invocation and value conversion. The retained type `CimException` identifies the exception class, but the available record cannot pinpoint a lower-level CIM cause. The `native-api-summary.json` lists these categories separately from native calls; the 42 native steps have zero recorded failures. Fresh execution-policy and source-integrity gates both passed.

## Membership attribution: Node PID 24588

“Required” means required by the **executed v3 gate**, not merely useful context. Every `checks` value at `launcher.ps1` lines 124–135 must be true before the Node can be classified as owned.

| Field / gate | Required for PASS? | v3 source | Retained value / result | Existing independent non-CIM evidence? |
| --- | --- | --- | --- | --- |
| PID and owned process identity | Yes | `CreateProcessW` returned PID and exact owned process handle | PID `24588`; exact handle retained | Yes: creation/handle returned by the native helper; helper does **not** call `GetProcessId` to read PID back from the handle. |
| Executable image path | Yes | `QueryFullProcessImageNameW` on member handle, compared with configured Node path | `C:\Program Files\nodejs\node.exe`; check true | Yes, native handle query. |
| Launcher parent PID | Yes | CIM `ParentProcessId` compared with PowerShell `$PID` | Null; check false | No actual OS parent-PID readback in the existing helper. `CreateProcessW` by the launcher supports intended origin but is not the executed gate's independent parent-PID measurement. |
| Creation time and handle identity | Yes | `GetProcessTimes` on member and retained owned handle | FILETIME `134350421952308310`; handle match true | Yes for kernel creation time/owned-handle agreement. |
| Independent CIM/native creation-time agreement | Yes | CIM `CreationDate` versus native FILETIME (within one second) | CIM time null; check false | No second independent time source in the existing helper. Native time cannot be counted twice as corroboration. |
| Session ID availability | Yes | `ProcessIdToSessionId` | Session `5`; check true | Yes, directly from native API. |
| Actual command-line token **and** probe path | Yes | CIM `CommandLine` checked for both values | Null; `tokenAndProbePath=false` | No external-process command-line readback in the existing helper. Launch input and the synthetic ready record support intended invocation and child response but do not replace the required OS command-line readback. |
| Synthetic ready record / token | Yes | `probe.cjs` ready record checked against returned PID and runtime token | Check true | Yes, synthetic ready record; it is an additional gate, not a replacement for command-line evidence. |
| Explicit Job assignment and membership | Yes | `AssignProcessToJobObject`, `IsProcessInJob`, Job PID list | Check true | Yes, native API and owned handle. |
| Pre-release liveness | Yes | `WaitForSingleObject` on member and owned handle | Check true | Yes, native handle observation. |

## Membership attribution: conhost PID 24432

Every conhost `checks` value at `launcher.ps1` lines 137–145 must be true. The observed conhost was an **unexpected Job member** relative to the initial expected set `[24588]`; the pre-release set remained `[24432,24588]`.

| Field / gate | Required for PASS? | v3 source | Retained value / result | Existing independent non-CIM evidence? |
| --- | --- | --- | --- | --- |
| PID / Job-member identity | Yes | `QueryInformationJobObject(JobObjectBasicProcessIdList)`, `OpenProcess` | PID `24432`; opened, in Job | Yes, native Job query and member handle. |
| Trusted executable image | Yes | `QueryFullProcessImageNameW`; compare with `GetSystemDirectoryW` path | `C:\Windows\System32\conhost.exe`; check true | Yes, native member-handle query. |
| Exact parent PID equals Node `24588` | Yes | CIM `ParentProcessId` | Null; `exactNodeParent=false` | **No**. The helper has no parent-PID API or retained creation relationship for this conhost. Same Job/session and creation proximity do not prove parentage. |
| Native creation after Node and within five seconds | Yes | `GetProcessTimes` on member and owned Node handle | Conhost FILETIME `134350421952528397`; both native timing checks true | Yes, native kernel times. |
| Independent CIM/native creation-time agreement | Yes | CIM `CreationDate` versus native FILETIME | CIM time null; check false | No second independent time source in the existing helper. |
| Session equality | Yes | `ProcessIdToSessionId` for each PID | Both session `5`; `sameSession=true` | **Directly provable** by native API; no CIM needed. |
| Job membership and pre-release liveness | Yes | `IsProcessInJob`, `WaitForSingleObject` | Both checks true | Yes, native member handle. |
| Conhost command line / token | **No** in executed conhost `checks` | CIM metadata if available | Null; `tokenObserved=false` | No external-process readback; absence is neutral for this conhost gate. It cannot establish parentage. |
| Retained conhost handle for exit chronology | Required later, after allowlisting | `RetainCandidateConsoleHost` only for a classified candidate | Not reached; `candidatePid=null`, no retained conhost exit measurement | Capability exists in native helper, but its use was correctly blocked by the failed membership gate. |

The record therefore does **not** prove `24432 → parent 24588`. Prior diagnostic runs involved different process instances and cannot supply this run's parent PID. The image, same session, Job membership, and creation proximity are supportive but do not satisfy the exact-parent criterion.

## Existing native-helper capability and its limit

| Fact | Existing v3 native source | v3 outcome |
| --- | --- | --- |
| Executable image path | `OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE)` + `QueryFullProcessImageNameW`; `GetSystemDirectoryW` for trusted conhost path | Both paths available, no native error. |
| PID from exact owned Node creation | `CreateProcessW` / returned `PROCESS_INFORMATION.dwProcessId` and retained process handle | Node PID and handle available. `GetProcessId(handle)` is **not** imported or invoked. |
| Job member PIDs / membership | `QueryInformationJobObject(JobObjectBasicProcessIdList)` + `IsProcessInJob` | Member set and membership available. |
| Kernel process creation / exit times | `GetProcessTimes` on opened or retained handles | Both member creation times; Node kernel exit time. Conhost exit measurement not reached. |
| Session ID | `ProcessIdToSessionId` | Both session IDs `5`, directly measured. |
| Liveness / exact-handle wait | `WaitForSingleObject` | Both alive at native pre-release inspection; owned Node handle later signaled. |
| Parent-process identity of conhost, actual Node command line, CIM-independent corroboration of CIM time | **No corresponding readback in existing helper** | Unavailable. The helper does not import `NtQueryInformationProcess`, retrieve an external process's command line, or provide a second creation-time source. |

This is a **mixture** of mandatory CIM evidence and CIM-independent native evidence. The failed CIM fields are not all redundant. A possible future Windows identity-source mechanism would need separate design, authorization, and validation against the same mandatory facts; this analysis does not assert that any unimplemented mechanism is an approved deterministic replacement.

## Timing, lifecycle, and safe cleanup

The new v3 lifecycle measurement operated as designed **up to the membership stop**: exact Node handle retained; pre-release wait nonsignaled; cooperative release issued; `WaitForSingleObject` then signaled; `GetProcessTimes` succeeded on that exact handle. Node creation FILETIME was `134350421952308310` (`2026-09-28T04:09:55.2308310Z`), kernel exit FILETIME `134350421956218653` (`2026-09-28T04:09:55.6218653Z`), and the distinct post-exit observation was `2026-09-28T04:09:55.6246542Z`. Native API failure count was `0`.

Because the conhost remained `Unknown / Not Allowlisted`, its exact handle was not retained for lifecycle measurement. Conhost kernel exit time, exit ordering, and signed exit delta are null. The lifecycle criterion remains **Needs Clarification — Missing valid Node/conhost kernel exit chronology**, while the diagnostic's overall retained result remains **FAIL — Lifecycle Attribution Not Supported**. Cleanup used cooperative release; fallback count `0`, unidentified-member termination `0`, and Job-wide termination `0`. Native handles closed successfully. The separate CIM PID-absence check failed, so the retained cleanup result **TargetedOwnedParentFallbackOrPidAbsenceUnverified — Cannot Pass** is not upgraded to PASS.

## Classification and governance consequence

**Class C — Mandatory Attribution Cannot Currently Be Established Without CIM.** The executed gate requires exact parent PID for both members, actual Node command-line token/probe path, and independent CIM/native creation-time agreement. CIM returned no values for either member. The existing approved helper proves image, native creation time, session, Job membership, liveness, and Node handle identity, but contains no approved deterministic replacement for all missing mandatory facts. The underlying CIM failure cause is **Undetermined from retained evidence** because only the exception class was retained; that uncertainty does not change what the gate required or what the run actually proved.

Accordingly, **no Diagnostic v4 design or authorization proposal is created**. Another diagnostic retry requires a separately approved execution-environment or identity-source solution that preserves every mandatory attribution criterion and safe cleanup rule. No launcher v1.4, Smoke v5, or formal retry `0003` follows from this analysis.

The next governance decision must address one of these paths before another diagnostic can be proposed:

1. **Approved identity-source solution:** establish a deterministic trusted source for **all** currently missing mandatory attribution fields, without weakening the existing gate.
2. **Approved execution environment:** establish an environment in which the existing mandatory CIM identity queries can execute reliably and retain actionable failure semantics.

This analysis chooses neither path and authorizes no implementation or execution.

## Preserved status and boundaries

| Item | Status / result retained |
| --- | --- |
| Diagnostic v2 | `Needs Clarification` |
| Diagnostic v3 | `FAIL — Lifecycle Attribution Not Supported` |
| Diagnostic v4 | `Not Proposed` |
| Launcher v1.4 | `Blocked` |
| Smoke v5 | `Not Authorized` |
| Formal OE-12 retry `0003` | `Not Authorized` |
| OE-12 operational evidence | `Not Executed` |
| Operational evidence | `11 Accepted / 4 Not Executed` |
| `SIR02-DEF-02` | `Missing / Not Reviewed` |
| SIR-02 | `Blocking` |

No diagnostic, smoke, formal execution, source modification, implementation change, dependency/configuration/Git-setting change, or status transition was performed for this analysis. Formal attempts `0001` and `0002`, earlier smoke/diagnostic evidence, and the accepted OE-12 implementation `826376cc84521a5d648462fdcc985cd2d412a24c` remain unchanged. OE-08, OE-14, and OE-15 remain unchanged.
