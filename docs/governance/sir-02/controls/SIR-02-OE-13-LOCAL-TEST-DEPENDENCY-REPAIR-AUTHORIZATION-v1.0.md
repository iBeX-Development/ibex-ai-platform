# SIR-02 OE-13 Local Test Dependency Repair Authorization Record

## Document control

| Field | Value |
| --- | --- |
| Document/version | `SIR-02-OE-13-LOCAL-TEST-DEPENDENCY-REPAIR-AUTHORIZATION` / `v1.0` |
| Status | **`Proposed / Not Authorized`** |
| Exact design proposed | `SIR-02-OE-13-LOCAL-TEST-DEPENDENCY-REPAIR-DESIGN-v1.0.md` |
| Owner | GANTUMUR Erdenedalai — Founder / Administrator |
| Reviewer | SODBILEG Erkhembayar — Administrator |
| Decision date | `Owner Input Required` |
| Owner decision/outcome | `Owner Input Required` |
| Owner decision statement | `Owner Input Required` |
| Exact commands permitted | `Owner approval required` |
| Local `node_modules` reconstruction permission | `Owner Input Required` |
| Network permission | `Owner approval required if needed` |
| Immutable completed-authorization reference | `Owner Input Required` |

## Proposed decision scope for owner review

The requested future decision is limited to repairing the **local installed test dependency layout** so the already accepted OE-13 supplemental instrumentation can be run. It would not authorize a dependency-version change, a tracked repository edit, an OE-13 evidence run, or OE-13 acceptance. The design identifies a conditional offline frozen install and, only if separately approved, a frozen install that may fetch the **existing locked package versions**. The owner must explicitly decide which exact command is permitted, whether pnpm may reconstruct ignored local `node_modules`, and whether any network access is permitted. A decision to approve offline repair does not imply approval of online repair.

Proposed commands for a future exact-command decision:

| Stage | Proposed command | Current authorization |
| --- | --- | --- |
| First local-only repair attempt | `corepack pnpm install --offline --frozen-lockfile` | **Not authorized** |
| Network candidate, only if local content is insufficient | `corepack pnpm install --frozen-lockfile` | **Not authorized; separate explicit network approval required** |
| Post-repair runner smoke check | `corepack pnpm exec vitest --version` | **Not authorized as part of a repair yet** |

All future commands must be bounded, noninteractive, run from the existing checkout, and retain exact logs and pre/post Git and dependency-layout checks. No manual `node_modules` deletion, repository move, broad/full-access permission, dependency update, or lockfile edit is proposed. If pnpm cannot preserve the tracked baseline, stop for a new decision.

## Supporting context and status hold

- Accepted supplemental instrumentation: `23c150b494b8ec66b21e56776b32923f9607acfb`; accepted review: `1f22bf2ff5d02d9c9b8266c0874e99fca4a65d41`.
- Preserved tooling-attempt lineage: commit `4c9e597d1c0aa91613c328dbb5ffbe834ff2cbc9`; artifact SHA-256 `e7702360622c5ca86ed56ef7186f570b391b834a50e9dc171cec1fdf0197fec0`.
- The original formal OE-13 run remains `SIR02-KM-OE-13-V1_0-20260926T131738Z-0001`; no supplemental scenario ran during the two repair-triggering tooling attempts.
- This record supplies **no owner approval**. It neither authorizes running `pnpm install` nor permits a network request, test execution, code edit, or evidence-status change.
- OE-13 remains `Executed / Awaiting Independent Review`; operational evidence remains `9 Accepted / 1 Awaiting Independent Review / 5 Not Executed`. `SIR02-DEF-02` remains `Missing / Not Reviewed`; SIR-02 remains `Blocking`.
