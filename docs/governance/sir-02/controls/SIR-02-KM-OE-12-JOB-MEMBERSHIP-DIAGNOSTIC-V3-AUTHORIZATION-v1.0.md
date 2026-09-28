# SIR-02 KM OE-12 Job Membership Diagnostic v3 Authorization Proposal v1.0

## Proposed decision record

| Field | Value |
| --- | --- |
| Version | `v1.0` |
| Classification | **Non-Formal Tooling Diagnostic — Not OE-12 Operational Evidence** |
| Owner | `GANTUMUR Erdenedalai — Founder / Administrator` |
| Reviewer | `SODBILEG Erkhembayar — Administrator` |
| Decision date | **Owner Input Required** |
| Authorization status | **Proposed / Not Authorized** |
| Exact execution command | **Owner approval required after exact-source/readiness publication** |
| Network permission | **Not proposed** |
| Source finding | `SIR-02-KM-OE-12-DIAGNOSTIC-V2-LIFECYCLE-FORENSIC-ANALYSIS-v1.0.md`: **Class B — Exit Chronology Not Retained** |
| V2 evidence | `8b2977e2e14e93185cb9cafece80d35371209dcb`; token `SIR02-OE12-JOB-MEMBERSHIP-DIAGNOSTIC-V2-20260928T012331298Z`; result `Needs Clarification` |
| V3 execution | **Not Authorized / Not Executed** |
| Launcher v1.4 / Smoke v5 / formal OE-12 retry `0003` | **Blocked / Not Authorized** |
| OE-12 status | **Not Executed** |

This record proposes a future owner decision; it is **not** an approval to write or run v3 source. The one authorized v2 attempt is consumed and its `Needs Clarification` record remains immutable. The only unresolved v2 finding is exact Node/conhost exit chronology. Pre-release membership and identity checks already passed; they may be reused as design requirements, not reclassified as a final PASS.

## Minimum proposed temporary source scope

If the owner later authorizes preparation, create a **new versioned temporary source package** only under:

- `docs/governance/sir-02/controls/oe-12-job-membership-diagnostic-v3-source-v1.0/launcher.ps1`
- `docs/governance/sir-02/controls/oe-12-job-membership-diagnostic-v3-source-v1.0/native-helper.cs`
- `docs/governance/sir-02/controls/oe-12-job-membership-diagnostic-v3-source-v1.0/probe.cjs`

The v3 launcher and helper may copy the published v2 **identity, allowlist, source-integrity, and safe-cleanup concepts** read-only. The probe's only proposed change is the version-specific synthetic token pattern; it must not add descendants or live operations. A new exact-source ZIP, checksums, static validation, and pre-execution readiness record must be prepared and independently verified **before any separately authorized v3 attempt**. No v2 source, ZIP, readiness record, raw artifact, manifest, or decision may be overwritten or relabeled.

No OE-12 fixture/integration test, accepted implementation `826376cc84521a5d648462fdcc985cd2d412a24c`, production/runtime source, dependency, migration, repository configuration, Git setting, `.gitattributes`, credential, secret, deployment, network, ingestion, RAG, embedding, index, vector store, retrieval, or traffic change is proposed. Any need outside this temporary diagnostic-tooling scope requires a new change-control decision **before coding**.

## Proposed lifecycle measurement contract

Retain the approved topology: PowerShell launcher with an **in-process** native helper, exactly one synthetic Node parent, and conditionally at most one conclusive Windows `conhost.exe` companion. Preserve every v2 Node/conhost identity criterion and both complete pre-release Job-member queries. Unknown or changing membership remains fail closed. Token absence on conhost remains neutral. No member is promoted from candidate on filename, parent PID, or Job membership alone.

The proposed timing addition is limited to the **original exact process handles**:

1. Before release, retain the Node CreateProcess-owned handle and, if present, a creation-bound conhost query/synchronize handle. Confirm each is nonsignaled. Record PID, creation FILETIME, image, parent, session, Job membership, native/API result, and observation UTC timestamp.
2. Record the cooperative release-write interval and signal only the exact Node parent. Preserve the existing `12,000 ms` Node wait, optional separate `5,000 ms` conhost observation bound, and non-destructive cleanup.
3. After each exact handle is known signaled, call `GetProcessTimes` (or a demonstrably equivalent Windows-native process-timing API) **on that retained handle**. Require API success and a nonzero, valid kernel creation and exit FILETIME for Node and for any candidate conhost. Preserve the raw FILETIME integers, UTC conversions, target handle/PID, API error, and distinct observation timestamp. An optional `GetExitCodeProcess` result may corroborate termination but cannot replace an exit timestamp.
4. Even if conhost is **already signaled** when first checked after Node's wait, query its kernel exit time from the retained handle. Do not skip the timing query or infer ordering from the wait return. If still running, observe it for up to the separate bound, then query exit time only after it signals. Never reopen by PID as a substitute for the retained process object.
5. Compare raw kernel exit FILETIMEs without rounding. Retain `NodeExitFileTimeUtc`, `ConhostExitFileTimeUtc`, `ConhostMinusNodeExitTicks`, and converted elapsed milliseconds; keep wait-return and release/observation timestamps in separate fields. Require internally consistent creation-before-exit values and source identity. An unavailable, zero, contradictory, or inaccessible exit time yields `Needs Clarification` or `FAIL` under the approved fail-closed rules.

The existing approved lifecycle rule is **not** changed. If it requires conhost to exit **after** Node, v3 may support PASS only when exact kernel times establish that ordering and the candidate terminates within the approved bounded cooperative lifecycle. A conhost exit before or equal to Node exit, an exit outside the bound, or timing that cannot establish relation to the release interval cannot be relabeled acceptable. Such an observation must remain `Needs Clarification` or `FAIL — Lifecycle Attribution Not Supported` as applicable; changing the criterion itself requires a separate governance decision. A no-conhost topology records the conhost comparison as not applicable without weakening Node or member-set gates.

## Safety, evidence, and future gates

Proposed decisions remain exactly `PASS — Exit Chronology Conclusively Established`, `FAIL — Lifecycle Attribution Not Supported`, or `Needs Clarification`. PASS also requires fresh source-integrity verification, one separately authorized attempt, complete member attribution, cooperative Node exit, no exact-parent fallback, successful handle cleanup, and zero prohibited actions. Retain raw native/API successes and sanitized errors, handle-bound creation/exit times, observation timestamps, membership snapshots, cleanup results, and a SHA-256 manifest. A targeted fallback may apply only to the reverified exact-owned Node parent under a separately approved source design and **always disqualifies PASS**.

The proposal forbids `TerminateJobObject`, kill-on-close testing, conhost termination, unknown-member termination, and manual killing as PASS evidence. It authorizes **no diagnostic execution now**. A future v3 attempt needs (1) an explicit owner authorization for exact temporary source preparation, (2) published source bundle and readiness, (3) a fresh source-integrity check, and (4) a separate explicit one-attempt execution decision. A PASS, if achieved later, would support only a **separate review** of whether the conhost attribution finding is closed; it would not directly create launcher v1.4 or authorize Smoke v5, formal retry `0003`, or an OE-12 status change.

Diagnostic v2 remains `Needs Clarification`. Diagnostic v1, Smokes v1–v4, and formal attempts `0001`/`0002` remain unchanged. Launcher v1.4 remains blocked; Smoke v5 and formal retry `0003` remain **Not Authorized**. OE-12 remains **Not Executed**; operational evidence remains **11 Accepted / 0 Awaiting Independent Review / 4 Not Executed**. `SIR02-DEF-02` remains **Missing / Not Reviewed**; SIR-02 remains **Blocking**.
