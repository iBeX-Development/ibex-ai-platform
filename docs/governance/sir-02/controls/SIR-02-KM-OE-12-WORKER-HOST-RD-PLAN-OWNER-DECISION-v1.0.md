# SIR-02 KM OE-12 Worker-Host R&D Plan Owner Decision v1.0

| Field | Owner decision |
| --- | --- |
| Status before publication | **Approved / Pending Immutable Publication / No R&D Execution Authorization** |
| Owner | **GANTUMUR Erdenedalai — Founder / Administrator** |
| Decision date | **2026-09-29** |
| Decision | **Approve the OE-12 Worker-Host R&D Plan for Exact Source / Configuration Preparation** |
| Approved candidate | **Dedicated non-interactive worker host** only |
| Approved technical review | `894b04dcecd76fb7a3ba044bb381e57764402216` — `Accepted — Worker-Host R&D Plan Ready for Exact-Byte Publication and Owner Approval` |
| Approved plan publication | `83d74ca3f1962e2963b1011b2a97b9b55344486d` — commit contains only `SIR-02-KM-OE-12-WORKER-HOST-RD-PLAN-v1.0.md` |
| Exact published plan SHA-256 | `c559e0486ee287364ce57ff1c5e190229a4a63af877f5508a7dec90a720de984` |
| Authority granted after effect | Exact source/configuration **preparation only**, followed by separate path preflight and safety review |

## 1. Exact approval and effect rule

The owner approves **the exact reviewed and published Worker-Host R&D Plan** named above **for Exact Source / Configuration Preparation**. This decision neither alters that plan nor selects a production architecture. It does not approve the worker-host candidate as compliant. The owner identity and decision are supplied by the current user instruction; this record does not claim that Codex independently verified personal identity or obtained a separate human reviewer attestation.

**Effect rule:** this approval becomes effective only when the exact commit containing this owner-decision record is immutably published to `codex/sir-02-immediate-dispatch`. A local-only commit remains **`Approved / Pending Immutable Publication / No R&D Execution Authorization`** and grants no source-preparation authority. After publication, only the exact source/configuration preparation stage may begin. Plan publication, this approval, exact-source preparation, source safety review and R&D execution authorization remain distinct governance acts.

## 2. Reviewed contract retained without modification

Approval preserves **RQ-1–RQ-5** as independent, falsifiable questions: creation provenance; full worker/helper membership; controller-owned closure and result-authority separation; bounded ownership-safe disposal; and independent failure, cleanup and audit evidence. It preserves **WH-01–WH-10** as the future normal, timeout, unresponsive, exception, late-result, stale-generation, ownership-mismatch, unexpected-member, disposal-failure and cleanup/`finally` cases. It preserves **SC-1–SC-8** as separate mandatory criteria; failure of any one remains **`Worker-Host Candidate Not Proven Compliant`**, with no aggregate PASS substitution.

The published plan's proposed bounds remain unchanged and unproven:

| Bound | Proposed reviewed value |
| --- | --- |
| Worker startup `T_start` | **8 s** |
| Provider observation `T_provider` | **10 s** |
| Authoritative closure `T_close` | **2 s** |
| Cooperative cancellation grace `T_cancel` | **2 s** |
| Fresh ownership evidence age `T_fresh` | **500 ms maximum**, with immediate pre-action revalidation still mandatory |
| Worker disposal/safe isolation `T_dispose` | **5 s** |
| Total future R&D run `T_total` | **45 s** |

The approved preparation must preserve the full **`PID + image path + parent PID + creation time + run token + creation/assignment evidence`** ownership tuple; an independent pre-probe receipt producer and probe-independent integrity anchor; applicable handle/session/boundary identity; run/generation binding and PID-reuse/replay resistance; and fresh complete identity/member revalidation immediately before every process/resource-affecting action. A worker self-report or PID list is never sufficient.

It must preserve the controller's exactly one immutable `Success | Timeout | Fail | Cancelled` terminal state, Accepted Result Cutoff, run/generation result-authority revocation, late/stale rejection, accepted post-closure mutation count `0`, and closure/final authoritative-state equality. **Result revocation does not prove worker disposal**, and Authoritative Validation-Boundary Quiescence does not assert physical CIM-provider quiescence. Normal, timeout, hang, exception, ownership-failure, disposal-failure and `finally` cleanup paths remain fail closed. Unknown members, stale ownership, unverified disposal, destructive fallback, prohibited privilege/configuration change and evidence loss remain STOP conditions. At most **one future separately authorized R&D run package** may be proposed; a failed attempt requires immutable retention and new authority for retry.

## 3. Exact source/configuration preparation scope after publication

Preparation may produce only an exact, reviewable package for this **worker-host** R&D candidate, including as applicable:

- supervisor/launcher source;
- worker source;
- independent receipt producer and verifier interface material;
- result-channel source/configuration;
- disposal/cleanup logic;
- configuration and synthetic inputs;
- dependency/version inventory and exact environment declaration.

The future package must name every execution-relevant file/helper and retain SHA-256 for reviewed source/configuration and bundle. Before any later execution, a separately accepted exact-source/path preflight must prove **`reviewed bytes == runnable bytes` for 100% of relevant artifacts**, retain the actual executable/launcher paths, and map every applicable case and exit path as **`trigger → exact reviewed source → branch/function → exact API/call → state transition → ownership check → cleanup/disposal → retained evidence`**. Each path must explicitly say `Ownership Check = Required` or `Not Applicable — <reason>`. Source safety review and a **separate R&D execution authorization** must follow; this owner approval cannot replace either.

## 4. Capability and canonical-state boundary

This decision **does not authorize** a worker launch, process creation/termination for R&D, CIM/provider observation, an R&D experiment or evidence run, dependency installation, elevation, service/OS/global configuration change, production/runtime implementation, sandbox/container work or formal OE-12 execution. No exact-source/configuration package is prepared in this owner-decision action. The published plan remains at its exact bytes; its proposal status is not rewritten in place.

**GAP-A = OPEN / mandatory; GAP-B operational closure = NOT ESTABLISHED; bounded non-destructive worker disposal = OPEN proof obligation; Alignment GAP = CLOSED; OE-12 = Not Executed; SIR-02 = Blocking.** Plan approval closes neither GAP and does not prove worker disposal. The rule remains **`GAP Closure = Approved Applicable Design/Boundary AND Newly Authorized Direct Evidence`**.

After this decision is immutably published, the required next sequence is **`Exact Source / Configuration Preparation → Exact Source / Path Preflight → Source Safety Review → Separate R&D Execution Authorization → One Authorized R&D Execution`**. No stage implies the next. **Next permissible action now:** publish this exact owner-decision commit unchanged; do not prepare source, execute anything or change canonical status in this action.
