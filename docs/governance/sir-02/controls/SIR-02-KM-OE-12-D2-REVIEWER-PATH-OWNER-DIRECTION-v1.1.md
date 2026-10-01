# OE-12 D2 Reviewer Path — Owner Direction v1.1

**Record status:** `Direction to Defer / No Reviewer Appointed / Not Effective`

**Set ID:** `SIR02-KM-OE12-D2-SAFETY-2026-09-30-01`

**Selected path:** `R3 — Defer assignment`

**Decision-channel date:** 2026-10-01 (Asia/Ulaanbaatar)

**Version history:** This v1.1 record replaces the local v1.0 direction record at `8ac5153eea998bea6714ede603963975a6e4fb28` as the proposed governance record for this same R3 selection. V1.0 remains immutable local history; it lacked the available message ID and containing-turn timestamp and used different status wording. Neither version is a six-file effect record. This v1.1 record is local and unpublished.

## 1. Separate owner-channel choice and provenance limit

The R3 selection comes from the **preceding separate user-channel message**, not from the subsequent `ACTION — Record the Separate R3 Owner Direction Only` instruction or the candidate's listed options.

| Provenance field | Observed value |
| --- | --- |
| Message reference | `01a0f51c-42c8-7693-a105-9fb8c7aa2152` in Codex thread `01a0c879-cf52-7782-8a94-2711e84b4d89`. |
| Channel | `user`. |
| Containing turn start | Unix `1790818665` = `2026-10-01 01:37:45 UTC` = `2026-10-01 09:37:45 Asia/Ulaanbaatar`. This is the thread's **turn-start timestamp**, not an independently exposed per-message submission timestamp. |
| Per-message timestamp | Not exposed by the available thread record; no exact message time is inferred. |

**Exact user-message content, JSON-escaped** (the final `\u0020\u0020\n` encodes two trailing spaces and one line feed):

```json
"I select R3 for `SIR02-KM-OE12-D2-SAFETY-2026-09-30-01`: defer the D2 effect reviewer appointment. I direct evidence collection and governance work to establish D2-specific reviewer independence and an approved person-attribution method. This does not appoint a reviewer, approve an attribution method, effect the six documents, or authorize source changes or execution.\u0020\u0020\n"
```

This evidence supports an explicit selection from the user channel. Codex has **not** independently verified that the named physical person `GANTUMUR Erdenedalai — Founder / Administrator` controlled that channel. Neither this record nor the Git author field supplies that identity proof; no handwritten, cryptographic or other personal signature is asserted.

## 2. Published decision basis and exact D2 set

The governed remote branch `codex/sir-02-immediate-dispatch` was read back at `2ad6ad42caa7d6b73655ed0b8c183fcd94ab7cc5`. Its published reviewer-decision candidate at `4f1ab32cb9326f3d9bf0b96eb77f5a9002c487a4` has SHA-256 `3a0e38caa165b366903c41bac36c67a46885ff00a1aa9f9dc859f280f5cf7df6`; its technical review at `2ad6ad42caa7d6b73655ed0b8c183fcd94ab7cc5` has SHA-256 `48df28340fb2c863fce51cbfb59fd5504a8143d9211acc0777573efc7a7e142c` and decision `Suitable for Owner Decision — Not Effective`. Candidate §3 defines R3 as deferring reviewer assignment with `STOP — No Effect`; candidate §4 leaves person-attribution unresolved. Neither published record selected R3 itself.

This direction is bound only to the six frozen successors at `fe1087f4537f9d3c06d5465529bd083fd1dbac39`. Each full path begins `docs/governance/sir-02/controls/`; the published candidate §2 binds the same complete paths, versions, hashes and conditional predecessor clauses.

