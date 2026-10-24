# OE-09 synthetic inventory contract candidate

2026-10-24. Disabled by default; requires explicit `enabled: true` and `environment: test`. Four new test-only files. No existing files, production adapters, baseline, governance status or findings are changed.

## Existing implementation and plan reconciliation

Read-only searches of tracked packages/tests and current untracked test helpers found no source-inventory reconciliation implementation. Existing reconciliation references concern model-budget accounting and approval recovery, which are different contracts. This increment therefore adds one pure local validator, reusing the existing exact admission identity, synthetic admission schema and guarded snapshot implementation rather than duplicating those rules.

`docs/governance/sir-02/controls/SIR-02-KM-OPERATIONAL-EVIDENCE-EXECUTION-PLAN-v1.0.md`, OE-09 lines 236-250, expressly calls for deterministic authoritative/derived inventory comparison, eight synthetic discrepancy categories, clean control, tenant isolation and exact counts. The knowledge lifecycle control baseline sections 6-10 require withdrawal/staleness exclusion, reconciliation, duplicate/conflict quarantine and no silent precedence. This is preparatory local contract evidence. OE-09 remains Not Executed; OE-01 and OE-04 prerequisites are not established by these fixtures.

## Scope and semantics

Test-owned configuration selects one tenant. Inventory data cannot choose or override it. Strict, bounded snapshots reject accessors, extra fields and malformed schemas without evaluating getters. Source projections reuse the synthetic admission record. Expected artifacts explicitly declare IDs and kinds; derived projections bind exact source/version/document/version/checksum representation and document checksum. Checksums are lineage references, not computed hashes of actual artifact contents.

Seven artifact kinds are supported: document, chunk, embedding, index, vector, cache and retrieval-preparation. An expected manifest must be nonempty, but the validator cannot prove its real-world completeness. No artifact requirement is inferred from a source alone. A supplied source/derived state can exercise stale, superseded or withdrawn behavior; no real review-date, ownership revocation or lifecycle service is consulted.

All discrepancies deny eligibility and return synthetic disposition `quarantined`. This is an immutable report decision, not a persisted quarantine or an independently authorized retrieval enforcement point. The test's local consumer is called only on an allowed report. No production or admitted retrieval path consumes the report in this increment. No resolution, repair, deletion, reactivation or write API exists.

Duplicate source keys or expected artifact IDs are ambiguous and cannot contribute matched artifacts. Conflicting admission records are separately flagged; no first-record precedence can make them eligible. Missing counts mean declared artifacts without an unambiguous active exact match, so withdrawn/mismatched artifacts can also produce a missing discrepancy. Counts include supplied source rows, declared expected rows, supplied derived rows and unique exact active matches; the overall report may remain quarantined despite some matches.

Source ownership consistency is checked separately from document matching, using tenant/source ID/source version. Different documents or document versions cannot hide contradictory owners for that source/version. Every mapping in such a conflicting group is excluded from matched counts. Consistent-owner multi-document mappings and genuinely distinct sources remain valid under this synthetic contract. Per-document approval/lineage references remain document-specific; the fix does not invent a source-global approval rule.

Foreign tenant records reject the entire partition with zero reported counts and no input hash; foreign identifiers/content never appear. Valid foreign inventories with different IDs, content references or sizes produce the same opaque denial for the configured tenant. Malformed inputs receive a generic invalid-inventory denial. Separately configured tenant runs share no state.

Same-tenant input and report SHA-256 hashes provide reproducible local references, not signatures, authenticated authority or immutable operational receipts. Canonical schema order and sorted inventory rows remove input order dependence while retaining duplicate multiplicity. Reports contain category codes and counts, not source content or ownership/approval evidence IDs. There is no detailed operational resolution log or audit sink.

## Validation

28 cases cover clean counts and guarded consumer, all eight required discrepancy categories, kind conflicts, absent synthetic approval, duplicate sources, changed versions, conflicting ownership without precedence, inactive derived artifacts under active source approval, all seven artifact kinds with a missing declaration, opaque foreign denial, mixed-partition denial and independent tenant runs, order-invariant reports, changed input hashes, invalid inventories, accessor rejection and disabled/non-test execution.

Initial 23-test focused run passed with scoped lint/type exit 0. Coverage was extended to 28 tests; code inspection then removed first-record matching for ambiguous declarations. Final ten-suite aggregate: 404 PASS, 3 existing skips (407 total), including all 28 new cases; scoped ESLint and TypeScript exit 0. Existing composition and source-admission candidates remain frozen. No full repository build or release acceptance is claimed.

Use pinned Node 22.23.3 at `C:\Users\gantu\Documents\Codex\2026-10-15\task\ibex-tooling\node\node-v22.23.3-win-x64\node.exe` with existing dependencies:

```text
node_modules/vitest/vitest.mjs run tests/integration/source-reconciliation.test.ts --config vitest.config.ts --configLoader runner --no-cache --pool=threads --experimental.fsModuleCache=false
node_modules/eslint/bin/eslint.js tests/testing/source-reconciliation.ts tests/integration/source-reconciliation.test.ts --max-warnings 0
node_modules/typescript/bin/tsc -p tests/integration/source-reconciliation.tsconfig.json --noEmit
```

Related aggregate: the new suite plus routed-source-admission, source-admission, rag-routing-binding, f06-rag-authorization, f06-shared-knowledge, scoped-factual-grounding, asset-parent-read-simulation, findings-registry and phase10-assessment, using the same Vitest flags.

## Minimum real inputs and next boundary

Official execution needs accepted OE-01 source registration and OE-04 lineage evidence, a server-authenticated tenant/authorization context, isolated approved authoritative/lifecycle and all derived inventories bound to a consistent run, independently authorized resolution records, and immutable run/audit receipts with exact before/after counts. These must come from the responsible owners/services; synthetic booleans and reference strings cannot supply them. No official acceptance or finding closure follows from this candidate.

After independent review, the next local integration decision is how an actual adapter will supply a consistent inventory snapshot and enforce the reconciliation denial before source use. This can be tested with an explicitly synthetic adapter while those real inputs remain unavailable; it must not convert a caller-supplied report or digest into authority.

Package these four paths explicitly after the accepted ingress/source-admission dependencies. Exclude historical dirty files. This turn does not stage, commit or push. The existing 42 entries and 43 refs must remain unchanged, with four added entries only.

## Independent P2 review correction

The first 28-case/404-pass candidate missed ownership contradictions across different document identities: its duplicate key included document ID/version. Independent review reproduced two records for one tenant/source/version with different owners incorrectly receiving an allowed result. Existing lifecycle baseline section 10 requires quarantine; the baseline itself is unchanged.

The correction adds an independent source-level ownership pass and excludes all conflicting-source mappings from matching. Five new cases cover cross-document-ID and cross-document-version contradictions, reversed input order, consistent-owner positive controls for both mappings, and distinct-source/different-owner positive control. Inputs are unchanged, contradictory groups have matched count zero, and the guarded local consumer is not called. Final validation: 33 focused PASS; ten-suite related aggregate 409 PASS, 3 existing skips (412 total); scoped lint and type checks exit 0. Only this helper, its test and these notes change; the tsconfig and every previously accepted candidate stay byte-identical.
