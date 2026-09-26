# SIR-02 KM OE-13 Supplemental Evidence Instrumentation Authorization Record

## Document control

| Field | Value |
| --- | --- |
| Document/version | `SIR-02-KM-OE-13-SUPPLEMENTAL-EVIDENCE-INSTRUMENTATION-AUTHORIZATION` / `v1.0` |
| Status | **`Proposed / Not Authorized`** |
| Evidence item | `SIR02-KM-OE-13` |
| Proposed exact design | `SIR-02-KM-OE-13-SUPPLEMENTAL-EVIDENCE-INSTRUMENTATION-DESIGN-v1.0.md` |
| Immutable design commit/reference | `Owner Input Required` |
| Owner | GANTUMUR Erdenedalai — Founder / Administrator |
| Reviewer | SODBILEG Erkhembayar — Administrator |
| Decision date | `Owner Input Required` |
| Owner implementation decision | `Owner Input Required` |
| Owner decision statement | `Owner Input Required` |
| Owner acceptance of conditions | `Owner Input Required` |
| Exact authorized file list | `Owner approval required` |
| Immutable completed-authorization reference | `Owner Input Required` |

## Decision requested from owner

Approve, reject, or defer **only** the supplemental test-only instrumentation design v1.0 after reviewing its immutable committed form. If approving, explicitly confirm the exact files, narrow internal pair-mapping change, measurement boundary and probe requirements, synthetic data restriction, fail-closed behavior, independent implementation review, and separate authorization before supplemental execution. Record decision date, conditions, and immutable completed-decision reference. Approval cannot be inferred from the earlier OE-13 fixture authorization.

### Proposed files for owner decision — none authorized yet

1. **Modify** `tests/testing/sir02-km-oe13-duplicate-conflict-fixture.ts` only to expose the classifier's already-computed pair ID with its exact left/right references in the internal result. This is necessary because the current result flattens references and cannot unambiguously map multiple same-type pairs.
2. **Modify** `tests/integration/sir02-km-oe13-duplicate-conflict.test.ts` only to retain the approved scenarios' raw per-case values, exercise the observer, and produce a deterministic supplemental test report.
3. **Add** `tests/testing/sir02-km-oe13-live-operation-observer.ts` only for the bounded test-worker observation, explicit live-operation counters, synthetic blocked probes, and fail-safe restoration.

The owner may authorize a smaller proven set, but implementation must stop if the approved set cannot produce all required values. Any fourth code file, dependency, production instrumentation, runtime path, migration, configuration, or deployment change requires a new design and authorization before coding. Accepted OE-09/OE-11 implementations and tests, all original OE-13 formal artifacts, and the existing clarification review are not proposed for modification.

## Proposed authorization conditions

- Supplemental evidence is a **later, separately timed capture** of values missing from formal run `SIR02-KM-OE-13-V1_0-20260926T131738Z-0001`; it does not replace that run or assert retrospective measurements.
- Preserve formal evidence commit `a0bcdb4ef646b0322cca6e30ef1f8c3b282501c9`, linkage `49b3266a722ac9560f5f2a17ef56f54b7fb565b5`, clarification review `ca366ee8fd2814695051fa745c6f71236d9e1508`, and accepted implementation `00810eb46123d83d22723f7bcf98d195a4c6da87` as immutable lineage.
- Use synthetic data only in `sir02-km-evidence-v1` under `SIR02-KM-EVIDENCE-FIXTURE v1.0`; no production/customer/real tenant data or cross-tenant reuse.
- Retain actual per-case SHA-256 registry/inventory values, deterministic affected-pair IDs and left/right references, exact counts, quarantine holds, and explicit *measured* live-operation counter snapshots. Never infer or fabricate a missing value.
- The observer must count and block attempted live actions inside its stated boundary, self-test every category with synthetic blocked probes, fail if coverage is unavailable, and leave no live state. It must not itself enable network access or call a live service.
- Caller-visible Tenant B protected-field disclosure remains `0`; internal reference capture must not leak into caller output or unsanitized audit.
- No live ingestion, RAG, embedding, indexing, vector processing, retrieval, production storage, deployment, configuration mutation, credential or secret operation, or traffic is authorized.
- No production/runtime source file, database migration, dependency addition, existing OE-09/OE-11 implementation, or later-stage governance item may change.
- Implementation alone does not authorize supplemental execution. Independent implementation review and a separate controlled supplemental-execution decision are required. The later evidence needs independent review and reviewer attestation before OE-13 can be accepted.

## Current hold

**No implementation is authorized by this proposed record.** Do not write code, run a supplemental capture, rerun or overwrite formal run `0001`, accept OE-13, or authorize another OE item. OE-13 remains `Executed / Awaiting Independent Review`; the other evidence statuses remain unchanged; `SIR02-DEF-02` remains `Missing / Not Reviewed`; SIR-02 remains `Blocking`.