| Frozen successor filename/version | Committed SHA-256 | Conditional effective-predecessor clause |
| --- | --- | --- |
| `SIR-02-KM-OE-12-CRITERION-AMENDMENT-v1.3.md` | `2f2978abf4b2664ceb4e3fca18a00807922b8950bf30c5243567cda03adbd367` | Criterion Amendment v1.1 C1 only. |
| `SIR-02-KM-OPERATIONAL-EVIDENCE-ACCEPTANCE-MATRIX-AMENDMENT-v1.3.md` | `93a92bf3bcb0c5f76979198fa211fc8408c962d49a272ed25017d3fbe62e7026` | Acceptance Matrix Amendment v1.1 M1 OE-12 row only. |
| `SIR-02-KM-OPERATIONAL-EVIDENCE-EXECUTION-PLAN-AMENDMENT-v1.3.md` | `107c5c7251b2efa60a6073881e5a8e08fc09daf0569f6c5ae9553fe9402ea855` | Execution Plan Amendment v1.1 P3/P5 only. |
| `SIR-02-KM-OE-12-AUTHORITATIVE-VALIDATION-BOUNDARY-DETAILED-DESIGN-v1.2.md` | `fc5133a965e2e2362046b9cd8ab6fa1936a29c9b2138b25c5648ab5e8d012623` | Detailed Design v1.0 D3/D5 only. |
| `SIR-02-KM-OE-12-WORKER-HOST-RD-PLAN-v1.3.md` | `54a2e4bccc687edc8b4064a72897fa13752fe9df07afd2a4dd34ea7c0522e1a3` | Worker-Host R&D Plan v1.0 §1, RQ-4, §§6, 8–9 only. |
| `SIR-02-KM-OE-12-BOUNDED-WORKER-ISOLATION-DISPOSAL-DESIGN-v1.3.md` | `7c49ee7c4b042e83fc6862560c041f9c374937a958face51b28f20bd28b23d4e` | Bounded Worker Design v1.0 status/method label, §§3–4 and conditional B3 only. |

The six successor documents remain `Proposed / Not Approved / Not Effective`. No predecessor is superseded by R3; unaffected predecessor provisions remain authoritative. The later local attribution/independence proposal `94d3101227d0b6fadcdf59f77217d1f9eee3c49d` is a separate, **unapproved and non-effective** proposal, not a published owner decision or an approved identity method.

## 3. Direction and conditions for leaving R3

**Reviewer appointment = Deferred / None.** **R1 and R2 = Not Selected.** **Personal reviewer confirmation = Not Supplied.** **Approved D2 person-attribution method = Not Established.** **Six-file effect = STOP — No Effect.**

The user directs evidence collection and governance preparation to establish D2-specific reviewer independence and an approved person-attribution method. This permits no appointment or approval by inference. Before a later R1 or R2 owner decision could result in an effective appointment, externally supplied and independently checked evidence must cover: (1) the proposed person's specific D2 authority; (2) their actual authorship or alteration of each frozen member and the final activation/linkage and effect material; (3) independence and organizational, financial or other conflicts; (4) the evidence source, custodian, date and immutable reference for each finding; and (5) an applicable approved channel-to-person attribution procedure with its exact governing clause, trust authority, protected identity/channel record, timestamp and verification evidence. If no approved method applies, a new versioned standard and any supporting service, account, credential, privilege or configuration require separate review and change control. Missing evidence is `Insufficient Evidence`, never clearance. A failed separation or established conflict requires a **new** explicit owner choice of a different identified authorized reviewer or continued hold; R2 cannot be silently substituted.

Any later reviewer confirmation requires the final exact-byte-reviewed activation/supersession and governance-linkage packet and must personally bind the set ID, all six full paths/versions/hashes, affected predecessor clauses, final packet paths/hashes, decision, date and attributable immutable provenance. A distinct owner effect confirmation remains separate. A role listing, Git author, Codex-authored text or technical review is not personal confirmation.

## 4. Non-effect and next gate

This R3 record does not contact anyone, approve an attribution method, activate controlled termination, appoint a reviewer, effect the six documents, approve a mechanism, change source/configuration/environment or authorize any R&D or formal OE-12 execution. Publication of an R3 hold alone could not effect the six-file set.

**Preserved state:** `Technical Preflight = REJECTED`; `R&D Execution = NOT AUTHORIZED`; `Attempt = NOT STARTED`; `GAP-A = OPEN / mandatory`; `GAP-B operational closure = NOT ESTABLISHED`; `worker disposal = OPEN proof obligation`; `OE-12 = Not Executed`; `SIR-02 = Blocking`.

**Next gate:** exact-byte technical review of this corrected local R3 direction. Any later R1/R2 decision and attribution approval require separate governance and independent evidence.
