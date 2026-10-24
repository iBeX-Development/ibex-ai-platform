# F06 shared restricted knowledge — local regression candidate

Ready for independent review. This is not an official OE-10 execution, F06 finding closure, new policy, publication authority or live integration approval.

## Existing coverage reconciled

Requirement: docs/baseline/06-rag-architecture-v1.0.md:890, Data Leakage Tests, explicitly lists Tenant A to global restricted content and unauthorized role to restricted document.

Existing tests inspected and preserved:

- tests/tenant/rag-runtime-isolation.test.ts:108 has a global_approved/internal positive and wrong-domain empty response; it lacks the restricted classification, six independent dimensions, malicious-store matrix and complete disclosure/call observations.
- tests/contract/rag-runtime-contract.test.ts:57 rejects tenant identity on shared metadata; this is schema evidence, not retrieval authorization.
- tests/integration/rag-runtime.test.ts:500 changes tenant scope without matching integrity evidence; this is tamper rejection, not valid domain-restricted candidate authorization.
- The accepted f06-rag-authorization package covers private candidate dimensions and pre-store authorization. Its files remain unchanged. Parent reports independent acceptance with 32 PASS and lint/type exit 0; that suite was not rerun for this package.

## Added evidence

Only three new files: f06-shared-knowledge.test.ts, f06-shared-knowledge.tsconfig.json and these notes under tests/integration.

26 cases: for each of global_approved and domain_approved, six compliant-store negatives, six malicious-store negatives and one authorized Tenant A positive control.

Non-private document fixtures are authored with tenant_scope set from creation, no tenant_id, classification restricted, explicit synthetic owner/source/document/content canaries, and explicit access metadata. They are ingested with existing deterministic fixture helpers; they are not private indexed chunks relabeled shared. The allow decision used by those fixture helpers is not authoritative publication or access-policy evidence.

The six denied dimensions are document permission, document entitlement, role, allowed agent, domain, and knowledge scope. Only access metadata changes per case. These fields do not alter the runtime's content/chunk/citation integrity hashes, and malicious returns must reach TENANT_SCOPE_VIOLATION rather than integrity INVALID_RESPONSE.

| Stage                                                                | Expected calls (store / embedding / ranker / upsert) | Outcome                                                                                                                            |
| -------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Compliant deterministic store filtering, each denied dimension       | 1 / 0 / 0 / 0                                        | Complete empty success response; no restricted canaries in complete response or audits                                             |
| Malicious store returns valid inaccessible candidate, each dimension | 1 / 0 / 0 / 0                                        | Exact public 403 TENANT_SCOPE_VIOLATION envelope; no restricted canaries in public error or audits; rejected/security_filter audit |
| Authorized shared restricted control, both scopes                    | 1 / 1 / 1 / 0                                        | Exactly one result, exact candidate passed to ranker, trusted tenant/role/grants/agent/domain/scope filter checked                 |

All observers are spies around existing deterministic delegates. No zero-store assertion is claimed for candidate filtering. Zero pre-store dependencies remain the separate accepted authorization package's evidence. Both complete public error envelopes and serialized audit arrays are tested. Negative canaries include content, document ID, title, source URI, owner, chunk ID, content hash and citation evidence hash. Authorized controls intentionally return authorized content; raw content and owner remain absent from audits, and owner is absent from public response.

Runtime mapping: packages/rag-runtime/src/service.ts:653 authorization; :663 scope resolution; :708 trusted filter construction; :745 store invocation; :749 schema and subsequent integrity validation; :769 candidate security validation. packages/rag-runtime/src/access.ts:14 allows non-private scope through tenant partition check but still applies domain (:22), agent (:23), knowledge-scope overlap (:24), permission (:25), entitlement (:26) and role (:27–28) filters. Shared status is not a bypass for those checks.

No new meaning is assigned to classification restricted: this package tests existing access metadata enforcement. It does not establish an additional classification policy. Synthetic grant strings are negative test inputs, not policy/ownership authorities. The compliant deterministic store uses the production predicate; it is not independently implemented production vector-store evidence. Malicious candidate inputs are independently authored and exercise runtime post-store defense directly.

## Validation

Pinned direct Node 22.23.3; runner reported Vitest 4.1.11. Existing dependencies, threads, no persistent FS module cache. First and only execution: 26 PASS, zero skipped; test/lint/type each exit 0. No ordinary correction cycles were needed.

```powershell
& 'C:\Users\gantu\Documents\Codex\2026-10-15\task\ibex-tooling\node\node-v22.23.3-win-x64\node.exe' node_modules/vitest/vitest.mjs run tests/integration/f06-shared-knowledge.test.ts --config vitest.config.ts --configLoader runner --no-cache --pool=threads --experimental.fsModuleCache=false --reporter verbose
& 'C:\Users\gantu\Documents\Codex\2026-10-15\task\ibex-tooling\node\node-v22.23.3-win-x64\node.exe' node_modules/eslint/bin/eslint.js tests/integration/f06-shared-knowledge.test.ts --max-warnings 0
& 'C:\Users\gantu\Documents\Codex\2026-10-15\task\ibex-tooling\node\node-v22.23.3-win-x64\node.exe' node_modules/typescript/bin/tsc -p tests/integration/f06-shared-knowledge.tsconfig.json --noEmit
```

SHA-256:

- tests/integration/f06-shared-knowledge.test.ts: 74C167FC24855B5C1A4A95603F09A07001930E4E7028E32B85B198D8F88F7CF1
- tests/integration/f06-shared-knowledge.tsconfig.json: C46720DFE2E56D29CD4DE3BA3CD2960E9184EBAB8D35E2CE0716D9607D189FFB

## Preservation and remaining gaps

Initial inventory: 24 dirty/new entries and 43 refs; hashes matched the accepted prior candidate inventory. New paths were absent. Branch codex/local-model-typing-recovery, HEAD 028934845591b3e569a1c5d639f81df7c72ca8ac. This task is the sole intended writer; no delegation or additional writer was started. Final inventory/hash/ref comparison is returned with the completion message.

All prior files, production code, architecture, baselines, governance evidence, manifests and lockfiles are preserved. No installs, live access, credentials, permission changes or Git mutations.

Remaining: independent review of this package; actual authoritative shared publishing/ownership and role/agent/domain/scope policies; production store/filter adapter and identity enforcement; deployment non-disclosure and timing evidence. These local canary checks are not exhaustive noninterference, a production release decision, or official immutable OE-10 evidence. Existing cache-isolation and other broader baseline requirements are not claimed covered by this finite package.
