# Invocation-scoped Orchestrator to RAG binding — test-only candidate

Ready for independent review. No production RAG activation, ToolDispatcher change, decision cache, TTL, authority backend or new authorization policy.

## Contract reconciliation

Approved architecture references: docs/baseline/03-agent-architecture-v1.0.md:27–28 (Intent -> Domain -> Agent -> Tool/RAG), :76–95 (Orchestrator capability routing, permission and RAG/tool selection), :151–154 (capability manifest, RAG scope, permission requirements); docs/baseline/06-rag-architecture-v1.0.md:175–205 (trusted identity and scope).

Actual implementation authority exercised:
- packages/runtime/src/orchestrator.ts:296 calls AgentRegistry.authorize; registry.ts:81 checks agent permissions/entitlements and classifier-required capabilities.
- Orchestrator :329 verifies planned RAG scopes are a subset of selected agent scopes, and denies required RAG when disabled; :377 constructs the actual routing decision.
- runtime/src/contracts.ts:173 defines decision fields. Decision carries agent/version/domain/scopes, required capabilities, request/correlation and trace, but no routing decision ID, tenant or user.
- rag-runtime/src/ports.ts:18 resolves scope using context and routing ID; its signature has no trace parameter.
- rag-runtime/src/service.ts:653 still performs its own authorization, :663 resolves this port, :693 verifies context binding and :745 accesses store.

## Composition

New helper calls the actual SharedAgentRuntime.route; it does not accept a caller-authored decision. Original trusted context and input are captured before awaiting routing. Agent ID/version/domain/scopes come solely from the successful actual decision. Non-routed fallback, disabled route failures and no-RAG/empty-scope decisions do not create a retriever.

A random opaque ID is generated for this invocation because the authoritative decision contract has no ID. This is a local correlation binding, not an authorization source, persistent store, decision cache or TTL. IDs from another invocation are denied even with otherwise identical context.

The immutable port compares all trusted-context fields using canonical schema output: tenant, user, request, correlation, role, permissions, entitlements, session, channel and locale. Array order is preserved; equivalent reordered grants are not normalized into equivalence. Changed grants retaining every required value still fail binding. Resolving caller input never selects agent/domain/scope.

Trace is captured from the routing request, checked against the actual result and enforced at the composition retrieval wrapper. The port alone cannot verify trace because its authoritative signature lacks it; this proof requires the complete test composition wrapper. Required capabilities remain in the frozen actual decision and are checked by the actual registry during routing; the RAG scope contract has no capability field, and none is invented. Caller-added capability or scope fields are rejected by strict RAG request validation.

The test-owned buildRetriever callback wires the fixed port into an actual RagRuntimeService. That callback is trusted harness wiring, not caller business input. Production dependency wiring is not established here. Existing guarded snapshot helpers are reused unchanged with synthetic-only limits (16384 bytes, depth 16).

Returned binding, scope, scope arrays, actual capabilities and resolved scopes reject mutation attempts before any data dependency calls. The helper is invocation-scoped, not single-use: repeated same-context retrieval is possible while its closure remains alive; expiry/replay policy is outside this package.

## Evidence inventory

24 tests:
- 1 successful actual Orchestrator -> bound port -> RAG retrieval, exact decision-derived scope and store/embed/ranker observations.
- 8 changed scalar context fields.
- 2 changed grant arrays with required grants retained.
- 5 caller widening fields: agent ID/version, domain, knowledge scopes, required capabilities.
- 1 unknown and cross-invocation ID case.
- 1 changed trace case.
- 1 immutable binding/scope/capability/resolved-scope mutation case.
- 5 route failures: disabled RAG, disabled agent/no matching agent, unknown-intent fallback, no RAG plan and unregistered required capability.

Every negative checks zero store/embed/rank/upsert calls. Disabled/fallback/capability failures also check no retriever construction. Mutation attempts are rejected by frozen objects; they are not represented as policy denial results. Positive case checks one store, embedding and ranker call, zero upserts, and an actual retrieved result.

Synthetic existing runtime registry/classifier/prompt/RAG planners and authorization fixtures remain test inputs. No production policy/ownership authority or real provider call is asserted. The positive context combines existing fixture grants needed for both routing and retrieval; it is explicitly synthetic.

## Validation

First run: 24 PASS, zero skipped. Scoped lint and typecheck exit 0. No correction cycles needed. Direct Node 22.23.3, Vitest 4.1.11 with authorized threads/cache-safe flags. Existing dependencies only.

```powershell
& 'C:\Users\gantu\Documents\Codex\2026-10-15\task\ibex-tooling\node\node-v22.23.3-win-x64\node.exe' node_modules/vitest/vitest.mjs run tests/integration/rag-routing-binding.test.ts --config vitest.config.ts --configLoader runner --no-cache --pool=threads --experimental.fsModuleCache=false --reporter verbose
& 'C:\Users\gantu\Documents\Codex\2026-10-15\task\ibex-tooling\node\node-v22.23.3-win-x64\node.exe' node_modules/eslint/bin/eslint.js tests/testing/rag-routing-binding.ts tests/integration/rag-routing-binding.test.ts --max-warnings 0
& 'C:\Users\gantu\Documents\Codex\2026-10-15\task\ibex-tooling\node\node-v22.23.3-win-x64\node.exe' node_modules/typescript/bin/tsc -p tests/integration/rag-routing-binding.tsconfig.json --noEmit
```

SHA-256:
- tests/testing/rag-routing-binding.ts: F01C419A1DD76C09E10EC794ACC346268B0DD4D9C16F649B03F366B744C83E3C
- tests/integration/rag-routing-binding.test.ts: 9BFD0B06236C0FDBABC307CD814B2E10BEC05F809DF66A4839B6EB186230699F
- tests/integration/rag-routing-binding.tsconfig.json: AB4E91164AD8D715376A9658E4BAB4D899D656CD4939BECFEEFADFE8C4C4108E

## Preservation and limits

Initial 27 dirty/new entries and 43 refs captured. Branch codex/local-model-typing-recovery; HEAD 028934845591b3e569a1c5d639f81df7c72ca8ac. Four isolated additions only, including these notes. Existing accepted files, production packages/apps, ToolDispatcher, governance and baselines remain untouched. Final hash/status/ref comparison accompanies the completion message.

No cache, TTL, installs, network/live calls, permissions changes, commits or Git mutations. Independent review pending. This proves local routing binding only; ownership admission, authoritative production wiring, strict OE-10 all-dimensions zero-store requirement and production activation remain open. No finding closure or official OE-10 run.

