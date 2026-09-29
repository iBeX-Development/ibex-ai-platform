# SIR-02 KM OE-12 Worker-Host R&D Source / Configuration Manifest v1.0

| Field | Prepared record |
| --- | --- |
| Classification | **R&D ONLY / NOT AUTHORIZED FOR EXECUTION** |
| Status | **Prepared / Not Safety-Approved / No R&D Execution Authorization** |
| Candidate | **Dedicated non-interactive worker host** only |
| Preparation authority | Published owner decision `f526f845539193ab03db0a7eccb25ca319b29866` |
| Reviewed plan | Publication `83d74ca3f1962e2963b1011b2a97b9b55344486d`; technical review `894b04dcecd76fb7a3ba044bb381e57764402216`; plan SHA-256 `c559e0486ee287364ce57ff1c5e190229a4a63af877f5508a7dec90a720de984` |
| Source location | `tests/rd/oe12-worker-host/` — isolated test/R&D source, outside production/runtime |
| Machine source manifest | `tests/rd/oe12-worker-host/package-manifest.json` |
| Deterministic source-package manifest SHA-256 | `03d863808a642768151b0b675618bc99fa1e3108304e4f857d92dc6c3c597a33` |
| Execution | **Prepared bytes have NOT been executed.** No worker, CIM/provider operation, R&D run, or OE-12 operational evidence was created. |

## Exact staged/committed source and configuration bytes

SHA-256 is over exact Git-index blob bytes, to be checked again against committed blobs after the local package commit. The machine manifest lists all eight payload hashes in stable path order; its separate SHA-256 above is the deterministic package identity. It does not contain its own hash. The governance manifest is not part of the runnable payload and does not self-hash.

| Artifact path (repository relative) | Role and entry point | SHA-256 | Process/resource action and ownership check | Runtime / WH coverage |
| --- | --- | --- | --- | --- |
| `tests/rd/oe12-worker-host/PATH-MAP.md` | Static executable-path and bound map; not an entry point | `1dd4232fcb17e4f5443ca941334f1d5842070f960ef195bf4e0c64c36deab877` | None; Not Applicable — document only | WH-01–WH-10 map |
| `tests/rd/oe12-worker-host/config.json` | Proposed numeric/environment/case configuration; not an entry point | `501e2210a4373374d685c585a4aedb8d6fb78fc3c37634d0ff8b381458cbf246` | None; Not Applicable — data only | WH-01–WH-10; seven reviewed bounds |
| `tests/rd/oe12-worker-host/controller.mjs` | **Entry point:** Authoritative Controller; result fence, HMAC anchor, audit | `3fdf55eec65585857e5157099ce60e0be2fe60318833f66c61b05ff780daf26a` | `spawn` supervisor and independent identity observer; Required before ARM/CANCEL downstream, via full receipt/member gate and supervisor fresh revalidation. Own audit handles: Not Applicable — controller-owned resource. | Existing Node built-ins; WH-01,02,04–08,10 |
| `tests/rd/oe12-worker-host/guard.mjs` | Imported execution guard and runnable-byte verifier | `77a41db2a76e8a0ef17721d3afbe42516b2068c485446002830f47a6428a8c88` | No process action; Not Applicable — reads approved input and hashes. | Existing Node built-ins; all cases gated |
| `tests/rd/oe12-worker-host/identity.ps1` | **Guarded entry point:** read-only local identity observation helper, invoked by Supervisor/Controller | `94de540708eedf9c20f2e19d81c80d864912cb542a1943a3c2af6aff89af460c` | Local `Get-CimInstance Win32_Process`; no process-affecting API. Observer helper ownership/lifetime is **not proven**. | Windows PowerShell 5.1; WH-01,02,04,07,08,10 identity paths |
| `tests/rd/oe12-worker-host/protocol.mjs` | Controller-owned `AuthorityFence`, terminal/cutoff/rejection/state hash | `e487731d84a32003ba726326fae1f6e14d82696feababa69072bf691d84d4312` | No process action; Not Applicable — in-memory state only. | Existing Node built-ins; WH-01,02,04–06,10 |
| `tests/rd/oe12-worker-host/supervisor.mjs` | **Entry point:** Independent Supervisor / receipt producer / cooperative disposal | `00395c3663dfae9d654430dd91bc449863d65e2574925d366ece3bec4f7129f1` | `spawn` worker/observer; `worker.stdin.write/end` only after fresh full tuple check; no destructive fallback. Membership proof remains **UNPROVEN** and blocks ARM. | Existing Node built-ins + existing PowerShell; WH-01–04,07–10 |
| `tests/rd/oe12-worker-host/worker.ps1` | **Guarded entry point:** non-interactive synthetic Worker Host; waits for ARM before read-only local CIM | `8b370d1298498bf58b22047ec59c0f76d43d97c60d6422ed56ad488baba6ad81` | No external process action; own local `Get-CimInstance` only after exact ARM. Cannot set authoritative state or receipt. | Windows PowerShell 5.1; WH-01–06,10; WH-03/09 fail closed |
| `tests/rd/oe12-worker-host/package-manifest.json` | Machine-readable exact-byte payload list; runtime `--manifest-sha256` identity | `03d863808a642768151b0b675618bc99fa1e3108304e4f857d92dc6c3c597a33` | None; Not Applicable — data only | All runnable artifacts; no dependency install |

