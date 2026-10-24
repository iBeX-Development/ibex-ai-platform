# F06 local RAG authorization regression candidate

Status: ready for independent review, not reviewed/accepted yet. This is ordinary local regression development, not an official SIR02-KM-OE-10 evidence run, F06 closure, or governance evidence update. No production logic, live integrations, authority allowlists, manifests, lockfiles, branches or commits changed.

## Scope and preservation

Workspace C:\Users\gantu\Documents\Codex\2026-10-15\task\ibex-local-recovery; repository identity gt7719/ibex-ai-platform previously established and unchanged branch/root checked for this package. Branch codex/local-model-typing-recovery; HEAD 028934845591b3e569a1c5d639f81df7c72ca8ac; 43 refs. Initial 21 dirty/new files matched the prior 20-entry notes inventory plus notes SHA-256 8F767AA7CC3AE7F412D316410FB0D89125D64A2E6AA35B243BB845CEEC6915BB.

No Git index lock or additional overlapping writer was observed. App inventory showed the current delegated recovery task active, prior semantic reviewer idle and the separate Core workspace active; it is not an exhaustive OS writer lock. New filenames were absent before creation. Before/after hash and ref inventories provide bounded preservation evidence; final result is reported with this candidate.

Only new files:

- tests/integration/f06-rag-authorization.test.ts
- tests/integration/f06-rag-authorization.tsconfig.json
- tests/integration/f06-rag-authorization-notes.md

## Requirement and stage mapping

Authority references remain unchanged:

- docs/baseline/06-rag-architecture-v1.0.md:175 (trusted tenant context), :198 (retrieval scopes), :438 (filter sequence), :483 (retrieval flow), :353 (ingestion tenant ownership verification).
- docs/baseline/02-tenant-security-contract-v1.0.md:394 (resource ownership validation).
- docs/governance/sir-02/controls/SIR-02-KM-OPERATIONAL-EVIDENCE-EXECUTION-PLAN-v1.0.md:253, especially :257–264, names tenant, permission, entitlement, role, ownership, agent, domain and scope and expects authorization negatives before store/ranker access. This package does not certify that stronger requirement.

Runtime locations: packages/rag-runtime/src/service.ts (service), packages/rag-runtime/src/access.ts (predicate), packages/security/src/authorization.ts (authorization); test locations below refer to the new test file.

| Dimension       | Actual runtime stage/check                                                                                                                                                                                                            | Evidence and remaining gap                                                                                                                                                                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenant          | service:626 parses trusted context; :693 compares resolved tenant/user/request/correlation/routing identity before store; :708 constructs filter; predicate:14 checks private chunk tenant; service:769 repeats predicate after store | New :75 five conflicting scope bindings, :92 caller override; :114 and :126 tenant candidate cases; :152 mixed store. Context authenticity is upstream authority, not established by shape parsing.                                                                                                 |
| Permission      | service:653 invokes authorization; authorization:48 checks required retrieval permissions before policy; predicate:25 checks document permissions                                                                                     | New :59 missing retrieval permission has zero store/embed/rank/upsert calls; :114/:126 document-permission negatives have one store call, zero embed/rank. Document metadata checks are not pre-store proof.                                                                                        |
| Entitlement     | authorization:49 and predicate:26, same stage distinction                                                                                                                                                                             | New :59 missing retrieval entitlement; :114/:126 document entitlement. Authoritative policy source remains outside this fixture.                                                                                                                                                                    |
| Role            | trusted context requires nonempty role; passed to server policy and filter; predicate:27–28 enforces document allowed_roles                                                                                                           | New :114/:126 role negatives prove filtering/post-store rejection before semantic work, not role-specific pre-store policy. No approved role authority is invented.                                                                                                                                 |
| Ownership       | service:361 calls ingestion governance, :382 tenant binding; source_owner is required provenance in contracts.ts and stored at service:460                                                                                            | Existing rag-runtime.test.ts:29, :114, :147 verify provenance/required fields, :207 governance denial. Retrieval does not compare source_owner with trusted ownership authority. Explicit gap: authoritative ownership semantics and evidence; generic server policy denial is not ownership proof. |
| Agent           | resolved approved scope from port at service:663; filter at :708; predicate:23                                                                                                                                                        | New :92 rejects caller override; :114/:126 candidate agent mismatch. Scope port contract requires rejecting stale/foreign/widened scope, but fixture is not proof of actual resolver policy.                                                                                                        |
| Domain          | same scope port/filter; predicate:22                                                                                                                                                                                                  | New :92 override; :114/:126 domain mismatch. Actual approved domain selection authority remains an external evidence gap.                                                                                                                                                                           |
| Knowledge scope | same scope port/filter; predicate:24 uses any overlap                                                                                                                                                                                 | New :92 override; :114/:126 disjoint scope. Existing semantics are overlap, not an invented all-scopes requirement; multiple-scope policy authority is not established here.                                                                                                                        |

