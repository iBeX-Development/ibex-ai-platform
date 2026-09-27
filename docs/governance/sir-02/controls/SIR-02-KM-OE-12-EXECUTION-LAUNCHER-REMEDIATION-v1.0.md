# SIR-02 KM OE-12 Execution-Launcher Remediation v1.0

## Scope and preserved lineage

| Field | Value |
| --- | --- |
| Evidence item | `SIR02-KM-OE-12 — Lifecycle Audit Evidence` |
| Remediation version | `v1.0` |
| Attempt `0001` | `SIR02-KM-OE-12-V1_0-20260927T090557Z-0001` — Formal Execution Attempt, Integrity Failed; evidence `d20cf6acb7d43af418534c613148bf82876f7073`; failure record `7818c21c4471c35437b50fcd3c97ce00d147d05d` |
| Attempt `0002` | `SIR02-KM-OE-12-V1_0-20260927T104029Z-0002` — Formal Execution Attempt, Tooling Failed Before Vitest; failure commit `b1420d2b7f991585934e2f00f922e6a53deba77c` |
| Accepted implementation | `826376cc84521a5d648462fdcc985cd2d412a24c` |
| Existing integrity procedure | `SIR-02-KM-OE-12-FORMAL-EXECUTION-INTEGRITY-REMEDIATION-v1.0.md` at `b70971c4da908e62226fe500e27c56c7de9a11a1`; prior retry decision `2c787752bc81879148f2db90e18cc5665e35bb7c` and linkage `911c14138e66865dc76a133c9a47fd44627d6d14` |
| OE-12 operational-evidence status | `Not Executed` |

This is a launcher-only proposal. Attempts `0001` and `0002` remain immutable and must not be amended, deleted, overwritten, reused, collapsed, or reclassified as successful. Their observations cannot substitute for a later run. No OE-12 fixture, integration test, production/runtime source, dependency, configuration, migration, or Git setting needs to change.

## Confirmed `0002` failure

The temporary `0002` launcher was invoked using Windows PowerShell `5.1.26100.9444`. Its `Invoke-BoundedNode` function set `ProcessStartInfo.FileName` to the existing `node.exe`, then called `ProcessStartInfo.ArgumentList.Add(...)`. In that runtime `ArgumentList` was null, so the call raised `You cannot call a method on a null-valued expression.` The run log records duration `39 ms`, `stages: []`, and no Vitest or fixture-capture child process. This was a pre-Vitest launcher failure, not an OE-12 test, security, or acceptance failure.

## Compatible launcher design

Keep the launcher as temporary execution tooling outside the repository. It must run under Windows PowerShell 5.1 without using `ProcessStartInfo.ArgumentList` or a shell to interpret child arguments. Use an existing absolute `node.exe` path as `ProcessStartInfo.FileName`, `UseShellExecute = false`, `CreateNoWindow = true`, the repository as `WorkingDirectory`, and a single `ProcessStartInfo.Arguments` string built from a fixed array of arguments. The intended child entrypoints remain the already-installed repository-local `node_modules/vitest/vitest.mjs` and `node_modules/tsx/dist/cli.mjs`; no dependency install or version change is proposed. Use the existing narrow non-network dependency-read exception only if sandbox access to installed dependencies still requires it.

**Argument quoting contract:** Treat each argument as data and quote it independently for the Windows process command line. Reject NUL. Surround each argument, including an empty argument, with double quotes. Copy ordinary characters unchanged. For a run of `n` backslashes immediately before an embedded double quote, emit `2n + 1` backslashes followed by the quote. For `n` trailing backslashes before the closing quote, emit `2n` backslashes. Leave other backslashes unchanged. Join the individually quoted arguments with one space. Pass the resulting string to `ProcessStartInfo.Arguments`; pass the absolute executable separately through `FileName`. This handles spaces in the repository, installed dependency, and temporary paths and embedded quotes without `cmd.exe`, PowerShell expansion, or interpretation of synthetic payload content. Only fixed runner paths, options, and isolated output paths may become process arguments; no case payload, tenant data, or untrusted text is interpolated into command syntax.

Set redirected standard output and error encoding to UTF-8. Start asynchronous reads on both streams before waiting so neither pipe can block the child. Retain stdout and stderr separately, along with the exact argument array, quoted command line for diagnosis, child PID, UTC stage start/end, elapsed time, exit code, timeout flag, and stage outcome. A successful stage requires the expected output file, exit code `0`, and no timeout. Record each stage deterministically as `vitest` or `fixture-capture`; a stage that never starts is recorded as `Not Started`, never as a test failure.

