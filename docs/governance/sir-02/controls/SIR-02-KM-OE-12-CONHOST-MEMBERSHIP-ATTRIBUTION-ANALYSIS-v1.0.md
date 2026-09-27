# SIR-02 KM OE-12 Windows Console Host Membership Attribution Analysis v1.0

## Classification and evidence boundary

This is a read-only platform and evidence analysis. It is **not** OE-12 operational evidence, a rerun of Job Membership Diagnostic v1, a launcher v1.4 design, or authorization for Diagnostic v2, Smoke v5, or formal retry `0003`.

| Reference | Immutable identity |
| --- | --- |
| Class B Smoke v4 forensic analysis | `fa656ca968129bbb6dea05e853c66d859ae5f1b1` |
| Diagnostic v1 authorization and linkage | `70755e8571e8c2ccf8bdf182064993f1a91511e1`; `209f84a30c80bfe9ab8683273e1893b64618f3a9` |
| Diagnostic v1 source/readiness | `f66ab4f3e3635ef06529506b27550247aa746d11` |
| Diagnostic v1 executed evidence | `def523aa2b27dfdf4ceff8b349a12808aee47844` |
| Diagnostic v1 token | `SIR02-OE12-JOB-MEMBERSHIP-DIAGNOSTIC-20260927T231728980Z` |
| Diagnostic v1 result | **FAIL — Unknown or Unsafe Member Present**; the exact raw field's malformed dash is retained in the immutable raw artifact |

The v1 expected member set was `{37444}`. The observed set was `{33504, 37444}`. PID `37444` was the synthetic Node parent created with `CreateProcessW`, explicitly assigned to the new Job, and independently identified. PID `33504` was recorded as `C:\Windows\System32\conhost.exe`, with CIM parent PID `37444`, creation about 10 ms after the Node parent, and confirmed membership in that Job. It had no diagnostic token and was not explicitly assigned or allowlisted by v1. Its raw `inheritedMembership=false` value means v1 did **not establish** inherited membership; it is not affirmative proof of a different creation path. The raw `parentReadyRecordMatches=true` on the conhost row checks the **Node parent's** ready record globally and does not identify the conhost. A later read-only check found both PIDs absent, without proving the conhost's precise exit cause or lifetime relationship.

The prior Smoke v4 PID `45200` remains **unidentified from its own retained evidence**. The v1 observation of PID `33504` must not be projected backward onto PID `45200`. Smoke v4 remains FAIL, including its separately recorded Job-wide fallback safety finding.

## Microsoft platform behavior and limits of inference

