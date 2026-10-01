# SIR-02 KM OE-12 execution attempt 0001 — evidence integrity failure

| Field | Value |
| --- | --- |
| Evidence item | `SIR02-KM-OE-12` |
| Formal run ID | `SIR02-KM-OE-12-V1_0-20260927T090557Z-0001` |
| Run start / end (UTC) | `2026-09-27T09:05:57.3098316Z` / `2026-09-27T09:06:00.5744020Z` |
| Integrity finding recorded (UTC) | `2026-09-27T09:12:39Z` |
| Retained attempt commit | `d20cf6acb7d43af418534c613148bf82876f7073` |
| Result | `Evidence Integrity Failed — Not Eligible for Independent Acceptance` |
| OE-12 operational-evidence status | `Not Executed` (unchanged) |

The bounded Vitest process returned 68/68 passing tests and the isolated fixture capture process returned successfully. After the attempt artifacts were committed, a byte-level comparison against the committed Git blobs found that the SHA-256 manifest does not validate the committed package. The formal run's scenario results remain retained, but this package is not a successful OE-12 formal evidence submission.

The manifest declares SHA-256 `2c2e47a1f074e8d5d5e8c14708b6102bb2086eb83f0c858618359f124a54ff8f` for `SIR-02-KM-OE-12-FORMAL-RUN-LOG-0001-v1.0.json`. The committed blob's SHA-256 is `aec9f41662ab457dca86efec109c7293bd9edfebd010b1f9845b7fd9f1bf7e8d`. The other 13 payload artifact hashes match their committed blobs.

The manifest sidecar declares manifest SHA-256 `5aa43afcd6954cfe95a4ddeb9a5b816118ea7d68a02eb385341081f55f03c37b`, while the committed manifest blob's SHA-256 is `705306b6aa06deb05df6549f60690ad91f1b7951b5b7fb6220befa0a67b2f466`. The worktree copies match the manifest and sidecar values. Git `core.autocrlf=true` normalized CRLF to LF in the committed run log and manifest; the hashes had been calculated against the worktree bytes before this Git transformation.

All original attempt artifacts, manifest, and sidecar at commit `d20cf6acb7d43af418534c613148bf82876f7073` are preserved without overwrite or amendment. No retry or code change was performed after this finding. OE-12 remains `Not Executed`; the Execution Plan, Acceptance Matrix, OE-08, OE-14, OE-15, and `SIR02-DEF-02` remain unchanged. A later controlled attempt, if separately directed, must use a new run sequence and verify manifest hashes against the exact committed bytes before any success linkage or status change.