Pre-store authorization: service:653; resolved-scope checks :663–701; strict request contract contracts.ts:267. Store filtering: service:745 invokes the port with complete filter. Post-store validation: service:749 parses, :755 checks integrity, :769 checks security predicate; post-ranking repeat at :851. Do not relabel candidate post-store rejection as zero-store proof.

Existing tests inspected, not rerun here: tests/integration/rag-runtime.test.ts:254 filter/citation positive, :322 server deny, :339 scope missing/conflict, :378 revoked filtering, :412 empty retrieval, :555 forged cross-tenant candidate, :628 sanitized invalid boundary. The new tests add full store/embed/ranker/upsert observations, per-dimension negatives, complete response/public-error/audit serialization checks and independent malicious candidate inputs.

## Test inventory and proof limits

32 cases:

- 16 pre-store: 2 missing retrieval grants, 3 server-policy denial/failure/malformed decisions, 5 resolved identity mismatches, 2 scope denial/failure, 4 caller overrides.
- 7 compliant-store candidate filtering cases: tenant, document permission, document entitlement, role, agent, domain, knowledge scope.
- 7 malicious-store candidate post-validation cases for the same dimensions, with valid recomputed integrity.
- 1 authorized positive control and 1 mixed authorized/foreign-store control.

Tests use existing synthetic fixtures and deterministic embedding/ranker delegates with independent spies. Metadata mutations are authored in the test. Hash helpers maintain valid integrity so the expected scope error must come from authorization filtering, not tamper detection. The deterministic store uses the production predicate, so compliant-store tests are not an independently implemented vector-store proof. Malicious-store tests override its returned candidates and exercise runtime post-validation directly.

Negative pre-store cases observe zero store, embedding, ranking and upsert calls. Candidate negatives intentionally observe one store call and zero embedding/ranking/upsert. Positive control proves observers execute. Mixed control inspects complete ranker candidates, response and audits. Complete serialized public errors (toErrorEnvelope) and audit arrays are scanned for restricted content/document/title/source/owner/chunk/citation markers and policy exception marker. This is canary-based non-disclosure evidence, not exhaustive noninterference or timing equivalence. No live HTTP error serialization or external audit sink is exercised.

No concrete ownership authority or production role/agent/domain/scope policy is introduced. Missing immutable official-run evidence, actual resolver authorization, actual store isolation, broader pre-store ownership/role semantics and deployment integration remain explicit gaps. The fixture's declared context is not an authentication proof. No findings or governance status changed.

## Execution

Verified executable path uses Node 22.23.3; test runner reported Vitest 4.1.11. Existing dependencies only; no pnpm/install/network/escalation/temp redirection.

Initial run: 9 passed, 23 failed because the new test incorrectly expected audit outcome failed rather than the runtime's documented rejected classification (service:1054); lint found three unbound fixture methods; typecheck exit 0. One ordinary correction cycle changed the expected outcome to rejected and bound methods. No production changes or weakened call/disclosure assertions.

Final result: 32 passed, zero skipped; focused test, scoped lint and scoped typecheck all exit 0.

```powershell
& 'C:\Users\gantu\Documents\Codex\2026-10-15\task\ibex-tooling\node\node-v22.23.3-win-x64\node.exe' node_modules/vitest/vitest.mjs run tests/integration/f06-rag-authorization.test.ts --config vitest.config.ts --configLoader runner --no-cache --pool=threads --experimental.fsModuleCache=false --reporter verbose
& 'C:\Users\gantu\Documents\Codex\2026-10-15\task\ibex-tooling\node\node-v22.23.3-win-x64\node.exe' node_modules/eslint/bin/eslint.js tests/integration/f06-rag-authorization.test.ts --max-warnings 0
& 'C:\Users\gantu\Documents\Codex\2026-10-15\task\ibex-tooling\node\node-v22.23.3-win-x64\node.exe' node_modules/typescript/bin/tsc -p tests/integration/f06-rag-authorization.tsconfig.json --noEmit
```

