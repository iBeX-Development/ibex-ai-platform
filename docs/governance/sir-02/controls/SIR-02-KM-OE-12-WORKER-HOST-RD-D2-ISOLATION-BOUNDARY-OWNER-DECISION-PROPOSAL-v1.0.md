# SIR-02 KM OE-12 Worker-Host R&D D2 Isolation-Boundary Owner Decision Proposal v1.0

| Field | Proposal |
| --- | --- |
| Status | **Proposed / Owner Decision Required / No Mechanism Selected / No Source or Execution Authorization** |
| Decision owner | GANTUMUR Erdenedalai — Founder / Administrator; **no option selected in this record** |
| Scope | Next *design-only* D2 direction for the dedicated non-interactive Worker-Host R&D candidate |
| Published owner direction | `15b887286d21258f686e1e2c8ec08c7ffdb77e65` — **T1 + P1 + D2 design only + E1 + M1** |
| Reviewed design | `d80179795e10bef853ce4854a8d9eccefe49537e` — SHA-256 `44093b90058c81a6879c13e31d3d06305723812a9b4a6e48b092e019335a1427` |
| Published technical review | `5c2bb255e426ffc31ea9af58aa68439352dcd5f0` — **`Design STOP Valid — New isolation-boundary design required`** |
| Helper bound | `≤5,000 ms` **unproven design target**, not a demonstrated capability or execution permission |

## 1. Decision basis and non-negotiable criterion

The technical review §3 traces `tests/rd/oe12-worker-host/supervisor.mjs:12–35,63–168`, `controller.mjs:15–39,64–75,123–140`, `worker.ps1:43–75`, and `identity.ps1:38–61` in the committed package `abd9435d27916f13847493496551f6a2e8563f3d`. Timed-out identity helpers can be unreferenced with pipes destroyed without observed exit; Worker cancellation can leave the Worker live; `finally` starts a fresh wait; Supervisor streams may be released without proving exit of the Worker, helper or possible console host. The package has **no actual complete Node/conhost/helper member enumeration** and no qualifying finite non-destructive isolation/disposal mechanism. WH-03/09 are prelaunch STOP and WH-08 is synthetic STOP, so none supplies direct real hang, disposal-failure or membership proof. The package has not been run under R&D authorization. The prior exact-source/path preflight at `a1e14fbff39984345484cf59a8c828a5aa3f35c7` remains **Rejected**.

**Owner decision criterion:** an option may progress beyond design review only if its separately specified exact mechanism has a credible, independently reviewable path to finite disposition of an actual unresponsive Worker **and** a timed-out helper, with all actual Node/conhost/helper members accounted for, **without affecting an unidentified process**. If that path is absent, that option remains **`Design STOP`**. Stream closure, `unref()`, an authoritative Accepted Result Cutoff, a timeout callback, and later PID absence do **not** prove process exit, qualifying safe isolation, or complete disposal. Worker exit alone does not account for all handles and related members. An unknown member cannot be exposed to `TerminateJobObject`, kill-on-close, `TerminateProcess`, `Stop-Process`, `taskkill` or an equivalent destructive fallback. No fallback may exceed primary-path authority.

The active OE-12 criterion is **Authoritative Validation-Boundary Quiescence** under the scoped published activation decision, not a claim of physical CIM-provider quiescence. A finite result fence is necessary but cannot substitute for the separately open bounded non-destructive Worker-disposal obligation. **`GAP Closure = Approved Applicable Design/Boundary AND Newly Authorized Direct Evidence`**; this proposal supplies neither element of operational GAP closure.

## 2. Mutually distinct owner options — none selected

### Option A — Commission a New Worker-Host Containment Design (Design Only)

**Conditional direction:** keep the existing dedicated non-interactive Worker-Host environment as the candidate and commission a separate design that may be considered only if it can independently account for the complete *actual* member/resource set and define a finite non-destructive disposition. This is **not** a finding that the current host has such a mechanism. No Job Object, process API or other containment technology is chosen here.

