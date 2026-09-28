# SIR-02 KM OE-12 Boundary Change-Control Decision v1.0

| Field | Value |
| --- | --- |
| Purpose | Request an owner decision on whether to continue detailed boundary design; no technical model selected |
| Feasibility assessment | `SIR-02-KM-OE-12-BOUNDARY-FEASIBILITY-ASSESSMENT-v1.0.md` |
| Boundary review | `47f211830b24ea8c60540621f2d99a625225966f` |
| Reviewed remediation publication | `47bfaed4e0b96ce9d6c4fc0d4e6ac206659d6d46` |
| Owner | `GANTUMUR Erdenedalai — Founder / Administrator` |
| Reviewer | `SODBILEG Erkhembayar — Administrator` |
| Status | **Proposed / Owner Decision Required** |
| Decision date | **Owner Input Required** |
| Selected option | **None** |
| Authorized files, commands, probes, or execution | **None** |

## Findings presented for owner decision

- GAP-A remains **Expanded Trust Boundary Required**. An independent controller/anchor is a plausible direction for a controller-created synthetic Node process, but complete conhost creation/assignment provenance and no-elevation availability remain unproven. Feasibility result: **Needs Clarification**.
- GAP-B remains **Separate Isolation/Execution Boundary Required**. The current non-destructive, in-process or cooperative worker path cannot prove finite quiescence of a nonresponsive shared CIM provider. Probe/collector stability is distinct from provider completion. Feasibility result: **Not currently feasible** under the current contract.
- No combined boundary model has yet been demonstrated to satisfy both gaps. C1 and C2 leave bounded provider completion unproved. C3 would require explicit quiescence and destructive-action change control, and still would not prove shared-provider completion. C4 requires separate platform/environment feasibility and likely privilege/configuration change control.
- The exact source `61aa0e575fc52f121f9fd24cb41a575ccc55c120` remains rejected for execution. The Alignment GAP remains **OPEN**. Option B remains `Needs Clarification`; Diagnostic v4 is not proposed; launcher v1.4 is blocked; Smoke v5 and formal retry `0003` are not authorized; OE-12 remains `Not Executed`.

## Owner decision options — select exactly one in a later decision

1. **Approve Boundary Model for Detailed Design** — the owner must name the exact combined boundary model and separately specify any trust, criterion, process-action, privilege, environment, dependency, or configuration change being considered. This option would authorize **detailed design only**, not source preparation, probe execution, or implementation. No model is recommended or preselected by this proposal.
2. **Additional Feasibility Analysis Required** — identify the precise unanswered trust/identity or provider-quiescence question and authorize only a separately scoped, read-only analysis plan. No probe or implementation follows from this option alone.
3. **Stop OE-12 Current Approach** — stop work on the present CIM/launcher route while preserving every historical attempt, review, and canonical status. Any replacement approach requires its own governance decision.

**Current decision: no option selected.** The owner must make and publish a separate decision. The proposal cannot be read as approval of C1, C2, C3, C4, Option B, Diagnostic v4, Smoke v5, or formal retry `0003`.

## Change-control conditions

Any later detailed design must keep the full identity tuple and independent pre-probe receipt anchor; prevent the probe from creating or resealing its own ownership evidence; require fresh identity and membership verification immediately before a process-affecting action; and preserve tenant/security controls. It must separately prove provider-level quiescence or explicitly seek a criterion decision before using probe-boundary quiescence. No silent weakening is permitted.

The current contract permits only cooperative/natural exit, bounded observation, read-only verification, and deterministic disposal. Unknown-member termination, Job-wide destructive fallback, and other destructive cleanup remain prohibited. A design involving worker termination must identify its exact target, independent ownership proof, absence of collateral processes, and the specific change to the non-destructive contract before implementation can be considered.

STOP for separate change control if the chosen future model requires production/runtime modification, tenant/security weakening, criterion weakening, privilege elevation, Windows/CIM configuration or service changes, network access, dependency installation, or live/production data. None is authorized here. No canonical OE/SIR status changes are made by this proposal.
