# OE-12 D2 Corrected Six-Document Safety Amendment — Exact-Byte Technical Re-Review v1.0

**Scope:** Technical review of proposed, non-effective successor drafts only.

**Date:** 2026-09-30 (Asia/Ulaanbaatar).

**Effect:** None. No owner outcome, mechanism, source/environment change or R&D execution is authorized by this review.

## 1. Immutable inputs and exact-byte gate

Commit `2b5e98aa320364987256b3848dd3b6f889a07da3` adds **only** `SIR-02-KM-OE-12-WORKER-HOST-RD-PLAN-v1.2.md` and `SIR-02-KM-OE-12-BOUNDED-WORKER-ISOLATION-DISPOSAL-DESIGN-v1.2.md`. It does not edit the four drafts from `4df85800f6b6ba9c8e4f8429694aaf1aa79cddf7`, the old v1.1 drafts, active predecessors or source. The prior six-document technical review is `2353c4c4b885c7bc8182c18b21f0c1c277f4229a`, decision `Revision Required`.

All six complete committed drafts, both old v1.1 drafts, the complete prior review and the corresponding v1.0/v1.1 governing predecessors were read. The following SHA-256 values were recomputed from the committed blobs at `HEAD`; all match their recorded values. Paths are under `docs/governance/sir-02/controls/`.

| Proposed member | Committed SHA-256 | Result |
|---|---|---|
| `SIR-02-KM-OE-12-CRITERION-AMENDMENT-v1.2.md` | `8f42f71c04b3fdeccf2207f062cd5bd5cf4c66209a11710632566f3cc4f6b13c` | MATCH |
| `SIR-02-KM-OPERATIONAL-EVIDENCE-ACCEPTANCE-MATRIX-AMENDMENT-v1.2.md` | `45bb39650ca9f4c038f974007353e6bcc1785a2e8fbeda97c77cb9cbc9a26a8d` | MATCH |
| `SIR-02-KM-OPERATIONAL-EVIDENCE-EXECUTION-PLAN-AMENDMENT-v1.2.md` | `1b9cb926fdc64e30a57a21c3865da268343d7a8ebe9d70a6b1b5f6b8e7df7e39` | MATCH |
| `SIR-02-KM-OE-12-AUTHORITATIVE-VALIDATION-BOUNDARY-DETAILED-DESIGN-v1.1.md` | `9be3679178feb59571bb59a2e1972ba4187feb5533d5052fd3af3e7d51065d09` | MATCH |
| `SIR-02-KM-OE-12-WORKER-HOST-RD-PLAN-v1.2.md` | `29902a2144e6cb9f9f3aa18146459bda6390367145f682ecb10ce4da1500c556` | MATCH |
| `SIR-02-KM-OE-12-BOUNDED-WORKER-ISOLATION-DISPOSAL-DESIGN-v1.2.md` | `47436076eb17b49241e30426efe96aafcbc116f57ac7b2f719a6475a8d88d023` | MATCH |

The criterion, Matrix, Execution Plan and Detailed Design predecessors are scoped active OE-12 overlays under the published activation decision `da524cb006253fb0b6a2df79651b830febc5acdd` §§2–3. The Worker-Host Plan v1.0 was approved for source/configuration preparation only by `f526f845539193ab03db0a7eccb25ca319b29866`; the Bounded Worker Design v1.0 remains a governed resolution direction without a proven mechanism. Historical proposal headers do not change those later decisions. All six drafts under this review remain `Proposed / Not Approved / Not Effective`.

## 2. Eight Plan Alignment gates — this read-only re-review only

These findings were re-evaluated against the current clauses. They permit inspection and this review record; they do not carry forward any prior drafting result as activation, implementation or execution authority.

