# SIR-02 KM OE-12 Boundary Feasibility Assessment v1.0

| Field | Value |
| --- | --- |
| Purpose | Assess trust and execution boundaries only; no implementation selection or authorization |
| Boundary review | `47f211830b24ea8c60540621f2d99a625225966f` — `Accepted — Boundary Escalation Required` |
| Reviewed remediation publication | `47bfaed4e0b96ce9d6c4fc0d4e6ac206659d6d46` |
| Exact source | `61aa0e575fc52f121f9fd24cb41a575ccc55c120` — unchanged and execution unauthorized |
| Source-safety review | `76e20519b3395faf012c6231d818eaf9e8532690` — `Rejected — Source Remediation Required` |
| Active-path alignment review | `023b43614e7584d8f92d07a51ea32c8419a45e71` — Alignment GAP **OPEN** |
| GAP-A feasibility result | **Needs Clarification** — an independent producer is conceivable, but complete Node/conhost creation and assignment provenance has not been demonstrated |
| GAP-B feasibility result | **Not currently feasible** under the current non-destructive, provider-quiescence contract |
| Combined boundary | No model has yet been shown to close both gaps under the current contract |
| Execution | No probe, diagnostic, smoke, or formal run performed by this assessment |

## 1. Mandatory preflight

At preparation, the two published remediation documents match the bytes reviewed by `47f211830b24ea8c60540621f2d99a625225966f`:

| Published document | Reviewed SHA-256 | Observed SHA-256 | Result |
| --- | --- | --- | --- |
| `SIR-02-KM-OE-12-CIM-VALIDATION-SOURCE-SAFETY-REMEDIATION-v1.0.md` | `beb697438b8ec57b3b389714d5b5928909215db2bed463d7846e16387417653a` | `beb697438b8ec57b3b389714d5b5928909215db2bed463d7846e16387417653a` | MATCH |
| `SIR-02-KM-OE-12-CIM-VALIDATION-SOURCE-SAFETY-REMEDIATION-AUTHORIZATION-v1.0.md` | `c6637282a7d2c70fad4630e18cac27b3d730f36fc6207f0d91054ac5921e9ce3` | `c6637282a7d2c70fad4630e18cac27b3d730f36fc6207f0d91054ac5921e9ce3` | MATCH |

GAP-A remains **Expanded Trust Boundary Required** and GAP-B remains **Separate Isolation/Execution Boundary Required**. The remediation authorization is `Proposed / Not Authorized`, with no authorized files, commands, or probe. No implementation or execution authorization for a boundary model exists. Option B remains `Needs Clarification`; Diagnostic v4 is not proposed; Smoke v5 and formal retry `0003` are not authorized; OE-12 remains `Not Executed`. No acceptance criterion is changed by this assessment.

The rejected exact-source review found that the probe can receive both a receipt and its hash through the same input boundary, so it cannot authenticate independent ownership. It also found that an in-process CIM timeout does not prove the stalled operation quiescent. The current source is not a feasible execution path merely because it records a timeout or a matching hash.

## 2. GAP-A: independent creation/assignment receipt

The mandatory identity set is **PID + image path + parent PID + creation time + run token + creation/assignment event**, plus retained handle, session, and Job evidence where applicable. The receipt must exist before probe validation, be anchored outside probe-controlled input, and bind the current synthetic run and each evaluated process role. A receipt and hash supplied together by the probe or its caller remain an untrusted consistency check.

