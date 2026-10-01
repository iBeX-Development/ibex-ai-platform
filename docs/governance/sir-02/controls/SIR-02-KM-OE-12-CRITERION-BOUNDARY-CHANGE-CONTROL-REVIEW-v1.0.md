# SIR-02 KM OE-12 Criterion / Boundary Change-Control Review v1.0

| Field | Record |
| --- | --- |
| Record type | Owner / change-control review proposal; no decision or implementation authorization |
| Date prepared | 2026-09-29 |
| Scoped feasibility result | `bbe24d5d52f320439580cb34bda257c2ede96cea` — A1 and B1 `Needs Clarification`; overall `Additional Scoped Analysis Required` |
| Independent technical review | `38f845b625a583d0d848492e4cdecdec4c560369` — A1 and B1 supported; `Accepted — Analysis Result Ready for Owner / Change-Control Review` |
| Supplied human reviewer attestation | `09ecf134975a35d97ce4a618ae7add7536696cfe` — explicitly names the technical review commit |
| Alignment GAP | `OPEN` |
| Change status | Candidate only; no boundary model or criterion change approved |

## 1. Preflight and decision basis

The retained technical review supports the A1 and B1 findings; the separately supplied reviewer attestation references that exact review. A1 remains unresolved because an independent producer and probe-independent receipt integrity anchor have not been established. B1 remains unresolved because the existing in-process CIM path cannot prove bounded provider-level completion; the retained evidence does not rule out every future boundary. No current authorization approves a boundary model, revised criterion, source or implementation change, CIM/process execution, Diagnostic v4, launcher v1.4, Smoke v5, or formal retry `0003`. The Alignment GAP remains `OPEN`.

The present active OE-12 execution-safety requirement is **bounded provider-level CIM quiescence**: timeout/cancellation must lead to proven completion of provider work and operation/session lifecycle, with no pending callback/result and disposal after quiescence. The scoped analysis and technical review show that timeout detection, cancellation request, worker completion, collector stability, ignored late results, and client disposal do not prove this requirement. This requirement is in the active CIM validation safety lineage; the existing lifecycle audit objective and its 14-family/20-negative-case acceptance scope remain separate.

## 2. GAP-A remains a separate mandatory requirement

**Independent Receipt Trust Boundary Required.** Any future solution must independently anchor a receipt binding `PID + image path + parent PID + creation time + run token + creation/assignment event`, plus retained handle/session/Job evidence where applicable. It must prove independent receipt-producer identity, creation before probe validation, a probe-independent integrity anchor, exact run binding, resistance to PID reuse, and fresh ownership revalidation immediately before any process-affecting action. A receipt and hash supplied through the same probe-controlled input do not authenticate ownership. The proposed B1 replacement below cannot close, hide, or waive GAP-A. GAP-A remains `Needs Clarification` and the Alignment GAP remains `OPEN`.

## 3. GAP-B candidate replacement criterion — proposed, unapproved

**Candidate name: Authoritative Validation-Boundary Quiescence.** Replace the active requirement for *bounded provider-level CIM quiescence* with the following measurable safety criterion only if separately approved through owner/change control:

> Within a finite approved bound, the OE-12 validation worker or isolation boundary reaches exactly one immutable terminal state (`success`, `fail`, `timeout`, or `cancelled`); the authoritative result channel is closed or fenced at that boundary. Every query and result is bound to the exact run ID and generation token. At terminal closure, an explicit immutable **Accepted Result Cutoff** fixes the accepted result set for that run/generation. Results and callbacks arriving after the cutoff or from an older generation are classified `Late / Rejected` and cannot mutate accepted validation state. The worker/isolation lifetime and resource-disposal outcome are bounded and evidenced. Success, timeout, exception, cancellation, partial-result, provider-failure, outer/watchdog-timeout, and `finally` paths have reviewed executable mappings and retained evidence. No destructive fallback may act on an unknown or unverified process, and fallback authority may not exceed the primary path. An independent audit record proves the final authoritative state and its immutability after closure.

This proposed criterion **does not require or claim that a shared CIM provider process has physically stopped all internal work**. It requires proof that no provider activity or late result can affect the authoritative OE-12 validation outcome after bounded boundary closure. It is **not equivalent** to provider-level quiescence. Adopting it would explicitly change the active acceptance/safety criterion; this draft does not adopt it or establish that an implementation is feasible.

### Required measurable properties for a future detailed design

