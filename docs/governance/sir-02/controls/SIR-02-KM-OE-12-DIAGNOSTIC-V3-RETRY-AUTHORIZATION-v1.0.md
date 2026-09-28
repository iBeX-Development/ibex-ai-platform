# SIR-02 KM OE-12 Diagnostic v3 Retry Authorization Proposal v1.0

## Decision record

| Field | Value |
| --- | --- |
| Version | `v1.0` |
| Classification | **Non-Formal Tooling Diagnostic — Not OE-12 Operational Evidence** |
| Owner | `GANTUMUR Erdenedalai — Founder / Administrator` |
| Reviewer | `SODBILEG Erkhembayar — Administrator` |
| Decision date | **Owner Input Required** |
| Authorization status | **Proposed / Not Authorized** |
| Proposed execution count | At most one new Diagnostic v3 attempt, subject to a later explicit owner authorization and fresh gates |
| Proposed mechanism | Explicit Windows PowerShell 5.1 process-local `-ExecutionPolicy Bypass` invocation only, as designed in `SIR-02-KM-OE-12-DIAGNOSTIC-V3-EXECUTION-POLICY-REMEDIATION-v1.0.md` |
| Failed prelaunch attempt | `SIR02-OE12-JOB-MEMBERSHIP-DIAGNOSTIC-V3-PRELAUNCH-20260928T031652739Z`; immutable evidence `d44bd8e70e95c2828132989e50c754e7df188e91` |
| Exact source / readiness | `9f8480b6c8f44cba616ff2bf80094a8cb664de7a` / `2773025d84488f0b3d36732c643f96a7aa533296` |
| Original diagnostic authorization / linkage | `320698beba43d2aab9af30e74f2c983b93a67f55` / `c98415be85397d2e0e118bd715d5b8df2395ad9f` |
| Diagnostic v3 retry | **Not Authorized / Not Executed** |
| Formal OE-12 retry `0003` | **Not Authorized** |

## Proposed owner decision — not yet made

The requested future decision is whether to allow **one** fresh, non-formal Diagnostic v3 execution using the unchanged, byte-verified source bundle and an explicit process-local execution-policy parameter. This proposal is not that decision. It grants no current permission to invoke the launcher, change execution policy persistently, or run any downstream smoke or formal OE-12 evidence.

If the owner later authorizes the retry, the operator must first repeat `Get-ExecutionPolicy -List` in the target Windows PowerShell 5.1 environment and retain all five scope values. Proceed only while the observed state remains **Class A**. A defined enforced `MachinePolicy` or `UserPolicy`, another host-enforced block, or ambiguous precedence requires STOP and a separate environment/execution decision. No hidden/encoded-command workaround, interactive-shell copy, registry edit, `Set-ExecutionPolicy`, Group Policy edit, machine/user policy change, or privilege elevation is proposed.

The operator must then repeat fresh V3-D0: verify the exact-source ZIP SHA-256 `82b047a85d3fec6cabd6e430c6225eee0ed46b0e7b92694f1703e3a4910249ab`, extract to a fresh temporary location, byte-compare `launcher.ps1`, `native-helper.cs`, and `probe.cjs` with source commit `9f8480b6c8f44cba616ff2bf80094a8cb664de7a`, retain an integrity receipt, and use only that verified launcher path. The invocation must be noninteractive, bounded, and network-free, with stdout, stderr, exit code, start/end UTC, any runtime token, and partial outputs retained. The source/readiness and all existing historical attempts remain immutable. No runtime token may be claimed until the script actually starts; the preserved prelaunch ID is never reused.

If any gate or attempted diagnostic fails, preserve that one attempt immutably and stop. No automatic retry, chronology inference, lifecycle-criterion reinterpretation, or status promotion is allowed. Any later PASS could only support a separate review of Diagnostic v2's lifecycle clarification; it would not authorize launcher v1.4, Smoke v5, formal retry `0003`, or an OE-12 status change.

## Unchanged boundaries

No Diagnostic v3 retry occurs in this proposal step. No `Set-ExecutionPolicy`, registry/Group Policy operation, machine/user policy change, network access, Diagnostic v3 source edit, launcher v1.4 creation, Smoke v5, formal retry `0003`, OE-12 implementation/test change, dependency/configuration/Git-setting change, or alteration of OE-08/OE-14/OE-15 or `SIR02-DEF-02` is authorized. The failed prelaunch result remains **Needs Clarification — Pre-Script Execution-Policy Tooling Failure**; Diagnostic v2 remains **Needs Clarification**. Launcher v1.4 is **Blocked**; Smoke v5 and formal retry `0003` are **Not Authorized**. OE-12 is **Not Executed**; operational evidence is **11 Accepted / 0 Awaiting Independent Review / 4 Not Executed**; `SIR02-DEF-02` is **Missing / Not Reviewed**; SIR-02 is **Blocking**.