Final code SHA-256:

- test: 2006D65832EB832EC905E383B02406B35CC067F63915C1017872B8FFBCA2BBFF
- tsconfig: 5005D86EDF6A6C791A10646E184DA16193314D2D06BEA0E145E96EC25FB380B5

## Preserved pre-existing inventory

```text
.github/workflows/ci.yml
2D2DBD7D4C126E1450D316324C45F19F415360A7F31328CA447C969293892742

docs/evaluation/findings/registry.v1.json
C1B4044E724460A450BD4F8EF867A2C3F99A843861BAE5D8385EE10749829FC2

docs/governance/sir-02/controls/SIR-02-KM-OPERATIONAL-EVIDENCE-ACCEPTANCE-MATRIX-v1.0.md
2F4EF5598D62C5131324A6F52067364E274CBD180B01B69915804FF6105ED15E

docs/governance/sir-02/SIR-02-EVIDENCE-COLLECTION-REGISTER-v1.0.md
A1C04647A705A1430FCD0C4740C64D901EC24180F331FDC84A6D3D656869B307

docs/governance/sir-02/SIR-02-EVIDENCE-DISPATCH-TRACKER-v1.0.md
BB5A551EE4E3B20BF705EC040931D01BD17A238F77025605B4072508BA2BDA4F

docs/integration/proposals/asset-component-chain-notes.md
957D26F559326CB0F7CAC543C3ED4E31A4ACFECD869AB760835AFB94D0471912

packages/model-gateway/src/service.ts
8315F351BC5BE7D763C19AA071C748C1C72BFC767F5936337087A964BDDEF0E6

tests/evaluation/evidence/phase10-runtime-evidence-v1.0.0.json
4ED10E5C98611A3F2A50FF1B98AD929B3B1950F73836D874BDF42F5A0D7FEC64

tests/integration/api-asset-composition.test.ts
28C45C59819891BC0B682E3A3C9E84840C19DD64D0AB5BA6BDF2C4FC7972FFF5

tests/integration/model-gateway-timeout-audit.test.ts
1C2CDF2BD7F59663CE223542538D67F04567CFCC0EB401998C47DEA9FF3DBE14

tests/phase8/asset-parent-read-simulation-notes.md
8F767AA7CC3AE7F412D316410FB0D89125D64A2E6AA35B243BB845CEEC6915BB

tests/phase8/asset-parent-read-simulation.test.ts
3460ABB51A857F2D8DC34297705C8002763956142F2AF4F21403BDBA493D7FBF

tests/phase8/asset-parent-read-simulation.tsconfig.json
CF5E65C20E7AC9523D88A67A3B7A7934685F289ADEE1689F50DF18AA21FF4A3F

tests/phase8/scoped-factual-grounding-notes.md
6DBF3B16F0A84388C48ECE7B93C2484750206B230F96B318AFE282A4C49F5D9A

tests/phase8/scoped-factual-grounding.test.ts
37BFC17BFBA8AA5176D842A7ACB0F929FF15D1C56DD729FCE086605805CF3002

tests/phase8/scoped-factual-grounding.tsconfig.json
58F05F5B2633CFA5F153A98C5C1B8B6854DC6DC8E0C97759ABD88A269060DF86

tests/testing/asset-component-chain.ts
3C2848B393DF9750EDED91396706FCCD1C6F3BB92E8927BD2000521888FAA079

tests/testing/asset-parent-read-simulation.ts
7CF9DC712A3FF36CC1119615497F3DA25EF1EF06BADCA9132EF1FAD899CFA0BE

tests/testing/scoped-factual-grounding-fixtures.ts
27A0A07D35E95150F8F33FFE02A859C03C592B07D7C553BEA3E60474ACFBA03A

tests/testing/scoped-factual-grounding-ingress.ts
3AAA75B71F7520F831FDD131F1D1455B0ABCE44644C04A8C45C472200F169F69

tests/testing/scoped-factual-grounding.ts
3B20E09738F0D243393898D242AE9BAD56DBE1C9CA08E9B4B1C994D197E79621
```