| Gate | Result | Exact clause and action affected |
|---|---|---|
| Master Architecture / Baseline | **PASS** | `docs/baseline/README.md` §§“v1.x minor update rule”, “v2.0 major update rule” and “Architecture change procedure” require reviewed, approved versioned changes before effect; `01-master-ai-policy-v1.0.md` §2 retains `Core iBeX → AI Gateway → iBeX Hybrid Intelligent AI Platform`. Reading drafts and recording a finding changes none of those controls. Any later material baseline effect needs separate review/approval. |
| Implementation Plan | **PASS** | `docs/baseline/17-implementation-plan-v1.0.md` §§1–2 and its `Build → Local Test → Integration → Security Validation → Evaluation → Shadow Mode → Controlled Pilot → Production Readiness` sequence remain authoritative. This action performs no build, implementation or test. |
| SIR / Shadow Readiness Plan | **PASS** | `docs/baseline/15-implementation-readiness-review-v1.0.md` §§23–24 retain readiness/release gates; `docs/governance/sir-02/responses/product-response-v1.0.md` `SIR02-GOV-02` says reduced Shadow-scope approval does not authorize Shadow entry. A document review advances neither gate. |
| Operational Evidence Execution Plan | **PASS** | `SIR-02-KM-OPERATIONAL-EVIDENCE-EXECUTION-PLAN-v1.0.md` §“Formal governance approval” requires actual immutable evidence before `Passed`/`Accepted` and separately gates live/Shadow use; §“SIR02-KM-OE-12 — Lifecycle audit evidence” remains `Not Executed`. This action executes no case or OE-12 attempt. |
| Scope / Change Control | **PASS** | Published D2 amendment technical review `077cb9b4d6e6f61f6eba799cb1b8b6542020d429` §4 requires coordinated six-document review, exact-byte publication and separate owner effect; partial activation is prohibited. This action creates only a new technical review. |
| Exit / Next-step | **PASS** | Prior six-document review `2353c4c4b885c7bc8182c18b21f0c1c277f4229a` §4 calls for versioned correction and exact-byte re-review; its §5 preserves non-effect. This action records whether corrected bytes can proceed, without selecting the later owner step. |
| Evidence Integrity / Traceability | **PASS** | The two-file commit scope and all six committed hashes in §1 match. The unresolved version-binding references are retained verbatim and evaluated below; this review does not rewrite evidence or silently substitute files. |
| Capability Boundary / Environment | **PASS** | Worker-Host R&D Plan v1.0 §§3–9 requires separate exact source, environment, full ownership, disposal and execution gates; Operational Evidence Execution Plan v1.0 §“Formal governance approval” limits execution to approved non-live evidence. This read-only action changes no capability or environment. |

**Gate scope:** none of the eight blocks read-only re-review. All effect, source, mechanism, environment and execution gates remain closed. The replacement-linkage failure below prevents these exact six bytes from being a suitable owner-effect package.

## 3. Cross-clause safety review

| Clause group | Finding |
|---|---|
| Criterion v1.2 C1 and active criterion v1.1 | C1 calls the proposed act **controlled termination** and explicitly says it is not “non-destructive termination.” The current criterion permits no destructive fallback against unknown/unverified processes. The proposal requires a separate outer owner, fully verified exclusive run boundary, complete actual admission, fresh identity, no outside effect, non-resetting deadline, external evidence and observed final state. No current permission is implied. |
| Worker-Host Plan v1.2 §2 versus v1.0 §§1, 2, 6, 8–9 and old v1.1 W6/W7–W8/W9 | The §1 objective is explicitly replaced with cooperative/natural non-destructive exit **or** a separately approved controlled outer-owner path; RQ-4, `T_cancel` and `T_dispose` expiry, §8 STOP and §9 cleanup are explicitly reconciled. An unapproved, unknown-member, late or wider fallback remains prohibited. `T_start = 8 s`, `T_provider = 10 s`, `T_close = 2 s`, `T_cancel = 2 s` inside `T_dispose = 5 s`, `T_fresh ≤ 500 ms` and `T_total = 45 s` are unchanged; helper `≤5,000 ms` remains an unproven target. The old wording conflict is resolved **within this proposed successor**, not in the active plan. |
| Bounded Worker Design v1.2 §2 versus v1.0 status/§§3–4 and old v1.1 B3 | The status label, §3 heading/Design GAP and §4 direct-evidence phrase now distinguish the cooperative non-destructive method from a conditional controlled termination method. B3 remains conditional; Controller, Worker, helper and watchdog gain no termination authority. Actual Worker/helper hang, complete Node/conhost/host-managed membership, finite disposition and no collateral effect still need direct proof. The old wording conflict is resolved **within this proposed successor**, not in the governing design. |
| Matrix v1.2 M1 and Execution Plan v1.2 P3/P5 | Both retain unknown/unrelated-process protection, independent evidence, exact source/path and pre-action ownership checks, and separate source/environment/R&D gates. Neither equates pause, API initiation, stream closure, `unref()` or later PID absence with disposal. |
| Detailed Design v1.1 D3/D5 and retained v1.0 §§3, 5, 7 | The Controller and Worker remain cooperative/observational; watchdog is denied force action. The separate outer role is conditional and unproven. v1.0 §7 says no concrete non-destructive mechanism **has yet proven** finite disposal; that negative historical finding is not a requirement to relabel a future controlled action as non-destructive. Its implementation STOP and separate change control remain. |

**Safety disposition:** the targeted non-destructive *method-wording* contradiction identified by `2353c4c4…` is addressed in the two v1.2 drafts. Unknown or mismatched ownership, incomplete admission, evidence failure, unobserved final state or deadline overrun still means `STOP — Disposition Unproven`. No Worker/Controller/helper/watchdog receives termination authority. Pause is temporary isolation only. WH-03/08/09 prelaunch or synthetic STOP remains nonproof. This is a contract reading, **not** a mechanism feasibility or disposal finding.

