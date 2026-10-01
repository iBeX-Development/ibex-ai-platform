# SIR-02 KM OE-12 Diagnostic v3 Execution-Policy Tooling Remediation v1.0

## Scope and preserved failure

| Field | Value |
| --- | --- |
| Version | `v1.0` |
| Classification | **Non-Formal Tooling Diagnostic — Not OE-12 Operational Evidence** |
| Purpose | Design the minimum non-persistent, process-scoped way to load the already authorized Diagnostic v3 launcher. This document does not authorize or execute a retry. |
| Preserved prelaunch attempt | `SIR02-OE12-JOB-MEMBERSHIP-DIAGNOSTIC-V3-PRELAUNCH-20260928T031652739Z` |
| Immutable prelaunch evidence | `d44bd8e70e95c2828132989e50c754e7df188e91` |
| Prelaunch result | **Needs Clarification — Pre-Script Execution-Policy Tooling Failure**; launcher exit `1` after `443 ms` |
| V3-D0 | **PASS**; the bundle and all three freshly extracted source files matched committed bytes |
| Exact-source bundle SHA-256 | `82b047a85d3fec6cabd6e430c6225eee0ed46b0e7b92694f1703e3a4910249ab` |
| Runtime token / native calls / lifecycle measurement | **Not Generated / None / Not Reached** |

The prelaunch evidence is immutable. Its seven retained payload SHA-256 values and the manifest SHA-256 matched the committed bytes. The PowerShell child reported that `launcher.ps1` could not be loaded because script execution was disabled. This occurred before the script's first statement; no Diagnostic v3 source defect was demonstrated. Do not rewrite, relabel, or reuse the prelaunch ID, and do not represent this as a lifecycle failure or completed Diagnostic v3 run.

## Read-only policy precedence inspection

During this assessment on `2026-09-28` UTC, a Windows PowerShell **5.1.26100.9444** child launched with `-NoProfile -NonInteractive -Command` returned the following read-only `Get-ExecutionPolicy -List` result. The command queried policy only; it did not invoke a script, set policy, edit the registry, or change Group Policy.

| Scope | Windows PowerShell 5.1 result |
| --- | --- |
| `MachinePolicy` | `Undefined` |
| `UserPolicy` | `Undefined` |
| `Process` | `Undefined` |
| `CurrentUser` | `Undefined` |
| `LocalMachine` | `Undefined` |
| Effective policy | `Restricted` |

The earlier prelaunch evidence reported the same five Windows PowerShell 5.1 scope values and effective `Restricted` result. The calling PowerShell 7.6.5 shell separately reported `LocalMachine = RemoteSigned` and effective `RemoteSigned`. The proposed retry targets **Windows PowerShell 5.1**, so its own scope list governs this decision. The difference between shells is preserved, not normalized away.

**Decision: Class A — Process-Scoped Execution Permitted.** Neither `MachinePolicy` nor `UserPolicy` is defined in the target Windows PowerShell 5.1 process, and no enforced host policy is evidenced by the read-only inspection. The process-local approach remains **unexecuted and unproven**; the later attempt must stop and retain evidence if a higher-precedence or equivalent host control blocks it. This classification is not permission to circumvent an enforced policy.

If a later read-only check instead finds enforced `MachinePolicy`, `UserPolicy`, or equivalent host control, classify **Class B — Enterprise/host policy enforcement blocks process-local execution** and record `STOP — Host Policy Requires Separate Environment/Execution Approval`. Do not weaken that control, use hidden or encoded commands, or paste launcher logic into an interactive shell. Propose a separately governed approved environment or signed-script path. If the policy evidence cannot establish precedence, classify **Class C — Policy state ambiguous**, request only the missing read-only evidence, and do not retry.

## Proposed single process-local invocation — not yet authorized

After a separate owner decision, a future operator may perform a fresh V3-D0 check against source commit `9f8480b6c8f44cba616ff2bf80094a8cb664de7a` and readiness commit `2773025d84488f0b3d36732c643f96a7aa533296`. Only a byte-verified launcher extracted from the immutable bundle may be used. The proposed bounded, noninteractive command is:

```powershell
& "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "<fresh-verified-extraction>\launcher.ps1" -IntegrityReceiptPath "<fresh-retained-D0-receipt.json>" -ExpectedBundleSha256 "82b047a85d3fec6cabd6e430c6225eee0ed46b0e7b92694f1703e3a4910249ab"
```

`-ExecutionPolicy Bypass` is proposed **only as an explicit invocation parameter for that one Windows PowerShell process**. It is not a `Set-ExecutionPolicy` call and does not authorize a machine, user, registry, Group Policy, profile, repository, or persistent policy change. The proposal neither invokes a network resource nor grants network access. The source package has no proposed changes. Use the readiness record's finite watchdog and retain exact command, start/end UTC, stdout, stderr, exit code, source-integrity receipt, and any partial result. Do not silently retry if launch, policy, integrity, or diagnostic execution fails.

The future execution must verify before launch that all five policy scopes still support Class A, the working tree/source is unchanged, the bundle SHA-256 matches, the three extracted files match committed bytes, and the exact `-File` path is the verified extracted launcher. A fresh runtime token matching `SIR02-OE12-JOB-MEMBERSHIP-DIAGNOSTIC-V3-<UTC yyyyMMddTHHmmssfffZ>` may be recorded **only after the launcher actually begins execution**. The failed prelaunch attempt did not allocate that token and cannot be reused or backfilled.

## Source and downstream boundaries

The exact source remains the three files at `docs/governance/sir-02/controls/oe-12-job-membership-diagnostic-v3-source-v1.0/` (`launcher.ps1`, `native-helper.cs`, and `probe.cjs`) plus `SIR-02-KM-OE-12-JOB-MEMBERSHIP-DIAGNOSTIC-V3-EXACT-SOURCE-BUNDLE-v1.0.zip`. Do not modify those files, the readiness record, OE-12 implementation `826376cc84521a5d648462fdcc985cd2d412a24c`, tests, production/runtime code, dependencies, configuration, registry, Git settings, or `.gitattributes`.

Diagnostic v2 remains **Needs Clarification**. Launcher v1.4 remains **Blocked**; Smoke v5 and formal retry `0003` remain **Not Authorized**. OE-12 remains **Not Executed**; operational evidence remains **11 Accepted / 0 Awaiting Independent Review / 4 Not Executed**. `SIR02-DEF-02` remains **Missing / Not Reviewed**; SIR-02 remains **Blocking**. No status changes are made by this proposal.
