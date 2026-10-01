# SIR-02 KM OE-12 Job Membership Diagnostic v2 Pre-Execution Readiness v1.0

## Boundary and decision

| Field | Value |
| --- | --- |
| Classification | **Non-Formal Tooling Diagnostic — Not OE-12 Operational Evidence** |
| Readiness result | **Ready for Authorized Diagnostic v2 Execution** |
| Execution in this preparation step | **Not performed**; no Diagnostic v2 token or runtime membership evidence was generated |
| Authorized attempt | One non-formal Diagnostic v2 attempt only, after the external D0 source-integrity gate passes |
| Attribution analysis | `9136b1aa0a49e7753efd9e23d652787d6d398549` |
| Authorization decision | `2f9cfcc687e376ab8ff5372886e8820ea5cce2bb` |
| Authorization linkage | `346793104887b2ac6d5e268b82026fa4cfe57fca` |
| Prior Diagnostic v1 | Source/readiness `f66ab4f3e3635ef06529506b27550247aa746d11`; FAIL evidence `def523aa2b27dfdf4ceff8b349a12808aee47844` remains unchanged |
| Accepted OE-12 implementation | `826376cc84521a5d648462fdcc985cd2d412a24c`, unchanged |

This readiness decision concerns only the static source package and its safety boundary. It does not certify an observed Job membership, consume the authorized v2 attempt, approve launcher v1.4, approve Smoke v5, authorize formal retry `0003`, or change OE-12 status. A missing, changed, or unverified source byte at execution time requires **STOP** before launching any diagnostic process.

## Exact source package

| Source | SHA-256 of prepared source bytes |
| --- | --- |
| `docs/governance/sir-02/controls/oe-12-job-membership-diagnostic-v2-source-v1.0/launcher.ps1` | `6276b8e40bfccd99ae4acf959c3732c985c1e0d6a65aee57fbc6ad5b92b0e1c2` |
| `docs/governance/sir-02/controls/oe-12-job-membership-diagnostic-v2-source-v1.0/native-helper.cs` | `bc194a73c976d8e76005538da239954fe1e10d995a33225a73320ac3af449ce7` |
| `docs/governance/sir-02/controls/oe-12-job-membership-diagnostic-v2-source-v1.0/probe.cjs` | `2546442b748673902aefcb5c3ac66e862fdeb291ec1966f69e5856ae471d86dc` |
| `docs/governance/sir-02/controls/SIR-02-KM-OE-12-JOB-MEMBERSHIP-DIAGNOSTIC-V2-EXACT-SOURCE-BUNDLE-v1.0.zip` | `9f4876b992cda7148ff7d0f62fd3194ed4923fd7263e93daebef8e92816b5a11` |

The ZIP contains exactly `launcher.ps1`, `native-helper.cs`, and `probe.cjs`. Its three entries matched the prepared source files byte for byte. The source and bundle are to be committed as a single immutable package; a post-commit blob-to-source and blob-to-ZIP comparison is required before this readiness record is relied upon.

## D0 source-integrity gate before the one authorized execution

The future operator must independently verify the published bundle SHA-256, all three committed Git blobs, the three ZIP entries, and the extracted runnable files byte for byte. The bundle expected value is `9f4876b992cda7148ff7d0f62fd3194ed4923fd7263e93daebef8e92816b5a11`. The operator must retain a separate integrity receipt with `bundleSha256`, the three named source SHA-256 values, and booleans `bundleVerified`, `committedSourceVerified`, and `extractedSourceVerified`; each boolean must be true only after its direct comparison. The launcher independently recalculates the three local source hashes, requires the receipt and the expected bundle hash, and stops before creating the Job or Node parent if they disagree. The receipt is an execution input, not an assertion that this preparation step already performed extraction or execution.

After that independent D0 check, the exact noninteractive launcher invocation is:

```powershell
powershell.exe -NoProfile -NonInteractive -File "<verified-extracted-v2-source>\launcher.ps1" -IntegrityReceiptPath "<retained-D0-receipt.json>" -ExpectedBundleSha256 "9f4876b992cda7148ff7d0f62fd3194ed4923fd7263e93daebef8e92816b5a11"
```

The operator must apply an independent finite watchdog to the entire invocation and retain stdout, stderr, exit code, start/end UTC times, capture directory, and every partial result. The launcher creates its diagnostic token only when invoked: `SIR02-OE12-JOB-MEMBERSHIP-DIAGNOSTIC-V2-<UTC yyyyMMddTHHmmssfffZ>`. Do not preallocate or reuse the token. Any source-integrity failure consumes no diagnostic runtime evidence and must stop before a process is launched.

## Expected topology and identity evidence

The launcher is Windows PowerShell 5.1. `native-helper.cs` is compiled **in that process**, so it creates no helper process. A fresh anonymous Job with verified zero limit flags contains one synthetic Node parent explicitly assigned while suspended, then resumed. At most one OS-managed `conhost.exe` may additionally appear. There is no watchdog child, second Node/application process, arbitrary Job member, network call, privilege elevation, or live OE-12 fixture/test invocation.