| Required decision dimension | Design question and acceptance evidence before any source authorization |
| --- | --- |
| Trust owner and admission | Identify an outer authority independent of caller/Worker with exclusive admission control before any Controller, Supervisor, Worker, identity helper or applicable console host can influence provider work. Bind each admitted role to T1's consumed attempt and P1's independently sealed creation/assignment receipt. A process the boundary cannot account for is not admitted or acted upon. |
| Complete identity | Propose a concrete way to retain expected/actual/unexpected member sets and `PID + image path + parent PID + creation time + run token + creation/assignment event`, plus retained handle/session/Job evidence where applicable. Prove PID-reuse resistance and fresh full revalidation immediately before every process/resource-affecting action, including exception and `finally`. Membership alone is not ownership. |
| Resource/handle lifecycle | Name the boundary owner, all handles/sessions/channels, member admission/removal events, creation and assignment order, one monotonic total/disposal/helper deadline, handle-close order, result fence and independent final evidence. Distinguish live-but-isolated, exited, handles-closed and disposed states. No timer may reset in a fallback or `finally`. |
| Actual hang and helper timeout | Specify exactly what happens when `worker.ps1` remains unresponsive in or around CIM and when either `identity.ps1` helper times out. The mechanism must retain a bounded, observable disposition for each live member while rejecting all late authority. If the only finite path needs unknown-member termination, this option stays **Design STOP**. |
| Unrelated-process impact | Demonstrate that any containment or handle-close behavior cannot terminate, suspend, alter or otherwise collateralize an unidentified/unrelated process. A kill-on-close Job or Job-wide termination while membership is unresolved is disallowed. |
| Dependencies and approvals | Inventory any new OS API/helper, key, store, account/ACL, privilege, service, executable, configuration, dependency or Windows/CIM change. Each requires **separate change control** before implementation; production/runtime changes and criterion changes need their own owner decision. |
| Direct negative proof | Separately authorized **real** WH-03 unresponsive Worker, WH-08 actual unexpected member, WH-09 disposal failure and WH-10 exception/timeout/finally paths; include a timed-out identity helper and a possible conhost member. Retain exact source/API path, timestamps, complete membership, freshness, handle states, non-destructive actions and candidate ineligibility on failure. Prelaunch/synthetic STOP is nonproof. |

**Possible effect if later selected:** authorize preparation of an exact Worker-Host containment design for technical review only. It does not approve a mechanism, source work, environment change, WH run or attempt. If a complete safe design cannot be specified, return to the owner with **Design STOP** rather than silently substituting Option B or weakening D2.

### Option B — Commission a Separately Governed Isolation-Environment Design (Design Only)

**Conditional direction:** if the existing Worker-Host boundary cannot credibly prove finite safe disposition, commission a separate isolation-environment design. The environment type, host ownership and mechanism are **unselected**. This is a distinct trust and infrastructure boundary, not merely a new process name or an implicit switch to sandbox/container R&D.

| Required decision dimension | Design question and acceptance evidence before any environment or source authorization |
| --- | --- |
| Trust owner and admission | Identify the environment authority and who can create, seal, admit and remove every Controller/Supervisor/Worker/helper and applicable console-host role. Explain how T1 attempt consumption and P1 receipts cross the boundary without caller/Worker self-authentication or circular trust. |
| Complete identity | Prove independent creation/assignment provenance and complete actual member inventory inside and at the edge of the environment. Bind full tuples and handles/sessions to one run/generation; show how a late, unexpected, inherited or host-managed member is detected and kept outside any destructive action. |
| Resource/handle lifecycle | Define the finite lifecycle of the environment, its channels, handles, sessions, storage and observers; which authority retains them; how closure, safe isolation and actual disposal differ; and how late results remain fenced after boundary closure. An abandoned live process cannot be called disposed merely because the authoritative result is closed. |
| Actual hang and helper timeout | Specify a credible mechanism for an unresponsive Worker and a hung identity helper, with measured finite bounds and independent observation of exit or qualifying non-destructive isolation. Define behavior if the environment itself fails or cannot dispose a member. If finite disposition depends on collateral harm to an unidentified process, this option stays **Design STOP**. |
| Unrelated-process impact | Show how the environment prevents effect on unrelated host processes and how unknown members are handled safely. Explicitly evaluate host-managed console processes and any shared provider/session resource; isolation claims must not be inferred from a process boundary name. |
| Dependencies and approvals | Identify new host/environment ownership, virtualization/container/service components if proposed later, keys/stores, image/executable identity, ACLs, privileges, dependencies, policy, network and Windows/CIM configuration impact. All such changes require **separate owner/change-control review**; this option permits none. Any criterion redefinition is separate baseline change control. |
| Direct negative proof | After separate exact-source, environment and execution authorizations: actual WH-03/08/09/10 plus environment failure, unknown/inherited member, delayed result, timed-out helper, host/collector crash and evidence-write failure. Retain full membership and unrelated-process safety evidence, immutable terminal/cutoff and finite resource disposition. No static design or synthetic STOP may be scored PASS. |

**Possible effect if later selected:** authorize preparation of a separately governed isolation-environment **design proposal only**. It does not select a sandbox, container, VM, service or other technology, approve an environment, authorize source/configuration changes or authorize execution. A later architecture change may require review of T1/P1/E1/M1 and the active baseline before any implementation decision. If no compliant boundary can be specified, return to the owner with **Design STOP**.

### Option C — Hold / Defer D2 Boundary Selection

