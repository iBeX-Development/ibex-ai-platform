# OE-12 D2 Confirmation Attribution and Independence Evidence Proposal v1.0

**Status:** `Proposed / Not Approved / Not Effective`

**Proposal date:** 2026-09-30 (Asia/Ulaanbaatar)

**Set ID:** `SIR02-KM-OE12-D2-SAFETY-2026-09-30-01`

**Owner choice:** `None Selected`

**D2 reviewer assignment:** `None`
**Applicable personal-attribution method:** `Not Established`

This document proposes a D2-scoped evidence contract for later technical review and owner governance decision. The request to prepare it is not an owner selection, reviewer appointment, personal confirmation, or activation. In particular, the R1 path remains conditional; this document does not choose R1, R2, or R3.

## 1. Governing basis and exact scope

The published tip of `codex/sir-02-immediate-dispatch` was verified as `2ad6ad42caa7d6b73655ed0b8c183fcd94ab7cc5` before drafting. The published reviewer-assignment candidate at `4f1ab32cb9326f3d9bf0b96eb77f5a9002c487a4` has committed SHA-256 `3a0e38caa165b366903c41bac36c67a46885ff00a1aa9f9dc859f280f5cf7df6`. Its technical review at `2ad6ad42caa7d6b73655ed0b8c183fcd94ab7cc5` has committed SHA-256 `48df28340fb2c863fce51cbfb59fd5504a8143d9211acc0777573efc7a7e142c` and decides `Suitable for Owner Decision — Not Effective`. Neither selects a reviewer or attribution method.

The active `SIR-02-KNOWLEDGE-MANAGEMENT-LIFECYCLE-CONTROL-BASELINE-v1.0.md`, “Acceptance criteria for formal baseline approval” (lines 249–258), requires owner and reviewer confirmation of the complete scope, status/date, and an immutable repository reference. Its “Change control” clause (lines 262–270) requires a new version, rationale/history, owner and reviewer approval, immutable reference, and dependent-evidence reassessment. `SIR-02-KM-OPERATIONAL-EVIDENCE-GATE-A-v1.0.md`, A4 (lines 164–188), states the non-authorship, independent-review, and alternate-reviewer separation rule for controlled operational evidence. A4 is a separation precedent, **not** an automatic appointment for this D2 safety-contract effect. The lifecycle baseline, general SIR-02 reviewer listings, and A4 do not establish an applicable channel-to-named-person confirmation procedure.

The published D2 owner direction v1.1 at `ee7d2c34626b7129662b122360ec7952986c9713` approves coordinated activation **preparation**, not effect. The published activation proposal v1.1 at `fd95747b2d9b818512a7d0e8eae896b9313c8db6`, §4, requires a separately supplied authorized-reviewer statement and distinct owner effect confirmation on the complete final packet. The activation candidate at `27ad8ec7e5eac1d7890dd46c32eb4e90ed4cb59e` leaves the reviewer, confirmations, and final packet hashes pending. The earlier reviewer-authority clarification proposal at `54fc21e858b3ebe4c4b82b85a904a754c4bdd6dc` and review at `4a2d9acfc4a68d1f532f5b7d18aff4e008fcb721` are suitable for an owner governance decision but have not approved an attribution method.

All six frozen successors below are in `docs/governance/sir-02/controls/`, were added at `fe1087f4537f9d3c06d5465529bd083fd1dbac39`, and remain `Proposed / Not Approved / Not Effective`. Every future assignment and confirmation must bind each **full repository path**, version, exact committed SHA-256, and conditional predecessor clause, not merely this table's set ID.

