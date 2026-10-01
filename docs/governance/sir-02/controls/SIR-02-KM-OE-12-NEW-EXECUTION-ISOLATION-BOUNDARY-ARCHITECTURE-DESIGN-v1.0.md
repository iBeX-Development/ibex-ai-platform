# SIR-02 KM OE-12 New Execution / Isolation-Boundary Architecture Design v1.0

| Field | Architecture proposal |
| --- | --- |
| Status | **Proposed / Not Approved / No Implementation Authorization** |
| Owner design authority | Option 1 decision `794aae6db3d0bb98cc66de83c8355b149bb11e18` — design preparation only |
| Canonical prior Design STOP | Publication `2379951558e02c2d5663355afdb1f747d27a228e`; accepted technical review `b6c8a40c6ebae5ae2fe2c9cfbfaddfb8d3aaabfe` |
| Prior finding | **Design STOP — No Compliant Isolation Boundary Identified** for the previously assessed mechanisms |
| Present architecture decision | **Architecture Design STOP — No New Compliant Execution Boundary Identified** under current approved evidence and environment constraints |
| Preferred candidate | **None selected** |
| Active criterion | **Authoritative Validation-Boundary Quiescence**; no physical CIM-provider quiescence claim |
| GAP-A / GAP-B operational closure / worker disposal | **OPEN / mandatory** / **NOT ESTABLISHED** / **OPEN proof obligation** |
| Alignment GAP / OE-12 / SIR-02 | **CLOSED** / **Not Executed** / **Blocking** |

## 1. Authority, objective, and scope

The Option 1 owner decision is immutably published on `codex/sir-02-immediate-dispatch`. It permits this **architecture design proposal only**. No concrete worker mechanism, trust boundary, environment, source, implementation, R&D experiment, diagnostic, smoke, or OE-12 run is approved. The prior Design STOP remains valid for same-process/thread and ordinary PowerShell runspace isolation, direct parent-process termination, PID-only control, incomplete Job membership, shared console/conhost topology, and repetition of the same CIM client timeout/cancellation model. Existing failed attempts and evidence retain their classifications.

The objective is a **materially new execution boundary** in which the **Authoritative OE-12 Controller does not depend on direct in-process or shared-host control of an unresponsive CIM/provider operation**. Worker or provider non-cooperation must not prevent bounded closure of the authoritative validation boundary, and must not create cleanup authority over an unknown process. The architecture must separately prove finite, safe lifetime and deterministic disposal of the owned worker execution environment; result fencing alone cannot satisfy that worker-disposal obligation.

Two logical flows are required:

`Authoritative Controller → Execution Boundary Supervisor → Disposable / Isolated Worker Environment → Read-Only CIM / Provider Operation`

`Worker Result Channel → Generation / Cutoff Fence → Immutable Authoritative State → Independent Audit Evidence`

An **independent GAP-A receipt/identity authority** is a third trust dependency spanning controller, supervisor, and worker admission. It is not a worker-supplied attestation. Logical roles below do not select a process, service, container, VM, IPC protocol, credential, storage engine, or OS configuration.