| Candidate trust boundary | Producer, anchor, and verification | Probe independence, reuse resistance, and evidence | Cleanup, privilege, and change impact | Feasibility |
| --- | --- | --- | --- | --- |
| A1. Independent local controller with native process handle | A separately governed controller creates the synthetic Node process, retains its creation handle and timestamp, observes its image/parent/session, writes a pre-probe run-bound receipt, and anchors its digest in a channel the probe cannot write. The probe reads a controller-owned reference and verifies it against that anchor. [CreateProcessW](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-createprocessw) returns child identity and handles; [GetProcessTimes](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-getprocesstimes) can bind creation time to the retained handle. | Strong candidate for the controller-created Node. The probe cannot rewrite/reseal the anchor. Retained handle plus creation time resists PID reuse. It does **not** independently establish the creation/assignment event, full image path, run binding, or safe ownership of an OS-created conhost. Job membership gives PIDs, not ownership. Retain controller identity, handle/source events, sealed receipt, anchor, verification outcome, and mismatch reasons. | Controller owns its handles and synthetic files and disposes them cooperatively. New test-only controller, receipt, anchor, and branch review require separate design and authorization. No production change is assumed. Privilege and conhost-observability feasibility remain unverified. | Partial; full GAP-A **unproven** |
| A2. Independent operating-system event plus controller handle correlation | A separate controller subscribes to a process-start source before launch, retains event producer/timestamp and correlates PID, parent, session, and creation time with a fresh handle-bound image check and run token. [Win32_ProcessStartTrace](https://learn.microsoft.com/en-us/previous-versions/windows/desktop/krnlprov/win32-processstarttrace) exposes PID, parent PID, process name, session, and event time, but not the complete required identity by itself. | Could help attribute Node and conhost only if event completeness, timing, provider access, exact creation/assignment provenance, and token linkage are independently proven. A name, parent PID, and nearby time alone cannot authenticate an unexplained conhost. Retain subscription provenance, raw event, handle query, correlation decision, and rejected candidates. | Subscription/session cleanup and missed-event handling need exact branches. Availability without elevation, WMI changes, service restart, or new dependencies is unknown. Such requirements are STOP conditions, not implicit permissions. | **Needs Clarification** |
| A3. Separately signed or committed receipt | A distinct controller could seal the independently observed facts with a separately held signing key or pre-probe immutable commit. The probe verifies producer identity and a trusted digest/signature through a channel it cannot author. | Cryptographic sealing or a Git commit proves integrity of supplied bytes only; it does not prove that the underlying process facts or conhost attribution were true. An input-supplied receipt plus input-supplied hash is expressly insufficient. Retain producer identity, key/commit provenance, timestamp ordering, run binding, and verification result. | Key/secret custody, credentials, write authority, and possibly repository or configuration changes need their own change control. No such mechanism is selected or authorized. | Conditional anchor only; not a complete identity model |

**GAP-A classification: `Needs Clarification`.** An expanded diagnostic trust boundary can independently authenticate a controller-created synthetic child in principle, but no retained evidence establishes the full required Node/conhost creation and assignment tuple under an approved, no-elevation environment. The minimum missing proof is a separately accountable controller and anchor plus a verified source of conhost creation/assignment identity that binds to the same run token and survives PID reuse. No source implementation is authorized.

## 3. GAP-B: bounded CIM completion and isolation

Two different properties must be kept separate:

1. **Provider-level quiescence:** the underlying CIM provider operation has ended; no provider work, live operation/session, pending callback, or later result remains.
2. **Probe/isolation-boundary quiescence:** no later result or callback can enter or mutate the authoritative evidence collector after the boundary is closed. This does not prove the shared provider stopped working.

The current requirement from the source-safety remediation demands provider/operation completion and safe disposal before a successful quiescence claim. A client timeout or failure result cannot be relabeled as completion. [Get-CimInstance `OperationTimeoutSec`](https://learn.microsoft.com/en-us/powershell/module/cimcmdlets/get-ciminstance?view=powershell-5.1) bounds a response wait; [PowerShell.BeginStop](https://learn.microsoft.com/en-us/dotnet/api/system.management.automation.powershell.beginstop?view=powershellsdk-7.6.0) requests pipeline stopping; [EndStop](https://learn.microsoft.com/en-us/dotnet/api/system.management.automation.powershell.endstop?view=powershellsdk-7.6.0) waits for that stop; [CimSession](https://learn.microsoft.com/en-us/dotnet/api/microsoft.management.infrastructure.cimsession) exposes close/disposal APIs. None of these documented client calls alone guarantees that a nonresponsive shared provider is quiescent within a finite outer bound. This is an inference from the documented semantics, not a claim that the APIs are defective.

| Candidate execution boundary | Session/operation, timeout, cancellation, and late-result control | Completion and retained proof | Privilege, environment, disposal, and criterion impact | Feasibility |
| --- | --- | --- | --- | --- |
| B1. Existing in-process PowerShell/CIM | CIM executes in the same probe process. Client timeout and `BeginStop` can request cancellation. A hung provider or unresolved callback can remain after the wait; a later result can affect probe state unless all paths are independently fenced. | No finite provider-level completion proof or safe disposal after a permanently stalled call. Preserve timeout/error and stop rather than report PASS. | No new privilege or dependency, but fails the required bounded quiescence proof. | **Not feasible for this requirement** |
| B2. Separate worker with cooperative exit only | CIM executes in an owned worker. Controller stops accepting results at timeout, sends cooperative cancellation, and waits for a bounded interval. A run-token/sequence fence can prevent late data from changing authoritative collector state. | Collector-side state can be stable. If the CIM call ignores cancellation, worker/session/provider completion and disposal are not guaranteed. A still-running worker makes the cleanup claim incomplete. | New test-only worker and controller require design/authorization. No destructive action is allowed. Provider-level criterion remains unsatisfied. | Partial; not a bounded-completion solution |
| B3. Disposable worker with forced termination | CIM executes in a worker; controller could close its result channel and terminate a precisely owned worker after a bound. This could bound collector mutation, but not necessarily shared-provider work. | A worker-exit handle and fenced collector could prove probe-boundary quiescence only. Provider-level completion would remain unproved without additional provider evidence. Prior unknown Job membership prevents treating a Job-wide kill as safe. | **Outside the current non-destructive contract.** Would require explicit termination and quiescence-criterion change control, full fresh process/member ownership proof, and independent review. No termination method is proposed or authorized here. | Conditional only after separate change control; **not currently feasible** |
| B4. Fully isolated disposable CIM provider/environment | CIM provider and probe would run inside a separately owned disposable environment, with evidence that every operation and provider resource ceased before disposal. | Could in theory support provider-level quiescence if the isolation truly contains all provider work and termination/closure is proven. Current Windows/CIM host has not been shown to provide that boundary. | Requires environment provisioning and likely privilege/configuration changes. These are STOP conditions under current scope; no such boundary is established. | **Unproven and outside current scope** |

For each later candidate, evidence must separately identify query admission stop, timeout trigger, cancellation call and acknowledgement, callback/result drain, operation/session completion, provider status when claimed, handle closure, temp cleanup, and final state. A watchdog may observe, signal approved cooperative cancellation, and capture evidence; it cannot enlarge cleanup authority. [MI operation timeout documentation](https://learn.microsoft.com/en-us/windows/win32/api/mi/nf-mi-mi_operationoptions_settimeout) also does not supply a general guarantee that a stalled provider reaches finite quiescence.

**GAP-B classification: `Not currently feasible`.** No available documented, approved in-process or cooperative isolated mechanism proves provider-level quiescence within a finite bound when the shared CIM provider stalls indefinitely. A future owner could consider a **different** probe-boundary criterion or separately isolated provider with explicit change control, but this assessment does not weaken or select either. If provider-level quiescence remains literal, the current Windows/CIM interfaces reviewed here do not prove it for a nonresponsive shared provider.

## 4. Combined architecture and trust boundaries

Conceptual data flow only:

```text
Independent synthetic-run controller and receipt producer
    -> independently anchored, pre-probe run-bound receipt
    -> isolated read-only CIM validation worker
    -> independently owned evidence collector and decision gate
```

The controller would create synthetic process(es), retain handles and creation/assignment observations, seal the receipt, and own the trusted anchor. The worker would read a receipt identifier, independently verify the anchor and fresh full identity, and perform read-only CIM queries. The collector would own authoritative results, enforce run-token and sequence fencing, reject late/partial output, and record exact errors. The controller alone could request cooperative cancellation and dispose its own handles/resources after completion is proven. No component may create the process, self-assert its ownership, validate its own receipt, and accept its own result without an independent boundary.

This topology is **not an approved combined model**: full conhost receipt provenance is unproven, and worker isolation does not prove stalled shared-provider quiescence. Candidate combinations:

| Combination | GAP-A | GAP-B | Combined result |
| --- | --- | --- | --- |
| C1. Independent controller/anchor + existing in-process CIM | Controller-created Node partially supportable; conhost unproven | Unbounded provider quiescence | Not feasible |
| C2. Independent controller/anchor + cooperative worker | Conhost unproven | Collector fencing only; hung worker remains | Not feasible |
| C3. Independent controller/anchor + disposable worker | Conhost unproven | Probe boundary potentially bounded, provider boundary unproven; termination prohibited | Requires criterion, safety, and change-control decisions before detailed design |
| C4. Independent controller/anchor + fully isolated provider environment | Conhost and environment provenance unproven | Provider containment and quiescence unproven | Needs separate platform/environment feasibility and change control |

**Feasible combined boundary models under the current approved criteria and scope: none established.** This is a feasibility finding, not a selection of C3 or C4.

## 5. Ownership, exit, and cleanup safety

Every future process-sensitive model must retain the complete identity tuple, run token, exact role, creation/assignment source, and handle/session/Job evidence where applicable. The tuple and actual Job membership must be freshly revalidated immediately before **every process-affecting action**. PID or Job membership alone is not ownership proof. An unexplained member makes a Job-wide destructive action unsafe; prior Smoke v4 established that a fallback can bypass a primary unknown-member guard. [Job Object membership](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-jobobject_basic_process_id_list) is a PID list, while [Job Object termination](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects) affects the associated processes.

Current permitted cleanup is cooperative/natural exit, bounded wait, read-only verification, and deterministic disposal of owned handles, sessions, subscriptions, and temporary files. Success, provider failure, CIM exception, partial result, cancellation, inner/outer timeout, early exit, launcher exception, cleanup exception, and `finally` each need executable branches and retained outcome evidence. Primary failure and cleanup failure must both be retained. No fallback may have broader authority than the primary path. `TerminateProcess`, `Stop-Process`, `taskkill`, `TerminateJobObject`, kill-on-close, and unknown-PID termination remain prohibited.

If a future design proposes worker termination, it must name the exact target worker, show an independent controller has freshly verified the entire identity/membership set immediately before action, and prove no unrelated process can be affected. It must explicitly request a change to the present non-destructive contract. This document grants no such change or process action.

## 6. Baseline and criterion impact

| Candidate | OE-12 diagnostic design | CIM validation plan | Acceptance Matrix / OE Execution Plan | Attribution criteria | Quiescence criterion | Tenant/security contract | Production/runtime architecture |
| --- | --- | --- | --- | --- | --- | --- | --- |
| C1 independent receipt + in-process CIM | New version and independent receipt controller required | New version required | No change proposed; current criterion remains unmet | No weakening; full tuple remains required | Unchanged and unmet | Unchanged | No change proposed |
| C2 independent receipt + cooperative worker | New version, controller, worker, and branch map required | New version required | No change proposed; current criterion remains unmet | No weakening; conhost proof unresolved | Unchanged and unmet for stalled provider | Unchanged | No change proposed |
| C3 controller + terminable worker | New version and separately authorized process-action design required | New version required | **Explicit owner decision needed** if probe-boundary quiescence substitutes for provider-level proof or destructive cleanup is permitted | Full tuple and fresh ownership remain mandatory | **Criterion/change control required**; provider proof not supplied | No weakening permitted | No production change assumed; any required change is STOP |
| C4 controller + isolated provider environment | New design and environment boundary required | New version required | Separate environment and possibly criterion decision; no silent change | Full tuple, environment/session provenance required | Could remain unchanged only if provider-level completion is actually proved | No weakening permitted | Environment/privilege/configuration impact unproven and outside this authorization |

No package, dependency, production/runtime, Windows/CIM setting, network, privilege, tenant/security, or acceptance change is authorized. A candidate that requires any such change must stop for an explicit separate governance decision. A criterion change must never be hidden as an implementation detail.

## 7. Comparative decision matrix

`Unproven` means the candidate has not met the control, not that a test failed. None is selected.

| Dimension | C1: controller + in-process CIM | C2: controller + cooperative worker | C3: controller + terminable worker | C4: controller + isolated provider environment |
| --- | --- | --- | --- | --- |
| Security isolation | Controller/probe separation; CIM shared | Separate worker; CIM provider shared | Worker contained only if ownership verified; provider shared | Potentially strongest, environment unvalidated |
| Evidence independence | Possible for Node; conhost unresolved | Same receipt gap | Same receipt gap | Same receipt gap plus environment trust |
| Deterministic ownership | Node handle possible; full set unproven | Same | Full fresh worker/member proof also needed | Full process and environment proof needed |
| Bounded completion | No | No for hung worker/provider | Collector possibly; provider unproven | Possible in theory; not established |
| Cleanup safety | Cooperative; unresolved CIM operation | Cooperative; hung worker unresolved | Destructive termination conflicts with contract | Disposal and whole-environment ownership unproven |
| Reproducibility | High in simple case; failure uncertain | Moderate; hang remains | Moderate; platform/termination sensitive | Low until environment specified |
| Auditability | Controller receipt possible | Receipt plus worker transcript | Adds termination/ownership transcript | Adds environment lifecycle transcript |
| Portability | Windows/CIM dependent | Windows/CIM dependent | Windows process-control dependent | Lowest; environment specific |
| Privilege requirement | Unknown for conhost attribution | Unknown for conhost attribution | Unknown; no elevation assumed | Likely elevated/environment control; unverified |
| Dependency requirement | New source only proposed; none approved | New helper source proposed; no package assumed | New helper/OS API source likely; none approved | Environment provisioning likely; unverified |
| Environment changes | None established | None established | None established; may be required | Likely required; STOP under current scope |
| Criterion changes | None; requirement unmet | None; requirement unmet | Explicit quiescence and cleanup decision required | None only if full provider proof; otherwise decision required |
| Implementation complexity | Medium | High | Very high | Very high |
| Risk of another inconclusive run | High | High | High until trust/criterion settled | High until platform validated |

## 8. Feasibility conclusion and next gate

GAP-A is **Needs Clarification**; GAP-B is **Not currently feasible** under the current non-destructive provider-quiescence contract. No combined candidate currently supports detailed source design or execution authorization. The Alignment GAP remains **OPEN**.

The next permissible action is an **owner review of the separate boundary change-control decision proposal**. If the owner requests more feasibility work, it must be separately scoped and read-only. If a model is later approved for detailed design, the owner must name its exact model and explicitly decide any criterion, trust, environment, privilege, or process-action change before source preparation. This assessment does not authorize Option B selection, Diagnostic v4, launcher v1.4, Smoke v5, formal retry `0003`, or any probe.
