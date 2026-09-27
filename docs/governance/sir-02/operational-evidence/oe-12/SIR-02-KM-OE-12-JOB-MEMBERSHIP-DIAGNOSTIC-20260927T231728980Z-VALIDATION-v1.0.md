# OE-12 Job Membership Diagnostic Validation v1.0

## Classification and authority

**Non-Formal Job Membership Diagnostic — Not OE-12 Operational Evidence.** This record preserves the one diagnostic authorized by decision `70755e8571e8c2ccf8bdf182064993f1a91511e1` and linkage `209f84a30c80bfe9ab8683273e1893b64618f3a9`, following the Class B forensic basis `fa656ca968129bbb6dea05e853c66d859ae5f1b1`. The exact source/readiness commit was `f66ab4f3e3635ef06529506b27550247aa746d11`. No formal OE-12 Run ID or Smoke v5 ID was allocated.

| Field | Retained result |
| --- | --- |
| Diagnostic token | `SIR02-OE12-JOB-MEMBERSHIP-DIAGNOSTIC-20260927T231728980Z` |
| Launcher invocation | `powershell.exe -NoProfile -NonInteractive -File <verified extracted launcher.ps1>` |
| Extracted source directory | `C:\Users\gantu\AppData\Local\Temp\sir02-oe12-job-membership-source-20260927T231653057Z` |
| Launcher start/end UTC | `2026-09-27T23:17:28.6693776Z` / `2026-09-27T23:17:29.9488834Z` |
| Launcher elapsed / exit code | `1,273 ms` / `1` |
| Diagnostic start/end UTC | `2026-09-27T23:17:28.9805222Z` / `2026-09-27T23:17:29.9071000Z` |
| Windows PowerShell / Node | `5.1.26100.9444` / `C:\Program Files\nodejs\node.exe`, `v22.23.2` |
| Final diagnostic result | Raw field: **`FAIL â€” Unknown or Unsafe Member Present`**; semantic classification: **FAIL — Unknown or Unsafe Member Present** |

## Gate D0 and retained artifact integrity

Gate D0 passed before the launcher started. The exact ZIP SHA-256 matched `36078a74ee4dc28ded28c955a498dee5b2d7d1a0d1032b3c0a85e5fbf4db6160`. It contained exactly `launcher.ps1`, `native-helper.cs`, and `probe.cjs`. Each extracted file matched its worktree source and the blob in commit `f66ab4f3e3635ef06529506b27550247aa746d11` byte for byte:

| Source | SHA-256 |
| --- | --- |
| `launcher.ps1` | `a7ef17603b9813da8123c3921915bf2a79c364513c45df208be106e06ed2bcc1` |
| `native-helper.cs` | `debeb08b020025ccb54f14597378619caea2a060609bcf478dbf63048137f8e5` |
| `probe.cjs` | `a10bcd3cdf67dad050104c53628a551041be42cb3218580836a270c452844175` |

The retained files below were staged as exact captured bytes, without Git line-ending conversion. These SHA-256 values were calculated from the staged blob bytes and matched the captured files byte for byte. The raw result, Gate D0 result, launcher attempt, ready signal, release signal, stdout, and stderr remain separately identifiable.

| Retained file suffix | SHA-256 of exact staged bytes |
| --- | --- |
| `-GATE-D0-v1.0.json` | `14cc7adea825bf557f5683757549f8850c8d6d68b038122edfa3d3e69ebf05e7` |
| `-ATTEMPT-v1.0.json` | `f73e07ddab5d42ff51f005bc8b7b576de05f5c13b942314004499bbb3f055fb1` |
| `-RAW-v1.0.json` | `f73aa112c16f142439bd9e8f50f620b1360dac0842cf3ad8fc559eabe6e6ea11` |
| `-PARENT-READY-v1.0.json` | `e94f6656b104ec753da39144dc7bc4da4630de14c70d1bd17b2aa8d4f3ae6ef1` |
| `-PARENT-RELEASE-v1.0.txt` | `a66666bc9d1c3c2e271e372f1ce7a7a4c0c50d5fe2e87722b0f1f40040eec8a8` |
| `-STDOUT-v1.0.txt` | `37173b5f9572c44e0452cd1080d5fdc8d85450eca409ec435fe3808c2300a803` |
| `-STDERR-v1.0.txt` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

