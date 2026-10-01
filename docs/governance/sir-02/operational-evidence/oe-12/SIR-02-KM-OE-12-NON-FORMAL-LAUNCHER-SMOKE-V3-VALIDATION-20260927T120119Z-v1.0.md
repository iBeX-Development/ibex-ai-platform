# OE-12 non-formal launcher Smoke v3 — failed validation

- **Classification:** Non-Formal Launcher Smoke Validation — Not OE-12 Operational Evidence
- **Capture ID:** `SIR02-KM-OE-12-LAUNCHER-SMOKE-V3-20260927T120119Z`
- **Decision:** `FAIL`
- **UTC start/end:** `2026-09-27T12:01:19.7253438Z` / `2026-09-27T12:01:21.9844905Z`
- **Recorded launcher duration:** `2,259 ms`

## Authority and environment

| Item | Immutable reference or observation |
| --- | --- |
| Launcher remediation v1.2 | `032b2244886e04b8704a265a09e33f067fb10ed8` |
| One-time Smoke v3 owner decision | `f955087dbad6a39a6e58bbb2ab16c637adcc23f9` |
| Authorization linkage | `2788c421e2e0eaebe59d220c1f9e3407c9253162` |
| Accepted OE-12 implementation | `826376cc84521a5d648462fdcc985cd2d412a24c`; unchanged |
| PowerShell | Windows PowerShell `5.1.26100.9444` |
| Node | `C:\Program Files\nodejs\node.exe`, `v22.23.2` |
| Data and network | Synthetic local probe; `COREPACK_ENABLE_NETWORK=0`, `npm_config_offline=true`; no network call in retained probe |
| Temporary execution path | `C:\Users\gantu\AppData\Local\Temp\sir02-oe12-smoke-v3-prep\` |

The retained launcher and probe were temporary test-execution tooling. They were not application, OE-12 fixture, or integration-test changes. The one-time invocation was `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File 'C:\Users\gantu\AppData\Local\Temp\sir02-oe12-smoke-v3-prep\launcher-v3.ps1'`. The invocation used no watch mode or network request.

## Transport and scenario results

T0 was `PASS` for all three bracketed vectors: echo `12/12`, nonzero `2/2`, and tree `2/2` expected/decoded elements. Indexed comparisons, ordered values, duplicate `repeat-value` entries, the deliberate zero-length element, string-only element checks, and the exact probe path passed. The raw capture retains the serialized JSON, decoded vectors, per-index checks, quoted Windows arguments, `ProcessStartInfo.Arguments`, and child-observed `process.argv` where the child returned. The echo child reported an exact `13/13` `process.argv` match, including the empty string and quoting cases.

| Gate | Retained result | Observation |
| --- | --- | --- |
| T0 | PASS | All three vectors decoded and matched; no Node child started before its T0 check. |
| S1 | PASS | Intended probe executed; exit `0`; deterministic prepared/started/completed stages. |
| S2 | PASS | Child `process.argv` matched all `13` expected elements exactly. |
| S3 | PASS | Space-containing executable, probe, and synthetic path remained intact. |
| S4 | PASS | Exact stdout marker and structured argument line captured. |
| S5 | PASS | Exact stderr marker captured separately. |
| S6 | PASS | Nonzero exit `23` captured and classified as failed exit. |
| S7 | Not Reached in finalized raw case result | The tree scenario began after T0, but its bounded termination path raised `ERROR: Access denied` before returning a scenario record. Timeout/termination success was not established. |
| S8 | Not Reached | No retained proof of automatic child-tree termination or no orphan at the launcher boundary. |
| S9 | PASS | Shell-significant payload reached the child literally; no interpretation marker or unexpected temporary file appeared. |
| S10 | PASS | Pre/post repository HEAD, status, guarded files, and existing OE-12 artifact inventory matched before publication of this failure record. |

The raw result records `fatalPhase = Launcher or assertion`, `fatalError = ERROR: Access denied`, and `overall = FAIL`. From the retained launcher path and the fact that the tree T0 passed but no `raw.tree` result returned, the failure is assessed as a permission denial during the tree-termination call. The raw capture does not retain a `taskkill` exit code, a completed timeout result, or a parent/child PID mapping; none is inferred here. This is a launcher/tooling failure, not an OE-12 lifecycle-acceptance result.

The console emitted the temporary raw-result path, `SMOKE_V3_RESULT=FAIL`, this capture ID, and `FATAL=ERROR: Access denied`. The shell session remained open after that output while synthetic Node processes were still active. Two `C:\Program Files\nodejs\node.exe` processes, PIDs `9568` and `33624`, were observed with the Smoke v3 start time. They were explicitly stopped with `Stop-Process -Id 9568,33624 -Force`; a subsequent `Get-Process` check found neither PID. This manual cleanup does not satisfy S7 or S8 and does not change the `FAIL` decision.

## Preserved artifacts and status boundary

- Raw result: `SIR-02-KM-OE-12-NON-FORMAL-LAUNCHER-SMOKE-V3-RAW-20260927T120119Z-v1.0.json`
- Temporary launcher source as executed: `SIR-02-KM-OE-12-NON-FORMAL-LAUNCHER-SMOKE-V3-LAUNCHER-20260927T120119Z-v1.0.ps1.txt`
- Synthetic probe source as executed: `SIR-02-KM-OE-12-NON-FORMAL-LAUNCHER-SMOKE-V3-PROBE-20260927T120119Z-v1.0.cjs.txt`

Smoke v1 (`e437f02fcd3746207d9cb17bddad045c3ce0f115`), Smoke v2 (`22882d0c32b24ca6ecdfab373d24b139af89dd9d`), and failed formal attempts `0001` and `0002` remain unchanged. No formal OE-12 Run ID `0003`, payload, manifest, sidecar, or success linkage was created. Formal retry `0003` remains **Not Authorized** and is not eligible for owner authorization from this failed smoke. Do not silently repair or rerun Smoke v3; a new governance decision is required for the termination-permission issue.

OE-12 remains `Not Executed`; operational evidence remains `11 Accepted / 0 Awaiting Independent Review / 4 Not Executed`. `SIR02-DEF-02` remains `Missing / Not Reviewed`; SIR-02 remains `Blocking`. OE-08, OE-14, OE-15, dependencies, configuration, Git settings, accepted implementation, and production/runtime paths remain unchanged.