| Role and trust zone | Authority and data flow | Owned lifecycle and failure boundary | Required evidence |
| --- | --- | --- | --- |
| Authoritative Controller — trusted validation authority | Owns run/generation admission, approved deadline, terminal decision, cutoff and revocation. Receives only independently verified receipt and fenced candidate results; never grants the worker direct state access. | Must close within a finite bound even if supervisor, worker, IPC or provider stalls. Controller failure is fail-closed and independently recorded; it cannot silently turn missing evidence into success. | Admission/closure, terminal reason/time, cutoff, accepted count, state references, revocation and failure/audit outcome. |
| Execution Boundary Supervisor — separately governed execution authority | Creates/adopts one per-run worker environment under a future approved mechanism; observes its identity and resources; sends only permitted admission/cancellation/disposal commands. It cannot decide or rewrite the OE-12 authoritative result. | Must account for own handles/session, child/helper membership, crash, lost contact, bounded observation and safe cleanup. A supervisor crash must not keep the authoritative boundary open. | Creation/assignment events, handle/session and membership identity, run binding, supervisor health, cleanup attempts and unresolved state. |
| Independent receipt/identity authority — outside worker/probe control | Anchors the creator/event and full ownership tuple before worker validation; makes an immutable receipt available to controller and permitted validators. The actual producer/anchor is **not chosen or proven**. | Missing, late, replayed, altered or mismatched receipt blocks worker admission or process action. Must not be resealed by worker or supervisor-controlled probe input. | Producer identity, pre-probe seal/time, independent digest/reference, run/generation binding, full tuple and current revalidation result. |
| Disposable / Isolated Worker Environment — untrusted observation boundary | Receives one governed run/generation, exact read-only query scope and limited target context; emits candidate observations only. It cannot write authoritative result, accepted set, receipt, audit seal, Core iBeX or another tenant/run. | Worker, any host process, helper, child, handles, session and owned query resources require a defined finite lifetime and safe disposal. A hung or unknown resource remains an explicit failure, never an assumed cleanup success. | Boundary identity, admission/exit/resource census, deadlines, disposal outcome, unexpected members and sanitized native errors. |
| Read-Only CIM / Provider Operation — lower-trust external dependency | Reads only approved synthetic target fields; output is untrusted candidate data. A shared provider may continue internally after authoritative closure. | Provider hang/failure must not block controller closure or mutate sealed result. Owned operation/session state must be tracked and disposed where applicable; shared-provider physical quiescence is not asserted. | Query/operation state, request/time, provider status, error category, cancellation and unresolved or late result. |
| Result channel and generation/cutoff fence — transport plus trusted acceptance gate | Channel carries run/generation/sequence-tagged candidates. Controller-owned fence accepts only validated pre-cutoff results while open; closure revokes generation authority. | Broken/partial IPC is fail-closed. Channel revocation prevents authoritative writes; it does **not** prove worker exit or disposal. Late/stale delivery is rejected into non-authoritative audit metadata. | Send/receive/accepted/rejected counts, channel closure, stale/late disposition and cutoff reference. |
| Immutable authoritative state and independent audit — separate trusted authorities | Only Controller can set one terminal state; audit independently retains sanitized closure, ownership, rejection, cleanup and integrity records. Worker cannot reseal either. | Terminal state and cutoff never reopen/advance. Audit-sink failure blocks success and is separately retained without changing historical results. | Closure and final state hashes/references, zero post-closure accepted mutations, sink outcome, immutable source/evidence references. |

## 2. Historical Design STOP and materially new classes

The previously assessed techniques may appear later only as internal primitives **inside a materially different, independently bounded higher-level environment** with complete ownership and safe disposal proof. Repackaging the same process, Job, runspace, shared console, or CIM timeout as a new name does not escape the canonical STOP. This proposal evaluates four *architecture classes*, not implementations:

| Candidate | Material boundary change | Current classification | Dispositive unresolved property |
| --- | --- | --- | --- |
| **A. Dedicated non-interactive worker-host boundary** | A separately created per-run host, explicit supervisor-owned handle/session, no interactive/shared-console dependency, explicit IPC/result channel, one run/generation per host, and independently retained creation provenance. This differs from an ordinary child process only if the host boundary also owns and accounts for the entire worker/helper lifecycle. | **Needs Separate Environment/R&D Validation** | No retained evidence proves complete host/child ownership or finite **non-destructive** disposal of a hung host and its resources on this Windows environment. Merely making a process non-interactive does not supply that proof. |
| **B. Dedicated worker-service / broker boundary** | Controller submits a run contract to a separately governed broker that owns provider execution; controller owns only admission, result fencing and authoritative closure. | **Not Currently Feasible** within present authority | Broker/service account, privilege, installation/configuration, lifetime, helper containment and independent disposal authority are unapproved/unverified. A resident broker is not itself a disposable per-run worker boundary. |
| **C. Ephemeral sandbox / containerized execution boundary** | One run/generation enters a disposable environment with no shared authoritative state; the supervisor would own environment lifecycle rather than an individual shared-host process. | **Needs Separate Environment/R&D Validation** | Windows/CI availability, dependency/configuration needs, host/guest provenance, all-member containment and finite non-destructive environment disposal are unverified. Destroying an environment with an unknown member cannot be assumed safe. |
| **D. Ephemeral VM or equivalent stronger host boundary** | The worker/provider would be placed inside a per-run host boundary whose creation, resources and retirement are independently governed. This is assessed only as an architectural class. | **Not Currently Feasible** within present authority | No approved VM capability, privilege/configuration/dependency model, complete ownership map, finite safe retirement guarantee, or acceptable operational/cost model is established. Availability is not assumed. |

