# SIR-02 KM OE-12 Diagnostic v3 Retry Authorization Record v1.0

## Decision record

| Field | Value |
| --- | --- |
| Version | `v1.0` |
| Classification | **Non-Formal Tooling Diagnostic — Not OE-12 Operational Evidence** |
| Owner | `GANTUMUR Erdenedalai — Founder / Administrator` |
| Reviewer | `SODBILEG Erkhembayar — Administrator` |
| Decision date | `2026-09-28` |
| Authorization status | **Authorized for One Diagnostic v3 Retry** |
| Immutable remediation reference | `d47669911c95eb539bb14e45ffc20ed74a5db100` |
| Authorized execution count | Exactly one new non-formal Diagnostic v3 attempt, only after fresh policy and source-integrity gates; **not executed by this decision** |
| Authorized mechanism | One Windows PowerShell 5.1 process-local `-ExecutionPolicy Bypass` invocation only, as defined in `SIR-02-KM-OE-12-DIAGNOSTIC-V3-EXECUTION-POLICY-REMEDIATION-v1.0.md` |
| Policy assessment | **Class A — Process-Scoped Execution Permitted**, limited to the inspected Windows PowerShell 5.1 environment |
| Observed target policy | `MachinePolicy=Undefined`; `UserPolicy=Undefined`; `Process=Undefined`; `CurrentUser=Undefined`; `LocalMachine=Undefined`; effective `Restricted` |
| Failed prelaunch attempt | `SIR02-OE12-JOB-MEMBERSHIP-DIAGNOSTIC-V3-PRELAUNCH-20260928T031652739Z`; immutable evidence `d44bd8e70e95c2828132989e50c754e7df188e91` |
| Exact source / readiness | `9f8480b6c8f44cba616ff2bf80094a8cb664de7a` / `2773025d84488f0b3d36732c643f96a7aa533296` |
| Original diagnostic authorization / linkage | `320698beba43d2aab9af30e74f2c983b93a67f55` / `c98415be85397d2e0e118bd715d5b8df2395ad9f` |
| Diagnostic v3 retry | **Authorized / Not Yet Executed** |
| Formal OE-12 retry `0003` | **Not Authorized** |

## Owner decision

> The OE-12 Diagnostic v3 retry is authorized for one non-formal lifecycle-observability attempt using the process-scoped PowerShell execution mechanism defined at commit d47669911c95eb539bb14e45ffc20ed74a5db100. This authorization permits only a one-process invocation of the already-approved immutable Diagnostic v3 source and does not authorize persistent PowerShell policy changes, launcher v1.4, Smoke v5, formal retry 0003, or OE-12 operational evidence execution.

This decision authorizes **one later attempt only**. It does not execute the retry or authorize any persistent policy change. The observed Class A result is limited to the inspected Windows PowerShell 5.1 environment. Before the attempt, the operator must repeat the read-only `Get-ExecutionPolicy -List` query there and retain all five scope values. Proceed only while `MachinePolicy` and `UserPolicy` remain unenforced and no newly observed host or enterprise control blocks process-scoped execution. Otherwise record `STOP — Host Policy Requires Separate Environment/Execution Approval`; do not invoke `-ExecutionPolicy Bypass` or attempt circumvention. No hidden/encoded-command workaround, interactive-shell copy, registry edit, `Set-ExecutionPolicy`, Group Policy edit, CurrentUser/LocalMachine policy change, or privilege elevation is authorized.

The operator must then repeat fresh V3-D0: verify the exact-source ZIP SHA-256 `82b047a85d3fec6cabd6e430c6225eee0ed46b0e7b92694f1703e3a4910249ab`, extract to a fresh temporary location, byte-compare `launcher.ps1`, `native-helper.cs`, and `probe.cjs` with source commit `9f8480b6c8f44cba616ff2bf80094a8cb664de7a`, retain an integrity receipt, and use only that verified launcher path. The approved process-local mechanism is one invocation equivalent to `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "<verified launcher.ps1>" ...`. Here `-ExecutionPolicy Bypass` is a **Process-scoped invocation parameter for this one authorized synthetic retry**, not a machine/user policy change, registry or Group Policy modification, or permanent relaxation. The invocation must be noninteractive, bounded, and network-free, with stdout, stderr, exit code, start/end UTC, any runtime token, and partial outputs retained. The source/readiness and all existing historical attempts remain immutable. No runtime token may be claimed until the script actually starts; the preserved prelaunch ID is never reused.

If any gate or attempted diagnostic fails, preserve that one attempt immutably and stop. No automatic retry, chronology inference, lifecycle-criterion reinterpretation, or status promotion is allowed. Any later PASS could only support a separate review of Diagnostic v2's lifecycle clarification; it would not authorize launcher v1.4, Smoke v5, formal retry `0003`, or an OE-12 status change.

## Unchanged boundaries and failure handling

If the later attempt is blocked before source execution, fails source integrity, encounters new policy enforcement, fails lifecycle measurement, requires fallback, or encounters a prohibited destructive action, preserve it immutably and **STOP**. Another retry is not automatic. No chronology or lifecycle result may be inferred from the preserved prelaunch attempt.

No Diagnostic v3 retry occurs in this authorization step. No `Set-ExecutionPolicy`, registry/Group Policy operation, machine/user policy change, network access, Diagnostic v3 source edit, launcher v1.4 creation, Smoke v5, formal retry `0003`, OE-12 implementation/test change, dependency/configuration/Git-setting change, or alteration of OE-08/OE-14/OE-15 or `SIR02-DEF-02` is authorized. The failed prelaunch result remains **Needs Clarification — Pre-Script Execution-Policy Tooling Failure**; Diagnostic v2 remains **Needs Clarification**. Launcher v1.4 is **Blocked**; Smoke v5 and formal retry `0003` are **Not Authorized**. OE-12 is **Not Executed**; operational evidence is **11 Accepted / 0 Awaiting Independent Review / 4 Not Executed**; `SIR02-DEF-02` is **Missing / Not Reviewed**; SIR-02 is **Blocking**.
