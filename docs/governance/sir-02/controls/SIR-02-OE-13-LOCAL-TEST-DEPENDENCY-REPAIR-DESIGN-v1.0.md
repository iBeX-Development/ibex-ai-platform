# SIR-02 OE-13 Local Test Dependency Repair Design

## Document control

| Field | Value |
| --- | --- |
| Document/version | `SIR-02-OE-13-LOCAL-TEST-DEPENDENCY-REPAIR-DESIGN` / `v1.0` |
| Status | `Proposed / Not Approved` |
| Purpose | Restore only the local test dependency layout needed by the accepted OE-13 supplemental instrumentation |
| Owner | GANTUMUR Erdenedalai — Founder / Administrator |
| Reviewer | SODBILEG Erkhembayar — Administrator |
| Environment | Local repository checkout; isolated non-live OE-13 tests |
| Decision date | `Owner Input Required` |
| Immutable approved-design reference | `Owner Input Required` |

This is a repair proposal, not permission to run an install. Accepted instrumentation commit `23c150b494b8ec66b21e56776b32923f9607acfb` and independent review `1f22bf2ff5d02d9c9b8266c0874e99fca4a65d41` remain unchanged. The original formal OE-13 run `SIR02-KM-OE-13-V1_0-20260926T131738Z-0001` remains authoritative. Tooling-attempt commit `4c9e597d1c0aa91613c328dbb5ffbe834ff2cbc9` preserves the two unsuccessful supplemental attempts; its JSON artifact SHA-256 is `e7702360622c5ca86ed56ef7186f570b391b834a50e9dc171cec1fdf0197fec0`.

## Read-only diagnosis at preparation

| Question | Observed state | Conclusion |
| --- | --- | --- |
| Is `node_modules` complete? | `node_modules/.modules.yaml`, `node_modules/.pnpm/lock.yaml`, and `node_modules/.bin/vitest.cmd` are absent. Direct Vitest startup fails with `ERR_MODULE_NOT_FOUND` for `@vitest/utils`. | No. The installed dependency layout cannot run Vitest. |
| Are pnpm virtual-store links complete? | The `vitest@4.1.11` and `@vitest+utils@4.1.11` package directories exist, but Vitest's `node_modules/@vitest/utils` link is absent. | No. Package content in the virtual store does not establish a usable dependency graph. |
| Is the configured store/cache intact? | pnpm `11.19.0` reports `./.pnpm-store/v11`; that path is absent. Existing virtual-store package directories are not a substitute for a verified content-addressed store. | The configured cache is unavailable; offline repair cannot be assumed to work. |
| Can a frozen install repair the layout? | `package.json` and `pnpm-lock.yaml` are tracked and unchanged. The lockfile pins `vitest@4.1.11` and `@vitest/utils@4.1.11`. | A successful `--frozen-lockfile` install is the preferred pnpm-managed relink/reconstruction method, subject to owner authorization and post-install verification. Success is not yet demonstrated. |
| Would versions or tracked files change? | No such change is needed by the proposal. A frozen install must be stopped and treated as a failed repair if it proposes any tracked-file or resolution change. | No version, `package.json`, workspace file, or lockfile change is authorized. |
| Is network required? | The configured pnpm store is absent; an offline install may fail despite residual virtual-store content. | Network is **likely** needed to refill the store, but not proven until an authorized offline attempt. Network remains separately owner-gated. |
| Do OneDrive, ACLs, or sandbox affect this? | The checkout is under OneDrive. Sandbox read of `vitest.mjs` was denied; a one-time exception reached Node, which then reported the missing package link. The file's ordinary `Archive` attribute and the available evidence do not establish OneDrive as the cause of the incomplete layout. | Sandbox permission affected execution; the installation-layout cause is not attributable to OneDrive or Windows ACL from current evidence. Reassess only if a frozen repair fails. |

Attempt 1 timed out after `120.227` seconds while `corepack pnpm exec vitest run ...` reported that it was recreating `node_modules`. Attempt 2 exited before scenarios in `0.095` seconds with the missing `@vitest/utils` error. Neither wrote a Vitest report or supplemental measurement file. The generated untracked `.pnpm-store` cache from attempt 1 was removed after its absence from the initial clean checkout was established; the tooling record and temporary command logs were preserved. No application, test implementation, governance status, or tracked dependency declaration changed.

