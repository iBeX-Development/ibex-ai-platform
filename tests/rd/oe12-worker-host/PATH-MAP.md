# OE-12 Worker-Host R&D Exact-Source Path Map v1.0

**R&D ONLY / NOT AUTHORIZED FOR EXECUTION.** This is a candidate source map for independent preflight and safety review. No path has been executed or safety-accepted. The package intentionally fails the execution guard while safe finite-lifetime disposal and complete helper/member attribution remain unproven. No source-level branch alone closes GAP-A, GAP-B, or the worker-disposal obligation.

## Role and authority separation

| Role | Exact source | Authority |
| --- | --- | --- |
| Authoritative Controller | `controller.mjs`, `protocol.mjs` | Owns run/generation, HMAC receipt anchor, ARM decision, result acceptance, terminal/cutoff, audit. It does not infer worker disposal from closure. |
| Independent Supervisor / receipt producer | `supervisor.mjs` | Creates worker with `spawn(...,{shell:false,windowsHide:true,stdio:pipes})`, retains `ChildProcess`, observes identity through `identity.ps1`, emits pre-ARM receipt. Cannot set authoritative terminal state. |
| Worker Host | `worker.ps1` | Waits for exact ARM frame before any local read-only `Get-CimInstance`; returns candidate observation only. No receipt acceptance or authoritative write. |
| Identity observation | `identity.ps1` | Local read-only `Win32_Process` query. Supervisor produces receipt; Controller independently re-observes before ARM. Observer helper lifecycle remains a safety-review obligation. |
| Result channel / fence | JSON lines over dedicated supervisor stdout and worker stdout; `AuthorityFence` in `protocol.mjs` | Controller checks run, generation and sequence. Closure fixes cutoff and revokes acceptance; late/stale frames become non-authoritative audit metadata. |

## Explicit execution guard and STOP findings

`controller.mjs` and `supervisor.mjs` enter through `executionGate()` in `guard.mjs`. Direct entry to `worker.ps1` or `identity.ps1` also checks mode, run/token/generation/case, approved config, machine manifest/source hashes, and the *future separately published* one-run authorization record and its SHA-256 before READY or CIM. The JavaScript gate hashes every listed runnable source/config byte. The current `config.json` sets `readiness=STOP`, exact executable paths `MUST VERIFY BEFORE EXECUTION`, `safeDisposalCapability=UNPROVEN`, and `completeMembershipCapability=UNPROVEN`. Consequently **no worker/supervisor/provider branch is authorized or reachable with this package at its prepared bytes**. A later change to these fields changes the reviewed package hash and requires new review/authorization. The guard cannot confer governance authority by itself.

The candidate has **no proved finite non-destructive lifetime for a stalled worker**. It has **no independent complete-member enumeration**, including conhost-equivalent/helper attribution. Its read-only identity observer is itself a helper whose stalled lifetime is not proven. HMAC in Controller memory separates worker input from receipt anchoring but its full trust boundary and immutable evidence sink remain unproven. These are explicit source-safety STOP findings; WH-03, WH-08 and WH-09 cannot be claimed PASS. Any future safety review must keep execution stopped until resolved through separate governance. `DisposalFailed / Safe Isolation Not Proven` is a failed case, never a qualifying safe-isolation claim.

## Bounds: start event → timer → expiry branch → consequence → evidence

| Bound | Exact source/API | Expiry / consequence | Retained evidence |
| --- | --- | --- | --- |
| Startup 8 s | `supervisor.mjs:main` `startupTick=process.hrtime.bigint()`, `observeIdentity`, `elapsedMs` | `STOP — worker startup bound exceeded`; no ARM | `Receipt`, `SupervisorStop`, `SupervisorFinally` |
| Provider 10 s | `controller.mjs:main` `providerStart`, `setTimeout` after ARM | `close('Timeout')`, cutoff and revocation; cancellation requested separately | `ProviderObservationTimerStarted/Expired`, `BoundaryClosed` |
| Closure 2 s | `controller.mjs:close` trigger `tick()`; `AuthorityFence.close` | throws `STOP — authoritative closure bound exceeded`; no successful validation claim | `BoundaryClosed.durationMs/withinBound` |
| Cancellation grace 2 s | `supervisor.mjs:main` `CancelRequested`, `Promise.race` on `exit`/`setTimeout` | `WorkerUnresponsive`, no destructive fallback | `CancelRequested`, `WorkerUnresponsive` |
| Fresh ownership 500 ms | `supervisor.mjs:observeIdentity/verifyFresh`, Controller `independentIdentity` | `STOP — Ownership Revalidation Failed`; withhold action | `FreshOwnership` or `SupervisorStop` |
| Disposal/safe isolation 5 s | `supervisor.mjs:main` starts `disposalStart` after cancellation; bounded `Promise.race` | `STOP — Safe Hang-Path Disposal Unproven`; no `Disposed` inference | `DisposalObservation`, `SupervisorFinally` |
| Total 45 s | `controller.mjs:main` `runStart`, `setTimeout` | `close('Timeout')`; unresolved worker remains failed | `BoundaryClosed`, `ControllerFinally.totalWithinBound` |