- Microsoft's [Windows Console definitions](https://learn.microsoft.com/en-us/windows/console/definitions) describe `conhost.exe` as the Windows Console Host and the server for Windows Console APIs used by command-line applications. Microsoft's [console creation documentation](https://learn.microsoft.com/en-us/windows/console/creation-of-a-console) explains that Windows may create a console when a console process starts. These are platform-role facts, not instance-level attribution of PID `33504`.
- Microsoft's [Job Objects documentation](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects) states that, by default, a process associated with a Job passes Job association to child processes it creates through `CreateProcess`, unless applicable breakaway behavior is enabled. The v1 Job reported effective limit flags `0`, including no configured breakaway or kill-on-close. Thus a Job can contain a child or support process in addition to the explicitly assigned parent. This does not establish how this particular conhost entered the Job.
- The same [Job Objects documentation](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects) distinguishes ordinary Job membership from authorization to act on all members and describes Job-wide termination and kill-on-close effects. No platform statement makes a PID safe to terminate merely because its name, parent PID, or Job membership matches a plausible console topology.

**Topology-assumption assessment: `Incomplete for Windows Console Host behavior`.** The v1 assertion that a correct Windows console-process Job must contain exactly one Node PID was narrower than the platform behavior permits. The observed `conhost.exe` is consistent with a possible Windows console companion, but this is an inference, not a conclusive attribution. The v1 FAIL decision remains correct under its approved exact-one-member allowlist and is not changed by this analysis.

## Proposed deterministic conhost attribution criteria

A future Diagnostic v2 may label **at most one** additional member `Allowlisted — OS-Managed Console Host for Current Synthetic Parent` only when every criterion below is independently retained and satisfied. A missing, inaccessible, contradictory, or racing field fails closed; an image name or parent PID alone is insufficient.

1. **Trusted image identity:** resolve the member's full executable path with a process-handle query, normalize it against the active Windows system directory, and confirm that it is the expected Windows `conhost.exe` binary. Record the canonical path and the evidence used to establish trust. A basename match alone fails.
2. **Exact parent identity:** the observed parent PID equals the conclusively identified synthetic Node PID, and the Node PID remains bound to its retained process handle and creation time so PID reuse cannot masquerade as the parent.
3. **Causal creation time:** retain native and available CIM creation times for both processes. The conhost must not predate the synthetic parent and must appear within the current diagnostic's bounded parent lifecycle. Disagreement or unavailable timing is unresolved.
4. **Job membership and session:** independently confirm both processes in the exact newly created Job and compare Windows session IDs where the platform exposes them. A missing or conflicting session result cannot be silently ignored.
5. **Process role and origin:** retain the conhost image, parent PID, command line where safely available, creation identity, and available console/process creation evidence. It must fit the approved OS-console-companion role. No diagnostic token on conhost is **neutral**: OS-created infrastructure may not receive application arguments; token absence alone proves neither safety nor danger. The token must still identify the Node parent.
6. **Complete member set:** the Node parent is the only explicitly assigned application process. There is no second Node or other application process, no unrelated executable, no second conhost, and no unidentified PID. The conhost must not be promoted to an approved role merely to make counts match.
7. **Non-destructive lifecycle correlation:** capture the conhost's PID **and creation identity** while Node is alive. After cooperative Node release and verified natural exit, observe whether that same conhost identity exits within a finite bound, without terminating it or using any Job-wide action. PID absence alone, without identity and timing, is insufficient. A conhost that persists, is replaced, or cannot be reidentified remains unresolved.

The revised expected safe member model is **required `{exact synthetic Node parent}` plus optional `{one conclusively attributed Windows conhost.exe companion}`**. PASS is permitted only when the observed set equals that model and every observed member is conclusively attributed. Disallowed members include an unidentified PID, unrelated executable, second application process, wrong-parent conhost, unmatched session, uncorrelated creation/lifecycle, or any member with incomplete identity evidence. A conditional companion is never a wildcard allowance for arbitrary descendants.

## Proposed non-destructive Diagnostic v2 method

Diagnostic v2's question is whether an extra Job member is deterministically attributable to Windows Console Host infrastructure for the **current** synthetic Node parent and whether the complete member set can be safely allowlisted without guessing. Its proposed topology is PowerShell launcher with an in-process native helper, one explicitly assigned synthetic Node parent, and **conditionally** one OS-managed conhost member. It must distinguish explicit assignment from observed/inherited membership and record uncertainty as uncertainty.

Before any release, retain the Node and any conhost PID, handle-bound creation time, full image path, parent PID, session ID when available, command line, Node diagnostic-token presence, exact Job membership, Job limit flags, source and timestamp of each observation, expected set, observed set, and allowlist decision. Retain sanitized native/CIM errors and any missing fields. Then signal only the known Node parent through the existing cooperative mechanism, wait within fixed bounds, and query the same creation-bound process identities after Node exit. No unknown member is signalled or killed. A zero-limit Job handle may be closed only after confirming no kill-on-close behavior; closure is not a destructive test. A targeted fallback, if ever separately permitted for the exact owned parent, disqualifies PASS. No `TerminateJobObject`, kill-on-close test, unknown-member termination, manual conhost kill, or S7/S8 acceptance test is permitted.

If later authorized and executed, Diagnostic v2 must return exactly one of `PASS — Complete Job Membership Attributed`, `FAIL — Unknown or Unsafe Member Present`, or `Needs Clarification`. PASS would support **considering** a later launcher v1.4 design with a deterministic OS-companion allowlist gate; it would not itself approve v1.4, Smoke v5, formal retry `0003`, or OE-12. FAIL or Needs Clarification leaves those gates blocked. Raw observations and any failed or partial v2 attempt would need immutable preservation without overwriting v1.

## Unchanged governance state

Diagnostic v1 remains **FAIL**; Smoke v4 remains **FAIL**; Smoke v5 and formal retry `0003` remain **Not Authorized**. Launcher v1.4 is blocked pending a separately authorized and conclusive Diagnostic v2. OE-12 remains **Not Executed**; operational evidence remains **11 Accepted / 0 Awaiting Independent Review / 4 Not Executed**. `SIR02-DEF-02` remains **Missing / Not Reviewed**; SIR-02 remains **Blocking**. No implementation, fixture/test, production/runtime, dependency, migration, configuration, Git-setting, or historical evidence change is made by this analysis.
