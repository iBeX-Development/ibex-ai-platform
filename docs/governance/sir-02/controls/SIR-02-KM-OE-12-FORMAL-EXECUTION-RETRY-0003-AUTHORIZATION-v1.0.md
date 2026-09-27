# SIR-02 KM OE-12 Formal-Execution Retry 0003 Authorization Proposal v1.0

## Document control

| Field | Value |
| --- | --- |
| Document | `SIR-02-KM-OE-12-FORMAL-EXECUTION-RETRY-0003-AUTHORIZATION` |
| Version | `v1.0` |
| Proposed exact launcher design | `SIR-02-KM-OE-12-EXECUTION-LAUNCHER-REMEDIATION-v1.0.md` |
| Existing integrity design | `SIR-02-KM-OE-12-FORMAL-EXECUTION-INTEGRITY-REMEDIATION-v1.0.md` at `b70971c4da908e62226fe500e27c56c7de9a11a1` |
| Failed attempt `0001` | `SIR02-KM-OE-12-V1_0-20260927T090557Z-0001`; evidence `d20cf6acb7d43af418534c613148bf82876f7073`; failure record `7818c21c4471c35437b50fcd3c97ce00d147d05d` |
| Failed attempt `0002` | `SIR02-KM-OE-12-V1_0-20260927T104029Z-0002`; tooling-failure commit `b1420d2b7f991585934e2f00f922e6a53deba77c` |
| Accepted implementation | `826376cc84521a5d648462fdcc985cd2d412a24c` |
| Owner | GANTUMUR Erdenedalai — Founder / Administrator |
| Reviewer | SODBILEG Erkhembayar — Administrator |
| Authorization status | `Proposed / Not Authorized` |
| Formal retry `0003` | `Not Authorized` |
| Decision date | `Owner Input Required` |
| Launcher smoke status | `Required / Not Yet Executed` |
| Exact commands permitted | `Owner approval required` |
| Network permission | `Not Authorized` |
| OE-12 operational-evidence status | `Not Executed` |

## Pending owner decisions

First, the owner must separately authorize the **non-formal launcher smoke** specified in the accompanying v1.0 design. The smoke must pass under Windows PowerShell 5.1 and demonstrate exact argument delivery, stdout/stderr and exit-code capture, bounded timeout and child-tree termination, no network, and no OE-12 formal evidence or status change. Its outcome is tooling validation, not operational evidence. This proposed record does not authorize or run that smoke.

After a passing smoke has been retained and reviewed, the owner may separately decide whether to authorize **one** new controlled formal OE-12 retry with sequence `0003`. This record does not make that decision or authorize the run. Never reuse `0001` or `0002`, amend their artifacts, reclassify their failures, or use their scenario results as `0003` evidence. `0002` failed before Vitest because Windows PowerShell 5.1 exposed a null `ProcessStartInfo.ArgumentList`; no OE-12 scenario or capture was produced in that attempt.

## Proposed scope if later authorized

- Use only the exact accepted test-only implementation commit `826376cc84521a5d648462fdcc985cd2d412a24c`, isolated synthetic namespace `sir02-km-evidence-v1`, and fixture schema `SIR02-KM-EVIDENCE-FIXTURE v1.0`. A new run ID would be `SIR02-KM-OE-12-V1_0-<UTC>-0003`, assigned on actual bounded formal start, with new sequence-`0003` filenames.
- Change only temporary execution tooling to a PowerShell 5.1-compatible launch method that avoids `ProcessStartInfo.ArgumentList`. No OE-12 fixture or integration-test modification, production/runtime change, dependency addition, lockfile or configuration change, migration, Git-setting change, or `.gitattributes` change is proposed. The existing narrow non-network dependency-access exception may be used only if still required.
- Preserve the already approved staged/index-byte hashing and committed-blob verification procedure unchanged. The payload manifest has no self-hash; its separate sidecar authenticates the staged manifest digest. Success linkage and `Executed / Awaiting Independent Review` status are permitted only after a new passing run and `100% MATCH` at the post-commit integrity gate. This proposal does not accept OE-12.
- If the launcher cannot be made compatible using temporary tooling, or requires a repository helper, implementation file, production/runtime, dependency, or configuration change outside this design, stop and request separate change control before altering it.
- On any failed stage, preserve a distinct immutable failed attempt and stop without automatic further retry or OE-12 status change. No network, live customer/tenant data, ingestion, RAG, embeddings, indexing, vector-store population, retrieval, deployment, credentials, secrets, or traffic change is authorized.

The exact next decision is authorization to perform the **launcher smoke**, followed by review of its retained result. Formal retry `0003` requires its own subsequent owner authorization. Neither the smoke nor formal retry has been run in this preparation step. Attempts `0001` and `0002`, the accepted implementation, and the approved staged-byte integrity procedure remain unchanged. OE-12 remains `Not Executed`; operational evidence remains **11 Accepted / 0 Awaiting Independent Review / 4 Not Executed**. OE-08, OE-14, OE-15, and `SIR02-DEF-02` at `Missing / Not Reviewed` remain unchanged; SIR-02 remains `Blocking`.
