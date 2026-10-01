# OE-12 Job Membership Diagnostic v2 — One Non-Formal Attempt

**Classification:** Non-Formal Tooling Diagnostic — Not OE-12 Operational Evidence

**Token:** `SIR02-OE12-JOB-MEMBERSHIP-DIAGNOSTIC-V2-20260928T012331298Z`

**Decision:** **Needs Clarification**
**Attempts:** One authorized v2 attempt; no retry.

## Immutable lineage and source gate

| Reference | Identity |
| --- | --- |
| Conhost attribution analysis | `9136b1aa0a49e7753efd9e23d652787d6d398549` |
| Diagnostic v2 authorization and linkage | `2f9cfcc687e376ab8ff5372886e8820ea5cce2bb`; `346793104887b2ac6d5e268b82026fa4cfe57fca` |
| Exact source/readiness | `ad675cf4de409fc9e675d4f3c595114d1d7f914a` |
| Exact bundle SHA-256 | `9f4876b992cda7148ff7d0f62fd3194ed4923fd7263e93daebef8e92816b5a11` |
| V2-D0 | **PASS**: published ZIP hash, committed source blobs, retained sources, extracted runnable bytes, and clean worktree matched before launch. See `d0-source-integrity.json`. |

The exact extracted `launcher.ps1` was invoked once using Windows PowerShell 5.1. `invocation.json`, `stdout.txt`, and `stderr.txt` retain the command, timestamps, elapsed `2,189 ms`, `60,000 ms` watchdog, exit code `1`, and raw output. The watchdog did not time out or terminate the launcher. The original `raw-result.json`, `parent-ready.json`, and `parent-release.flag` are retained byte for byte. The derived JSON files present direct views of that raw capture; they do not replace it.

## Identity, membership, and causal result

| Check | Retained result |
| --- | --- |
| Synthetic Node parent | PID `22240`; image `C:\Program Files\nodejs\node.exe`; parent PID `22532` (diagnostic launcher); session `4`; unique v2 token and exact probe path in command line; creation time bound to the CreateProcess-owned handle; explicit Job assignment and membership; pre-release alive. All recorded Node identity checks passed. |
| Initial and confirmatory Job-member sets | Both `{22240, 39056}`. The required Node was present, and the only additional member was PID `39056`. The source's generic `unexpectedMemberPidSet` names the non-parent PID; it is **not** a final unsafe classification. |
| Conditional conhost | PID `39056`; full image `C:\Windows\System32\conhost.exe` matched the trusted system path; CIM parent PID `22240`; session `4`; confirmed Job membership; alive before release; native creation `239,387` 100-ns ticks (`23.9387 ms`) after Node creation. All retained pre-release conhost criteria passed. Token absence on conhost was neutral. |
| Pre-release allowlist | **PASS** for one explicitly assigned Node and one **candidate** conhost. No Unknown / Not Allowlisted member was observed in either pre-release snapshot. |
| Node cleanup | Release signal issued; exact owned Node exited within the `12,000 ms` bound and was no longer alive; its PID was absent on the subsequent CIM check. No exact-owned-parent termination fallback was used. |
| Conhost lifecycle | At the immediate check after the observed Node exit, the retained creation-bound conhost handle was already signaled (not alive). The capture does **not** establish whether conhost exited before or after Node. No separate post-parent `5,000 ms` wait could observe a later natural exit. Final conhost allowlisting is **unproven**. |

The raw lifecycle timestamps are retained in `raw-result.json` and `lifecycle-correlation.json`. The absence of conhost at the immediate post-parent check cannot be promoted into proof of the required exit order. The exact final decision is therefore **Needs Clarification**, even though the pre-release attribution and cooperative Node cleanup passed. There were `46` native/API records, `0` failed native steps, `0` `TerminateProcess` calls, `0` Job-wide termination calls, `0` unidentified-member terminations, and verified zero Job limit flags. Handle cleanup succeeded. See `native-api-summary.json` and `cooperative-cleanup.json`.

## Retained package and governance boundary

This package retains: D0 source-integrity result, invocation and output, unmodified raw result and parent probe records, complete member inventory, expected-versus-observed comparison, Node identity, conhost attribution, pre-release allowlist, lifecycle timeline, native/API results, cleanup result, this validation record, and a SHA-256 manifest with separate manifest sidecar. Every derived value is traceable to the named raw files.

Diagnostic v2 is **not sufficient** to begin a launcher v1.4 design step. Do not retry this consumed v2 attempt or infer conhost ownership/lifecycle from PID absence. Diagnostic v1, Smokes v1–v4, and formal attempts `0001`/`0002` remain unchanged. Launcher v1.4 remains blocked, Smoke v5 and formal OE-12 retry `0003` remain **Not Authorized**. OE-12 remains **Not Executed**; operational evidence remains **11 Accepted / 0 Awaiting Independent Review / 4 Not Executed**. `SIR02-DEF-02` remains **Missing / Not Reviewed**, and SIR-02 remains **Blocking**.
