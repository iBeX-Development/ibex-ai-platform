# SIR-02 KM OE-12 Boundary Change-Control Decision v1.0

| Field | Value |
| --- | --- |
| Purpose | Record the owner decision on the OE-12 boundary feasibility path; no technical model selected |
| Feasibility assessment | `SIR-02-KM-OE-12-BOUNDARY-FEASIBILITY-ASSESSMENT-v1.0.md` |
| Published assessment and decision proposal | `622611efa22c261cb57a08feda20a808a54121a6` |
| Boundary review | `47f211830b24ea8c60540621f2d99a625225966f` |
| Reviewed remediation publication | `47bfaed4e0b96ce9d6c4fc0d4e6ac206659d6d46` |
| Owner | `GANTUMUR Erdenedalai — Founder / Administrator` |
| Reviewer | `SODBILEG Erkhembayar — Administrator` |
| Status | **Additional Feasibility Analysis Required** |
| Decision date | **2026-09-29** |
| Selected option | **Additional Feasibility Analysis Required** |
| Immutable owner decision | `e31036b003a59c4e27b0a2e7239bcd32aef6ba80` |
| Authorized files, commands, probes, or execution | **None** |

## Decision basis

- GAP-A remains **Expanded Trust Boundary Required**. An independent controller/anchor is a plausible direction for a controller-created synthetic Node process, but complete conhost creation/assignment provenance and no-elevation availability remain unproven. Feasibility result: **Needs Clarification**.
- GAP-B remains **Separate Isolation/Execution Boundary Required**. The current non-destructive, in-process or cooperative worker path cannot prove finite quiescence of a nonresponsive shared CIM provider. Probe/collector stability is distinct from provider completion. Feasibility result: **Not currently feasible** under the current contract.
- No combined boundary model has yet been demonstrated to satisfy both gaps. C1 and C2 leave bounded provider completion unproved. C3 would require explicit quiescence and destructive-action change control, and still would not prove shared-provider completion. C4 requires separate platform/environment feasibility and likely privilege/configuration change control.
- The exact source `61aa0e575fc52f121f9fd24cb41a575ccc55c120` remains rejected for execution. The Alignment GAP remains **OPEN**. Option B remains `Needs Clarification`; Diagnostic v4 is not proposed; launcher v1.4 is blocked; Smoke v5 and formal retry `0003` are not authorized; OE-12 remains `Not Executed`.

## Owner decision options and selected decision

1. **Approve Boundary Model for Detailed Design** — the owner must name the exact combined boundary model and separately specify any trust, criterion, process-action, privilege, environment, dependency, or configuration change being considered. This option would authorize **detailed design only**, not source preparation, probe execution, or implementation. No model is recommended or selected by this decision.
2. **Additional Feasibility Analysis Required** — identify the precise unanswered trust/identity or provider-quiescence question and authorize only a separately scoped, read-only analysis plan. No probe or implementation follows from this option alone.
3. **Stop OE-12 Current Approach** — stop work on the present CIM/launcher route while preserving every historical attempt, review, and canonical status. Any replacement approach requires its own governance decision.

**Owner decision: `Additional Feasibility Analysis Required`.** GAP-A remains unresolved. GAP-B is not currently feasible under the existing non-destructive provider-quiescence requirement. No combined boundary model has been proven feasible, so detailed-design approval would be premature. The current OE-12 approach is not terminated, but implementation cannot proceed until a separately scoped feasibility analysis resolves or formally reframes the blocking boundary. No model is approved, and this decision does not select Option B or authorize Diagnostic v4, launcher v1.4, Smoke v5, or formal retry `0003`.

The next permissible action is to prepare a separately scoped, read-only feasibility-analysis proposal for the independent receipt trust boundary and bounded CIM completion boundary. This decision does not itself authorize that analysis to execute a probe, implement a receipt producer or isolated worker/provider, or change a criterion.

The owner decision is preserved at commit `e31036b003a59c4e27b0a2e7239bcd32aef6ba80`. This linkage identifies that decision only. It does not approve a boundary model, authorize implementation or execution, close the Alignment GAP, or change any canonical OE/SIR status.

## Change-control conditions

Any later detailed design must keep the full identity tuple and independent pre-probe receipt anchor; prevent the probe from creating or resealing its own ownership evidence; require fresh identity and membership verification immediately before a process-affecting action; and preserve tenant/security controls. It must separately prove provider-level quiescence or explicitly seek a criterion decision before using probe-boundary quiescence. No silent weakening is permitted.

The current contract permits only cooperative/natural exit, bounded observation, read-only verification, and deterministic disposal. Unknown-member termination, Job-wide destructive fallback, and other destructive cleanup remain prohibited. A design involving worker termination must identify its exact target, independent ownership proof, absence of collateral processes, and the specific change to the non-destructive contract before implementation can be considered.

STOP for separate change control if the chosen future model requires production/runtime modification, tenant/security weakening, criterion weakening, privilege elevation, Windows/CIM configuration or service changes, network access, dependency installation, or live/production data. None is authorized here. No canonical OE/SIR status changes are made by this proposal.