## 4. Replacement-linkage inventory and gate

The exact-name search across the **four unchanged drafts** found the following eight references to the old two v1.1 drafts. Every occurrence is in line 13, in the operative **“Indivisible change set”** sentence followed by **“No member becomes effective alone”** and a requirement for coordinated review/publication/owner effect. Each is therefore **normative and version-binding**, not a historical citation.

| Unchanged draft, exact clause | Worker-Host reference | Bounded Worker reference | Classification |
|---|---|---|---|
| `SIR-02-KM-OE-12-CRITERION-AMENDMENT-v1.2.md:13` | `SIR-02-KM-OE-12-WORKER-HOST-RD-PLAN-v1.1.md` | `SIR-02-KM-OE-12-BOUNDED-WORKER-ISOLATION-DISPOSAL-DESIGN-v1.1.md` | Both normative/version-binding |
| `SIR-02-KM-OPERATIONAL-EVIDENCE-ACCEPTANCE-MATRIX-AMENDMENT-v1.2.md:13` | `SIR-02-KM-OE-12-WORKER-HOST-RD-PLAN-v1.1.md` | `SIR-02-KM-OE-12-BOUNDED-WORKER-ISOLATION-DISPOSAL-DESIGN-v1.1.md` | Both normative/version-binding |
| `SIR-02-KM-OPERATIONAL-EVIDENCE-EXECUTION-PLAN-AMENDMENT-v1.2.md:13` | `SIR-02-KM-OE-12-WORKER-HOST-RD-PLAN-v1.1.md` | `SIR-02-KM-OE-12-BOUNDED-WORKER-ISOLATION-DISPOSAL-DESIGN-v1.1.md` | Both normative/version-binding |
| `SIR-02-KM-OE-12-AUTHORITATIVE-VALIDATION-BOUNDARY-DETAILED-DESIGN-v1.1.md:13` | `SIR-02-KM-OE-12-WORKER-HOST-RD-PLAN-v1.1.md` | `SIR-02-KM-OE-12-BOUNDED-WORKER-ISOLATION-DISPOSAL-DESIGN-v1.1.md` | Both normative/version-binding |

No other exact-name or shorthand references to those two v1.1 files occur in the four unchanged drafts. The new Worker-Host and Bounded Worker v1.2 files instead declare a proposed six-member set containing **themselves** and the four unchanged draft hashes. Their separate v1.1 lineage references are historical, but their new membership tables are also normative for the proposed set. Thus two incompatible six-member lists coexist in the exact files under review. A reader could reasonably follow any unchanged draft and select the old v1.1 Worker-Host and Bounded Worker members. The v1.2 pair openly warns of this conflict, but a unilateral “superseded for proposed set” statement in only those two files cannot amend the four version-binding clauses. **Replacement-linkage gate: FAIL.**

**Minimum self-contained versioned correction for a six-document contract:** prepare mutually consistent, separately versioned successors for **all six** documents, changing only membership/version references where the substantive clauses already pass. The four unchanged drafts need new versioned membership clauses replacing both v1.1 names with the corrected pair. Because the two corrected v1.2 files reciprocally name and hash the four current draft versions, they also need reference-only successors that name the four new versions. All six successor membership lists must identify the same six files; an independent reviewed publication/linkage record can retain their final SHA-256 values without self-referential hashes inside each file. Verify available next version numbers at that drafting step. No external linkage or later owner decision may silently override the contradictory references in these committed drafts. Re-review the exact final six-member set before publication or owner effect.

## 5. Decision and unchanged governance state

**Technical decision: `Revision Required`.** The six SHA-256 checks pass; the targeted non-destructive wording is reconciled as a proposed change, with unknown-process, authority, deadline, evidence and pause safeguards intact. The normative old-v1.1 membership references in four unchanged drafts make the proposed effective set ambiguous. The exact six bytes are therefore not suitable for an owner decision or partial activation. This review edits none of them.

| Control | State |
|---|---|
| Controlled termination | `NOT APPROVED` |
| Technical Preflight | `REJECTED` |
| R&D Execution | `NOT AUTHORIZED` |
| Attempt | `NOT STARTED` |
| GAP-A | `OPEN / mandatory` |
| GAP-B operational closure | `NOT ESTABLISHED` |
| Worker disposal | `OPEN proof obligation` |
| OE-12 | `Not Executed` |
| SIR-02 | `Blocking` |

No source import, Worker/VM/container/process/CIM execution, environment modification, WH case, approval, publication or push follows from this review. The next permissible governance action is a separately scoped preparation of mutually consistent versioned membership corrections, followed by exact-byte technical re-review.
