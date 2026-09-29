# SIR-02 KM OE-12 Candidate-Specific R&D Owner / Change-Control Decision v1.0

| Field | Owner decision record |
| --- | --- |
| Status before immutable publication | **Approved / Pending Immutable Publication / Planning Only / No R&D Execution Authorization** |
| Decision owner | GANTUMUR Erdenedalai — Founder / Administrator |
| Decision date | 2026-09-29 |
| Owner option selected | **Option 1 — Authorize Worker-Host R&D Planning Only** |
| Other options | Options 2, 3 and 4 **not selected** |
| Canonical architecture publication | `8295d93cb60dbcfb1c34d863213d521a03a1e013` |
| Exact architecture SHA-256 | `dc3c5544464a28f262f5f5a747fbe1a98be9ce1cbc0208e7fd1cec407505e537` |
| Canonical technical review | `560fd02d28ea4f844e9f7b18af2c98f55dbc94e1` — `Accepted — Architecture Design STOP Valid / Candidate-Specific R&D Change-Control Required` |
| Canonical finding | **Architecture Design STOP — No New Compliant Execution Boundary Identified** |
| Preferred architecture | **None selected** |
| Decision subject | One bounded **worker-host R&D planning** track only; no sandbox/container planning or R&D execution |

## 1. Preconditions and decision boundary

The published architecture has exactly the reviewed bytes and remains `Proposed / Not Approved / No Implementation Authorization`. Its assessed candidate classifications are:

| Candidate architecture class | Canonical classification | Eligibility in this decision |
| --- | --- | --- |
| Dedicated non-interactive worker host | `Needs Separate Environment/R&D Validation` | Eligible for a separate **planning-only** owner choice |
| Worker service/broker | `Not Currently Feasible` | Excluded unless later change control introduces new evidence |
| Ephemeral sandbox/container | `Needs Separate Environment/R&D Validation` | Eligible for a separate **planning-only** owner choice |
| Ephemeral VM/stronger host | `Not Currently Feasible` | Excluded unless later change control introduces new evidence |

No architecture has been selected or approved. **GAP-A = OPEN / mandatory; GAP-B operational closure = NOT ESTABLISHED; bounded non-destructive worker disposal = OPEN proof obligation; Alignment GAP = CLOSED; OE-12 = Not Executed; SIR-02 = Blocking.** No candidate-specific R&D execution, implementation, or operational OE-12 execution authorization is supplied by the canonical publication or review.

The owner selected **Option 1** in the current user instruction. This record does not claim Codex independently verified the owner's personal identity or obtained a separate reviewer attestation. **`R&D Planning Authorization ≠ R&D Execution Authorization`.** The selection permits preparation of one bounded worker-host plan defining future questions, exact environment and proposed source/configuration, ownership model, evidence, acceptance and STOP criteria, and cleanup **only after this exact decision is immutably published**. It does not permit an experiment, approve a mechanism, or establish operational evidence. A local-only record has no governance effect.

## 2. Owner decision — Option 1 selected

**Option 1 is selected.** Options 2, 3 and 4 below remain unselected alternatives; no combined choice is created.

### Option 1 — Authorize Worker-Host R&D Planning Only

**Selected.** Upon immutable publication of this exact owner decision, authorize preparation of **one bounded R&D plan** for the **Dedicated non-interactive worker host** class only. Sandbox/container planning is not included. No experiment, executable source, environment change, or implementation is authorized by this planning choice.

### Option 2 — Authorize Sandbox / Container R&D Planning Only

**Not selected.** This alternative would authorize preparation of **one bounded R&D plan** for the **Ephemeral sandbox/container** class only. Worker-host planning would not be included. Availability, safety and compliance of the facility are not assumed; no experiment, source, environment change, or implementation is authorized by this alternative.

### Option 3 — Authorize Two Independent Candidate-Specific R&D Planning Tracks

**Not selected.** This alternative would authorize preparation of **two separate bounded R&D plans**, one for the **Dedicated non-interactive worker host** class and one for the **Ephemeral sandbox/container** class. The questions, source/environment proposals, evidence, reviews and later execution decisions would remain independent. Evidence from one track cannot automatically establish feasibility, ownership, disposal or acceptance in the other.

### Option 4 — Hold Candidate-Specific R&D

**Not selected.** This alternative would preserve the canonical Architecture Design STOP and perform no further candidate-specific technical work until a later owner decision. A hold would not close a GAP, prove disposal, reclassify prior evidence, or authorize another candidate class.

The worker service/broker and ephemeral VM/stronger-host classes are **not** included in any option above. Adding either requires later separate change control supported by new evidence.

## 3. Worker-host planning boundary after immutable publication

A worker-host plan may ask only bounded, falsifiable, decision-relevant questions, including:

1. Can an independently governed controller/supervisor create one non-interactive, run-bound worker host with retained creation and assignment provenance, without depending on an interactive/shared console?
2. Can an independent receipt producer and anchor authenticate the complete GAP-A ownership tuple without worker self-attestation, including run/generation binding and PID-reuse resistance?
3. Can every child/helper and applicable conhost-equivalent member be completely attributed and freshly revalidated before any process/resource-affecting action?
4. Can authoritative result-channel authority be revoked and the terminal result sealed within an approved finite bound despite worker/provider non-cooperation, without calling that worker disposal?
5. Can the owned worker environment and resources be isolated/disposed within a defined finite bound, non-destructively and without acting on unknown or unverified processes?
6. Can normal, timeout, hang, exception, cancellation and disposal-failure paths retain independent, sanitized lifecycle, closure, membership and cleanup evidence?

These are **questions for a future plan**, not findings of feasibility. The plan must define finite bounds and observable pass/fail evidence before any separately governed execution; this record does not answer or experimentally test them.