### Candidate evaluation against mandatory controls

Terms in this matrix are **design findings, not scores**: `Possible / unproven` means the class could express the control but no approved mechanism or direct evidence establishes it; `Conditional` means a separate design/change-control decision is required; `Unproven` means the required property is not established. None is a PASS for operational acceptance.

| Mandatory dimension | A — Worker host | B — Broker | C — Sandbox/container | D — VM/stronger host |
| --- | --- | --- | --- | --- |
| Independent execution identity | Possible / unproven host handle and creation record | Conditional broker and per-run worker identity | Conditional host/guest identity mapping | Conditional VM/guest identity mapping |
| Bounded authoritative closure | Possible via controller-owned deadline/fence, unproven | Possible if controller remains independent, unproven | Possible if controller stays outside sandbox, unproven | Possible if controller stays outside VM, unproven |
| Bounded worker/environment disposal | **Unproven** for hung host and descendants | **Unproven** for broker-owned hung worker | **Unproven** for safe bounded environment retirement | **Unproven** for safe bounded VM retirement |
| Non-destructive behavior | Conditional full ownership and approved action; no automatic termination | Conditional broker authority and account boundaries | Conditional no unknown member/collateral effect | Conditional no unknown member/collateral effect |
| GAP-A ownership compatibility | Possible / unproven independent receipt | Possible / unproven broker-independent receipt | Conditional cross-boundary receipt | Conditional host/guest receipt |
| Complete creation/assignment provenance | Unproven host, helper and conhost chain | Unproven broker/service/worker chain | Unproven host plus sandbox/guest chain | Unproven host plus VM/guest chain |
| Helper/child containment | Unproven; no shared-console assumption allowed | Unproven broker child census | Unproven environment member census | Unproven guest/member census |
| No unknown-member action | Required, not yet demonstrated | Required, not yet demonstrated | Required, not yet demonstrated | Required, not yet demonstrated |
| One run/generation per boundary | Design contract possible, unproven | Requires per-run sub-boundary; resident broker alone insufficient | Design contract possible, unproven | Design contract possible, unproven |
| Late-result fencing | Controller-owned fence possible, unproven | Controller-owned fence possible, unproven | External fence possible, unproven | External fence possible, unproven |
| Stale-result rejection | Run/generation check required | Run/generation check required | Run/generation check required | Run/generation check required |
| Result-channel revocation | Explicit IPC required; disposal distinct | Broker IPC required; disposal distinct | Cross-boundary IPC required; disposal distinct | Cross-host IPC required; disposal distinct |
| Independent auditability | Independent channel required; unproven | Broker cannot be sole audit authority | Sandbox cannot be sole audit authority | VM cannot be sole audit authority |
| Failure containment | Host crash/hang must not affect controller or tenant | Broker crash/shared service blast radius unresolved | Sandbox escape/shared-host effect unresolved | VM/host failure effect unresolved |
| Privilege requirement | Unknown; no elevation assumed | Service/account rights require change control | Unknown; may require privilege/change control | Unknown; likely needs host authority; not assumed |
| OS/global configuration requirement | No change may be assumed; host capability unverified | Service installation/configuration would require approval | Windows sandbox/container capability/config unverified | VM/hypervisor capability/config unverified |
| New dependency requirement | Unknown; no package approved | Broker packaging/dependency unapproved | Image/runtime/dependency unapproved | VM image/platform/dependency unapproved |
| Windows compatibility | Non-interactive host behavior unverified | Broker/service lifecycle unverified | Sandbox/container support unverified | VM availability unverified |
| CI/developer compatibility | Per-run host and cleanup unverified | Service/account deployment unverified | CI image/runtime and cleanup unverified | CI capacity, startup and cleanup unverified |
| Tenant/security impact | Must preserve tenant-scoped run and no Core access | Broker multi-tenant authority requires separate scrutiny | Environment tenancy and data boundary unproven | VM tenancy and host boundary unproven |
| Operational complexity | Per-run host, IPC, provenance and cleanup burden | Persistent broker operations, account and service governance | Environment images, lifecycle and evidence handling | Host provisioning, lifecycle and cost burden unverified; no approved estimate |
| Future production suitability | Separate architecture review; no adoption implied | Separate service/security/operations review | Separate platform/runtime review | Separate infrastructure and cost review |