Every file uses the common prefix `SIR-02-KM-OE-12-JOB-MEMBERSHIP-DIAGNOSTIC-20260927T231728980Z` in this directory. The empty stderr file is retained as a zero-byte result. The source bundle and accepted implementation were not modified.

## Membership and identity result

The intended topology was the PowerShell launcher with its in-process native helper and one synthetic Node parent, with no synthetic descendant or watchdog. The launcher and helper shared PID `32736`. `CreateProcessW(CREATE_SUSPENDED)` created synthetic Node PID `37444`; the only explicit `AssignProcessToJobObject` call assigned that exact parent, and `IsProcessInJob` confirmed membership before resume. The Job was anonymous and non-inheritable. Effective Job limit flags read back as `0`, with kill-on-close disabled.

| Member PID | Retained identity | Membership assessment |
| --- | --- | --- |
| `37444` | `C:\Program Files\nodejs\node.exe`; CIM parent PID `32736`; native creation FILETIME `134350246493323733`; CIM creation `2026-09-27T23:17:29.3323730Z`; diagnostic token present in command line; ready record PID/token match | Exact created parent, explicitly assigned, in Job, Node image and owned-handle creation match; **Allowlisted** |
| `33504` | `C:\Windows\System32\conhost.exe`; CIM parent PID `37444`; native creation FILETIME `134350246493425692`; CIM creation `2026-09-27T23:17:29.3425690Z`; command line `\??\C:\Windows\system32\conhost.exe 0x4`; diagnostic token absent | In Job, but not explicitly assigned or included in the approved expected set; **Unknown / Not Allowlisted** |

Expected member PID set: `{37444}`. Observed member PID set: `{33504, 37444}`. Unexpected member set: `{33504}`. Missing expected member set: `{}`. Native open, image, and membership queries succeeded for both observed members; local CIM errors were absent. The additional `conhost.exe` has a recorded image, parent PID, creation times, command line, and Job membership, but its role and safe synthetic-run ownership were **not** established under the approved exact-member allowlist. A child relationship alone does not authorize it. No unknown member was reclassified or terminated.

The raw `parentReadyRecordMatches` field is `true` on both member rows because the accepted source checks the one parent ready record globally. For PID `33504`, this field does **not** assert that the ready record identifies that member; its distinct PID and absent token remain the controlling facts. This interpretation leaves the raw measurement unchanged.

## Cleanup, safety, and decision boundary

The diagnostic issued the synthetic parent's cooperative release signal. The exact known parent exited within the 12-second bound; post-cleanup identity/liveness verification found the original parent absent. No exact-owned-handle `TerminateProcess` fallback was used. The raw native-step record shows no `TerminateJobObject` or Job-wide destructive action. Native handle cleanup succeeded, including closing the verified zero-limit Job handle. A separate read-only post-run query found both PID `33504` and PID `37444` absent; that later absence does not establish how the unallowlisted member exited or turn the allowlist gate into PASS.

The exact raw result string is **`FAIL â€” Unknown or Unsafe Member Present`**. The malformed dash is retained exactly as emitted: Windows PowerShell 5.1 decoded the UTF-8-without-BOM source's dash literal as ANSI. Its semantic classification is **FAIL — Unknown or Unsafe Member Present**; no raw field was corrected or replaced. This diagnostic does not prove Smoke v4 S7/S8, kill-on-close, descendant termination, or OE-12 acceptance. It identifies a `conhost.exe` extra Job member in this one run, but does not retroactively identify Smoke v4's unexplained PID `45200` or establish a safe allowlist for a later launcher. Process provenance is therefore insufficient to proceed to a v1.4 launcher design or Smoke v5 execution from this result alone. A separate governed decision is required before any further diagnostic or launcher work.

Smoke v4 remains **FAIL**. Smoke v5 and formal OE-12 retry `0003` remain **Not Authorized**. OE-12 remains **Not Executed**; operational evidence remains **11 Accepted / 0 Awaiting Independent Review / 4 Not Executed**. `SIR02-DEF-02` remains **Missing / Not Reviewed**, and SIR-02 remains **Blocking**. Formal attempts `0001`/`0002`, Smokes v1–v4, accepted OE-12 implementation `826376cc84521a5d648462fdcc985cd2d412a24c`, and OE-08/OE-14/OE-15 are unchanged.