| Property | Required proof if the criterion is approved |
| --- | --- |
| Late-result fencing | Each query/result carries run ID and generation. Record the explicit immutable Accepted Result Cutoff at closure; after that cutoff, no result, callback, event, or state update from that run/generation may enter authoritative validation state. Classify later arrivals only as `Late / Rejected`; retain counts and per-result rejection dispositions where applicable. The cutoff cannot be inferred later from logs. |
| Deterministic completion | Exactly one of `success`, `fail`, `timeout`, `cancelled` is committed. After termination, re-entry to active state, advancing the cutoff, reuse of the run/generation identity, and alteration of the terminal reason or authoritative result are prohibited. Reopening requires a separately governed new run/generation. |
| Isolation | Worker/session effects cannot alter authoritative results after closure. Any process isolation has an explicit full ownership tuple, fresh revalidation, membership rules, and safe cleanup contract. |
| Cleanup | Map success, timeout, exception, cancellation, partial/provider failure, outer watchdog, and `finally` to reviewed exact source/API calls and resource state. Disposal is deterministic. No unknown-process termination or broader fallback authority. |
| Independent audit | Retain run ID, generation ID, terminal state and reason, closure timestamp, Accepted Result Cutoff, final accepted result count, authoritative state version/hash (or equivalent immutable reference) at closure, late-result count/list and rejection disposition, final post-closure authoritative state version/hash, accepted post-closure mutation count, cleanup outcome, and immutable evidence reference, independently of probe-controlled result input. |

The closure evidence must establish `authoritative_state_after_closure == authoritative_state_at_closure`, with accepted post-closure mutation count `0`, after all observed late-result handling and disposal. It must prove that rejected late data changed neither terminal status, accepted result set, ownership state, nor audit decision. Separately designated **non-authoritative audit metadata** may record late-result rejection without counting as a change to the authoritative validation result. The cutoff, state references, and comparison must be retained as closure evidence; later inference from logs is insufficient.

Future execution would still require an immutable reviewed source package, `100%` runnable-byte match, exact executable/launcher path, accepted branch/path mapping, source-level independent safety review, and separate execution authorization. The candidate wording alone satisfies none of those gates.

## 4. Baseline and contract impact assessment

| Contract | Amendment assessment if owner approves redesign |
| --- | --- |
| Active OE-12 CIM validation safety criterion | **Required.** Version the criterion replacement and record that boundary closure replaces provider-level completion proof only for the explicitly approved validation path. Do not silently reinterpret old records. |
| `SIR-02-KM-OPERATIONAL-EVIDENCE-ACCEPTANCE-MATRIX-v1.0.md` | **Required as a versioned OE-12 addendum/amendment before implementation or formal retry.** Its OE-12 row currently requires trusted lifecycle reconstruction, missing/unbound/duplicate/conflicting-event failure, and observable sink failures. Preserve those requirements; add the approved tooling/evidence gate and its distinction from provider quiescence. |
| `SIR-02-KM-OPERATIONAL-EVIDENCE-EXECUTION-PLAN-v1.0.md` | **Required as a versioned OE-12 execution amendment before formal retry.** Preserve the lifecycle event objective and status; specify the approved boundary acceptance, evidence, safety review, and execution prerequisites. |
| `SIR-02-KM-OE-12-LIFECYCLE-AUDIT-FIXTURE-DESIGN-v1.0.md` | **Conditional versioned addendum.** Required if detailed design changes fixture/test measurement or captured evidence. Its existing 14-family/20-case lifecycle contract is unchanged by this proposal. The accepted implementation must not be silently edited. |
| Evaluation/golden criteria (`docs/baseline/09-evaluation-framework-v1.0.md` and related Phase 10 records) | **No amendment established now.** Detailed design must check whether the new OE-12 boundary changes any evaluation/golden gate; amend by separate change control only if an actual criterion dependency is identified. Existing golden results stay immutable. |
| Audit/observability wording (`docs/baseline/08-audit-observability-architecture-v1.0.md` and OE-12 audit controls) | **OE-12 evidence/audit addendum required** for boundary closure and late-result rejection fields. A production audit architecture amendment is **conditional**, only if separately approved design changes the public audit contract; none is approved here. |

Tenant isolation, authorization, resource ownership, accepted OE evidence, and the existing OE-12 lifecycle-audit acceptance cases remain unchanged. Production/runtime architecture is unchanged unless separately approved. No prior failed Smoke/Diagnostic/formal attempt is reclassified.

## 5. No-more-same-evidence-loop and decision boundary

Further read-only feasibility review of the **same retained evidence** cannot be used to claim closure of A1 or B1. Progress requires at least one separately governed input: an approved criterion change, an approved new trust boundary, an approved new execution/isolation boundary, or new authorized evidence. None is authorized by this review.

The companion owner decision record offers exactly three unselected choices. Approval for **detailed design**, if later chosen, would not itself approve source changes, implementation, runtime validation, or execution. The Alignment GAP remains `OPEN` until the separately governed criterion and boundary path is designed, reviewed, and evidenced. OE-12 and all other canonical OE/SIR statuses remain unchanged.