**Preferred-architecture gate result: `Architecture Design STOP — No New Compliant Execution Boundary Identified`.** None of A–D currently satisfies *all* mandatory controls conceptually **under the active approval and known environment facts**, chiefly complete independent GAP-A ownership and a finite, non-destructive disposal path for an unresponsive worker/environment without unknown-member impact. A, C and their boundary semantics warrant separately governed environment questions; B and D require broader service/host capability and change control. No preferred architecture is selected. This is not a claim that every future architecture is impossible or that `Authoritative Validation-Boundary Quiescence` is invalid.

## 3. GAP-A independent trust integration — mandatory and open

The future architecture must establish this **full identity tuple** before worker admission and before every applicable process/resource-affecting action: **`PID + image path + parent PID + creation time + run token + creation/assignment evidence`**, plus retained handle/session/worker-boundary/Job or host/guest membership evidence where applicable. A PID list, local execution, worker self-report, or receipt plus hash supplied through the same worker-controlled input is insufficient.

1. **Boundary creator:** a separately governed Execution Boundary Supervisor would create or adopt the per-run worker boundary through a future approved interface. The exact creator/API and process topology are **unselected**.
2. **Receipt producer and anchor:** an authority **independent of the worker/probe and its writable input**, with a separately governed custody path, must observe the creation/assignment event and seal the full tuple. The producer and anchor mechanism are **unproven GAP-A obligations**, not capabilities assumed from the supervisor label.
3. **Authority point:** the receipt becomes authoritative only after immutable, probe-independent sealing **before** worker admission/query validation. It must bind producer identity, run/generation, synthetic role, event time, exact process/boundary identity, and reference/hash. Worker or probe cannot rewrite, reseal, or redefine it.
4. **Validation and reuse resistance:** the Controller's independent verifier checks the anchor and current identity; the supervisor may supply observations but cannot be sole verifier of its own claim. Run/generation identity is single-use; mismatched creation time/image/parent/token or event binding rejects PID reuse and replay.
5. **Fresh pre-action check:** immediately before each permitted process/resource-affecting action, an independent authority re-reads the full current tuple and complete applicable membership/handle/session/boundary set against the sealed receipt. Missing, stale, conflicting, reused, unexpected or unverified identity is `STOP — Ownership Revalidation Failed`; no unknown-member action or fallback bypass follows.

This is a **trust contract**, not an implemented producer. **GAP-A remains OPEN / mandatory**. A later design must demonstrate the independent producer/anchor and complete Node/conhost or equivalent helper provenance without weakening the active ownership criterion.

## 4. Authoritative state and disposal are separate contracts

The **authoritative validation state**, controlled only by the Authoritative Controller, transitions from open to exactly one immutable terminal value: **`Success | Timeout | Fail | Cancelled`**. The worker/environment lifecycle has separate created, running, completed, failed, unresponsive, disposal-pending, disposed and disposal-failed observations; none directly sets the terminal value. A worker completion cannot automatically authorize `Success`.

At closure the Controller must atomically retain run ID, generation ID, terminal reason and UTC time, accepted result count, explicit immutable **Accepted Result Cutoff**, and authoritative state version/hash or equivalent immutable reference. It revokes the generation's result authority and channel acceptance. Every late or stale result/callback is `Late / Rejected`, with separately labeled non-authoritative audit metadata. The cutoff cannot advance; the terminal state cannot reopen; the generation cannot be reused. The accepted post-closure mutation count is `0`, and independent final comparison must prove **`authoritative_state_after_closure == authoritative_state_at_closure`**, excluding only explicitly non-authoritative rejection metadata.

