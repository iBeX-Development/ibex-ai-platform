# SIR-02 KM OE-13 Supplemental Evidence Instrumentation Authorization Record

## Document control

| Field | Value |
| --- | --- |
| Document/version | `SIR-02-KM-OE-13-SUPPLEMENTAL-EVIDENCE-INSTRUMENTATION-AUTHORIZATION` / `v1.0` |
| Status | **`Authorized for Test-Only Supplemental Instrumentation`** |
| Evidence item | `SIR02-KM-OE-13` |
| Exact design authorized | `SIR-02-KM-OE-13-SUPPLEMENTAL-EVIDENCE-INSTRUMENTATION-DESIGN-v1.0.md` |
| Immutable design commit/reference | `927ef22169cebf33cceec852eb4911364e9f4f44` |
| Owner | GANTUMUR Erdenedalai — Founder / Administrator |
| Reviewer | SODBILEG Erkhembayar — Administrator |
| Decision date | `2026-09-26` |
| Owner implementation decision | `Authorized for Test-Only Supplemental Instrumentation` |
| Owner decision statement | Exact owner-supplied statement below |
| Owner acceptance of conditions | Exact scope and conditions below |
| Exact authorized file list | The three test-only files below, and no others |
| Immutable completed-authorization reference | `70b636fd0f59df0b4bbf1d079463452255f050e6` |

## Formal owner decision

> The OE-13 Supplemental Evidence Instrumentation Design v1.0 is approved for implementation strictly as isolated test-only instrumentation required to close the evidence-sufficiency findings for the existing formal OE-13 run.

This decision authorizes the exact design at commit `927ef22169cebf33cceec852eb4911364e9f4f44` and **only** the three files below. It authorizes implementation, not supplemental execution or OE-13 acceptance.

### Exact authorized implementation files

1. **Modify** `tests/integration/sir02-km-oe13-duplicate-conflict.test.ts` only to retain the approved scenarios' raw per-case values, exercise the observer, and produce a deterministic supplemental test report.
2. **Narrowly modify** `tests/testing/sir02-km-oe13-duplicate-conflict-fixture.ts` only to expose/retain already computed deterministic left/right affected-pair mapping and raw per-case registry/artifact-inventory evidence needed by the supplemental capture. Classification, authority, caller-visible denial, quarantine, and cleanup behavior must remain unchanged.
3. **Add** `tests/testing/sir02-km-oe13-live-operation-observer.ts` only for the bounded test-worker observation, explicit live-operation counters, synthetic blocked probes, and fail-safe restoration.

No other file is authorized. If this set cannot produce all required values, implementation must stop and obtain a new design/authorization decision before any additional change. Accepted OE-09/OE-11 implementations and tests, all original OE-13 formal artifacts, and the existing clarification review remain unchanged.

## Approved implementation conditions

- Supplemental evidence is a **later, separately timed capture** of values missing from formal run `SIR02-KM-OE-13-V1_0-20260926T131738Z-0001`; it does not replace that run or assert retrospective measurements.
- Preserve formal evidence commit `a0bcdb4ef646b0322cca6e30ef1f8c3b282501c9`, linkage `49b3266a722ac9560f5f2a17ef56f54b7fb565b5`, clarification review `ca366ee8fd2814695051fa745c6f71236d9e1508`, and accepted implementation `00810eb46123d83d22723f7bcf98d195a4c6da87` as immutable lineage.
- Use synthetic data only in `sir02-km-evidence-v1` under `SIR02-KM-EVIDENCE-FIXTURE v1.0`; no production/customer/real tenant data or cross-tenant reuse.
- Retain actual per-case SHA-256 registry/inventory values, deterministic affected-pair IDs and left/right references, exact counts, quarantine holds, and explicit *measured* live-operation counter snapshots. Never infer or fabricate a missing value.
- The measurement boundary is **each bracketed OE-13 scenario invocation in the isolated test worker**. Counter state begins clean for each scenario, is captured before cleanup, and cleanup then resets all observer state.
- The observer must have an explicit counter for live ingestion; live parsing/chunking; live embeddings; live indexing; live vector-store write/population; live retrieval/retrieval preparation; live production storage; deployment actions; configuration mutations; credential operations; secret operations; and traffic/network actions. The expected measured count for each is `0`.
- The observer must count and block attempted live actions inside its stated boundary, self-test every category with synthetic blocked probes, fail closed if coverage is unavailable, and leave no live state. It must not itself enable network access or call a live service.
- Caller-visible Tenant B protected-field disclosure remains `0`; internal reference capture must not leak into caller output or unsanitized audit.
- No live ingestion, RAG, embedding, indexing, vector processing, retrieval, production storage, deployment, configuration mutation, credential or secret operation, or traffic is authorized.
- No production/runtime source file, database migration, dependency addition, existing OE-09/OE-11 implementation, or later-stage governance item may change.
- Implementation alone does not authorize supplemental execution. Independent implementation review and reviewer attestation for the exact implementation commit are required. Supplemental execution is authorized only after that review is `Accepted` and a separate controlled supplemental-execution decision is recorded. The later evidence needs separate independent review. Final OE-13 clarification review may reopen only after supplemental evidence is accepted and the original formal-run reviewer attestation exists.

## Current execution and status hold

This decision records **implementation authorization only**. No code is written and no supplemental capture is executed in this authorization step. Do not rerun, replace, rewrite, or relabel formal run `0001`; its evidence and linkage commits remain authoritative and immutable. The clarification review stays open. OE-13 remains `Executed / Awaiting Independent Review`; the other evidence statuses remain unchanged; `SIR02-DEF-02` remains `Missing / Not Reviewed`; SIR-02 remains `Blocking`.
