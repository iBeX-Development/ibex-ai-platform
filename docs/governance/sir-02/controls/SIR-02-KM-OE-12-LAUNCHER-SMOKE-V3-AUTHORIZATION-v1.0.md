# SIR-02 KM OE-12 Launcher Smoke v3 Authorization Record v1.0

## Decision record

| Field | Value |
| --- | --- |
| Version | v1.0 |
| Scope | One new non-formal Windows PowerShell 5.1 Smoke v3 only |
| Exact authorized remediation | SIR-02-KM-OE-12-EXECUTION-LAUNCHER-REMEDIATION-v1.2.md at 032b2244886e04b8704a265a09e33f067fb10ed8 |
| Failed Smoke v1 | e437f02fcd3746207d9cb17bddad045c3ce0f115; FAIL; unchanged |
| Failed Smoke v2 | 22882d0c32b24ca6ecdfab373d24b139af89dd9d; FAIL; unchanged |
| Owner | GANTUMUR Erdenedalai — Founder / Administrator |
| Reviewer | SODBILEG Erkhembayar — Administrator |
| Authorization status | Authorized for Non-Formal Smoke v3 |
| Decision date | 2026-09-27 |
| Authorization decision reference | f955087dbad6a39a6e58bbb2ab16c637adcc23f9 |
| Exact permitted execution | One bounded non-formal Windows PowerShell 5.1 Smoke v3 under the exact v1.2 remediation, using existing node.exe, temporary launcher/probe, synthetic arguments, and no network |
| Smoke v3 execution status | Authorized / Not Yet Executed |
| Network permission | Not Authorized |
| Formal retry 0003 | Not Authorized; separate future decision required |
| OE-12 operational-evidence status | Not Executed |

## Formal owner decision and execution gate

> The OE-12 Launcher Remediation v1.2 at commit 032b2244886e04b8704a265a09e33f067fb10ed8 is approved for one non-formal Smoke v3 validation only. This authorization does not authorize formal retry 0003 and does not constitute OE-12 operational evidence.

The proposed v1.2 remediation and Proposed / Not Authorized record remain visible at 032b2244886e04b8704a265a09e33f067fb10ed8. This decision permits exactly one future non-formal Smoke v3; it does not execute a launcher or smoke in this authorization step. Before execution, the exact temporary launcher/probe, existing executable, command, output location, finite timeout, JSON parser availability, and no-network controls must be reviewable against the remediation. The temporary tooling stays outside repository implementation paths.

The owner decision is preserved at f955087dbad6a39a6e58bbb2ab16c637adcc23f9. This linkage records that immutable decision reference only; it is neither a Smoke v3 result nor a formal OE-12 success linkage.

Smoke v3 must transport the fixed synthetic child argument vector as one nonempty JSON array string through the PowerShell 5.1 binder. It must decode into a dedicated local typed array without losing the deliberate zero-length string, order, or duplicate values. T0 must compare encoded and decoded counts and values per index, reject null/non-string or missing elements, and verify the probe path before any Node launch. A T0 failure stops before S1–S10; Node must not start and the result cannot be PASS. Only after T0 PASS may S1–S10 run under the v1.2 and v1.1 launcher controls, including exact process.argv, streams, exit code, timeout/tree cleanup, shell-significant literal data, and zero formal OE-12 side effects. Any FAIL or Needs Clarification must be retained without an automatic fix or rerun.

Retain distinct serialized transport input, decoded argument vector, Windows quoting/escaping, ProcessStartInfo.Arguments, and child process.argv stages. Compare their expected and actual values without treating a shell-generated command string as the authoritative argument vector. Include ordinary text, spaces, deliberate empty string, duplicate values, embedded double quotes, backslashes before quotes, trailing backslashes, paths with spaces, and shell-significant characters. Do not remove or special-case away the empty argument to obtain PASS. Record exactly one Smoke v3 result: PASS, FAIL, or Needs Clarification; PASS requires T0 and every mandatory S1–S10 behavior.

The future result must be labeled **Non-Formal Launcher Smoke Validation — Not OE-12 Operational Evidence**. A FAIL or incomplete attempt must be preserved exactly and returned for new governance review. A PASS would satisfy only the smoke prerequisite; it would not constitute OE-12 operational evidence or authorize formal 0003. Formal retry 0003 remains unavailable until Smoke v3 executes, T0 and S1–S10 all PASS, the PASS is retained immutably, and a separate owner authorization for formal retry 0003 is granted.

## Preserved boundaries

Do not amend, delete, overwrite, or reclassify failed Smoke v1 or v2, formal attempts 0001/0002, or the accepted OE-12 implementation at 826376cc84521a5d648462fdcc985cd2d412a24c. Do not remove the empty-string test input. Do not modify OE-12 tests, production/runtime code, dependencies, lockfile, migrations, repository configuration, Git settings, .gitattributes, or any live service. No network, real tenant/customer data, ingestion, RAG, embeddings, indexing, vector writes, retrieval, deployment, credentials, secrets, or traffic change is authorized.

This authorization step does not execute a launcher, Smoke v3, or formal retry 0003; it creates no operational evidence and changes no OE status. Formal retry 0003 remains Not Authorized regardless of a future Smoke v3 result until a separate formal owner decision. OE-12 remains Not Executed; operational evidence remains 11 Accepted / 0 Awaiting Independent Review / 4 Not Executed. OE-08, OE-14, OE-15 and SIR02-DEF-02 at Missing / Not Reviewed remain unchanged. SIR-02 remains Blocking.
