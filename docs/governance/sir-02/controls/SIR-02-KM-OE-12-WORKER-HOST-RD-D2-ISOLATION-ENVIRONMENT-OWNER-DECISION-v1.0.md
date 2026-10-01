# SIR-02 / OE-12 — D2 Isolation-Environment Owner Direction v1.0

**Status:** `Owner-Selected Option B / Design Only / Feasibility Unproven / No Source or Execution Authorization`
**Decision date:** 2026-09-29 (Asia/Ulaanbaatar)
**Owner:** GANTUMUR Erdenedalai — Founder / Administrator
**Decision provenance:** The owner delegated this selection in the conversation directing this record. This record does not represent a handwritten or cryptographic signature, or independent identity verification by Codex.

## Immutable decision basis

- Published D2 owner-decision proposal: `cf5d0f365c113fd4be310fd46a16c78c4289bc3a`, `SIR-02-KM-OE-12-WORKER-HOST-RD-D2-ISOLATION-BOUNDARY-OWNER-DECISION-PROPOSAL-v1.0.md`, committed SHA-256 `1584c01be6b2be144ade555a265f3d12343e7c7df6b20be37b437757bcf1ea0c`.
- Published D2 technical review: `5c2bb255e426ffc31ea9af58aa68439352dcd5f0`, `SIR-02-KM-OE-12-WORKER-HOST-RD-SELECTED-EXECUTION-BOUNDARY-TECHNICAL-REVIEW-v1.0.md`. Its D2 finding remains `Design STOP Valid — New isolation-boundary design required`.
- Earlier selected direction: `15b887286d21258f686e1e2c8ec08c7ffdb77e65` (T1 + P1 + D2 design only + E1 + M1). The proposed identity-helper `≤5,000 ms` ceiling remains an unproven design target.

## Owner-selected direction

**Selected:** `B — Separate isolation-environment design` — design only. In the published proposal, Option B is conditional on the existing Worker-Host boundary being unable to credibly prove finite safe disposition. It commissions a separately governed isolation-environment design; environment type, host ownership and mechanism remain unselected. A new process name alone is not an isolation boundary, and this selection does not implicitly choose sandbox, container, VM or service R&D.

**Not selected:** Option A — new Worker-Host containment design; Option C — hold/defer. Neither A nor C may be substituted without a new owner decision. Option B is not declared feasible and no disposal mechanism is approved.

## Design mandate and proof obligations

The next design must specify an exact environment boundary, its independent trust owner and its admission authority. It must account for the actual Controller/Supervisor, Node Worker, conhost, identity helpers and any other admitted member, including creation and assignment provenance, full `PID + image path + parent PID + creation time + run token + creation/assignment evidence`, and retained handle/session/Job evidence where applicable. Membership alone is not ownership. The design must require fresh full-identity revalidation immediately before every process-affecting action and fail closed on missing, stale, reused or unexpected identity.

The design must trace normal completion, timeout, cancellation, exception, crash and `finally` behavior for the Worker, conhost and helpers. It must distinguish stream closure, process exit, safe isolation and disposal. For a **real unresponsive Worker or helper**, it must give a credible, independently observable path to finite safe disposition without terminating or otherwise affecting an unidentified process. It must define admission, handle and channel lifetimes, environment failure behavior, authority limits, unrelated-process protection, retained evidence and negative-path tests. A timeout, `unref()`, stream closure, result cutoff or later PID absence alone is not disposal proof. The helper `≤5,000 ms` bound needs a measurable start, end and expiry consequence and remains unproven pending newly authorized direct evidence.

Option B changes a trust and infrastructure boundary. Before any implementation decision, the design must re-review the earlier selected controls across it:

| Control | Required cross-boundary re-review |
| --- | --- |
| T1 | External verifier/key custody, protected atomic single-use attempt claim, claim location, replay/concurrency/crash behavior and the first execution-relevant side effect. The caller or Worker cannot mint authority. |
| P1 | Trusted creator, receipt producer and anchor, cross-boundary creation/assignment, complete Node/conhost/helper membership, fresh identity checks and Controller-issued ARM before CIM/provider influence. A process cannot authenticate its own ownership claim. |
| E1 | Protected failure-ledger owner, placement and ACLs, independence from the primary audit writer, cross-boundary writes and failure of either evidence path after immutable terminal closure. |
| M1 | Externally authenticated trust root and complete manifest for environment image, host binaries, Worker/helpers, imports, configuration, executable paths and environment identity; exact reviewed-to-runnable byte verification immediately before any later execution. |

The later design must preserve one immutable authoritative terminal state, Accepted Result Cutoff, late/stale-result rejection and zero post-closure authoritative mutation. It must map direct negative-path evidence to the applicable WH-01–WH-10 cases, including real membership and disposal evidence for WH-03, WH-08 and WH-09; the existing synthetic or pre-launch findings do not prove those paths.

If no exact, credible boundary can provide finite non-destructive disposition without affecting an unidentified process, **preserve `D2 Design STOP` and return the issue to the owner**. Do not substitute Option A or another mechanism. Any new key, store, service, image, dependency, ACL, privilege, policy, configuration, host or environment requires separately governed change control; this decision approves none of them.

## Authority and next gates

This decision authorizes **candidate-specific design and change-control preparation only**. The sequence is: separate exact isolation-environment design → technical governance review → exact-byte publication → separate owner approval → separate change-control for required mechanisms → bounded source-change authorization → implementation → exact-source/path preflight and safety review → separate R&D execution authorization → newly authorized direct evidence and independent review → any operational GAP-closure decision.

This record does **not** authorize container/VM/service deployment; dependency, privilege, key, store or configuration changes; package source modification; Worker or CIM execution; WH cases; an R&D attempt; formal OE-12; or Shadow activation. It does not reverse the rejected technical preflight or establish GAP-A, GAP-B or worker-disposal proof.

## Preserved governance state

| Item | State |
| --- | --- |
| Technical Preflight | `REJECTED` |
| R&D Execution | `NOT AUTHORIZED` |
| Attempt | `NOT STARTED` |
| GAP-A | `OPEN / mandatory` |
| GAP-B operational closure | `NOT ESTABLISHED` |
| Worker disposal | `OPEN proof obligation` |
| OE-12 | `Not Executed` |
| SIR-02 | `Blocking` |

`GAP Closure = Approved Applicable Design/Boundary AND Newly Authorized Direct Evidence`. This direction satisfies neither operational proof obligation.
