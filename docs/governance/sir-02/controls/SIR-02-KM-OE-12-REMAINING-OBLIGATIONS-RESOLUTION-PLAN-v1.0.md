# SIR-02 KM OE-12 Remaining Obligations Resolution Plan v1.0

| Field | Plan state |
| --- | --- |
| Status | **Proposed / Not Approved / No Implementation Authorization** |
| Active baseline | Owner effect `da524cb006253fb0b6a2df79651b830febc5acdd`; Alignment-GAP closure `87f98ece53ecd0773137722cc184404743c541f8` |
| Alignment GAP | **CLOSED** — governance alignment only |
| GAP-A | **OPEN / mandatory** |
| GAP-B criterion/design | **ACTIVE / baseline-approved**: `Authoritative Validation-Boundary Quiescence` |
| GAP-B operational closure | **NOT ESTABLISHED** |
| Bounded non-destructive worker disposal | **OPEN proof obligation** |
| OE-12 / SIR-02 | **Not Executed / Blocking** |

## 1. Resolution scope and dependencies

This unpublished package proposes two distinct, still-unproven boundaries: `SIR-02-KM-OE-12-GAP-A-INDEPENDENT-RECEIPT-TRUST-BOUNDARY-DESIGN-v1.0.md` and `SIR-02-KM-OE-12-BOUNDED-WORKER-ISOLATION-DISPOSAL-DESIGN-v1.0.md`. The first requires an independent pre-probe ownership receipt and integrity anchor; the second separates bounded authoritative-result closure from physical worker disposal. Neither design is approved or operationally evidenced. GAP-A trust must gate any future worker validation or process-affecting action. A design that closes the result boundary but cannot prove safe, bounded worker disposal still leaves GAP-B operationally open.

The mandatory ownership model remains **`PID + image path + parent PID + creation time + run token + creation/assignment evidence`**, bound to exact run and generation, plus retained handle/session/Job identity and membership evidence where applicable. It cannot be reduced to PID, Job membership, or probe self-report. Fresh full-identity revalidation is required immediately before every process/resource-identity-affecting action; missing, mismatched, stale, reused, or unexpected identity fails closed. Tenant, source ownership, authorization, fail-closed denial, sanitized audit, and OE-08 synthetic audit-only controls remain in force.

## 2. Future executable-path and source-integrity contract

Before any execution, a future implementation must identify an immutable independently reviewed exact source package and SHA-256 for every source/helper and bundle, extract or copy runnable bytes into a fresh execution location, prove **`100% MATCH`** to reviewed bytes, reject unreviewed helpers, and retain the actual executable/launcher path. An independent source-safety review must accept every applicable executable mapping in this exact form:

`trigger → exact reviewed source → branch/function → exact API/call → state transition → ownership check → cleanup/disposal → retained evidence`

For each path, the map must explicitly record **`Ownership Check = Required`** or **`Ownership Check = Not Applicable — <reason>`**. Any path that can affect a process/resource identity requires fresh complete ownership revalidation immediately before the action. Fallback, watchdog, `finally`, timeout, or exception paths have no wider authority than the primary path and cannot bypass the same safety gate. Prose or comments alone cannot satisfy this source-level contract.

| Mandatory path class | Required future source-level proof |
| --- | --- |
| Successful validation | Exact acceptance branch, run/generation and receipt checks, state transition, audit, and owned-resource cleanup. |
| Timeout and cancellation | Separate triggers, finite authoritative closure, cooperative signal, outstanding-operation state, disposal and audit; no timeout-to-disposal inference. |
| Exception, partial result, provider failure | Separate fail-closed branch, sanitized category, no accepted partial result, resource/operation state, cleanup and evidence. |
| Stale generation and late result | Run/generation and cutoff checks, rejection branch, no authoritative mutation, non-authoritative audit disposition. |
| Unknown member and ownership mismatch | Fresh tuple and membership check, `STOP — Ownership Revalidation Failed`, no destructive or broader fallback, retained identity evidence. |
| Disposal failure | Distinct unresolved-resource state, bounded observation outcome, no false cleanup success or GAP closure. |
| Final/`finally` cleanup | Exact resource/handle disposal order, independent cleanup errors, temporary-file state, final authoritative state comparison and audit. |

The future mapping must also cover outer/watchdog timeout, launcher/child early exit if applicable, and every applicable branch added by a selected isolation mechanism. Any unreviewed branch or unverified identity is a pre-execution STOP.

## 3. Newly authorized direct-evidence requirements

