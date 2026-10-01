# SIR-02 KM OE-12 Execution-Launcher Remediation v1.1

## Document control and boundary

| Field | Value |
| --- | --- |
| Version | v1.1; additive amendment to launcher remediation v1.0 at 544f8fe578f749c67713f5d45587e8ba987a3860 |
| Evidence item | SIR02-KM-OE-12 — Lifecycle Audit Evidence |
| Failed non-formal smoke | FAIL; immutable record e437f02fcd3746207d9cb17bddad045c3ce0f115 |
| Accepted OE-12 implementation | 826376cc84521a5d648462fdcc985cd2d412a24c; unchanged |
| Formal retry 0003 | Not Authorized; no formal Run ID allocated |
| OE-12 status | Not Executed |

This amendment changes the proposed temporary Windows PowerShell 5.1 launcher design only. It does not revise remediation v1.0, formal attempts 0001 or 0002, the failed smoke, or the accepted OE-12 implementation. It neither authorizes nor executes a new smoke or formal retry.

## Preserved failed smoke

The non-formal smoke used Windows PowerShell 5.1.26100.9444 and C:\Program Files\nodejs\node.exe v22.23.2. It lasted 457 ms. Node started and exited with code 0, but the retained raw result contains arguments: [] and an empty ProcessStartInfo.Arguments string. The probe script and payload were not delivered. The temporary launcher declared its input parameter as $args, colliding with PowerShell's automatic $args variable. The call site constructed an intended nonempty array, but that array was lost at the Invoke-Probe boundary. A later missing-array index raised "Cannot index into a null array." The evidence for this cause is the retained launcher source, call site, empty argument capture, and smoke result at e437f02fcd3746207d9cb17bddad045c3ce0f115.

The failed smoke remains FAIL. S1 proves only that a Node process started and stages were recorded; the probe was not invoked. S2 is FAIL. S3–S9 were Not Reached. S10's formal-side-effect assertion was not reached, although no formal OE-12 execution occurred. None of those cases may be reclassified as passed. The raw result and prior smoke record must not be overwritten, replaced, or normalized into a passing result.

## Minimal temporary-launcher correction

A future temporary launcher, created outside the repository only after separate smoke-retry authorization, must use a dedicated typed argument variable such as [string[]]$processArguments or [string[]]$nodeArguments. It must not use $args as an explicit parameter, local variable, or launcher argument collection. All callers must pass this dedicated variable through named parameters, and ProcessStartInfo.Arguments must be built only from that validated collection. The smoke must retain both the pre-launch argument count and the expected count for each scenario. A static preflight must reject any remaining explicit launcher use of PowerShell's automatic $args.

Use one deterministic Windows command-line quoting function for every argument. Reject NUL. Enclose every argument, including an empty string, in double quotes. Copy ordinary characters unchanged. Before an embedded double quote, double the immediately preceding run of backslashes and add one more backslash before the quote. Before the closing quote, double a trailing run of backslashes. Leave other backslashes unchanged. Join independently quoted arguments with one space. Do not concatenate unquoted payload fragments or route payloads through cmd.exe or PowerShell expression evaluation. Pass the absolute existing node.exe path through ProcessStartInfo.FileName and the resulting single string through ProcessStartInfo.Arguments. Keep UseShellExecute=false, CreateNoWindow=true, UTF-8 redirected stdout/stderr, asynchronous stream draining, finite waits, and direct taskkill /PID /T /F tree cleanup. Do not use ProcessStartInfo.ArgumentList.

## Fail-closed pre-launch checks

Before Process.Start, reject and record a tooling failure if the executable path is empty or does not resolve to the existing node.exe; if the required synthetic script/probe path is empty, missing, or not an absolute existing file; if the typed argument collection is null or unexpectedly empty; if its first element is not the expected probe path; if its count differs from the expected count; or if the constructed ProcessStartInfo.Arguments string is empty when a script is required. A deliberately empty payload argument is allowed as one element and must not be confused with an empty collection. Record the full intended array, pre-launch count, expected count, quoted string, path checks, and stage outcome before launching. Any check failure stops that smoke attempt without starting Node and without assigning a formal OE-12 Run ID.

## Proposed non-formal Smoke v2

Smoke v2 is a new, separately retained tooling attempt, not a replacement for the failed smoke. Label its record exactly: **Non-Formal Launcher Smoke Validation — Not OE-12 Operational Evidence**. Assign a distinct non-formal capture identity and UTC timestamp only when an authorized smoke begins; do not use the Gate A formal sequence 0003 for it. Publish this v1.1 amendment and obtain a separate owner decision on the accompanying Proposed / Not Authorized smoke-retry record before creating or running the corrected temporary launcher.

Smoke v2 reruns S1–S10 under Windows PowerShell 5.1 with existing node.exe, synthetic data, no network, and no repository implementation change. In addition to the v1.0 checks, it must assert that the launcher input variable is not $args; the pre-launch argument count is nonzero and equals the recorded expected count; the child receives the exact absolute script/probe path; and the child reports its full process.argv. Compare the reported script path and every payload argument against their expected values exactly, including the empty value, spaces, embedded quotes, backslashes before quotes, trailing backslashes, path values, and shell-significant text. A separate nonzero-exit case must retain exact exit code and both streams. A short watchdog case must prove timeout, bounded return, parent/child tree termination or explicitly record uncertainty and fail closed. S10 must compare pre/post repository HEAD, tracked and untracked state, dependency/configuration state, formal OE-12 artifact inventory, and OE status; no formal Run ID, payload, manifest, sidecar, or success linkage may arise from the smoke.

Each case records expected and actual values, PASS/FAIL/Not Reached, UTC start/end, duration, PID where applicable, stdout/stderr, exit code, timeout, and termination result. On a failed preflight or case, preserve the new attempt and exact cause; do not silently fix and rerun. Formal retry 0003 remains unavailable until Smoke v2 is separately authorized, executed, passes, has its PASS retained immutably, and receives a separate formal-retry owner authorization. A passing smoke alone does not authorize or execute 0003.

## Scope and unchanged controls

The proposed correction is temporary test-execution tooling plus these governance documents. No OE-12 fixture or integration test, production/runtime source, dependency, package/lockfile, migration, repository configuration, Git setting, or .gitattributes change is required. No live tenant/customer data, ingestion, RAG, embedding, indexing, vector write, retrieval, deployment, credential, secret, or traffic action is authorized. The committed-byte SHA-256 procedure for any future separately authorized formal retry remains exactly as specified in the v1.0 launcher remediation and formal-execution integrity remediation.

Formal retry 0003 remains Not Authorized. OE-12 remains Not Executed. Operational evidence remains 11 Accepted / 0 Awaiting Independent Review / 4 Not Executed. OE-08, OE-14, OE-15 and SIR02-DEF-02 at Missing / Not Reviewed remain unchanged. SIR-02 remains Blocking.
