# SIR-02 KM OE-12 Job Membership Diagnostic v2 Authorization Proposal v1.0

## Proposed decision record

| Field | Value |
| --- | --- |
| Version | `v1.0` |
| Classification | **Non-Formal Job Membership Attribution Diagnostic — Not OE-12 Operational Evidence** |
| Owner | `GANTUMUR Erdenedalai — Founder / Administrator` |
| Reviewer | `SODBILEG Erkhembayar — Administrator` |
| Decision date | `Owner Input Required` |
| Authorization status | **Proposed / Not Authorized** |
| Proposed execution count | One non-formal v2 attempt only, after a separate affirmative owner decision and exact-source readiness gate |
| Attribution analysis | `SIR-02-KM-OE-12-CONHOST-MEMBERSHIP-ATTRIBUTION-ANALYSIS-v1.0.md` (candidate; immutable commit required before approval) |
| Prior diagnostic v1 evidence | `def523aa2b27dfdf4ceff8b349a12808aee47844`; **FAIL** |
| Prior Class B basis | `fa656ca968129bbb6dea05e853c66d859ae5f1b1` |
| Smoke v4 | **FAIL** |
| Launcher v1.4 / Smoke v5 | **Not Authorized** |
| Formal retry `0003` | **Not Authorized** |
| OE-12 | **Not Executed** |

**No execution is authorized by this proposal.** It requests a later owner decision on a new, non-destructive, synthetic v2 diagnostic. The one-attempt v1 authorization at `70755e8571e8c2ccf8bdf182064993f1a91511e1` was consumed and cannot be reused. A future approval must identify the immutable v2 analysis and exact temporary source/readiness references, its one permitted invocation, finite bounds, output location, and cleanup path. No v2 source package, run token, or process is created by this record.

## Proposed scope and acceptance gates

The sole question is whether every member of the new synthetic Job can be attributed to the current Node execution, including at most one Windows Console Host companion, before any destructive Job experiment is even considered. The **proposed** topology is PowerShell launcher and in-process native helper → exact synthetic Node parent → conditional OS-managed `conhost.exe`. It excludes additional Node/application descendants and arbitrary support processes.

Before a future v2 run, the exact temporary launcher, native helper, probe, source-bundle SHA-256, noninteractive command, Windows API/handle plan, expected result schema, and deterministic cleanup procedure must be published and independently checked. That readiness gate must prove the source uses synthetic local data only, requires no network or privilege elevation, does not modify repository implementation or configuration, and contains no Job-wide destructive path. An extracted source must match the committed source byte for byte before execution. A missing source, changed byte, unresolved cleanup path, required dependency, or new repository/runtime change stops the run and requires separate change control.

For each observed Job member, v2 must capture PID, full canonical image path, parent PID, native creation time, available CIM creation time, session ID, command line where available, Node token presence, role, explicit assignment versus inherited/OS-companion classification, exact Job membership, source/timestamp of each observation, and sanitized query errors. Preserve handle-bound Node identity and creation time to guard against PID reuse. Preserve expected, observed, unexpected, and missing member sets, together with the complete allowlist decision. Missing, inaccessible, contradictory, or racing evidence is not inferred.

The required member is the exact, explicitly assigned synthetic Node parent. **At most one** additional `conhost.exe` may be conditionally allowed, and only if every criterion in the attribution analysis passes: trusted system image path, exact Node parent identity, causally consistent creation time, matching session where applicable, confirmed Job membership, no evidence of predating Node, supported OS-console-companion role, and conclusive non-destructive exit correlation after Node release. Node must have its diagnostic token; conhost token absence is neutral. An unrelated executable, wrong-parent conhost, second application process, second conhost, unidentifiable PID, or unresolved lifecycle/timing fails closed.

The diagnostic must retain pre-release process states and then signal only the exact known Node parent to exit cooperatively. It must wait within finite bounds and recheck the exact conhost PID **with creation identity** after Node exit. It must never call `TerminateJobObject`, configure or test kill-on-close, terminate an unidentified member, manually terminate conhost, or perform S7/S8 acceptance testing. A previously observed extra member cannot be removed from evidence merely because it exited before a later query. No Job-wide fallback is allowed. Any targeted owned-parent fallback would prevent PASS and must be separately recorded under an approved source design.

The only permitted v2 decisions, if later authorized, are `PASS — Complete Job Membership Attributed`, `FAIL — Unknown or Unsafe Member Present`, and `Needs Clarification`. PASS requires the observed Job member set to equal the required Node plus only conclusively attributed approved OS companion members, with safe cleanup and no unresolved identity. FAIL or Needs Clarification leaves launcher v1.4, Smoke v5, and formal retry `0003` blocked. PASS may support a **separate future** v1.4 design decision; it does not itself authorize any later smoke or formal execution. Any v2 attempt, including a failed or partial one, must be retained immutably with raw identity, lifecycle, native results, timestamps, and checksums.

## Explicit exclusions and preserved state

This proposal does not authorize Diagnostic v2 execution; design or implementation of launcher v1.4; Smoke v5; formal retry `0003`; or OE-12 operational evidence. It changes no OE-12 fixture/integration test, accepted implementation `826376cc84521a5d648462fdcc985cd2d412a24c`, production/runtime source, dependency, migration, repository configuration, Git setting, `.gitattributes`, deployment, credential, secret, storage, ingestion, RAG, embedding, indexing, vector write, retrieval, network, or traffic path. It does not alter failed formal attempts `0001`/`0002`, Smokes v1–v4, diagnostic v1, OE-08/OE-14/OE-15, or any evidence status.

Diagnostic v1 and Smoke v4 remain **FAIL**. Smoke v5 and formal retry `0003` remain **Not Authorized**. OE-12 remains **Not Executed**; operational evidence remains **11 Accepted / 0 Awaiting Independent Review / 4 Not Executed**. `SIR02-DEF-02` remains **Missing / Not Reviewed**, and SIR-02 remains **Blocking**.