The separate **execution-environment contract** requires an independently owned worker boundary with a **proven finite lifetime and deterministic, ownership-aware, non-destructive disposal** of its owned worker/process/session/channel/handle resources even on a stalled CIM path. Future approved design must assign finite, measurable `T_close`, `T_cancel`, `T_isolate`, `T_dispose` and `T_total`, with monotonic elapsed timing, UTC evidence and a specified disposal order. The Controller must close within `T_close` without waiting indefinitely for worker/provider cooperation. It then revokes result authority, requests only approved cooperative cancellation, observes for `T_cancel`, and may isolate/dispose only through a separately approved action after fresh complete ownership/membership revalidation. It independently records environment exit, resource disposal and audit outcome within the approved bounds.

**Result/channel revocation is not worker disposal.** A worker that remains live, an unknown member, a failed supervisor, or an unverified environment cleanup must be retained as **`Authoritative result closed / worker disposal unresolved`**. That condition preserves the terminal result but **fails the worker-disposal acceptance gate and blocks GAP-B operational closure**. No `TerminateJobObject`, kill-on-close, direct process termination, destructive environment teardown, or broader fallback is made acceptable merely by calling it isolation. Any proposed process-affecting or destructive method needs separate change control, full fresh ownership proof, exact-source safety review and execution authority. Shared CIM-provider physical quiescence is not claimed; continuing provider work cannot reach the authoritative state after cutoff.

## 5. Failure-domain containment and evidence contract

For every path, future reviewed source must map **`trigger → exact reviewed source → branch/function → exact API/call → state transition → ownership check → cleanup/disposal → retained evidence`**. It must state `Ownership Check = Required` or `Ownership Check = Not Applicable — <reason>`; fresh full identity is mandatory immediately before a process/resource-identity-affecting action. An independent source review and `100%` runnable-byte match must precede separate execution authorization. The conceptual obligations are:

| Failure trigger | Authoritative result and safety behavior | Environment, audit and retained evidence |
| --- | --- | --- |
| Worker hang | Controller closes within finite bound under governed rule; generation/channel acceptance revoked. | Record worker and supervisor state, cancellation/observation, ownership, disposal success or unresolved condition. Never infer exit from timeout. |
| CIM/provider hang | No provider wait may block controller closure; late provider output remains candidate data only. | Retain operation/session state and late output; do not claim shared-provider physical stop or worker disposal from fence. |
| Worker crash | Controller fails closed or accepts only previously validated complete pre-cutoff result under governed rule. | Retain exit identity/code, partial output, channel state, owned-resource disposal and sanitized exception. |
| Supervisor crash | Independent Controller still closes; no supervisor assertion may become terminal authority. | Retain last independently verified environment identity, lost supervision, unresolved disposal, audit and separate recovery decision. |
| IPC failure | No missing/partial message is accepted as complete; Controller closes under governed fail/timeout rule. | Retain send/receive counts, integrity error, channel closure/revocation and pending resource state. |
| Result-channel failure | Fence fails closed; terminal result cannot be written by worker through another path. | Record channel state and unsent/pending candidates; preserve distinct cleanup outcome. |
| Audit-channel failure | No successful evidence package may be asserted without independent closure/cleanup evidence. | Retain sink/partial-write failure and primary decision separately; do not overwrite prior immutable history. |
| Stale generation | Reject before acceptance; no reopening or run/generation reuse. | Retain mismatched identifiers and sanitized rejection disposition only. |
| Late callback/result | Reject after cutoff; no accepted post-closure mutation. | Retain count, disposition and closure/final authoritative state equality. |
| Unexpected helper, child or member | Fail closed on complete membership/role check; no unknown-member action. | Retain member identity gap and unresolved disposal; no wider fallback. |
| Ownership mismatch or PID reuse | `STOP — Ownership Revalidation Failed`; no process/resource action. | Retain sealed receipt reference, current tuple comparison, mismatch category and pending cleanup state. |
| Disposal failure | Preserve immutable terminal result, but fail worker-disposal and GAP-B gates. | Retain elapsed bounds, unverified resources, attempted permitted cleanup, independent audit and new-run requirement for retry. |

Failure inside a worker boundary may not mutate **Core iBeX**, another tenant, another OE run, accepted result state after cutoff, or governance/audit history. The supervisor cannot use failure, timeout, watchdog or `finally` as a path to broader authority. Every failed or partial attempt remains traceable rather than overwritten.