| Obligation | Future direct evidence required before independent closure review |
| --- | --- |
| GAP-A — independent receipt trust | Prove producer independent of probe; producer/event identity; creation and sealing before probe validation; probe-independent anchor integrity and custody; full Node/conhost ownership tuple and applicable handle/session/Job facts; exact run/generation binding; replay and PID-reuse rejection; fresh pre-action revalidation; fail-closed negative cases and immutable sanitized audit. |
| GAP-B — authoritative validation boundary | Prove finite terminal transition; exactly one immutable terminal state and reason; explicit immutable Accepted Result Cutoff; run/generation result fence; late/stale rejection; accepted post-closure mutation count `0`; `authoritative_state_after_closure == authoritative_state_at_closure`; independent closure and rejection audit. |
| GAP-B — worker/boundary disposal | Separately prove bounded, non-destructive, ownership-aware worker/session and owned-resource disposal in success, timeout, cancellation, exception, partial/provider-failure, stalled-CIM and `finally` paths; prove unknown/unverified members are unaffected; retain unresolved outcomes without reporting success. |

**`GAP Closure = Approved Applicable Design/Boundary AND Newly Authorized Direct Evidence`** for both GAP-A and GAP-B. Approved design alone cannot close a GAP; evidence gathered against an unapproved design cannot close it. Prior retained evidence or adjacent-control results cannot substitute for direct evidence. The proposed separate isolation boundary is a **design GAP**, not a demonstrated disposal mechanism.

## 4. Required governance sequence and no-loop rule

`Design review → exact-byte publication → owner approval → implementation change-control → exact-source implementation → source safety review → execution authorization → new direct evidence → independent evidence review → GAP closure decision`

Do not skip or merge a stage by inference. Exact design review and owner approval must precede any implementation change-control. The accepted exact-source safety review must precede execution authorization. New direct evidence must be generated only under that authorization and independently reviewed before a separate closure decision. This plan and the two companion designs grant none of those authorities.

**Mandatory conditional ordering rule:** `If the current worker design cannot itself prove bounded, non-destructive disposal of an unresponsive worker, implementation authorization is prohibited until a separate isolation-boundary design has completed all required governance gates.` The current worker design records exactly that unresolved disposal obligation. Therefore the required additional sequence is:

`Separate Isolation-Boundary Design → Technical Governance Review → Exact-Byte Publication → Separate Owner Approval → Implementation Change-Control → Implementation Authorization → Exact-Source Implementation → Source Safety Review → Execution Authorization → Newly Authorized Direct Evidence → Independent Evidence Review → GAP Closure Decision`

**No implementation/source work for the unresolved worker-disposal mechanism may begin before the separate isolation-boundary design has been reviewed, published at reviewed bytes, and owner-approved.** The generic approval of this three-document package cannot substitute for those separate gates. The future isolation-boundary design must define boundary ownership, worker/session lifecycle, exact run/generation binding, bounded termination of the authoritative validation boundary, non-destructive disposal semantics, authority limits, fresh ownership checks, late-result fencing, cleanup/`finally` behavior, and retained independent audit evidence. Its technical review and owner approval must establish design readiness without treating approval as GAP-B operational closure. The governing `GAP Closure = Approved Applicable Design/Boundary AND Newly Authorized Direct Evidence` rule still requires subsequent newly authorized direct proof.

**No further re-analysis of previously retained OE-12 evidence may be used to close GAP-A or GAP-B.** Progress must introduce at least one of an approved new trust boundary, approved new isolation/disposal boundary, approved implementation, or newly authorized direct evidence, as applicable to the governing stage. The Alignment GAP is already closed as a governance-consistency matter; it cannot be treated as operational proof for either GAP.

## 5. STOP findings and limits

**Current design finding:** the proposed result fence does not prove finite non-destructive disposal of an unresponsive CIM worker. **`Design GAP — Separate Isolation Boundary Required`** remains the correct classification until a supported mechanism and direct proof are separately approved and evidenced. Complete independent Node/conhost receipt provenance is likewise not yet selected or proven. These open findings prohibit claiming GAP-A or GAP-B operational closure.

Stop and record the reason if a later design would require weakening the ownership tuple, probe self-attestation as sole receipt evidence, PID-only ownership, destructive cleanup of unknown processes, privilege elevation, OS/global configuration change, an unreviewed dependency, production/runtime modification, or bypass of AI/Core tenant/security controls. Do not implement such a requirement under this package; use separate change control where permissible. No destructive fallback may be invented to turn an unresolved disposal path into a PASS.

These three files are **unpublished proposals**. No executable source/code, process/CIM probe, synthetic execution, baseline/status change, or implementation/execution authorization is created here. **Next permissible action: Technical governance review of the three exact proposal bytes.**