| Frozen successor filename and version | Committed SHA-256 | Current predecessor and only conditional affected clause |
| --- | --- | --- |
| `SIR-02-KM-OE-12-CRITERION-AMENDMENT-v1.3.md` | `2f2978abf4b2664ceb4e3fca18a00807922b8950bf30c5243567cda03adbd367` | `SIR-02-KM-OE-12-CRITERION-AMENDMENT-v1.1.md`: C1 finite-lifetime/cleanup only. |
| `SIR-02-KM-OPERATIONAL-EVIDENCE-ACCEPTANCE-MATRIX-AMENDMENT-v1.3.md` | `93a92bf3bcb0c5f76979198fa211fc8408c962d49a272ed25017d3fbe62e7026` | `SIR-02-KM-OPERATIONAL-EVIDENCE-ACCEPTANCE-MATRIX-AMENDMENT-v1.1.md`: M1 OE-12 row only. |
| `SIR-02-KM-OPERATIONAL-EVIDENCE-EXECUTION-PLAN-AMENDMENT-v1.3.md` | `107c5c7251b2efa60a6073881e5a8e08fc09daf0569f6c5ae9553fe9402ea855` | `SIR-02-KM-OPERATIONAL-EVIDENCE-EXECUTION-PLAN-AMENDMENT-v1.1.md`: P3/P5 only. |
| `SIR-02-KM-OE-12-AUTHORITATIVE-VALIDATION-BOUNDARY-DETAILED-DESIGN-v1.2.md` | `fc5133a965e2e2362046b9cd8ab6fa1936a29c9b2138b25c5648ab5e8d012623` | `SIR-02-KM-OE-12-AUTHORITATIVE-VALIDATION-BOUNDARY-DETAILED-DESIGN-v1.0.md`: D3/D5 only. |
| `SIR-02-KM-OE-12-WORKER-HOST-RD-PLAN-v1.3.md` | `54a2e4bccc687edc8b4064a72897fa13752fe9df07afd2a4dd34ea7c0522e1a3` | `SIR-02-KM-OE-12-WORKER-HOST-RD-PLAN-v1.0.md`: §1, RQ-4, §§6, 8–9 only. |
| `SIR-02-KM-OE-12-BOUNDED-WORKER-ISOLATION-DISPOSAL-DESIGN-v1.3.md` | `7c49ee7c4b042e83fc6862560c041f9c374937a958face51b28f20bd28b23d4e` | `SIR-02-KM-OE-12-BOUNDED-WORKER-ISOLATION-DISPOSAL-DESIGN-v1.0.md`: status/method label, §§3–4, conditional B3 only. |

The full predecessor paths are in this same controls directory. These mappings are possible future scoped transitions, **not present supersessions**. Unaffected predecessor provisions remain authoritative. The Worker-Host Plan predecessor has source/configuration-preparation authority only; the Bounded Worker predecessor is a design direction without operational disposal proof.

## 2. Proposed independent attribution contract — method not selected

A user-channel submission can evidence an explicit choice by that channel; it cannot, by itself, establish which named person controlled the channel. Likewise a Git author field, role listing, Codex conversation text, or identifier supplied by the confirmer cannot authenticate personal identity or authority. The future verification must rest on an **independently governed identity-and-channel record** outside the control of the submitting person, Codex-generated text, and the D2 artifacts being confirmed. No such D2-applicable authority or method is approved by this proposal.

Any method proposed for later approval must identify: (1) the governing identity-record custodian and independent verifier, their authorization and separation from the confirmer and document preparer; (2) the authoritative mapping from named person and role to a controlled submission channel/account or artifact, its enrollment, revocation and validity interval; (3) access controls that prevent a confirmer from minting or altering their own identity/authority record, and prevent a worker, caller or assistant from resealing a confirmation; (4) the verifier's reproducible check of the channel/artifact, authority and record validity at submission time; (5) the source of a timestamp with timezone that is independently retained and tied to the submitted bytes; and (6) immutable, access-controlled references to the mapping, decision text, verification result, custody events and any later correction or revocation. Do not place credentials or secrets in the governance artifact.

The verifier must fail closed on missing, conflicting, stale, revoked, self-issued or non-independent records; a missing timestamp; a mismatched scope or byte hash; or an unavailable audit reference. It must retain a denial record without converting an unverified statement into approval. A second statement with identical wording is not an identity check. An owner's and a reviewer's submissions require **distinct** authority checks and separate confirmation evidence, even if they refer to the same packet.

| Conditional path for a future owner decision | What must first be established | Governance/change-control consequence |
| --- | --- | --- |
| **A — Use an existing approved method, if applicable** | Identify its exact governing clause, approval and immutable reference; prove that its identity/channel binding, custodian, verifier, access controls, timestamp and retained evidence apply to **both named D2 roles and this six-file effect**. None was verified in the present inputs. | No new method is created by this path. Any missing applicability or control is `STOP`; use a separately reviewed standard instead. |
| **B — Propose a new D2-scoped attribution standard** | Version and independently review the trust authority, identity enrollment, role assignment, protected record custody, verifier, revocation, timestamp, audit and failure procedures before owner/reviewer approval. | Separate governance change control is required. Any new account, service, key/credential, privilege, access-control list, storage, dependency or configuration also needs its own approved change and evidence before use. This document selects none. |
| **C — Defer attribution** | Record that no applicable method has been approved or independently evidenced. | No personal owner/reviewer confirmation counts and no D2 effect may be claimed. |

The choice among A, B and C is **unselected**. Approval of a standard would establish a rule, not retroactively validate prior unbound statements or approve the six-file effect.

## 3. One complete future confirmation scope

Only after a reviewer is expressly assigned, independence is evidenced, an applicable attribution method is approved, and the final activation/supersession plus governance-linkage packet has been committed, exact-byte reviewed and published **without effect**, may either person supply a separate personal decision. Each confirmation must bind in one exact statement or independently authenticated scope reference:

1. the set ID; all six **full** paths, versions and SHA-256 values in §1; all six **full** effective predecessor paths and precise scoped clauses; the fact that unaffected predecessor provisions remain authoritative;
2. the final activation and governance-linkage packet's full paths, versions, committed SHA-256 values, publication commits, accepted exact-byte technical-review reference, identical six-hash set and proposed common post-effect status; these packet values are currently **unknown** and must never be inferred from draft bytes;
3. the person's named role, specific authority/assignment reference, explicit `Approve`, `Reject` or `Needs Clarification` decision as applicable, personal decision date/time and timezone, and the exact non-effect/effect rule being considered;
4. the separately retained submitted bytes, message/artifact reference, approved identity-channel binding reference, verifier result, independent timestamp, immutable publication reference and custody history.

The assigned reviewer must provide their **own** independent statement; owner confirmation is separate and later. A technical `Suitable` review, baseline name, Git author field, Codex-authored wording, generic assent or silence cannot substitute. Different set membership, predecessor mapping, packet hash, status, date or decision between the two confirmations is `STOP — No Effect`; obtain separately reviewed correction rather than reconciling by inference. No statement gathered before the final packet exists can approve its unknown exact bytes.

## 4. D2-specific reviewer independence dossier

For an R1 nomination of SODBILEG Erkhembayar, or a separately selected R2 reviewer, the owner must obtain a documented assessment **before effective appointment or attribution of a personal confirmation**. It must identify the proposed reviewer and specific D2 authority; the six frozen members; their creation/edit/review history; the final activation/linkage packet and owner effect material; and any relevant organizational, financial or other conflict. For every item, record the evidence source, custodian, date, independent checker and conclusion.

Required direct questions are: Did the person create, author, alter, regenerate or replace any exact member or final effect material they would independently confirm? Did they participate in a way that prevents an independent review? Can they verify the complete immutable bytes, scoped predecessor map, final packet, status/effect rule, and evidence without reliance on their own unreviewed assertion? Does any relationship or interest create a conflict? Git metadata, absence of a name in a file, a general role designation, or an earlier unrelated “no known conflict” entry is insufficient to answer these questions. A person's own disclosure may be retained, but must be attributed under an approved method and checked against independent available evidence; it is not sole clearance.

Classify each required independence, authorship and conflict finding as `Supported`, `Conflict Established`, or `Insufficient Evidence`, with reason and immutable reference. `Insufficient Evidence` blocks effective assignment and confirmation; it does not mean clear. `Conflict Established` or failed author/reviewer separation disqualifies that reviewer for this exact material. The owner must then expressly select and assess a **different specifically identified, authorized reviewer** or defer; no automatic substitution occurs. This proposal does not decide whether SODBILEG passes or fails, and does not turn Gate A's earlier reviewer assignment into a D2 appointment.

## 5. Existing requirements, new approvals, and fail-closed gates

| Requirement | Current governance position | Additional decision or proof before use |
| --- | --- | --- |
| Complete-scope owner and reviewer confirmations, status/date, immutable reference, versioned change | Required by Lifecycle-Control Baseline, approval and change-control clauses cited in §1. | Bind the **final exact** six-file and activation/linkage scope; retain separate personal decisions. |
| Reviewer separation and independent checking | A4 supplies a rule for controlled evidence and an alternate-reviewer path, not a D2-specific appointment. | Owner's exact D2 assignment and the §4 dossier; if separation fails, a new owner decision on a different reviewer or hold. |
| Channel/account/artifact to named-person attribution | `Not Established` for this D2 effect in the reviewed records. | Owner governance decision selecting an applicable already-approved procedure or separately reviewed and approved versioned method; independent verification evidence. |
| New authority record, account, key/credential, service, storage, privilege, ACL, dependency or configuration | None is selected or authorized here. | Separate technical, security and change-control review and approval before creation or use; no package/source/environment change by this proposal. |
| Final exact-byte activation/linkage and effect | Packet and its hashes are pending; six frozen headers still say `Not Effective`. | Final packet review and non-effective publication, reviewer and owner confirmations on identical scope, then a separately approved coordinated effect procedure and verified remote publication. |

Missing authority, independence, attribution, exact hashes, final packet, personal decision, immutable evidence or matching owner/reviewer scope is `STOP — No Effect`. This document does not appoint or contact anyone, approve a personal-attribution method, create a personal attestation, activate the safety contract, approve a mechanism, or authorize source/environment change, R&D execution or formal OE-12. It does not reverse the rejected Worker-Host technical preflight or prove disposal.

**Preserved state:** `Technical Preflight = REJECTED`; `R&D Execution = NOT AUTHORIZED`; `Attempt = NOT STARTED`; `GAP-A = OPEN / mandatory`; `GAP-B operational closure = NOT ESTABLISHED`; `worker disposal = OPEN proof obligation`; `OE-12 = Not Executed`; `SIR-02 = Blocking`.

**Next gate:** exact-byte technical review of this committed proposal. Owner choice, reviewer assignment, attribution approval, personal confirmations and coordinated effect remain separate subsequent gates.