## Minimum repair sequence proposed for separate approval

1. **Record a pre-repair baseline.** From the existing repository, capture `git status --short`, `git hash-object package.json`, `git hash-object pnpm-lock.yaml`, `corepack pnpm --version`, `corepack pnpm store path`, and presence of `.modules.yaml`, virtual-store lockfile, Vitest shim, and Vitest's `@vitest/utils` link. Preserve output outside tracked source files. These are read-only checks.
2. **Attempt offline pnpm-managed repair first.** Proposed command: `corepack pnpm install --offline --frozen-lockfile`. Set `COREPACK_ENABLE_NETWORK=0` and use a bounded, noninteractive invocation. The configured store is currently absent, so missing local package content may make this attempt fail; preserve its exact output and any partial local state. Do not automatically proceed to a network attempt.
3. **Lockfile-frozen reconstruction if offline content is insufficient.** Proposed command: `corepack pnpm install --frozen-lockfile`. This step requires separate explicit owner approval for network access before execution. Limit network use to fetching the exact locked packages through the configured pnpm registry; do not change registry or dependency definitions. Pnpm may internally rebuild/relink the **ignored local `node_modules` tree** and populate the local store. This local-state repair needs explicit approval. Do not manually delete `node_modules`, move the checkout, or manually fabricate links.
4. **Verify, then stop.** Confirm the Vitest shim, `.modules.yaml`, virtual-store lockfile, and `@vitest/utils` link exist; run a bounded, noninteractive `corepack pnpm exec vitest --version` smoke check only. Verify `git status --short` and the recorded `package.json`/lockfile hashes are unchanged. If sandbox still denies the already-installed runner, seek only a one-time permission for that smoke check. Do **not** run OE-13 scenarios or produce supplemental evidence as part of repair.

The offline frozen install is the required first repair attempt after authorization. If it cannot complete specifically because locked package content is missing locally, stop and obtain separate network authorization before the frozen online command. In the present state, a network fetch is likely, but not proven. No full deletion of `node_modules` is proposed. If pnpm requires a manual purge, a different package version, tracked-file edit, registry change, migration, or any source change, stop for a new decision.

## Change boundaries and acceptance criteria

- **Local untracked state:** only ignored `node_modules` links/content and the configured local pnpm store may be repaired after approval. These are not immutable OE-13 evidence artifacts. Capture before/after package-layout checks and exact command logs.
- **Tracked repository files:** no changes to `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, code, tests, governance records, or configuration. Compare Git status and content hashes before/after. Any tracked change is a failed boundary check requiring separate change control.
- **Package resolution:** use existing `pnpm@11.19.0` and the exact lockfile. No dependency addition, upgrade, or lockfile regeneration. `--frozen-lockfile` must fail rather than resolve a new graph.
- **Network:** no network during diagnosis or an offline attempt. A frozen online attempt is prohibited until the owner approves it explicitly, including its command and scope.
- **Execution:** no formal or supplemental OE-13 test run, no application/runtime action, no ingestion, RAG, storage, deployment, secrets, credentials, or traffic. The version smoke check only establishes runner availability; it does not satisfy OE-13 evidence acceptance.
- **Failure:** preserve command, UTC start/end, exit code, timeout, stdout/stderr, and post-attempt state; do not repeatedly run installs or silently repair partial state.

The repair is **expected** to restore Vitest if the locked packages can be supplied and pnpm reconstructs all links. It cannot be certified sufficient before an authorized repair and smoke check. Any later supplemental execution remains a separate controlled step with its own evidence and independent review.

## Current governance hold

No repair command or test was executed while preparing this design. OE-13 remains `Executed / Awaiting Independent Review`; operational evidence remains `9 Accepted / 1 Awaiting Independent Review / 5 Not Executed`. `SIR02-DEF-02` remains `Missing / Not Reviewed`, and SIR-02 remains `Blocking`.
