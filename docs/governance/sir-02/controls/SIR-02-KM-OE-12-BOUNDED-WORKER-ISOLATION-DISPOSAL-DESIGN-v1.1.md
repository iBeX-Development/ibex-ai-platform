# SIR-02 KM OE-12 Bounded Worker Isolation / Disposal Design v1.1 — Coordinated D2 Successor Draft

**Status:** `Proposed / Not Approved / Not Effective`

**Change-set member:** `SIR-02-KM-OE-12-BOUNDED-WORKER-ISOLATION-DISPOSAL-DESIGN-v1.1.md`.

**Owner provenance:** The owner's 2026-09-30 instruction in this conversation directs preparation of six drafts only; it is not approval or activation of controlled termination.

**Predecessor:** `SIR-02-KM-OE-12-BOUNDED-WORKER-ISOLATION-DISPOSAL-DESIGN-v1.0.md`, published as an approved resolution direction only. It is not an approved disposal mechanism or implementation authority. Its §3 explicit call ban remains governing until separately reconciled.

**Reviewed redline:** `SIR-02-KM-OE-12-D2-CONTROLLED-TERMINATION-SAFETY-CONTRACT-AMENDMENT-PROPOSAL-v1.0.md` at `bbed96a4e730c2e3595f08745406c4770b6b8dc0`, B3; technical review `077cb9b4d6e6f61f6eba799cb1b8b6542020d429`, decision `Suitable for Owner Decision — Not Effective`.

**Indivisible change set:** `SIR-02-KM-OE-12-CRITERION-AMENDMENT-v1.2.md`; `SIR-02-KM-OPERATIONAL-EVIDENCE-ACCEPTANCE-MATRIX-AMENDMENT-v1.2.md`; `SIR-02-KM-OPERATIONAL-EVIDENCE-EXECUTION-PLAN-AMENDMENT-v1.2.md`; `SIR-02-KM-OE-12-AUTHORITATIVE-VALIDATION-BOUNDARY-DETAILED-DESIGN-v1.1.md`; `SIR-02-KM-OE-12-WORKER-HOST-RD-PLAN-v1.1.md`; and this bounded-worker design v1.1. **No member becomes effective alone.** All six require exact-byte technical review, publication, separate owner approval/effect and governance linkage as one coordinated package. Until then, effective predecessors and the v1.0 §3 ban remain authoritative. If later effected, this draft replaces only the B3 sentence below; all other v1.0 design and evidence obligations carry forward.

## B3 — Direct call-ban conflict and proposed replacement

**Current §3 sentence, exact text:**

> No PID-only action, unknown-member action, destructive Job-wide action, kill-on-close, `TerminateJobObject`, `TerminateProcess`, `Stop-Process`, `taskkill`, or fallback with broader authority is permitted.

**Proposed successor operation:** replace only that sentence, and only under the indivisible effect rule, with:

> No PID-only action, unknown-member action, destructive Job-wide action on unresolved membership, kill-on-close of an unverified Job, or fallback with broader authority is permitted. The Controller, Worker and watchdog may not invoke `TerminateJobObject`, `TerminateProcess`, `Stop-Process`, `taskkill` or equivalent force action. A distinct independent outer owner may be considered for one exact reviewed controlled-termination mechanism **only after** an owner-effected OE-12 safety-contract amendment, an independently reviewed and owner-approved exclusive-boundary design, separate mechanism/environment and source change control, and fresh complete run-bound member/boundary ownership checks. The action must affect no unidentified or unrelated process and must be followed by bounded independent exit/disposal and external evidence verification. Any missing guard or failed observation is STOP; no alternative destructive fallback is inferred.

This is a **direct material conflict requiring a separate owner decision**, not an interpretation of the current ban. The proposed exception is confined to a distinct independently authorized outer owner and a fully verified, exclusive single-run boundary after the approved timeout and cooperative grace. Complete actual Node/Worker/helper/conhost and host-managed membership, independent creation/assignment provenance, fresh full identity, zero unrelated effect, finite non-resetting deadline, native result, external immutable evidence and observed final resource state must be proved. A paused-but-live boundary is only temporary isolation; it never satisfies disposal or finite completion. `Disposal Unresolved` remains the fail-closed outcome when proof is missing.

**Unresolved design STOP:** No exact VM/container or other safe native mechanism, independent outer-owner trust root, complete actual admission method, finite real-hang disposal, timed-out helper disposition or post-action observer has been selected or proven. A documented API, stream close, `unref()`, timeout or later PID absence is not proof. The Option B Design STOP and worker-disposal proof obligation remain; GAP-A stays mandatory, and GAP-B operational closure is not established. Any new key, account, feature, dependency, privilege, service or configuration needs separate change control before mechanism/source work. This draft grants no process or environment action.

**Unresolved cross-clause conflict before effect:** The retained v1.0 §3 heading/Design GAP and §4 direct-evidence sentence still use **non-destructive** disposal language. Replacing only the B3 call-ban sentence does not silently revise those requirements. A later technical review and separate owner decision must resolve the exact versioned wording across this document and the Worker-Host Plan before either can take effect. No force action is reclassified as “non-destructive,” and no partial activation is permitted.

`Controlled termination = NOT APPROVED`; `Technical Preflight = REJECTED`; `R&D Execution = NOT AUTHORIZED`; `Attempt = NOT STARTED`; `OE-12 = Not Executed`; `SIR-02 = Blocking`.
