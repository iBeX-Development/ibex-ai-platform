# Actual routing plus source admission: local integration candidate

2026-10-24. Test-only, disabled unless explicitly enabled in environment `test`. No production registration, provider, source registry, ingestion, baseline change or finding closure.

## Plan and implementation

This closes the composition gap between the accepted actual-Orchestrator binding and accepted exact-source admission helper. It follows `docs/baseline/03-agent-architecture-v1.0.md` lines 27-28, 76-95 and 151-154 (actual routing and RAG scope), `docs/baseline/06-rag-architecture-v1.0.md` lines 175-205 (trusted identity/scope), and the SIR-02 knowledge lifecycle control baseline (admission and immediate withdrawal eligibility). It takes priority over a separate synthetic reconciliation matrix because the two accepted guards previously had separate successful paths.

The harness calls actual `SharedAgentRuntime.route`, then binds its returned scope port into the actual `RagRuntimeService` constructed by `createAdmittedRetrieval`. The existing binding checks trace; admission checks context and source authority; actual RAG resolves the invocation-bound port before exact store access. No caller-authored routing scope is used. The harness has no production entry point or store write implementation.

One necessary type-only adjustment to `tests/testing/rag-routing-binding.ts`: callback return is now `Pick<RagRuntimeService, 'retrieve'>`, because the wrapper exposes only retrieval rather than the nominal service instance and its private fields. Runtime behavior is unchanged. The new harness adapts the service-shaped call to the admitted wrapper, rejecting execution options; the binding always supplies an empty execution object. No unsafe service cast, runtime method replacement, duplicated trace guard, or production service edit is needed. All four accepted source-admission files remain byte-identical. Previous routing helper hash: F01C419A1DD76C09E10EC794ACC346268B0DD4D9C16F649B03F366B744C83E3C.

## Acceptance evidence

12 tests: successful content retrieval with exact admitted identity/evidence and actual decision-derived scope; three disabled/default/non-test cases; no-RAG route before construction; four forged request cases (routing ID, trace, tenant context, caller scope); valid route without source approval; returned document substitution; withdrawal while exact read is pending plus denial of subsequent reuse of the same routing binding.

Pre-store denials assert zero store/embed/rank calls. Returned-document mismatch asserts one read and zero semantic calls. Withdrawal observes the entered read deterministically, cancellation before read completion, an aborted store signal, no semantic calls or canary content/approval ID in public error/audits, and no second read after reuse. The existing RAG cancellation contract is `TIMEOUT_ERROR` / `RAG request was cancelled`; it is not represented as an authorization error.

Validation on the final code: 12 focused PASS; 9-suite aggregate 376 PASS, 3 existing skips (379 total); scoped ESLint and TypeScript exit 0. Initial focused run had 11 PASS and one incorrect cancellation-code expectation; corrected after checking the existing service contract. Initial lint/type issues were confined to unused typed mock arguments, unnecessary defaults and exact optional-property handling in the new test; corrected without production changes. No full-repository build or release validation claimed.

Pinned executable: `C:\Users\gantu\Documents\Codex\2026-10-15\task\ibex-tooling\node\node-v22.23.3-win-x64\node.exe` (Node 22.23.3). Existing dependencies only.

Commands (invoke each with the pinned executable):

```text
node_modules/vitest/vitest.mjs run tests/integration/routed-source-admission.test.ts --config vitest.config.ts --configLoader runner --no-cache --pool=threads --experimental.fsModuleCache=false
node_modules/eslint/bin/eslint.js tests/testing/rag-routing-binding.ts tests/integration/routed-source-admission.test.ts --max-warnings 0
node_modules/typescript/bin/tsc -p tests/integration/routed-source-admission.tsconfig.json --noEmit
node_modules/vitest/vitest.mjs run tests/integration/routed-source-admission.test.ts tests/integration/source-admission.test.ts tests/integration/rag-routing-binding.test.ts tests/integration/f06-rag-authorization.test.ts tests/integration/f06-shared-knowledge.test.ts tests/phase8/scoped-factual-grounding.test.ts tests/phase8/asset-parent-read-simulation.test.ts tests/evaluation/findings-registry.test.ts tests/evaluation/phase10-assessment.test.ts --config vitest.config.ts --configLoader runner --no-cache --pool=threads --experimental.fsModuleCache=false
```

## Authority limits and remaining work

Synthetic fixtures supply context, grants, classification, plans, owner verification and approval references. They do not authenticate human approvers or establish distributed authority, real lifecycle records, operational service access or live readiness. Production remains disabled. F01-F12 remain unreviewed with unknown severity; registry revision, evidence and baseline remain unchanged.

Following review of this composition, a concrete remaining local contract step is tenant-partitioned inventory reconciliation under SIR02-KM-OE-09 (execution plan lines 236-250): detect orphan, duplicate, missing, stale, superseded, withdrawn, cross-tenant and checksum discrepancies, plus a clean control; block unresolved cases, preserve counts and avoid foreign content disclosure or silent repair. This would be synthetic contract evidence, not an official operational acceptance run. Real ownership/human authority, approved inventories, service adapters and operational receipts remain external dependencies before live execution.

## Safe package boundary

The index was empty at entry. Do not stage all dirty files. Package accepted work with explicit path allowlists and dependency ordering: scoped-factual-grounding package (including ingress) first; then independent asset-parent and F06 packages; routing and source-admission packages depend on ingress; this composition depends on both routing and admission. The routing helper type adjustment belongs with this integration increment. The five operational organization-identity files form a separate change; origin configuration is not a Git commit artifact. Inspect the registry hunk instead of treating any preexisting dirty file as wholly owned by this increment.

Exclude all unrelated historical dirty work, including CI, model-gateway, governance registers, runtime evidence and asset-chain work. Preserve historical evidence URLs and findings. Current working-tree aggregate validation does not prove a staged-only package is self-contained: validate the eventual explicit candidate snapshot before committing or publishing it. This turn stages, commits and pushes nothing. Baseline branch/HEAD and all 43 refs are preserved; the 39 original status entries remain, with three new integration files added.
