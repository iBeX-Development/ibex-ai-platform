# SIR-02 KM OE-12 Execution-Launcher Remediation v1.2

## Document control and immutable lineage

| Field | Value |
| --- | --- |
| Version | v1.2; additive temporary-launcher input-contract amendment to v1.1 |
| Failed Smoke v1 | e437f02fcd3746207d9cb17bddad045c3ce0f115; FAIL; unchanged |
| Failed Smoke v2 | 22882d0c32b24ca6ecdfab373d24b139af89dd9d; FAIL; unchanged |
| Accepted OE-12 implementation | 826376cc84521a5d648462fdcc985cd2d412a24c; unchanged |
| Formal retry 0003 | Not Authorized; no new formal Run ID allocated |
| OE-12 operational-evidence status | Not Executed |

This document proposes only a new transport boundary for the temporary Windows PowerShell 5.1 launcher. It does not amend or overwrite Smoke v1 or v2, formal attempts 0001/0002, or the accepted implementation. It authorizes no execution.

## Confirmed Smoke v2 failure

Smoke v2 ran under Windows PowerShell 5.1.26100.9444 with existing C:\Program Files\nodejs\node.exe v22.23.2 for 489 ms. The launcher used the dedicated processArguments variable and had zero references to PowerShell's automatic $args variable. Its first echo payload deliberately contained an empty string. The function declared a mandatory [string[]]$processArguments parameter. Windows PowerShell 5.1 rejected the empty element while binding that parameter: "Cannot bind argument to parameter 'processArguments' because it is an empty string." Function entry, pre-launch validation, Process.Start, Node, and the probe were not reached. S1–S9 remain Not Reached; S10 PASS records zero formal OE-12 side effects. This is a launcher input-contract / PowerShell parameter-binding failure. It establishes no result for command-line quoting, Node, OE-12 tests, or formal evidence.

## Selected serialized-vector transport

Use one nonempty JSON array string as the only argument-vector value crossing any PowerShell function parameter boundary. Name that scalar input serializedArgumentVector; do not pass the child vector through a mandatory [string[]] parameter or through PowerShell's automatic $args. The expected scenario vector is fixed synthetic data and includes the absolute probe path, mode, ordinary strings, an intentional empty string, duplicates where tested, paths with spaces, embedded quotes, backslashes before quotes, trailing backslashes, and shell-significant characters. Serialize it once as JSON. Retain the exact serialized value and its expected element count before decoding. A JSON empty string element must remain the two-character JSON token "" in the encoded vector and a zero-length string after decoding.

Inside the temporary launcher, parse the scalar JSON value with a Windows PowerShell 5.1-compatible array-preserving JSON API. The preferred candidate is the existing .NET Framework System.Web.Script.Serialization.JavaScriptSerializer from System.Web.Extensions, if available on the host without installing or changing a dependency. Obtain its parsed array as one indexable object, not as pipeline output that could discard or coerce empty elements. Validate that the root is an array and every element is a non-null string. Allocate a new local [string[]] of exactly the parsed length and copy each element by index, including zero-length values and duplicates. Do not pass this decoded vector through another mandatory array parameter. If this framework parser is unavailable or cannot prove exact round-trip behavior on the host, stop before Smoke v3 and request a separate method decision; do not silently substitute an unverified parser.

The caller and launcher must not evaluate decoded text as PowerShell code, interpolate it into a shell command, or normalize away empty or duplicate elements. The JSON scalar transport is data, never an executable command string. No new repository dependency or package version is proposed.

## Mandatory T0 transport-integrity gate

Before any Node child starts, perform and retain a T0 result for the echo scenario and repeat the decoded-vector checks for every later child scenario:

1. Confirm the serialized JSON scalar is present, nonempty, and valid JSON whose root is an array.
2. Record the encoded expected element count, decoded element count, and every expected/decoded element at the same index. Compare with ordinal string equality and require exact order and duplicates.
3. Require the intentional empty string at its specified index; do not replace it with null, omit it, or remove it to obtain a passing run.
4. Reject null, non-string, unexpected extra/missing, or reordered elements.
5. Require element zero to be the exact existing absolute probe/script path and record that path separately.
6. Require the decoded count to equal both the encoded count and the scenario's fixed expected count.
7. Retain the serialized input, count checks, empty-index check, per-index comparison, probe-path check, result, and UTC time.

Any T0 failure is FAIL before Process.Start. Record S1–S9 as Not Reached and perform only the passive S10 side-effect check. Never continue to quoting or Node on a T0 mismatch.

## Four separate launcher layers

1. **Input transport:** one JSON array string crosses the PowerShell function binder.
2. **Decoded child vector:** strict array parsing and indexed copying yield a local [string[]] with exact element values/count/order.
3. **Windows quoting:** after T0 PASS, apply one deterministic quoting function independently to each decoded string. Keep the v1.1 rules: reject NUL, quote even empty strings, double backslashes before embedded quotes with one additional escape, double trailing backslashes, leave other characters unchanged, and join quoted arguments with one space. Shell-significant characters remain literal data.
4. **Process creation:** set the existing absolute node.exe as ProcessStartInfo.FileName and the single constructed quoted string as ProcessStartInfo.Arguments. UseShellExecute=false, redirected asynchronous stdout/stderr, bounded wait, and taskkill /PID /T /F tree cleanup remain as designed. Do not use ProcessStartInfo.ArgumentList.

The pre-launch checks from v1.1 remain: executable and probe exist, dedicated variable naming, expected/actual nonzero argument counts where required, exact probe in element zero and in the constructed invocation, and nonempty ProcessStartInfo.Arguments when a script is required. Binding/JSON/T0 errors must be distinguishable from quoting, child exit, timeout, and test failures.

## Proposed new non-formal Smoke v3

Smoke v3 is a distinct one-time attempt labeled **Non-Formal Launcher Smoke Validation — Not OE-12 Operational Evidence**. Its authorization record starts Proposed / Not Authorized. No capture ID or formal Run ID is assigned by this preparation. After this amendment is published and a separate owner decision authorizes one Smoke v3, execute T0 first. Only if T0 PASS may the unchanged S1–S10 scope from v1.1 run: correct Node/probe launch and exact process.argv; ordinary, empty, duplicate, quote/backslash/path arguments; space-containing paths; exact stdout/stderr; exact nonzero exit; bounded timeout; proven child-tree termination or explicit Needs Clarification; shell-significant text as data with no side effect; and zero formal OE-12 side effects. Retain pre-launch counts, serialized/decoded arrays, expected/actual process.argv, stream captures, exit codes, PIDs, timestamps, timeout/termination results, and case results. PASS requires T0 and every mandatory S1–S10 behavior. Failure or uncertainty is preserved as a new immutable tooling record and never silently repaired or rerun.

Formal retry 0003 remains unavailable until v1.2 is published, Smoke v3 is separately authorized, Smoke v3 executes with T0 and S1–S10 PASS, that PASS is retained immutably, and the owner separately authorizes formal 0003. A Smoke v3 PASS alone does not allocate or execute formal 0003.

## Scope and current state

The proposed change is confined to future temporary test-execution tooling outside repository implementation paths and these governance documents. No OE-12 fixture/integration test, production/runtime source, dependency, lockfile, migration, repository configuration, Git setting, .gitattributes, live tenant data, ingestion, RAG, embedding, indexing, vector write, retrieval, deployment, credential, secret, or traffic change is required or authorized. The committed-byte SHA-256 model for any separately authorized formal retry remains unchanged.

OE-12 remains Not Executed; operational evidence remains 11 Accepted / 0 Awaiting Independent Review / 4 Not Executed. Formal retry 0003 remains Not Authorized. OE-08, OE-14, OE-15 and SIR02-DEF-02 at Missing / Not Reviewed remain unchanged. SIR-02 remains Blocking.
