# SIR-02 KM OE-12 Launcher Smoke Retry Authorization Record v1.0

## Decision record

| Field | Value |
| --- | --- |
| Version | v1.0 |
| Scope | One new non-formal Windows PowerShell 5.1 launcher Smoke v2 only |
| Exact authorized amendment | SIR-02-KM-OE-12-EXECUTION-LAUNCHER-REMEDIATION-v1.1.md at e0d7d711f08063bc3e83159ec04d33edc5beff3e |
| Failed smoke lineage | e437f02fcd3746207d9cb17bddad045c3ce0f115; FAIL; unchanged |
| Owner | GANTUMUR Erdenedalai — Founder / Administrator |
| Reviewer | SODBILEG Erkhembayar — Administrator |
| Authorization status | Authorized for Non-Formal Smoke v2 |
| Decision date | 2026-09-27 |
| Authorization decision reference | ea9f1fbb36d51f6b3453304c026d219ed0c503c8 |
| Exact permitted execution | One bounded non-formal Windows PowerShell 5.1 Smoke v2 under the exact v1.1 amendment, using existing node.exe, temporary launcher/probe, synthetic arguments, and no network |
| Smoke v2 execution status | Authorized / Not Yet Executed |
| Network permission | Not Authorized |
| Formal retry 0003 | Not Authorized; separate future decision required |
| OE-12 operational-evidence status | Not Executed |

## Formal owner decision

> The OE-12 Launcher Remediation v1.1 at commit e0d7d711f08063bc3e83159ec04d33edc5beff3e is approved for one non-formal Smoke v2 validation only. This authorization does not authorize formal retry 0003 and does not constitute OE-12 operational evidence.

The proposed v1.1 amendment and Proposed / Not Authorized authorization remain visible at e0d7d711f08063bc3e83159ec04d33edc5beff3e. The owner decision is preserved at ea9f1fbb36d51f6b3453304c026d219ed0c503c8. This linkage adds the immutable decision reference only; it is not a smoke execution or formal OE-12 success linkage.

This decision permits only the future non-formal Smoke v2. No launcher or smoke is executed in this authorization step. Before execution, the exact temporary launcher and synthetic probe, executable path, command, output location, bounded timeouts, and non-network controls must be made reviewable against the amendment. The corrected launcher must remain outside repository implementation paths. The accepted OE-12 implementation at 826376cc84521a5d648462fdcc985cd2d412a24c remains unchanged.

The authorized smoke must fail closed on empty executable/script paths, absent script, unexpectedly empty argument collection, pre-launch count mismatch, or empty constructed Arguments string. Before child start it must record executable/probe existence, the dedicated typed processArguments/nodeArguments collection and its expected and actual nonzero counts, the constructed Arguments string, and the intended probe path. It must never use PowerShell's automatic $args as that collection or ProcessStartInfo.ArgumentList. It must use ProcessStartInfo.FileName, one deterministic Windows quoting function, and one separately constructed ProcessStartInfo.Arguments string. It must execute and retain S1–S10 plus exact probe-path and child-reported process.argv comparison, including empty strings, embedded quotes, backslashes, paths with spaces, and shell-significant argument data. Its result is exactly one of PASS, FAIL, or Needs Clarification; PASS requires every mandatory behavior. A failed or incomplete attempt is retained immutably and is not silently repaired or retried.

## Boundaries and next decision

Do not amend, delete, overwrite, or reclassify the failed smoke, formal attempts 0001/0002, or accepted implementation. Do not run OE-12 tests or fixture capture, create a formal OE-12 Run ID or operational-evidence artifact, or authorize formal retry 0003 through this record. Label Smoke v2 **Non-Formal Launcher Smoke Validation — Not OE-12 Operational Evidence**. Formal retry remains unavailable until this separately authorized Smoke v2 executes, passes, and has its PASS retained immutably; a separate owner authorization for formal retry 0003 is then still required. The existing formal retry-0003 authorization proposal remains Proposed / Not Authorized and is not changed here.

No OE-12 implementation, production/runtime code, dependency, lockfile, migration, configuration, Git setting, .gitattributes, live service, or persistent knowledge artifact may change. OE-08, OE-14, OE-15, SIR02-DEF-02, and all operational-evidence statuses remain unchanged. OE-12 remains Not Executed; operational evidence remains 11 Accepted / 0 Awaiting Independent Review / 4 Not Executed; SIR02-DEF-02 remains Missing / Not Reviewed; SIR-02 remains Blocking.

The owner decision above authorizes one bounded non-formal Smoke v2 only. Formal retry 0003 is Not Authorized, even if a later Smoke v2 passes, until the owner grants a separate formal authorization. This step changes no code, configuration, dependency, Git setting, OE status, or failed evidence and performs no execution.