## Selected mechanisms and source paths

The **Controller** is `controller.mjs`, the **independent creator/receipt producer** is a separate `supervisor.mjs` process, and the **Worker Host** is `worker.ps1` behind an explicit ARM message. Both executable JavaScript entry points call `executionGate()` before any spawn. The Worker emits only synthetic candidate observations. Controller-owned `AuthorityFence` receives run/generation/sequence-tagged JSON lines over dedicated pipes, fixes one `Success | Timeout | Fail | Cancelled` terminal state and explicit Accepted Result Cutoff, then rejects late/stale results. Controller evidence uses exclusive-create JSONL plus a separate SHA-256 sidecar at a future separately authorized `--evidence-dir`.

The Supervisor creates the worker with `spawn(...,{shell:false,windowsHide:true,stdio:pipes})`, retains the `ChildProcess` object and creation event, and uses local read-only `identity.ps1` to construct the full-tuple receipt. The Controller, separately from worker input, HMAC-anchors that receipt with a Controller-memory key and performs its own identity observation before ARM. This is a **candidate** independent receipt mechanism. Source review must still determine whether the producer, anchor, complete Node/conhost/helper provenance and immutable evidence sink satisfy GAP-A. A worker-reported receipt/hash is never accepted as ownership proof.

For process-affecting ARM and cooperative cancellation, `supervisor.mjs` re-queries `identity.ps1` immediately before `worker.stdin.write/end`; it compares PID, image, parent, creation time, run-token presence and creation event to the retained receipt, with the proposed 500 ms age bound. Missing/stale/mismatched tuple or unexpected member stops the action. Complete member enumeration and observer-helper lifetime are **not proven**; the source therefore reports STOP before ARM. No `TerminateProcess`, `TerminateJobObject`, kill-on-close, `Stop-Process`, `taskkill`, unknown-PID action or broad fallback is implemented.

The cleanup path requests cooperative EOF after fresh ownership validation, observes the 2 s grace within the 5 s disposal bound, and records `Disposed` only after observed exit. Otherwise it records **`DisposalFailed / Safe Isolation Not Proven`** and fails the case. Controller cutoff/revocation is never treated as worker disposal. `controller.mjs:finally`, `supervisor.mjs:finally`, and `worker.ps1:finally` are the cleanup locations. The exact trigger/branch/API/state/ownership/cleanup/evidence map for WH-01–WH-10 and all seven bounds is in `PATH-MAP.md`.

## Environment, guard and unresolved safety preflight

Expected future environment: Windows x64, Windows PowerShell 5.1 and the already available Node.js runtime under an ordinary user account; built-in modules only; no network, new dependency, elevation, service/OS/global configuration change, persistent execution-policy change, production data or runtime modification. Exact executable paths, versions, account, local provider behavior, complete membership and safe-disposal capability are **MUST VERIFY BEFORE EXECUTION**. No sandbox/container candidate is included.

Every executable entry point requires explicit `authorized-worker-host-rd` mode, run ID/token, generation, case, approved config path, exact machine-manifest SHA-256, plus an external separately published one-run execution-authorization record and hash. `guard.mjs` checks all listed files; `worker.ps1` and `identity.ps1` additionally check their own exact source hash before any READY/CIM branch. The present configuration says **`STOP — safe finite-lifetime worker disposal and complete membership attribution unproven`**, and its executable paths remain unverified. Thus the prepared package **cannot pass its current guard**. The guard is defense in depth, not execution authorization. Any changed config/source byte requires a new exact-byte review and separate authorization.

**STOP findings for source/path preflight:** no qualifying finite non-destructive lifetime for an unresponsive worker; no independent complete helper/member set (including conhost-equivalent relationships); observer-helper timeout/lifetime not proven; full independent receipt/evidence-sink trust not proven; exact executable paths/environment not verified. WH-03/WH-09 intentionally fail before launch. WH-08 cannot be claimed PASS from synthetic mismatch injection. These findings are not silently repaired or bypassed. No SC-1–SC-8 or RQ-1–RQ-5 PASS is claimed.

## Governance state and next gate

**GAP-A = OPEN / mandatory. GAP-B operational closure = NOT ESTABLISHED. Bounded non-destructive worker disposal = OPEN proof obligation. Alignment GAP = CLOSED. OE-12 = Not Executed. SIR-02 = Blocking.** R&D execution remains unauthorized; source safety acceptance remains pending. The package has not been copied to a runnable location, and **no prepared source has been executed**. No worker/process/CIM/provider test activity occurred during preparation. The next permissible action is **Exact Source / Path Preflight Review of this immutable Worker-Host R&D package**. That review must preserve STOP unless the unresolved mechanism and helper/member lifetime can be shown safe under separate governance; it cannot infer authorization from this manifest.
