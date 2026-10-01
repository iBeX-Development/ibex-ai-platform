# Non-Formal Launcher Smoke Validation — Not OE-12 Operational Evidence

| Field | Value |
| --- | --- |
| Remediation tested | 544f8fe578f749c67713f5d45587e8ba987a3860 |
| Accepted OE-12 implementation | 826376cc84521a5d648462fdcc985cd2d412a24c; unchanged |
| PowerShell | Windows PowerShell 5.1.26100.9444 |
| Node executable / version | C:\Program Files\nodejs\node.exe / v22.23.2 |
| Command | powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File <temporary launcher smoke.ps1> |
| Mechanism | ProcessStartInfo.FileName with separately quoted Arguments; no ArgumentList; UseShellExecute=false; redirected asynchronous stdout/stderr; bounded wait and taskkill tree termination path |
| UTC start / end | 2026-09-27T10:57:58.6485675Z / 2026-09-27T10:57:59.1060591Z |
| Elapsed | 457 ms |
| Overall decision | FAIL — temporary launcher argument transmission failed before the probe ran |
| Formal OE-12 Run ID | None generated; sequence 0003 remains unassigned and unauthorized |
| Network | COREPACK_ENABLE_NETWORK=0 and npm_config_offline=true; the synthetic probe contains no network action |

The exact temporary launcher, synthetic Node probe, and raw smoke result are retained alongside this record. The raw result is preserved as produced, including its case classifications. These are tooling diagnostics, not OE-12 operational evidence. No Vitest suite, OE-12 fixture, formal scenario, or formal capture ran.

## Case results

| Case | Required check | Observed result | Assessment |
| --- | --- | --- | --- |
| S1 | Deterministic Node child starts, exits 0, and records stages | Node started with no arguments, exited 0, and stages Prepared, Started, Completed were recorded. The raw harness marked this PASS. The probe script was not invoked. | Partial; launcher process start proven, full probe launch not proven |
| S2 | Exact arguments including spaces, quotes, path, and empty value | Actual argument count 0; expected synthetic array was not passed. Raw result FAIL. | FAIL |
| S3 | Path with spaces | Node executable path contained spaces, but the script path was not transmitted. | Not reached |
| S4 | Exact stdout capture | Empty stdout because no probe ran. | Not reached |
| S5 | Exact stderr capture | Empty stderr because no probe ran. | Not reached |
| S6 | Nonzero exit code captured as failure | Nonzero probe was not started. | Not reached |
| S7 | Bounded timeout and termination | Wait-mode probe was not started. | Not reached |
| S8 | Child-tree termination | Synthetic parent/child case was not started. | Not reached |
| S9 | Shell-significant payload treated as data | Payload was not transmitted; no shell interpretation can be concluded. | Not reached |
| S10 | No formal OE-12 effects | No formal run ID was generated and the repository was clean immediately after the smoke stopped. No OE-12 fixture or formal evidence path was invoked. | No formal execution observed; smoke harness did not reach its S10 assertion |

## Exact launcher gap

The retained launcher declares Invoke-Probe with a parameter named $args. In Windows PowerShell, $args is also an automatic variable. At the call site, the launcher constructed a nonempty echo argument array, but the retained raw result shows arguments: [] and quotedArgumentString: "". Node therefore started without the temporary probe script and exited normally without stdout or stderr. The next assertion recorded S2 FAIL, and a subsequent index into the absent echoed argument array raised "Cannot index into a null array." This is a temporary launcher/harness defect, not an OE-12 lifecycle test or acceptance result. The raw record contains the fatal message; the source and empty argument capture support this diagnosis. No correction or rerun was performed.

The source temporary-file SHA-256 values before governance copying were: launcher 620BE62010DDDEFB61C76D76205D8A81E644DF03AF6EA43315E68E6CB5D5D437; probe 0D482BC03F4D5709C09EFA3D0BAAE299E9736C47011EFD9B32B79955E8B85ACC; raw result E1ECFAD734F0183D31876B4FC59D356F69F1A186F5CC05F24068392E1506438D. Git may normalize text line endings on commit; the committed artifact bytes should be checked from the resulting commit.

## Governance disposition

The mandatory smoke gate has not passed. Formal retry 0003 is not eligible for owner authorization on this record. The retry authorization remains Proposed / Not Authorized, and a corrected non-formal launcher must be separately evaluated before any formal retry decision. This record does not authorize a rerun. Failed attempts 0001 and 0002 remain unchanged. No implementation, production/runtime source, dependency, package/lockfile, configuration, Git setting, OE-08, OE-14, OE-15, or SIR02-DEF-02 status was changed.

OE-12 remains Not Executed. Operational evidence remains 11 Accepted / 0 Awaiting Independent Review / 4 Not Executed. SIR02-DEF-02 remains Missing / Not Reviewed. SIR-02 remains Blocking.
