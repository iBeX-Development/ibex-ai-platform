# OE-12 Diagnostic v3 Retry — Non-Formal Failed Attempt

## Identity and immutable boundary

| Field | Retained value |
| --- | --- |
| Classification | **Non-Formal Tooling Diagnostic — Not OE-12 Operational Evidence** |
| Runtime token | `SIR02-OE12-JOB-MEMBERSHIP-DIAGNOSTIC-V3-20260928T040954760Z` |
| Result | **FAIL — Lifecycle Attribution Not Supported** |
| Authorization / linkage | `6ac9e21b41e1833386884e704c965f14d2cb37d0` / `f7c01673e0da287771dbb791924c2d2c38100500` |
| Execution-policy remediation | `d47669911c95eb539bb14e45ffc20ed74a5db100` |
| Exact source / readiness | `9f8480b6c8f44cba616ff2bf80094a8cb664de7a` / `2773025d84488f0b3d36732c643f96a7aa533296` |
| Earlier prelaunch attempt | `SIR02-OE12-JOB-MEMBERSHIP-DIAGNOSTIC-V3-PRELAUNCH-20260928T031652739Z`; evidence `d44bd8e70e95c2828132989e50c754e7df188e91`, unchanged |
| Runtime start / end UTC | `2026-09-28T04:09:54.7607891Z` / `2026-09-28T04:09:55.6512368Z` |
| External launcher | PID `16616`; exit `1`; elapsed `1330 ms`; `90000 ms` watchdog not reached; one invocation and no retry |

The failed attempt is preserved as observed. It does not change Diagnostic v2, authorize launcher v1.4 or Smoke v5, or constitute formal OE-12 evidence. The original prelaunch attempt is not relabeled or replaced.

## Gates and exact source

**R3-0 PASS.** Fresh read-only Windows PowerShell 5.1 inspection returned `MachinePolicy=Undefined`, `UserPolicy=Undefined`, `Process=Undefined`, `CurrentUser=Undefined`, `LocalMachine=Undefined`, effective `Restricted`. The observed environment remained **Class A — Process-Scoped Execution Permitted**. The sole launcher invocation used `-NoProfile -NonInteractive -ExecutionPolicy Bypass -File` as a process-local parameter. No `Set-ExecutionPolicy`, registry, Group Policy, CurrentUser/LocalMachine policy, or persistent setting change occurred.

**R3-1 PASS.** The ZIP SHA-256 was `82b047a85d3fec6cabd6e430c6225eee0ed46b0e7b92694f1703e3a4910249ab`. A fresh extraction contained exactly `launcher.ps1`, `native-helper.cs`, and `probe.cjs`; each was byte-compared with the committed source and matched. The launcher path used by the invocation was the verified extracted file. The repository working tree was clean before launch. The raw gate outputs and receipt are retained alongside the run log.

## Membership and measured lifecycle facts

The synthetic Node parent was PID `24588`. The Job's expected member set was `[24588]`; the observed and pre-release confirmation sets were `[24432, 24588]`. PID `24432` had trusted `C:\Windows\System32\conhost.exe` image, the same session, Job membership, and a creation time after Node within five seconds. Its CIM parent PID, CIM creation time, and command line were unavailable (`CimException`). The Node's CIM parent, command line, and CIM time were also unavailable (`CimException`). Both records therefore remained **Unknown / Not Allowlisted**. PID `24432` was an unexpected member under the approved allowlist. The pre-release gate returned **FAIL — Unknown or unsafe member**. This record does not infer that the conhost was unrelated; it records that the required attribution could not be established.

The exact owned Node handle was nonsignaled immediately before cooperative release. No conhost candidate passed attribution, so there was no retained conhost handle to validate or observe. The launcher issued the approved cooperative release signal. The Node handle then signaled within its `12000 ms` bound. `GetProcessTimes` succeeded on that retained handle:

| Measurement | Node | Conhost |
| --- | --- | --- |
| PID | `24588` | **No attributed candidate** |
| Creation FILETIME ticks | `134350421952308310` | **Unavailable** |
| Creation UTC | `2026-09-28T04:09:55.2308310Z` | **Unavailable** |
| Kernel exit FILETIME ticks | `134350421956218653` | **Unavailable** |
| Kernel exit UTC | `2026-09-28T04:09:55.6218653Z` | **Unavailable** |
| Termination observation UTC | `2026-09-28T04:09:55.6246542Z` | **Unavailable** |
| Pre-release handle state | **Nonsignaled** | **Not established** |

The release-write interval was `2026-09-28T04:09:55.5620672Z` to `2026-09-28T04:09:55.5652409Z`. The Node observation timestamp is kept separate from its kernel exit time. No conhost kernel exit FILETIME was captured. Consequently exact exit ordering, `conhost_exit_time - node_exit_time`, and its signed milliseconds are **unavailable**. No PID disappearance, enumeration result, handle state, or launcher observation time is substituted for the missing conhost kernel exit time.

## Criterion, safety, and errors

The unchanged lifecycle criterion requires the conhost kernel exit after Node kernel exit, after cooperative release, within the bounded observation. The raw lifecycle measurement is **Incomplete — Required exact-handle kernel exit chronology unavailable** and its separate criterion evaluation is **Needs Clarification — Missing valid Node/conhost kernel exit chronology**. The overall diagnostic result is **FAIL — Lifecycle Attribution Not Supported** because the earlier membership allowlist gate failed. This is not a measured contradiction of conhost/Node exit ordering.

The native/API log contains `42` steps with `0` recorded native-call failures. The identity failures are the retained CIM `CimException` categories for both member lookups and the parent PID-absence check. No exact-parent fallback was used, no unidentified member was terminated, and no Job-wide termination occurred; the retained native log has `0` prohibited termination calls. The Node exited, the source reports native handle cleanup succeeded, and the PID-absence check remained unverified because of `CimException`. The source's cleanup result is retained exactly as **TargetedOwnedParentFallbackOrPidAbsenceUnverified — Cannot Pass**; it is not promoted to cleanup PASS.

The runner's stdout, empty stderr, exit code, timestamps, and exact invocation are retained. The raw result records `formalRunIdGenerated=false` and `oe12StatusChanged=false`. No implementation, dependency, configuration, repository Git setting, earlier diagnostic, smoke, or formal-attempt artifact was changed.

## Decision and next gate

**FAIL — Lifecycle Attribution Not Supported.** One authorized retry was consumed; no further retry is authorized automatically. Diagnostic v2 remains **Needs Clarification**. This result does **not** justify closing its lifecycle finding or starting a separate clarification review. Launcher v1.4 remains **Blocked**; Smoke v5 and formal retry `0003` remain **Not Authorized**. OE-12 remains **Not Executed**; operational evidence remains **11 Accepted / 0 Awaiting Independent Review / 4 Not Executed**. `SIR02-DEF-02` remains **Missing / Not Reviewed**; SIR-02 remains **Blocking**.
