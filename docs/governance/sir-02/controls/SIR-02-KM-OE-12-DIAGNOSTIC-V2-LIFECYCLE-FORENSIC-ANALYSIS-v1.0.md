# SIR-02 KM OE-12 Diagnostic v2 Lifecycle and Exit-Chronology Forensic Analysis v1.0

## Boundary and conclusion

**Classification:** Read-only forensic analysis of a non-formal tooling diagnostic; **not OE-12 operational evidence**.

**Exit chronology classification:** **Class B — Exit Chronology Not Retained**.

**Diagnostic v2 result:** `Needs Clarification`, unchanged.
**Further execution in this analysis:** None.

The retained v2 evidence proves that the exact Node parent and candidate conhost were alive before release and that both handles were signaled by the later post-parent check. It does **not** retain either process's kernel exit time. The conhost was already signaled when checked immediately after the observed Node exit. That observation cannot establish which process exited first, whether conhost exited after the cooperative release, or the elapsed time between exits. No later PID check can recover the missing timing from the original handles; the v2 session closed those handles.

## Immutable evidence inspected

| Reference | Identity and result |
| --- | --- |
| Conhost attribution analysis / v2 proposal | `9136b1aa0a49e7753efd9e23d652787d6d398549` |
| V2 authorization and linkage | `2f9cfcc687e376ab8ff5372886e8820ea5cce2bb`; `346793104887b2ac6d5e268b82026fa4cfe57fca` |
| Exact executed v2 source and readiness | `ad675cf4de409fc9e675d4f3c595114d1d7f914a` |
| Single v2 attempt | `SIR02-OE12-JOB-MEMBERSHIP-DIAGNOSTIC-V2-20260928T012331298Z`; evidence commit `8b2977e2e14e93185cb9cafece80d35371209dcb`; decision `Needs Clarification` |
| Source integrity | V2-D0 PASS; source bundle SHA-256 `9f4876b992cda7148ff7d0f62fd3194ed4923fd7263e93daebef8e92816b5a11` |
| Retained evidence integrity | `16/16` payload SHA-256 values MATCH; `18/18` committed file bytes MATCH; manifest SHA-256 `e2912084fa40c58787553cdd04a2415d339f43bc0a3bdbf5a2ec2e99a1b40669` |

Read-only inspection covered `validation.md`, `raw-result.json`, `job-member-inventory.json`, `membership-comparison.json`, `node-identity.json`, `conhost-attribution.json`, `pre-release-allowlist.json`, `lifecycle-correlation.json`, `native-api-summary.json`, `cooperative-cleanup.json`, `d0-source-integrity.json`, `parent-ready.json`, `parent-release.flag`, `invocation.json`, stdout/stderr, the manifest/sidecar, and the exact `launcher.ps1`, `native-helper.cs`, and `probe.cjs` at the source commit. The manifest and sidecar were recomputed read-only and matched. Nothing in the v2 evidence or source was altered.

## Retained lifecycle data and limits

| Process | Retained original-handle facts | Exit timing that is **not** retained |
| --- | --- | --- |
| Synthetic Node parent PID `22240` | Full image `C:\Program Files\nodejs\node.exe`; launcher parent PID `22532`; session `4`; exact token/command line; explicit Job assignment and membership; native creation FILETIME `134350322119225337`; nonsignaled pre-release `WaitForSingleObject` result `258`; signaled owned-handle wait result `0` within the 12-second bound; later same-creation handle signaled and PID absent. Cooperative release was recorded at `2026-09-28T01:23:32.5535361Z`. | No native/kernel Node exit FILETIME. `parentExitUtc=2026-09-28T01:23:32.5775381Z` is a **launcher observation timestamp recorded after the wait**, not the kernel's process exit timestamp. |
| Candidate conhost PID `39056` | Trusted full image `C:\Windows\System32\conhost.exe`; parent PID `22240`; session `4`; confirmed Job membership; native creation FILETIME `134350322119464724` (23.9387 ms after Node creation); nonsignaled before release (`258`), including on its retained handle; immediately post-parent, that same retained handle was signaled (`0`). | No native/kernel conhost exit FILETIME; `conhostExitObservedUtc` is `null`; `conhostExitedNaturally` is `null`. The separate 5-second post-parent wait was not entered because the handle was already signaled. The native API step has no timestamp for the immediate conhost observation. |

Both pre-release Job-member queries returned `{22240, 39056}`. All recorded Node identity checks, candidate conhost image/parent/creation/session/Job checks, and the pre-release allowlist passed. The conhost had no v2 token; that absence is neutral under the approved attribution analysis. Cleanup recorded zero native API failures, zero exact-parent fallback calls, zero prohibited actions, and successful handle closure. These facts support the **pre-release** topology only. They do not close the final lifecycle criterion.

## Exact-source measurement finding

The native helper declared `GetProcessTimes` with creation, exit, kernel, and user outputs, but its `Creation(IntPtr)` helper returned **only** creation time and discarded the exit output. It called `WaitForSingleObject` to establish nonsignaled/signaled state. It did **not** call `GetExitCodeProcess`. `RetainedConsoleHostAliveAfterParent()` checked the retained conhost handle after the Node wait; when that handle was already signaled, the launcher did not enter `WaitForRetainedConsoleHostExit(5000)`. The launcher assigned `parentExitUtc` using `DateTime.UtcNow` after Node's wait and left conhost exit-observation fields null. The native/API result summary retains wait codes and creation times but no kernel exit time for either PID. The handles were retained long enough to permit a timing query while the diagnostic was active, then closed by `Dispose()`; they cannot be queried retrospectively from this immutable record.

The conhost may have exited after its final pre-release alive check and **before** cooperative release, between release and Node exit, or between Node exit and the immediate conhost check. The retained observations cannot distinguish these intervals. A signaled handle proves terminated state when observed; it does not supply an exact exit timestamp. Later PID absence, platform plausibility, and a successful pre-release allowlist are not substitutes. No retained timing fields conflict, so **Class C** does not apply; **Class A** lacks the required original-handle exit times.

## Narrow next proposal and unchanged gates

A separately authorized **Diagnostic v3** is required to measure the missing exit chronology on exact retained process handles. Its proposed scope is limited to lifecycle timing observability; it must keep the v2 membership model, synthetic topology, identity checks, cooperative release, non-destructive cleanup, and fail-closed decisions. The companion authorization proposal is `SIR-02-KM-OE-12-JOB-MEMBERSHIP-DIAGNOSTIC-V3-AUTHORIZATION-v1.0.md`, initially **Proposed / Not Authorized**. No v3 source, token, bundle, or process is created here.

Windows Job Objects normally associate child processes with a parent's Job unless applicable breakaway behavior applies, and `conhost.exe` is Windows console infrastructure, as documented in the immutable attribution analysis. These platform facts explain why the extra member is plausible; they cannot determine the exit order of PIDs `22240` and `39056`.

Diagnostic v2 remains `Needs Clarification`; Diagnostic v1 and Smokes v1–v4 remain unchanged. Launcher v1.4 remains blocked; Smoke v5 and formal OE-12 retry `0003` remain **Not Authorized**. OE-12 remains **Not Executed**. Operational evidence remains **11 Accepted / 0 Awaiting Independent Review / 4 Not Executed**; `SIR02-DEF-02` remains **Missing / Not Reviewed**; SIR-02 remains **Blocking**.
