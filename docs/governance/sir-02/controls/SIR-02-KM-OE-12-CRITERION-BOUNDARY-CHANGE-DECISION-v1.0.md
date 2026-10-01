# SIR-02 KM OE-12 Criterion / Boundary Change Decision v1.0

| Field | Owner decision record |
| --- | --- |
| Owner | GANTUMUR Erdenedalai — Founder / Administrator |
| Reviewer | SODBILEG Erkhembayar — Administrator |
| Decision | **Approve OE-12 Criterion / Boundary Redesign for Detailed Design** |
| Selected option | **Approve OE-12 Criterion / Boundary Redesign for Detailed Design** |
| Decision date | **2026-09-29** |
| Immutable owner decision | `126e689df2e14878f20fd343922b7db26dbf0163` |
| Change-control review | `SIR-02-KM-OE-12-CRITERION-BOUNDARY-CHANGE-CONTROL-REVIEW-v1.0.md` at `496ab2303009b2bed6250c9e1a01155390eb7916` |
| Accepted technical review | `ae01991c83c0277f6e37bbf7a265ca7c51049f32` |
| Canonical scoped analysis | `bbe24d5d52f320439580cb34bda257c2ede96cea` |
| Technical review | `38f845b625a583d0d848492e4cdecdec4c560369` |
| Supplied human attestation | `09ecf134975a35d97ce4a618ae7add7536696cfe` |
| Alignment GAP | **OPEN** |

## Decision basis

A1 independent receipt trust and B1 bounded provider-level CIM quiescence remain unresolved. The existing in-process path does not prove provider quiescence. The published change-control review proposes **Authoritative Validation-Boundary Quiescence** as an explicit replacement direction for the current B1 criterion and preserves A1 independently. Boundary-level closure and late-result fencing do not prove that shared CIM provider work physically stopped. No implementation or combined boundary model is approved by this decision.

The approved **design direction**, pending versioned baseline amendment, is a bounded validation boundary with exactly one immutable terminal state, an explicit immutable **Accepted Result Cutoff** bound to run/generation identity, late/stale result rejection, and authoritative state unchanged after closure with accepted post-closure mutation count `0`. Detailed design must cover deterministic isolation and disposal; success, timeout, exception, cancellation, and `finally` evidence; and independent closure/audit evidence. Rejection records are non-authoritative audit metadata. Neither the cutoff, terminal reason, accepted result, nor run/generation identity may be advanced or reused; reopening requires a separately governed new run/generation. This direction **does not claim provider-level physical quiescence**. It requires proof that no late provider activity or result can alter the authoritative OE-12 validation outcome after boundary closure.

**Current approved criterion remains authoritative until the required versioned amendment package is separately prepared, reviewed, and approved.** This owner decision approves the change-control direction for detailed design and versioned amendment preparation only. It does not itself amend the active baseline or close B1 operationally.

## Owner options and selected decision

1. **Approve OE-12 Criterion / Boundary Redesign for Detailed Design**
2. **Hold — Further Governance Clarification Required**
3. **Reject Redesign and Stop Current OE-12 Approach**

**Owner decision: `Approve OE-12 Criterion / Boundary Redesign for Detailed Design`.** The owner approves the change-control direction from `bounded provider-level CIM quiescence` to `Authoritative Validation-Boundary Quiescence` for detailed-design preparation, impact mapping, and versioned baseline amendment preparation. This is not approval of a concrete source, worker, producer, isolation architecture, implementation, or execution. The other options are not selected.

GAP-A remains **OPEN and mandatory**. A future design must prove an independent receipt producer, probe-independent integrity anchor, complete `PID + image path + parent PID + creation time + run token + creation/assignment event` binding, run binding, PID-reuse resistance, and fresh ownership revalidation, plus handle/session/Job evidence where applicable. GAP-B redesign cannot close, waive, or weaken GAP-A.

The next stage must prepare versioned amendments to the OE-12 safety/acceptance criterion, Operational Evidence Acceptance Matrix, Operational Evidence Execution Plan, and OE-12 audit-evidence wording/addendum. Fixture design, evaluation/golden criteria, and production audit architecture may be amended only if detailed design demonstrates a specific impact and separate change control approves it. Tenant isolation, authorization/ownership requirements, accepted OE evidence, and production/runtime architecture remain unchanged.

No further re-analysis of the same retained evidence may claim closure of GAP-A or GAP-B. Further progress requires an approved baseline amendment, approved detailed design, approved new trust/isolation boundary, or newly authorized evidence.

## Unchanged authority and safety boundary

This decision does not amend the current OE-12 criterion, acceptance matrix, execution plan, fixture design, evaluation/golden criteria, audit architecture, or canonical OE/SIR status. It does not authorize a receipt-producer or isolation-worker implementation, source/code change, process/CIM probe, Diagnostic v4, launcher v1.4, Smoke v5, or formal retry `0003`.

No destructive fallback against an unknown process is permitted. The complete ownership tuple, fresh pre-action identity revalidation, exact reviewed source, runnable-byte integrity, reviewed executable paths, bounded cleanup/disposal, and separate execution authorization remain mandatory for any future execution proposal. The Alignment GAP remains **OPEN**.

The next permissible action is **Prepare versioned OE-12 criterion/baseline amendment package and detailed-design proposal**. No implementation or execution is authorized by this decision.

The owner decision is preserved at commit `126e689df2e14878f20fd343922b7db26dbf0163`. This linkage identifies the decision only; it does not amend the current criterion, close GAP-A or the Alignment GAP, or authorize implementation or execution.
