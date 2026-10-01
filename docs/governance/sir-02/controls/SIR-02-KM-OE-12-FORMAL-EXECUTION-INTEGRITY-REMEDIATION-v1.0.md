# SIR-02 KM OE-12 Formal-Execution Integrity Remediation v1.0

## Control and scope

| Field | Value |
| --- | --- |
| Evidence item | `SIR02-KM-OE-12 — Lifecycle Audit Evidence` |
| Design version | `v1.0` |
| Failed formal run | `SIR02-KM-OE-12-V1_0-20260927T090557Z-0001` |
| Preserved attempt evidence commit | `d20cf6acb7d43af418534c613148bf82876f7073` |
| Preserved integrity-failure record commit | `7818c21c4471c35437b50fcd3c97ce00d147d05d` |
| Successful governance linkage for attempt `0001` | None |
| Accepted implementation commit | `826376cc84521a5d648462fdcc985cd2d412a24c` |
| Exact implementation reviewer attestation | `47905bc40d591b05719f3f9819544f6b64de7e66` |
| Accepted implementation review | `d64f5d46c059baa382abdb95c77e81fd14995e86` |
| OE-12 operational-evidence status | `Not Executed` |

This document specifies a proposed integrity-only retry procedure. It does not authorize or execute a retry. Attempt `0001` remains **Formal Execution Attempt — Integrity Failed**. Its artifacts, manifest, sidecar, evidence commit, and failure record must not be modified, replaced, amended, rehashed into apparent success, or reclassified. Its 68/68 passing Vitest results and successful fixture capture are historical observations, not accepted OE-12 evidence. The next controlled run must independently generate new evidence with sequence `0002` and new filenames; it may reuse the exact accepted test-only implementation without code changes.

## Confirmed root cause and immutable discrepancy

The repository has `core.autocrlf=true`. Attempt `0001` hashed the formal run log and manifest as CRLF worktree bytes. Git normalized those files to LF when staging/committing, so the recorded hashes did not identify their committed blobs. The other 13 retained payload hashes matched their committed blobs.

| Artifact | Recorded worktree or sidecar SHA-256 | Committed blob SHA-256 |
| --- | --- | --- |
| `SIR-02-KM-OE-12-FORMAL-RUN-LOG-0001-v1.0.json` | `2c2e47a1f074e8d5d5e8c14708b6102bb2086eb83f0c858618359f124a54ff8f` | `aec9f41662ab457dca86efec109c7293bd9edfebd010b1f9845b7fd9f1bf7e8d` |
| `SIR-02-KM-OE-12-SHA256-MANIFEST-0001-v1.0.json` | `5aa43afcd6954cfe95a4ddeb9a5b816118ea7d68a02eb385341081f55f03c37b` | `705306b6aa06deb05df6549f60690ad91f1b7951b5b7fb6220befa0a67b2f466` |

The canonical evidence identity for a retry is the exact content of the staged Git blob and, after commit, the exact content of the blob at that commit. Worktree-byte hashes are diagnostic only. Do not change `core.autocrlf` globally or add/change `.gitattributes`: reading staged and committed bytes directly handles the present conversion rule. A new need for repository configuration or attributes requires separate change control.

## Controlled retry gates

### R1 — Pre-run

1. Require a clean working tree and synchronized intended branch. Record branch, HEAD, UTC start, accepted implementation commit, and SHA-256 of both authorized OE-12 test-only implementation files. Verify the implementation files are unchanged from `826376cc84521a5d648462fdcc985cd2d412a24c`.
2. Verify the exact design, remediation, authorizations, reviewer attestation, and accepted implementation review remain reachable. Verify attempt `0001` and its failure record are unchanged.
3. Assign the new Gate A run ID **only when the bounded formal process actually begins**: `SIR02-KM-OE-12-V1_0-<UTC>-0002`. Use `0002` in every new retained filename. Never reuse `0001`.
4. Use the accepted fixture and noninteractive local test runner with a finite watchdog, synthetic namespace `sir02-km-evidence-v1`, fixture schema `SIR02-KM-EVIDENCE-FIXTURE v1.0`, and no network or live operations. A narrowly scoped one-time sandbox exception may be needed to read existing `node_modules/.pnpm`; attempt `0001` used such an exception without network. It was isolated test execution, not production or live Shadow operation.

