# SIR-02 KM OE-12 Launcher Smoke Retry Authorization Proposal v1.0

## Decision record

| Field | Value |
| --- | --- |
| Version | v1.0 |
| Scope | One new non-formal Windows PowerShell 5.1 launcher Smoke v2 only |
| Amendment | SIR-02-KM-OE-12-EXECUTION-LAUNCHER-REMEDIATION-v1.1.md |
| Failed smoke lineage | e437f02fcd3746207d9cb17bddad045c3ce0f115; FAIL; unchanged |
| Owner | GANTUMUR Erdenedalai — Founder / Administrator |
| Reviewer | SODBILEG Erkhembayar — Administrator |
| Authorization status | Proposed / Not Authorized |
| Decision date | Owner Input Required |
| Exact executable/command approval | Owner decision required before Smoke v2 |
| Network permission | Not Authorized |
| Formal retry 0003 | Not Authorized; separate future decision required |
| OE-12 operational-evidence status | Not Executed |

## Proposed owner decision

The owner would authorize only one new non-formal Smoke v2 of the corrected temporary launcher described in the v1.1 amendment. This record currently grants no execution permission. Before any smoke, the exact temporary launcher and synthetic probe, executable path, command, output location, bounded timeouts, and non-network controls must be made reviewable against the amendment. The corrected launcher must remain outside the repository implementation paths. The accepted OE-12 implementation at 826376cc84521a5d648462fdcc985cd2d412a24c remains unchanged.

The authorized smoke, if later approved, must first fail closed on empty executable/script paths, absent script, unexpectedly empty argument collection, pre-launch count mismatch, or empty constructed Arguments string. It must use a dedicated typed processArguments/nodeArguments collection rather than PowerShell's automatic $args, one deterministic Windows quoting function, ProcessStartInfo.FileName plus Arguments, and no ProcessStartInfo.ArgumentList. It must execute and retain S1–S10 with the extra exact-argv and pre-launch checks from the amendment. Its result is tooling validation only and may be PASS, FAIL, or Needs Clarification. A failed or incomplete attempt is retained independently and is not retried automatically.

## Boundaries and next decision

Do not amend, delete, overwrite, or reclassify the failed smoke, formal attempts 0001/0002, or accepted implementation. Do not run OE-12 tests or fixture capture, create a formal OE-12 Run ID or operational-evidence artifact, or authorize formal retry 0003 through this record. The formal retry remains unavailable until Smoke v2 is separately authorized, executed, passes, and has its PASS retained immutably; a separate owner authorization for formal retry 0003 is then still required. The existing formal retry-0003 authorization proposal remains Proposed / Not Authorized and is not changed here.

No OE-12 implementation, production/runtime code, dependency, lockfile, migration, configuration, Git setting, .gitattributes, live service, or persistent knowledge artifact may change. OE-08, OE-14, OE-15, SIR02-DEF-02, and all operational-evidence statuses remain unchanged. OE-12 remains Not Executed; operational evidence remains 11 Accepted / 0 Awaiting Independent Review / 4 Not Executed; SIR02-DEF-02 remains Missing / Not Reviewed; SIR-02 remains Blocking.

The exact owner decision still required is approval or rejection of one bounded non-formal Smoke v2 using the v1.1 temporary-tooling design, with no network or formal execution.
