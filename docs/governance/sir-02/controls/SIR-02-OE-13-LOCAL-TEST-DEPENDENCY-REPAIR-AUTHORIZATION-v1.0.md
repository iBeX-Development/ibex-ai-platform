# SIR-02 OE-13 Local Test Dependency Repair Authorization Record

## Document control

| Field | Value |
| --- | --- |
| Document/version | `SIR-02-OE-13-LOCAL-TEST-DEPENDENCY-REPAIR-AUTHORIZATION` / `v1.0` |
| Status | **`Authorized for Offline Local Dependency Repair`** |
| Exact design authorized | `SIR-02-OE-13-LOCAL-TEST-DEPENDENCY-REPAIR-DESIGN-v1.0.md`; commit `03438c6a30dd5df8cbbaab0421e67fda2b22af9d` |
| Owner | GANTUMUR Erdenedalai — Founder / Administrator |
| Reviewer | SODBILEG Erkhembayar — Administrator |
| Decision date | `2026-09-27` |
| Owner decision/outcome | `Authorized for Offline Local Dependency Repair` |
| Owner decision statement | Owner authorizes only the offline, frozen-lockfile command and local ignored dependency-link repair under the conditions below. |
| Exact repair command permitted | `corepack pnpm install --offline --frozen-lockfile` |
| Local `node_modules` reconstruction permission | Pnpm-managed repair of ignored local dependency links only; no wholesale deletion |
| Network permission | **Not authorized** |
| Immutable completed-authorization reference | `ca8ab9747eb556b12908af610e284175270bb441` |

## Formal owner decision and conditions

GANTUMUR Erdenedalai — Founder / Administrator authorizes one local-only offline dependency-layout repair attempt using **exactly** `corepack pnpm install --offline --frozen-lockfile`. This decision is limited to restoring ignored local `node_modules` and pnpm links for the accepted OE-13 supplemental test runner. It does not authorize a dependency-version change, a tracked repository edit, an OE-13 evidence run, or OE-13 acceptance.

The command must run from the existing checkout, noninteractively, with a bounded timeout and network disabled. Preserve the exact command, UTC start/end, elapsed time, exit code, and stdout/stderr. Before execution, verify a clean working tree, record `package.json` and lockfile hashes, record branch HEAD, and verify the accepted OE-13 instrumentation reference `23c150b494b8ec66b21e56776b32923f9607acfb`. After execution, verify those tracked files and all other tracked files are unchanged and inspect Vitest's shim and `@vitest/utils` resolution.

| Stage | Command | Authorization |
| --- | --- | --- |
| Offline local repair | `corepack pnpm install --offline --frozen-lockfile` | **Authorized once** |
| Online install | `corepack pnpm install --frozen-lockfile` | **Not authorized; separate explicit owner and network authorization required** |
| Post-repair toolchain validation, only after successful repair | `corepack pnpm exec vitest --version` or equivalent bounded noninteractive version check | **Authorized as validation only; not an OE-13 scenario or supplemental capture** |

No package addition, upgrade, downgrade, `package.json` change, lockfile change, production/runtime source change, implementation change, repository move, or wholesale `node_modules` deletion is authorized. If local package content is unavailable, the offline attempt fails or requests network, or pnpm cannot preserve the tracked baseline, **stop** and report the exact blocker. Do not fall back automatically. The owner must separately authorize any online command and network access.

## Supporting context and status hold

- Accepted supplemental instrumentation: `23c150b494b8ec66b21e56776b32923f9607acfb`; accepted review: `1f22bf2ff5d02d9c9b8266c0874e99fca4a65d41`.
- Preserved tooling-attempt lineage: commit `4c9e597d1c0aa91613c328dbb5ffbe834ff2cbc9`; artifact SHA-256 `e7702360622c5ca86ed56ef7186f570b391b834a50e9dc171cec1fdf0197fec0`.
- The original formal OE-13 run remains `SIR02-KM-OE-13-V1_0-20260926T131738Z-0001`; no supplemental scenario ran during the two repair-triggering tooling attempts.
- This record authorizes only the bounded offline command and conditional version smoke check above. It permits no network request, OE-13 scenario or supplemental capture, code edit, or evidence-status change.
- OE-13 remains `Executed / Awaiting Independent Review`; operational evidence remains `9 Accepted / 1 Awaiting Independent Review / 5 Not Executed`. `SIR02-DEF-02` remains `Missing / Not Reviewed`; SIR-02 remains `Blocking`.