For the Node parent, the launcher retains the CreateProcess-owned PID and handle-bound creation time, exact executable image, CIM parent PID and creation time, exact command line, unique v2 token, synthetic ready record, session ID, explicit assignment, Job membership, and pre-release liveness. Native and CIM creation times must agree within one second. Missing or contradictory identity fields fail closed.

For each observed member, the launcher retains PID, full image path, CIM parent PID, native and CIM creation times, session ID, command line if available, pre-release process state, exact Job membership, an observation timestamp, evidence sources, per-field query errors, and the member classification. A conhost token is **not required**: absence is neutral and is never used as proof of safety. The trusted conhost path comes from `GetSystemDirectoryW` plus `conhost.exe`, compared to the queried full image path, not to a basename.

The pre-release classifications are exactly `Allowlisted — Explicitly Assigned Synthetic Parent`, `Candidate — OS-Managed Console Host for Current Synthetic Parent`, and `Unknown / Not Allowlisted`. The candidate requires the trusted full image, parent PID equal to the exact Node PID, creation no earlier than Node and within five seconds of Node creation, native/CIM time agreement, matching available sessions, confirmed membership, and liveness. A second membership query must equal the first before release. The acceptable set is exactly the one allowlisted Node plus zero or one candidate conhost, with no Unknown member. Any unclassified, unrelated, second application, second conhost, changed member set, or missing parent fails closed.

## Lifecycle correlation and cleanup

The launcher retains a read-only handle for the candidate conhost, bound to its PID and creation time. It signals the exact synthetic Node via a release file and waits up to **12,000 ms** for cooperative or natural exit. The Node probe also has an independent **10,000 ms** natural-exit timer. If the owned Node remains, the helper may use `TerminateProcess` only on its reverified exact CreateProcess-owned parent handle, with a further **2,000 ms** wait; that fallback is explicitly recorded and **disqualifies PASS**. No other PID is a termination target.

After parent exit, the launcher checks the original process identity and queries whether the Node PID is absent. The conhost must still be alive immediately after the observed parent exit; the same retained creation-bound conhost handle is then observed for a separate **5,000 ms** window. Only its natural exit during that window promotes the candidate to `Allowlisted — OS-Managed Console Host for Current Synthetic Parent`. If exit order, identity, absence, or bounded exit cannot be proved, the decision is `Needs Clarification` or `FAIL — Unknown or Unsafe Member Present`. No conhost is terminated to obtain PASS.

The Job uses zero limit flags and no kill-on-close setting. Its handles close only after cleanup and lifecycle observation; handle closure is not a destructive test. The source contains **no** `TerminateJobObject`, Job-wide termination, kill-on-close acceptance action, conhost termination, unknown-member termination, or manual kill as PASS evidence. All observed native/API calls are recorded with operation name/class, target PID or handle where applicable, purpose, success, Win32 error code, and sanitized error text. The only possible decisions are `PASS — Complete Job Membership Attributed`, `FAIL — Unknown or Unsafe Member Present`, and `Needs Clarification`.

## Native/API inventory and static validation

The helper uses `CreateJobObjectW`, `SetInformationJobObject`, `QueryInformationJobObject` for limits and member PIDs, `CreateProcessW`, `AssignProcessToJobObject`, `IsProcessInJob`, `ResumeThread`, `GetProcessTimes`, `QueryFullProcessImageNameW`, `ProcessIdToSessionId`, `GetSystemDirectoryW`, `OpenProcess` with query/synchronize access, `WaitForSingleObject`, and `CloseHandle`. `TerminateProcess` exists solely in the guarded exact-owned-parent cleanup fallback described above. The PowerShell launcher uses local `Get-CimInstance` for process identity. It does not invoke application runtime code.

| Pre-execution validation | Result |
| --- | --- |
| Windows PowerShell parser on `launcher.ps1` | PASS; zero parse errors; script not invoked |
| `Add-Type -Path native-helper.cs` | PASS; compiled with no `NativeSession` instance |
| Existing `node.exe --check probe.cjs` | PASS; syntax only; probe not invoked |
| Source ZIP comparison | PASS; all three entries match their source bytes |
| Prohibited-action source scan | PASS for unauthorized paths; no Job-wide termination, kill-on-close action, conhost kill, unknown-member kill, process spawn in probe, or network API. The sole `TerminateProcess` call is exact-owned-parent fallback and cannot yield PASS |

No diagnostic, smoke, Vitest, or formal OE-12 scenario ran during this preparation. No runtime membership observation exists from v2 yet. No implementation, dependency, migration, production/runtime source, repository configuration, Git setting, or `.gitattributes` was changed. Formal attempts `0001`/`0002`, Smokes v1–v4, and Diagnostic v1 remain immutable. Launcher v1.4 remains blocked; Smoke v5 and formal retry `0003` remain **Not Authorized**. OE-12 remains **Not Executed**; operational evidence remains **11 Accepted / 0 Awaiting Independent Review / 4 Not Executed**. `SIR02-DEF-02` remains **Missing / Not Reviewed**, and SIR-02 remains **Blocking**.