### R2 — Post-execution, before commit

1. Require the new Vitest process and new fixture capture to finish successfully; retain UTC start/end, elapsed duration, exact command, timeout, stdout/stderr, exit codes, and formal JSON report. No result from attempt `0001` may substitute for a `0002` output.
2. Require all formal evidence artifacts: summary, raw normalized events, transition/dependency reconstruction, 20 negative-case results, full/partial sink-failure evidence, tenant-isolation/zero-disclosure evidence, sanitization, cleanup, Vitest result, run log, and captured command output. Confirm 14 lifecycle families, N01–N20, pre-persistence zero writes for N01–N17/N20, N18/N19 sink outcomes, chronology/reconstruction, zero disclosure, sanitization, cleanup, and OE-08 synthetic audit-only labeling.
3. Verify the implementation hashes remain unchanged, no source/dependency/configuration/migration file changed, and no persistent live state exists. The fixture's zero live-operation values describe the isolated fixture boundary; they are not a process-wide observer.
4. Place the new `0002` payloads at new paths without overwriting `0001`. Stage **only** those payloads. Read each staged artifact as binary from the Git index (for example, `git show :<repository-relative-path>` captured as bytes through a binary-safe process API), then calculate SHA-256 over that byte buffer. Do not hash text decoded and re-encoded by PowerShell or the worktree copy.

### R3 — Manifest and sidecar

1. Construct a deterministic UTF-8 manifest containing the run ID, algorithm `SHA-256`, each required payload path, staged blob byte length, and SHA-256 calculated from its staged/index bytes. Include the exact payload count and reject missing, duplicate, unexpected, or ambiguous paths. The manifest contains payload hashes, **not its own hash**.
2. Stage the manifest. Read its staged/index bytes with the same binary-safe method and calculate its SHA-256. A CRLF-to-LF conversion at this step is expected and covered by hashing the staged representation.
3. Write a separate `.sha256` sidecar containing the staged-manifest SHA-256 and manifest filename. Stage the sidecar. Verify its **staged** content parses to the intended manifest digest. The sidecar does not need to contain its own hash.
4. Before commit, re-read every staged payload, manifest, and sidecar; require all payload hashes, byte lengths, and the sidecar-to-manifest hash to match. Verify only the intended new `0002` files are staged.

### R4 — Post-commit integrity

1. Commit the complete `0002` package without amending or touching attempt `0001`. Record the exact new evidence commit.
2. Independently extract every expected artifact as raw bytes from the exact evidence commit (for example, `git show <evidence-commit>:<repository-relative-path>` through a binary-safe process API). Recompute SHA-256 and byte length for every committed payload. Parse the **committed** manifest and compare every entry to the corresponding committed blob. Recompute the committed manifest SHA-256 and compare it to the digest in the **committed** sidecar.
3. Require 100% match, including the run log, manifest, and sidecar relationship; verify the expected artifact count, run IDs, filenames, and committed file set. A successful Vitest result without this gate is insufficient. Check branch/worktree and implementation integrity again.

### R5 — Governance linkage

Only after R4 passes may governance linkage cite the `0002` evidence commit and verified manifest/sidecar, and only then may OE-12 move to `Executed / Awaiting Independent Review`. It must not be marked `Accepted` without a separate independent evidence review. OE-08, OE-14, OE-15, other evidence statuses, and `SIR02-DEF-02` remain unchanged.

## Failure and history rules

If a test, capture, staging, manifest, commit, or post-commit integrity gate fails, retain the exact attempt outputs and error, publish an immutable failure record as applicable, do not create a success linkage, do not change OE-12 status, and stop before any retry. A failed `0002` must remain visible and cannot be overwritten or silently repaired into success. Any later run would require a new sequence and separate direction.

No production/runtime code, OE-12 implementation, dependency definition, lockfile, migration, Git configuration, `.gitattributes`, deployment, credential, secret, storage, ingestion, RAG, embedding, indexing, vector, retrieval, or traffic change is required by this integrity remediation. OE-12 remains `Not Executed`; operational evidence remains **11 Accepted / 0 Awaiting Independent Review / 4 Not Executed**. `SIR02-DEF-02` remains `Missing / Not Reviewed`; SIR-02 remains `Blocking`.
