# SIR-02 KM OE-12 Launcher Smoke v3 Authorization Proposal v1.0

## Decision record

| Field | Value |
| --- | --- |
| Version | v1.0 |
| Scope | One new non-formal Windows PowerShell 5.1 Smoke v3 after separate owner authorization |
| Proposed remediation | SIR-02-KM-OE-12-EXECUTION-LAUNCHER-REMEDIATION-v1.2.md |
| Failed Smoke v1 | e437f02fcd3746207d9cb17bddad045c3ce0f115; FAIL; unchanged |
| Failed Smoke v2 | 22882d0c32b24ca6ecdfab373d24b139af89dd9d; FAIL; unchanged |
| Owner | GANTUMUR Erdenedalai — Founder / Administrator |
| Reviewer | SODBILEG Erkhembayar — Administrator |
| Authorization status | Proposed / Not Authorized |
| Decision date | Owner Input Required |
| Exact temporary command and paths | Owner decision required before execution |
| Network permission | Not Authorized |
| Formal retry 0003 | Not Authorized; separate future decision required |
| OE-12 operational-evidence status | Not Executed |

## Proposed owner decision and execution gate

The owner may later approve exactly one new non-formal Smoke v3 of the v1.2 temporary launcher transport design. This proposal grants no permission to implement or execute a launcher, run a smoke, or start formal retry 0003. The amendment must first be published for immutable review. Before the owner decides, the exact temporary launcher/probe, existing executable, command, output location, finite timeout, JSON parser availability, and no-network controls must be reviewable. The temporary tooling stays outside repository implementation paths.

If later authorized, Smoke v3 must transport the fixed synthetic child argument vector as one nonempty JSON array string through the PowerShell 5.1 binder. It must decode into a dedicated local typed array without losing the deliberate zero-length string, order, or duplicate values. T0 must compare encoded and decoded counts and values per index, reject null/non-string or missing elements, and verify the probe path before any Node launch. A T0 failure stops before S1. Only after T0 PASS may S1–S10 run under the v1.2 and v1.1 launcher controls, including exact process.argv, streams, exit code, timeout/tree cleanup, shell-significant literal data, and zero formal OE-12 side effects. Any FAIL or Needs Clarification must be retained without an automatic fix or rerun.

The future result must be labeled **Non-Formal Launcher Smoke Validation — Not OE-12 Operational Evidence**. A PASS would satisfy only the smoke prerequisite; it would not constitute OE-12 operational evidence or authorize formal 0003. Formal retry 0003 remains unavailable until v1.2 is published, Smoke v3 is separately authorized and executed, T0 and S1–S10 all PASS, the PASS is retained immutably, and a separate owner authorization for formal retry 0003 is granted.

## Preserved boundaries

Do not amend, delete, overwrite, or reclassify failed Smoke v1 or v2, formal attempts 0001/0002, or the accepted OE-12 implementation at 826376cc84521a5d648462fdcc985cd2d412a24c. Do not remove the empty-string test input. Do not modify OE-12 tests, production/runtime code, dependencies, lockfile, migrations, repository configuration, Git settings, .gitattributes, or any live service. No network, real tenant/customer data, ingestion, RAG, embeddings, indexing, vector writes, retrieval, deployment, credentials, secrets, or traffic change is authorized.

This preparation does not execute a launcher, Smoke v3, or formal retry 0003; it creates no operational evidence and changes no OE status. OE-12 remains Not Executed; operational evidence remains 11 Accepted / 0 Awaiting Independent Review / 4 Not Executed. OE-08, OE-14, OE-15 and SIR02-DEF-02 at Missing / Not Reviewed remain unchanged. SIR-02 remains Blocking. The next owner decision is whether to authorize one bounded non-formal Smoke v3 after this v1.2 design is published.
