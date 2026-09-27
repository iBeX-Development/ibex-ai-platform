# SIR-02 KM OE-12 Job Membership Diagnostic Authorization Proposal v1.0

| Field | Decision record |
| --- | --- |
| Purpose | Conclusively identify the additional Job Object member observed in failed non-formal Smoke v4 before any further launcher termination test |
| Basis | `SIR-02-KM-OE-12-SMOKE-V4-JOB-MEMBERSHIP-FORENSIC-ANALYSIS-v1.0.md`; Smoke v4 evidence commit `98bb5c30fd1619efbc0fba99d5062f258a65d811` |
| Owner | `GANTUMUR Erdenedalai — Founder / Administrator` |
| Reviewer | `SODBILEG Erkhembayar — Administrator` |
| Status | **Proposed / Not Authorized** |
| Decision date | `Owner Input Required` |
| Exact temporary diagnostic source/command | `Separate design and owner approval required before creation or execution` |
| Formal retry `0003` | **Not Authorized** |
| Smoke v5 | **Not Authorized** |
| OE-12 operational-evidence status | **Not Executed** |

## Proposed diagnostic boundary

This proposal is for a **new non-formal, synthetic, local Job Membership Diagnostic**, not a replacement for failed Smoke v4 and not OE-12 operational evidence. It would use only temporary execution tooling and the existing Windows PowerShell 5.1/Node environment after an exact diagnostic source and safe cleanup plan are reviewed and separately authorized. No diagnostic execution, launcher remediation v1.4, Smoke v5, or formal retry `0003` is authorized by this record.

Before any destructive action, the diagnostic must retain for **every** Job member: PID; executable/image path; safely obtained command line; parent PID; process creation time; expected synthetic role; a unique synthetic-run token; whether the member was explicitly assigned or inherited membership, supported by creation/assignment events; Job membership and observation time; and a deterministic intended-member allowlist verdict. It must also retain the intended parent PID, expected member set, actual member set, unexpected member set, native query/API results, and sanitized native errors. It must distinguish the diagnostic launcher, native in-process code, Node parent, any intentional descendant, and watchdog. It must capture the Job identity and a bounded event order sufficient to correlate process creation, assignment, membership, and exit. Missing, inaccessible, racing, or contradictory identity evidence yields **Unresolved / Fail Closed**, never an inferred role.

The diagnostic must use a reviewed non-destructive containment/cleanup method. It must **not** invoke `TerminateJobObject`, close a kill-on-close Job handle, or otherwise terminate a Job containing an unidentified member as a way to learn what the member was. It must not repeat Smoke v4's job-wide safety fallback after an unknown-member rejection. Its exact source and termination/handle-lifetime behavior, including what happens if the diagnostic cannot finish within its bound, require separate change control before execution. No unidentified PID may be individually killed. A read-only observation that a PID is later absent is insufficient to close identity.

## Decision gates

1. Owner approves an exact temporary diagnostic design/source, capture fields, non-destructive cleanup path, bounded timeout, and one execution. Until then, status remains `Proposed / Not Authorized`.
2. Preserve the distinct non-formal diagnostic result immutably, including raw identity observations, source, timestamps, output, errors, and SHA-256. A failure or partial capture remains a failed/partial diagnostic; do not overwrite it.
3. Independently review whether every member was conclusively identified and allowlisted. If the extra member is explained as intended, a separate v1.4 allowlist/kill-on-close design may be prepared. If unintended membership is proven, design containment remediation. If identity stays unresolved, stop. None of these outcomes retroactively changes Smoke v4.
4. Smoke v5 and formal retry `0003` each require their own later authorization gates. The prior SHA-256 integrity procedure and formal-run attempt lineage remain intact.

No OE-12 test fixture or integration test, production/runtime file, dependency, migration, repository/Git setting, `.gitattributes`, deployment, network, credentials, secrets, ingestion, RAG, embedding, indexing, vector storage, retrieval, or traffic change is proposed here. Accepted implementation `826376cc84521a5d648462fdcc985cd2d412a24c` remains unchanged. Failed formal attempts `0001`/`0002` and failed Smoke v1–v4 remain immutable. OE-12 stays `Not Executed`; operational evidence remains **11 Accepted / 0 Awaiting Independent Review / 4 Not Executed**; `SIR02-DEF-02` stays `Missing / Not Reviewed`; SIR-02 stays `Blocking`.