## WH path map

Each row follows **trigger → exact reviewed file/branch → exact API/call → state transition → ownership check → cleanup/disposal → retained evidence**. Any action on an *existing* process/resource identity requires fresh full revalidation immediately before that action. Initial `spawn` is **Ownership Check = Not Applicable — the new PID/creation event does not yet exist**; the exact run/config/manifest guard precedes creation, and a complete independent receipt plus fresh identity/membership validation is required before ARM or acceptance. A PID list or age check alone never proves ownership. The mandatory tuple is **PID + image path + parent PID + creation time + run token + creation/assignment evidence**, plus applicable retained handle/session/boundary and complete member evidence. Missing, stale, mismatched or unexpected values are STOP; no fallback bypass exists.

| Case | Executable branch / exact call and state | Ownership check | Cleanup and retained evidence |
| --- | --- | --- | --- |
| WH-01 Normal | `worker.ps1` ARM branch → `Get-CimInstance -ClassName Win32_Process -Filter`; `supervisor.mjs` `WorkerExit`; `controller.mjs` `close(Success/Fail)` | Initial spawn = Not Applicable — new identity does not exist; Required before ARM and process cleanup; result-only `AuthorityFence.receive` = Not Applicable — no process action | Natural exit; `Receipt`, `ResultAccepted`, `BoundaryClosed`, `WorkerDisposal`, final hashes |
| WH-02 Timeout | `controller.mjs` provider `setTimeout` → `close(Timeout)`; `supervisor.mjs` CANCEL → `worker.stdin.end()` | Required immediately before cooperative request; `observeIdentity` + `verifyFresh` | 2 s grace/5 s bound; unproven disposal fails; timer/cutoff/grace/disposal evidence |
| WH-03 Unresponsive | `supervisor.mjs:main` pre-launch `STOP — Safe Hang-Path Disposal Unproven` | Not Applicable — pre-launch STOP performs no process action | No launch; `PreflightStop` / STOP finding. No unresponsive-case PASS until separate safe boundary approved. |
| WH-04 Exception | `worker.ps1` synthetic exception → `catch` sanitized category; Controller `close(Fail)` | Required for subsequent process cleanup; receipt/revalidation gate still mandatory | `WorkerStderr` digest, `WorkerExit`, terminal/cutoff, disposal |
| WH-05 Late result | `worker.ps1` second candidate; `controller.mjs` → `AuthorityFence.receive` after close | Not Applicable — result rejection performs no process action; cleanup separately Required | `Late / Rejected`, unchanged closure/final hashes, zero mutations |
| WH-06 Stale generation | `worker.ps1` wrong generation; `AuthorityFence.receive` rejects | Not Applicable — result rejection performs no process action; cleanup separately Required | `Stale / Rejected`, unchanged terminal and audit |
| WH-07 Ownership mismatch | `supervisor.mjs:main` synthetic mismatch after `observeIdentity` / `verifyFresh` | Required — fails closed before ARM/CANCEL action | `SupervisorStop`, action withheld, unresolved resource reported |
| WH-08 Unexpected member | `supervisor.mjs:main` synthetic unexpected-member STOP; current membership capability gate also STOP | Required — fails closed before ARM/CANCEL action | `SupervisorStop`, no unknown-member action; complete-member proof still missing |
| WH-09 Disposal failure | `supervisor.mjs:main` pre-launch safe-disposal STOP; normal timeout path separately emits `DisposalFailed / Safe Isolation Not Proven` | Not Applicable for pre-launch STOP; Required for any later cooperative process action | No launch for forced case; unresolved-disposal failure, no qualifying isolation claim |
| WH-10 Cleanup/finally | `supervisor.mjs:finally`; `controller.mjs:finally`; `worker.ps1:finally` | Required before process-affecting cleanup. Controller-owned audit FD/stream closure = Not Applicable — own handle only | `SupervisorFinally`, `ControllerFinally`, evidence `.sha256`, unresolved worker flag |

## Evidence and non-claims

Future output location is authorized run-specific `--evidence-dir`, compared to a future authorization record. `controller.mjs` uses exclusive `openSync(...,'wx')` for JSONL audit and sidecar SHA-256; it records source/config identity, environment through authorization/config, run/generation, receipt anchor, ownership, monotonic durations, cutoff, result rejection, closure/final hashes, disposal and sanitized errors. The worker receives no evidence-file path. A controller-local HMAC plus exclusive file creation is a **candidate trust mechanism**, not independently verified immutable evidence. The source contains no real tenant/Core iBeX data. No chain-of-thought is captured. No network, installation, elevation, Windows service or global-configuration operation is present.

This map is a static review aid. It is not a PASS finding for SC-1–SC-8, RQ-1–RQ-5, or WH-01–WH-10. The next gate is independent **Exact Source / Path Preflight Review** at committed bytes, then separate source safety review. R&D execution remains unauthorized.