**Conditional direction:** retain the published **Design STOP** without commissioning a new boundary design until the owner can define an acceptable scope or receives separately authorized new evidence. No same-evidence reanalysis may be used to claim D2 progress.

| Required decision dimension | Hold condition |
| --- | --- |
| Trust owner, admission and identity | No new owner or admission method is chosen. T1/P1 remain design directions only; actual Node/conhost/helper identity and membership remain unproven. |
| Resources, hang and helper | Existing Worker/helper handle paths and the `≤5,000 ms` helper target remain unresolved; no finite disposal or isolation is claimed. The package remains STOP and cannot run WH-03/08/09 to generate proof under current authority. |
| Unrelated-process impact | Existing prohibition on destructive unknown-member action continues. No new process is put at risk by this hold decision. |
| Dependencies, tests and change control | No dependency, privilege, service, configuration, source or environment change is approved. Any future design or direct negative test requires a new scoped owner/change-control and execution sequence. |

**Possible effect if later selected:** record a governance hold only. R&D execution, source modification and formal OE-12 remain blocked. The owner may later make a fresh decision; silence or elapsed time is not approval.

## 3. T1/P1/E1/M1 continuity across the options

| Earlier selected direction | Option A: same Worker-Host environment | Option B: changed isolation environment | Option C: hold |
| --- | --- | --- | --- |
| **T1** externally verified decision and protected single-use ledger | Governing principle remains usable; exact trust root, ledger, first-side-effect ordering and role capability still need design/review. | Principle remains, but verifier custody, environment-crossing capabilities, attempt claim location, replay/crash behavior and first side effect must be **re-reviewed** across the new boundary. | Remains unimplemented; no claim consumed. |
| **P1** independent creator and sealed full receipt | Full tuple/complete Node/conhost/helper admission must be proven inside current host; READY/ARM handshake ambiguity from review §2 must be resolved. | **Re-review required** for creator identity, cross-boundary assignment, host-managed members, receipt anchor, handle/session identity and READY/ARM ordering. | GAP-A remains OPEN; no receipt proof. |
| **E1** protected independent failure ledger | Principle remains; prove independence from primary audit and failure-of-failure disposition. | **Re-review required** for sink placement/ACL, environment failure, cross-boundary writes and terminal snapshot retention. | No candidate evidence accepted. |
| **M1** externally authenticated complete manifest | Principle remains; include any new containment source, APIs/config and exact binaries in reviewed-to-runnable identity. | **Re-review required** for environment image, host/runtime binaries, new helpers, configuration, trust bootstrap and byte identity across the boundary. | Existing prepared package remains rejected and unexecuted. |

T1, P1, E1 and M1 cannot authenticate one another solely with caller-supplied records, hashes, nonce, receipt or frame. Selection of A or B would not automatically approve those unresolved mechanisms. If a selected D2 condition cannot be met, return it to the owner; do not silently choose another option or replace owner-selected D2 with D1.

## 4. Decision gate, STOP and authorization boundary

**No recommendation and no option is preselected.** The owner may later select exactly one direction: **Option A**, **Option B**, or **Option C**. A or B can authorize only separate bounded design preparation, subject to an exact scope and later technical review. Neither is described as feasible at present. The next implementation sequence, if a compliant design eventually exists, is: **separate D2 design → technical governance review → exact-byte publication → owner approval → applicable mechanism/environment change control → bounded source-change authorization → exact-source implementation → exact-source/path preflight and source-safety review → separate R&D execution authorization → at most one authorized attempt → independent direct-evidence review → separate GAP decision**. An owner design-direction selection does not skip any stage.

**STOP** any option if a proposed path would rely on PID-only ownership, incomplete Node/conhost/helper membership, stale receipt, a caller/Worker-controlled trust anchor, resettable deadline, stream close/`unref()` as disposal, terminal cutoff as physical isolation, later PID absence, unverified Job-wide cleanup, unknown-PID termination, a broader destructive fallback, or unapproved privilege/service/configuration/dependency change. Keep `Design STOP` until a concrete mechanism and observable proof path pass separate review. The current active OE-12 criterion and trusted tenant/security/audit controls cannot be weakened by this choice.

**Preserved state:** Technical Preflight = **REJECTED**; R&D Execution = **NOT AUTHORIZED**; Attempt = **NOT STARTED**; GAP-A = **OPEN / mandatory**; GAP-B operational closure = **NOT ESTABLISHED**; bounded non-destructive Worker disposal = **OPEN proof obligation**; Alignment GAP = **CLOSED**; OE-12 = **Not Executed**; SIR-02 = **Blocking**. This proposal creates no source, dependency, configuration, environment, process, CIM/provider observation, WH case, diagnostic, smoke, formal OE-12 attempt or owner approval.
