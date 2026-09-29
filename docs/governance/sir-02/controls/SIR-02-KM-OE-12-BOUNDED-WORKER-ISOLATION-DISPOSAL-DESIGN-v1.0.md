# SIR-02 KM OE-12 Bounded Worker Isolation / Disposal Design v1.0

| Field | Proposal state |
| --- | --- |
| Status | **Proposed / Not Approved / No Implementation Authorization** |
| Active criterion | **Authoritative Validation-Boundary Quiescence** under `da524cb006253fb0b6a2df79651b830febc5acdd` |
| GAP-B operational closure | **NOT ESTABLISHED** |
| Bounded non-destructive worker disposal | **OPEN proof obligation** |
| Scope | Conceptual isolation, fencing, disposal, and future evidence contract only |

## 1. Distinct authorities and run state

The proposed topology is an independently governed **validation controller**, a separately owned **read-only worker/session boundary**, an **authoritative result gate and state store** that the worker cannot write directly, and an **independent audit channel**. The controller assigns one unique run ID and generation ID, trusted synthetic tenant/source context, approved finite deadline, and verified GAP-A receipt reference before opening the validation boundary. The worker may submit only candidate observations tagged with that run/generation; it cannot set terminal state, move a cutoff, reseal ownership evidence, or accept its own result. The exact process, session, and channel mechanisms are not selected by this proposal.

The authoritative state moves `Prepared → Open → Closing → exactly one terminal state`. Terminal state is one of `Success`, `Fail`, `Timeout`, or `Cancelled` and cannot return to `Open`. At closure, the result gate atomically records terminal reason, closure timestamp, explicit immutable **Accepted Result Cutoff**, accepted result count, and authoritative state version/hash. The cutoff resolves races: an in-scope result is either accepted before closure in the sealed set or classified `Late / Rejected` afterward. Run/generation reuse and cutoff advancement after closure are prohibited.

Every candidate result is checked against the active run/generation, trusted scope, open state, and cutoff before acceptance. Results with a stale generation or delivered after closure are rejected and recorded only as separately labeled **non-authoritative audit metadata**. The independent audit channel retains the opening, terminal closure, cutoff, late/stale rejection dispositions, cleanup outcome, and immutable source/evidence references. A missing or failed closure/audit write cannot be reported as successful validation.

## 2. Boundary-quiescence safety property

The worker or shared CIM provider **may remain internally active** after the authoritative validation boundary becomes terminal. This design does **not** claim physical CIM-provider quiescence. It requires that late activity, results, and callbacks have no route to mutate the sealed OE-12 outcome. The authoritative result gate must reject them based on run/generation and cutoff even if the worker continues to emit them; the worker must have no direct write capability to authoritative state. A later implementation must prove the gate's closure/result ordering and that no alternate or fallback path can bypass it.

The mandatory invariant is:

`authoritative_state_after_closure == authoritative_state_at_closure`

except separately identified non-authoritative audit metadata for rejected late deliveries. Retained proof must compare immutable state/version/hash at closure and after all observed late-result handling and disposal, with **accepted post-closure mutation count = `0`**. One bounded terminal decision is distinct from proof that the worker, provider, and owned resources have been safely disposed.

## 3. Non-destructive worker disposal and unresolved boundary

The controller may stop admission of new work, send an approved cooperative cancellation request, observe for a finite bound, and dispose only resources it is independently proven to own. Every process/resource-identity-affecting operation requires a fresh match to the GAP-A sealed receipt and current full identity, plus handle/session/Job membership evidence where applicable. No PID-only action, unknown-member action, destructive Job-wide action, kill-on-close, `TerminateJobObject`, `TerminateProcess`, `Stop-Process`, `taskkill`, or fallback with broader authority is permitted. Timeout, cancellation, exception, provider failure, partial result, and `finally` must retain their distinct resource states and cleanup outcomes.

If cooperative cancellation and bounded observation cannot establish within the approved bound that the owned worker/session has reached a safe disposal state, the run must retain **`Disposal Unresolved`**, fail closed for operational GAP-B closure, and preserve the unresolved resource/identity evidence. It must not label the worker disposed merely because the result boundary closed, a timeout fired, a handle was released, or late results were fenced. No unknown or unverified process may be terminated to manufacture a disposal PASS.

**Design GAP — Separate Isolation Boundary Required.** The conceptual topology above proves how the **authoritative result** could remain immutable while provider work continues; it does **not** yet establish true bounded, non-destructive disposal for an unresponsive CIM worker. A later separately reviewed isolation/resource-lifecycle design must identify a supported, authority-limited mechanism and direct proof of finite cleanup without collateral effect. Isolation by itself, a cooperative request, or a bounded wait is insufficient if an unresponsive worker can remain live. If no such mechanism can be established without a prohibited action or separate change control, the design must STOP; no destructive fallback is invented here.

## 4. Required future source and evidence gates

A later approved exact-source package must map success, timeout, cancellation, exception, partial result, provider failure, stale generation, late result, unknown member, ownership mismatch, disposal failure, and final/`finally` cleanup to executable branches, exact calls, ownership checks, resource state, disposal, and retained evidence. Runnable bytes must match the independently reviewed package `100%`, and the actual executable/launcher path must be retained. This proposal is not that source review.

Newly authorized direct evidence must demonstrate bounded terminal transition, immutable Accepted Result Cutoff, one terminal state, late/stale-result rejection, zero accepted post-closure mutation, closure/final state equality, independent closure audit, and **separate** bounded non-destructive worker/boundary disposal under both normal and stalled-CIM paths. Until an applicable boundary is approved **and** this new direct evidence passes independent review, GAP-B operational closure remains **NOT ESTABLISHED**. OE-12 remains `Not Executed`; SIR-02 remains `Blocking`.