## 6. Tenant/platform and R&D boundary

The platform path remains **`Core iBeX → AI Gateway → AI Platform / OE validation tooling`**. The OE worker receives only scoped synthetic, read-only validation inputs. It gains no direct AI access to the Core database, cannot bypass tenant/source ownership, authorization or entitlement, cannot reuse one tenant's evidence for another, and is not trusted merely because it runs locally. Trusted synthetic tenant/request/correlation/trace identifiers, tenant-safe denials, sanitized audit metadata and the OE-08 synthetic audit-only boundary remain required. A proposed broker, sandbox or VM with broader data or privilege reach would require separate change control and must fail the present design gate.

Each unresolved environment-dependent candidate is **`R&D Validation Required — Not Authorized`** for the following *question only*; no experiment, probe, exact source, environment or execution procedure is designed here:

| Candidate | Minimal future question requiring separately authorized evidence |
| --- | --- |
| A — dedicated non-interactive worker host | Can one run-bound host be independently created and fully attributed, including helpers/conhost equivalents, and reach finite non-destructive disposal when its CIM work is unresponsive without privilege/configuration change or unknown-process impact? |
| B — worker service/broker | Can a separately governed service/account and per-run disposable sub-boundary exist under approved privilege/configuration and preserve independent receipt, tenant isolation and finite safe disposal? |
| C — ephemeral sandbox/container | Is a supported per-run Windows/CI sandbox available with complete host/guest process provenance and finite safe disposal of every owned member, without unapproved dependency/configuration/privilege changes? |
| D — ephemeral VM/stronger host | Is a governed per-run host capability available with full identity, bounded safe retirement and acceptable operational/cost constraints, without weakening the active ownership/disposal criteria? |

Any future R&D must follow **`R&D Plan → Review → Publication → Owner Authorization → Exact Source/Environment → Execution Authorization`**. If answering a question needs elevation, service/OS/CIM configuration, dependency installation, network, live data, criterion change or production/runtime modification, stop for its own change control; none is authorized by this proposal. R&D is not OE-12 operational evidence by default.

## 7. Governance sequence, capability and STOP conditions

Even if a later candidate is found conceptually compliant, the mandatory sequence is **`Architecture Review → Exact-Byte Publication → Owner Approval → Implementation Change-Control → Implementation Design → Exact-Source Implementation → Source Safety Review → Execution Authorization → New Direct Evidence → Independent Evidence Review → GAP Closure Decision`**. Architecture approval alone is not implementation authority. For both GAP-A and GAP-B, **`GAP Closure = Approved Applicable Design/Boundary AND Newly Authorized Direct Evidence`**. The prior Design STOP and retained OE-12 evidence may not be re-analyzed into a closure claim; progress requires a materially new approved boundary or separately authorized new evidence.

| Capability stage | Classification |
| --- | --- |
| Current | **Architecture proposal only; Architecture Design STOP.** No preferred boundary or implementation selected. |
| Pilot | Controlled OE-12 evidence execution remains **unauthorized**. |
| R&D | Candidate-specific environment questions only after separate review, owner approval, exact-source and execution authorization. |
| Future | Production/runtime adoption requires separate architecture, tenant/security, operations and change control. |

**STOP findings:** no A–D candidate currently proves all required ownership and bounded non-destructive worker-disposal properties; no preferred architecture can pass the selection gate. Stop rather than conceal PID-only ownership, unknown-process termination, worker self-attestation, destructive fallback, hidden elevation, uncontrolled OS/global configuration, unapproved dependency, tenant/security weakening, production-runtime changes without governance, or treating result-authority revocation as provider physical termination or worker disposal. No same-mechanism/same-evidence loop is permitted.

This is an **unpublished proposal**. It creates no executable source, implementation, process/CIM/PowerShell/Job/container/VM experiment, R&D plan or authorization, formal OE-12 evidence, GAP closure, worker-disposal proof or canonical status change. **GAP-A = OPEN / mandatory; GAP-B operational closure = NOT ESTABLISHED; worker disposal = OPEN proof obligation; Alignment GAP = CLOSED; OE-12 = Not Executed; SIR-02 = Blocking.** The next permissible action is **technical governance review of the exact new Execution / Isolation-Boundary Architecture Design bytes**.
