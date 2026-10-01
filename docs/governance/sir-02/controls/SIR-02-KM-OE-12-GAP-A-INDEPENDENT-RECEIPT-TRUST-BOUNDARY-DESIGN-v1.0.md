# SIR-02 KM OE-12 GAP-A Independent Receipt Trust-Boundary Design v1.0

| Field | Proposal state |
| --- | --- |
| Status | **Proposed / Not Approved / No Implementation Authorization** |
| Active scoped baseline | Owner effect `da524cb006253fb0b6a2df79651b830febc5acdd`; Alignment-GAP closure `87f98ece53ecd0773137722cc184404743c541f8` |
| Obligation | **GAP-A = OPEN / mandatory** |
| Scope | Conceptual trust-boundary design and future proof contract only; no source or execution |

## 1. Independent ownership-evidence boundary

The future **receipt producer** must be accountable and independent of the CIM validation probe and of the process being evaluated. It must directly create or independently observe each synthetic process creation and assignment event, retain its own event source and producer identity, and issue a run-bound receipt **before** the probe can validate or influence acceptance. Node and conhost require separate role-specific provenance; Job membership, PID proximity, or a process's self-report cannot establish either role's creation/assignment event. The exact producer and event-observation mechanism remain subject to later review and change control.

An **integrity-anchor custodian** must seal the receipt identity and digest or equivalent immutable reference through a write authority unavailable to the probe and its caller-controlled input. The anchor must establish the producer, creation time/order, custody, run/generation binding, and unchanged bytes before validation. The probe may receive only a selector for an independently authenticated read-only lookup; a `receipt + hash` supplied through the same probe-controlled channel is insufficient. The probe must be unable to forge, redefine, rewrite, reseal, or replace the receipt or anchor. An independently controlled audit channel retains the receipt, event, anchor, verification, and denial references.

The **ownership validator** reads the anchored receipt and independently checks current identity. The **authoritative acceptance controller** admits validation only after this check; the CIM probe has no authority to declare ownership or commit an accepted OE-12 result. No single component may independently assert all of process creation, ownership, validation, and acceptance. Separate identities, write permissions, custody, and fail-closed behavior must be demonstrated by later exact design and source review; names or file locations alone do not prove independence.

## 2. Receipt identity and binding contract

For each synthetic process role, the immutable receipt must bind:

`PID + image path + parent PID + creation time + run token + creation/assignment evidence`

It must also bind the unique run ID and generation ID; expected role; producer identity and authority; source/creation event identity; event and receipt timestamps; immutable receipt identity; integrity-anchor reference; and retained process-handle, session, and Job creation/assignment/membership evidence where applicable. An event that merely repeats the probe's asserted fields is not independent provenance. The producer and anchor must retain enough source references to distinguish the exact process instance from a later reuse of the same PID, including for conhost.

The run token and generation must be unique, single-use, and bound before validation. A receipt from another run, generation, role, process instance, or earlier PID incarnation is rejected. The anchor must prohibit mutation and reuse after sealing; a correction requires a separately governed new receipt and run/generation, never resealing an existing accepted receipt. Future evidence must establish when the receipt existed, which authority wrote it, and which authority later read and verified it.

## 3. Required states and fail-closed transitions

`Not Created → Created → Receipt Bound → Ownership Verified → Eligible for Validation`

| Transition | Required evidence and gate |
| --- | --- |
| `Not Created → Created` | Independent creation/assignment event and producer identity, timestamp, exact run/generation, role, and process-instance evidence are retained. |
| `Created → Receipt Bound` | Complete tuple and applicable handle/session/Job facts are sealed to a probe-independent immutable anchor before validation begins. |
| `Receipt Bound → Ownership Verified` | Validator authenticates producer and anchor, checks sealed ordering and full tuple against fresh independent identity evidence, and rejects PID reuse or role/run/generation mismatch. |
| `Ownership Verified → Eligible for Validation` | Acceptance controller records a separate authorization decision tied to the exact receipt, run/generation, trusted synthetic tenant context, and approved scope. |

Any missing, conflicting, stale, unverifiable, late-created, mismatched, or replayed field causes **`Fail Closed`** before validation acceptance. The state may not skip a gate or be reconstructed solely from a probe assertion. Immediately before **every** later process/resource-identity-affecting action, the full tuple and applicable handle/session/Job membership must be freshly revalidated against the sealed receipt. PID reuse, creation-time/image/parent/token mismatch, unknown Job member, stale identity, or an incomplete event is **`STOP — Ownership Revalidation Failed`**. Neither primary nor fallback may bypass the gate.

## 4. Future direct evidence and unresolved design work

Newly authorized direct evidence must show an independently created pre-probe receipt, producer and anchor authority separation, immutable receipt integrity and timestamps, complete Node/conhost creation/assignment provenance, exact run/generation binding, replay rejection, PID-reuse detection, and fresh full-identity revalidation immediately before each applicable action. Positive and deliberately missing/conflicting/stale cases must retain trusted source references and sanitized audit outcomes. Existing PID lists, Job membership, self-supplied receipt/hash pairs, and retained prior smoke/diagnostic records cannot substitute for this new proof.

This is a **proposal**, not a selected or proven producer/anchor implementation. If complete conhost provenance or an independent pre-probe anchor cannot be established within a later approved design, GAP-A remains open and validation must stop. **`GAP Closure = Approved Applicable Design/Boundary AND Newly Authorized Direct Evidence`**; this draft supplies neither approval nor direct evidence. No source/code, production/runtime control, environment, dependency, or canonical OE/SIR status is changed.