## 4. Sandbox/container planning boundary — not selected

A sandbox/container plan may ask only bounded, falsifiable, decision-relevant questions, including:

1. Is a supported ephemeral, per-run isolation facility actually available in the approved Windows and CI/developer environments without unapproved dependency, privilege, or OS/global configuration change?
2. Can independent creation/assignment provenance and an integrity anchor identify the exact host/guest boundary, worker and every owned helper/member before probe admission?
3. Can complete boundary membership and the GAP-A ownership tuple be retained, run/generation-bound, replay resistant, and freshly revalidated before any process/resource-affecting action?
4. Can the whole owned execution environment be isolated/disposed within a defined finite bound on both normal and unresponsive-provider paths without PID-targeted unknown-process action or collateral effect?
5. Can controller-owned terminal closure, channel revocation, late/stale-result fencing and independent sanitized audit remain attributable to one run/generation even when the environment fails or disappears?

Container/sandbox availability, privilege suitability, full membership, safe teardown and disposal are **unproven**. **Option 1 does not authorize this planning track.** This record selects no facility, image, runtime, API, source, cleanup method, or experiment.

## 5. Mandatory contract for any later authorized R&D plan

Each future candidate-specific plan must map every question through **`Question → Environment Boundary → Exact Source / Configuration → Ownership Model → Success / Failure Criteria → STOP Conditions → Evidence Schema → Cleanup / Disposal → Independent Review`** before execution. Questions must be bounded, falsifiable, decision-relevant, dependent on **new** candidate-specific environment evidence, and incapable of being satisfied by re-analysis of retained OE-12 evidence. A planning authorization may define a proposed experiment; only separate review, publication, owner authorization, exact-source/environment review and execution authorization may permit it to run.

Both tracks must preserve **GAP-A = OPEN / mandatory** until newly authorized direct evidence establishes an applicable approved trust boundary. The required identity is **`PID + image path + parent PID + creation time + run token + creation/assignment evidence`**, plus applicable boundary/handle/session/Job identity. A later plan must require an independent receipt producer and probe-independent integrity anchor, pre-probe receipt authority, run/generation binding, replay/PID-reuse protection, full child/helper membership and fresh complete ownership revalidation immediately before each process/resource-affecting action. Self-report and PID membership alone are insufficient; any mismatch or unknown member stops the action without a broader fallback.

Both tracks must preserve **GAP-B operational closure = NOT ESTABLISHED** and **worker disposal = OPEN proof obligation**. `Revoked result authority ≠ disposed worker.` New direct evidence would have to distinguish bounded authoritative closure from bounded, ownership-safe execution-boundary disposal; show one immutable terminal state and Accepted Result Cutoff, zero accepted post-closure authoritative mutation, late/stale rejection, no unknown-resource impact, explicit disposal time/result, and normal/failure/timeout/`finally` cleanup evidence. `Authoritative Validation-Boundary Quiescence` does not claim physical CIM-provider quiescence. **`GAP Closure = Approved Applicable Design/Boundary AND Newly Authorized Direct Evidence`** applies independently to GAP-A and GAP-B.

Before any future execution authorization, the exact reviewed source package and immutable commit, source/bundle SHA-256, `100%` runnable-byte match, actual launcher/executable path, and independently accepted path map are mandatory. Each applicable path must show **`trigger → exact reviewed source → branch/function → exact API/call → state transition → ownership check → cleanup/disposal → retained evidence`**, including success, exception/provider failure, partial result, timeout, cancellation, outer watchdog, and final/`finally` cleanup. This draft does not prepare that source or map.

**No-loop rule:** candidate-specific R&D must introduce newly authorized environment evidence. Prior CIM, runspace, process-tree, Job Object, conhost, smoke, diagnostic and retained OE-12 evidence cannot be repackaged or re-analyzed as new progress or as proof of ownership, disposal or GAP closure. A failed or unresolved attempt remains immutable; another attempt requires its own governed authority.

## 6. Capability, STOP and canonical state

| Stage | Authority from this proposed decision record |
| --- | --- |
| Current, before immutable publication | **Option 1 selected; planning authority pending publication.** No R&D plan or execution authority yet. |
| Pilot | **Not authorized.** No controlled OE-12 evidence, smoke, diagnostic or formal retry. |
| R&D, after immutable publication | **One worker-host planning track only** becomes authorized. R&D execution remains separately gated; sandbox/container planning remains unauthorized. |
| Future | Production/runtime adoption requires separate architecture, security, operations and change control. |

**STOP** rather than work around any need for source/code or experiment in this decision action, dependency installation, OS/global/CIM configuration, service/container/VM creation, privilege elevation, unknown-process action, destructive fallback, tenant/security weakening, production/runtime modification, or claim that result revocation proves physical provider or worker disposal. Selecting a planning track does not select or mark an architecture candidate compliant.

Option 1 closes neither GAP-A nor GAP-B, proves no worker disposal, does not reopen the Alignment GAP, and changes no OE-12/SIR-02 status. **GAP-A = OPEN / mandatory; GAP-B operational closure = NOT ESTABLISHED; worker disposal = OPEN proof obligation; Alignment GAP = CLOSED; OE-12 = Not Executed; SIR-02 = Blocking.**

**Effect rule:** this Option 1 decision becomes effective only when its exact commit is immutably published to `codex/sir-02-immediate-dispatch`. Until then, worker-host planning remains unauthorized. After exact publication, the next permissible action is **prepare one bounded dedicated non-interactive worker-host R&D plan for separate review**. This decision does not authorize preparing a sandbox/container plan, implementing a trust or isolation boundary, writing executable source, executing a process/CIM experiment, or running formal OE-12 evidence.