Use a finite watchdog of 120 seconds per formal stage. If it expires, invoke the existing Windows `taskkill.exe` directly with `/PID <numeric-child-pid> /T /F`, wait for parent/child termination, and record the kill command's result and any residual-process uncertainty. Do not rely on the .NET `Process.Kill(entireProcessTree)` overload, which is not available in the Windows PowerShell 5.1 runtime. If tree termination cannot be confirmed, fail closed, retain the tooling attempt, and do not continue to capture or evidence assembly. Do not start a second formal run automatically.

## Mandatory non-formal smoke gate

Before any owner authorization of a formal `0003` run, prepare a temporary launcher and temporary synthetic probe outside the repository and run it under **Windows PowerShell 5.1**. This smoke is a tooling validation only; it must create no OE-12 formal run ID, scenario output, governance artifact, or status change. No Vitest suite or OE-12 fixture may be invoked.

1. Confirm the host runtime is PowerShell 5.1 and the child executable is the existing absolute `node.exe`. Keep `COREPACK_ENABLE_NETWORK=0` and `npm_config_offline=true`; the probe performs no network operation.
2. Start a temporary Node probe via `ProcessStartInfo.FileName` and the quoted `Arguments` string. Pass fixed synthetic test arguments covering an empty string, whitespace, a path containing spaces, an embedded double quote, a backslash before a quote, and a trailing backslash. The probe reports `process.argv` as JSON on stdout, a fixed marker on stderr, and exits with a deliberate nonzero code such as `23`. Require byte-for-byte argument equality after JSON parsing, both streams captured separately, and the exact exit code retained. No shell expansion or payload evaluation is permitted.
3. Start the same isolated probe in a deliberate wait mode with a short smoke watchdog. Require the timeout flag, process-tree termination, bounded completion, and explicit timeout/kill outcome. Verify no child remains. Do not use the formal 120-second wait for the smoke timeout case.
4. Record the smoke result as `Launcher Smoke / Not Operational Evidence`. Verify no repository tracked file, dependency, configuration, Git setting, OE status, or live state changed. If any assertion fails, stop; do not authorize or run `0003`. Preserve the smoke diagnostic for a separate governance decision.

The smoke must establish process start, exact arguments, stdout, stderr, exit code, timeout, child-tree termination, PowerShell 5.1 compatibility, and no network. Only after a passing, independently reviewable smoke and a separate owner decision may the formal retry proceed.

## Future sequence and integrity gates

If separately authorized, the next run ID is `SIR02-KM-OE-12-V1_0-<UTC>-0003`, assigned only when its bounded formal process starts. All new retained formal filenames use sequence `0003`. Run the complete approved OE-12 suite and independently generate its event, negative-case, sink, tenant, sanitization, cleanup, Vitest, and log outputs. Do not reuse either failed attempt's results.

The staged-byte integrity model from `b70971c4da908e62226fe500e27c56c7de9a11a1` remains unchanged: stage payloads through normal Git conversion; hash exact binary Git-index bytes; build and stage a manifest of payload hashes only; hash the staged manifest; put that digest in a separate `.sha256` sidecar; commit; independently hash every blob from the exact commit; require `100% MATCH` for payloads and manifest/sidecar before success linkage or status change. Do not add a self-hash to the manifest or change `core.autocrlf=true` or `.gitattributes` to bypass this gate.

On any smoke, launcher, test, capture, staging, hash, or post-commit failure, preserve the distinct attempt and exact cause, publish an immutable failure record as applicable, do not create success linkage, do not change OE-12 status, and do not retry automatically. Attempt `0003` is not authorized or executed by this design.

No production/runtime code, accepted OE-12 fixture/integration test, dependency, migration, configuration, or Git-setting change is required. The temporary execution-tooling change stays outside the production/runtime and repository implementation paths. OE-08 remains synthetic audit-only and unchanged. OE-12 remains `Not Executed`; operational evidence remains **11 Accepted / 0 Awaiting Independent Review / 4 Not Executed**. `SIR02-DEF-02` remains `Missing / Not Reviewed`; SIR-02 remains `Blocking`.
