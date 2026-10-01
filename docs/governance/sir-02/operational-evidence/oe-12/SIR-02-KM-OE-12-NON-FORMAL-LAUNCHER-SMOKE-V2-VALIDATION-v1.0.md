# Non-Formal Launcher Smoke Validation — Not OE-12 Operational Evidence

## Capture and decision

| Field | Value |
| --- | --- |
| Non-formal capture ID | SIR02-KM-OE-12-LAUNCHER-SMOKE-V2-20260927T111920Z |
| Smoke v2 decision | FAIL |
| UTC start / end | 2026-09-27T11:19:20.9880979Z / 2026-09-27T11:19:21.4766496Z |
| Elapsed | 489 ms |
| Launcher remediation v1.1 | e0d7d711f08063bc3e83159ec04d33edc5beff3e |
| Smoke v2 owner decision / linkage | ea9f1fbb36d51f6b3453304c026d219ed0c503c8 / c72d47f357b4a22801468706a1c685536d80f825 |
| Prior failed Smoke v1 | e437f02fcd3746207d9cb17bddad045c3ce0f115; unchanged |
| Windows PowerShell | 5.1.26100.9444 |
| Existing Node | C:\Program Files\nodejs\node.exe; v22.23.2 |
| Intended launcher argument variable | processArguments, a dedicated typed string array |
| Automatic $args references in launcher AST | 0 |
| Formal OE-12 Run ID | None assigned |
| Formal retry 0003 | Not Authorized; not executed |
| OE-12 operational-evidence status | Not Executed; unchanged |

This is a distinct failed non-formal tooling attempt. It does not replace Smoke v1, formal attempts 0001/0002, or any operational evidence. The original v2 raw result, exact temporary launcher, and synthetic probe are retained alongside this record as non-executable governance attachments. No Vitest suite, OE-12 fixture, formal lifecycle scenario, or formal evidence capture started.

## Case-by-case result

| Case | Required validation | Actual result |
| --- | --- | --- |
| S1 | Correct probe launches and exits 0 | Not Reached — parameter binding failed before Process.Start |
| S2 | Exact argument transmission and process.argv match | Not Reached — no child process.argv exists |
| S3 | Path with spaces | Not Reached |
| S4 | stdout marker capture | Not Reached; no stdout |
| S5 | stderr marker capture | Not Reached; no stderr |
| S6 | Exact nonzero exit classification | Not Reached |
| S7 | Timeout detection and bounded return | Not Reached |
| S8 | Child-tree termination | Not Reached; no parent/child tree launched |
| S9 | Shell-significant input treated as data | Not Reached |
| S10 | Zero formal OE-12 side effects | PASS — pre/post repository HEAD, status, OE-12 artifact hashes, and protected package/lock/implementation/governance-file hashes matched |

The raw result records exactly one overall outcome, FAIL. It records no prelaunch stage, no expected or actual child process.argv, and no Node process result. S10 is a passive post-failure repository-integrity comparison and does not make any unrun launcher case pass.

## Exact failure and boundary

The temporary launcher declared Invoke-BoundedNode with a mandatory typed [string[]]$processArguments parameter. The S2 payload intentionally contained one empty string, as required by the approved quoting design. At the first echo-stage invocation, Windows PowerShell 5.1 rejected that empty string while binding the mandatory array parameter: "Cannot bind argument to parameter 'processArguments' because it is an empty string." This happened before the function's pre-launch checks or Process.Start. The failure is in temporary launcher parameter binding, not OE-12 lifecycle behavior. The launcher did avoid the automatic $args collision, and static parsing found zero automatic-$args variable references, but no runtime quoting or argument-delivery result was obtained.

The raw preflight history is empty because function binding prevented entry, not because Node received an empty argument list. There was no child Node process. The planned remedy must preserve deliberate empty-string payloads while keeping fail-closed checks for an empty or missing collection. No remedy was applied and no second Smoke v2 was run. The exact future correction and any new smoke authorization require a separate governance decision.

The source temporary-file SHA-256 values before governance copying were: launcher D31A294CAC84FD3B7D789C83EB47A4434E3D32FE66FF16A1E4629E640308A3D8; probe 08BC575D29F90EF8D2E4AD61D17072A5E0D98FF09BF25FBFF5053135D7D73716; raw result 4C3920760F534AEA19AAE5CD3AD866E3EBB5FB38FF021DC2E16795DBACAD8F95. Git may normalize text line endings on commit; committed bytes are the immutable repository reference.

## Safety and governance disposition

COREPACK_ENABLE_NETWORK=0 and npm_config_offline=true were set. The synthetic probe source contains no network action, and it was not invoked. No live ingestion, RAG, embedding, indexing, vector write, retrieval, production storage, deployment, credential, secret, or traffic action occurred. The accepted OE-12 implementation at 826376cc84521a5d648462fdcc985cd2d412a24c, dependencies, package/lockfile, configuration, Git settings, failed Smoke v1, and formal attempts 0001/0002 remain unchanged.

This FAIL does not authorize formal retry 0003. Do not silently repair or repeat Smoke v2, infer S1–S9 success, or change OE-12 status. Formal retry 0003 remains Not Authorized. OE-12 remains Not Executed; operational evidence remains 11 Accepted / 0 Awaiting Independent Review / 4 Not Executed. SIR02-DEF-02 remains Missing / Not Reviewed; SIR-02 remains Blocking.
