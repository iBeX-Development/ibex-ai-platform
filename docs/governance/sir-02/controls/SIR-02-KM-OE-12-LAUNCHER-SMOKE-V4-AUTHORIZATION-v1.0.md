# SIR-02 KM OE-12 Launcher Smoke v4 Authorization Proposal v1.0

## Decision record

| Field | Value |
| --- | --- |
| Version | v1.0 |
| Owner | GANTUMUR Erdenedalai — Founder / Administrator |
| Reviewer | SODBILEG Erkhembayar — Administrator |
| Authorization status | Proposed / Not Authorized |
| Decision date | Owner Input Required |
| Proposed remediation | `SIR-02-KM-OE-12-EXECUTION-LAUNCHER-REMEDIATION-v1.3.md`; published with this proposal, not yet authorized |
| Failed Smoke v3 | `SIR02-KM-OE-12-LAUNCHER-SMOKE-V3-20260927T120119Z`; `8af764bbf9e8525d33637e7e9291cc3dbb052994`; FAIL; unchanged |
| Earlier failed lineage | Formal attempts 0001/0002 and Smoke v1/v2 remain immutable |
| Exact temporary helper/invocation | Must be made reviewable before a later owner decision; no command authorized here |
| Network or elevation | Not Authorized |
| Smoke v4 execution | Not Authorized / Not Executed |
| Formal retry 0003 | Not Authorized; separate later owner decision required |
| OE-12 operational-evidence status | Not Executed |

## Proposed owner decision, pending input

The owner may later authorize exactly one **non-formal** Windows PowerShell 5.1 Smoke v4 of a temporary launcher conforming to remediation v1.3. This proposal is **not** that authorization. The candidate v1.3 design, exact temporary PowerShell/C# interop source, synthetic probe, existing executable path, full noninteractive command, output location, timeouts, API/handle plan, no-network controls, and cleanup behavior must first be reviewable. Any required repository implementation, dependency, configuration, security-policy, or elevation change requires separate change control; it is outside this proposal.

If separately authorized, Smoke v4 must use only synthetic local data and no network. It must carry forward the v1.2 JSON scalar transport, indexed decode, T0 gate, deterministic Windows quoting, `ProcessStartInfo.FileName`/`.Arguments` values, and exact child `process.argv` comparison. Its new Job Object mechanism must set and verify `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`, start the child suspended, assign and verify job membership before resume, prohibit breakaway, retain exact parent/descendant identities, capture every native result/error, and close all handles deterministically. No broad PID, image-name, or unrelated-process termination is permitted.

Smoke v4 must rerun **T0 and S1–S10 on the complete v1.3 launcher**. S7 requires a detected finite timeout, automatic job termination, bounded return, and timed-out process absence. S8 requires distinct parent/descendant PIDs, both verified alive and contained before cleanup, then both verified absent after automatic kill-on-close, without manual cleanup. The synthetic parent must not create its descendant before containment is verified. A failed or unverified Job Object API, timeout, containment, PID identity, pipe drain, or cleanup result fails closed. Prior v3 PASS findings cannot substitute for any v4 case.

The future result must be exactly one of `PASS`, `FAIL`, or `Needs Clarification` and labeled **Non-Formal Launcher Smoke Validation — Not OE-12 Operational Evidence**. On failure or uncertainty, retain the raw result and temporary tooling immutably, do not silently repair or rerun, and return for governance review. On PASS, preserve the full T0/S1–S10 result immutably; that would make formal retry `0003` eligible only for a **separate** owner authorization. Smoke v4 itself cannot authorize or execute formal retry `0003` or satisfy OE-12 operational evidence.

## Preserved scope and history

No Job Object launcher is implemented or run by this proposal. Do not modify accepted OE-12 implementation `826376cc84521a5d648462fdcc985cd2d412a24c`, OE-12 fixture or integration tests, production/runtime code, dependencies, migrations, repository configuration, Git settings, `.gitattributes`, execution policy, Windows security policy, credentials, secrets, deployment, storage, ingestion, RAG, embeddings, indexing, vector writes, retrieval, or traffic. Do not change formal attempts 0001/0002 or Smoke v1/v2/v3. The separately approved Git-index/committed-blob SHA-256 procedure for a future formal run is unchanged.

OE-12 remains `Not Executed`; operational evidence remains `11 Accepted / 0 Awaiting Independent Review / 4 Not Executed`. OE-08, OE-14, OE-15, and `SIR02-DEF-02` at `Missing / Not Reviewed` remain unchanged. SIR-02 remains `Blocking`. Formal retry `0003` remains **Not Authorized**, and no formal Run ID is allocated.
