# Source admission projection — disabled/test-only candidate

Ready for independent review. Owner direction authorizes local contract/adapter development only; no real approver identity, credential, live service, ingestion reopening or production activation is included.

## Existing authority and architecture boundary

Inspected packages/rag-runtime/src/ports.ts: KnowledgeGovernancePort authorizes ingestion with allowed/decision_id; KnowledgeStorePort filters metadata; neither supplies a complete source-admission lifecycle record.

Inspected docs/governance/sir-02/controls/SIR-02-KNOWLEDGE-MANAGEMENT-LIFECYCLE-CONTROL-BASELINE-v1.0.md:

- invariants 1–10 (:61 onwards): ingestion remains disabled, unknown/conflicting authority denies, exact version required, no implicit reopening;
- canonical record (:74 onwards): source/version/owner/tenant/scope/classification/provenance/checksum/lifecycle and event evidence;
- ownership and approval (:108 onwards): authoritative ownership verification, authorized human approval of each exact source version and checksum;
- version/supersession/withdrawal (:125 onwards, especially :157): no inherited approval; withdrawal immediately removes active eligibility;
- reconciliation and deletion remain mandatory and are not implemented by this minimal projection.
  Gate-A proposed fixture schema :91–117 separately identifies these evidence domains and is documentation-only, not a runtime migration.

This candidate does not replace that full record. It is a minimal decision projection consumed by an isolated retrieval adapter, with explicit synthetic references to underlying ownership, human approval and full lifecycle evidence. It tests fail-closed mechanics while actual evidence validation remains a production prerequisite. No architecture, baseline, governance record or production port was changed. The local exact-read interface is deliberately separate from the production KnowledgeStorePort.

## Contract

Source identity is an exact tuple:
source_id, source_version, checksum_representation, checksum, document_id, document_version.

Tokens are nonempty canonical ASCII opaque tokens with no whitespace normalization, slash, wildcard, inferred alias or version-family approval. The checksum is lowercase sha256:<64 hex>. Supported representation is explicitly ibex-rag-canonical-document-content-v1: the existing integrity.ts canonicalDocumentContent encoding (ordered JSON section location/content arrays joined with newline, UTF-8 SHA-256). It is NOT a raw-file-byte checksum. The representation name is a local candidate contract label, not an approved external standard. Unsupported raw-file representation and spelling aliases reject.

Synthetic decision projection additionally binds fixed synthetic issuer, decision ID, positive revision, tenant, source owner/origin, verified ownership flag/evidence, human approval flag/evidence, satisfied conditions, lifecycle evidence reference and active state. The registry fixture has one exact record; it has no wildcard lookup, list discovery, automatic approval or reactivation operation.

Unknown issuer, malformed/absent authority, false ownership/human approval/conditions and withdrawn/unknown/superseded/quarantined/expired states deny. These flags and references are fixture evidence only; they do not authenticate a real authority or human. No real approver or credential is invented.

Admission evidence captures original trusted context, exact identity and issuer/decision/revision. The wrapper compares complete schema-parsed context for each call. A local readExact port receives the admitted identity and evidence alongside the existing RAG security filter before store access. Thus the downstream read is instructed with exact identities, not merely a broad metadata filter. The stub observes those exact arguments; a production store implementation is not supplied.

Returned chunks must match admitted document ID/version/document checksum, private tenant, owner and origin before embedding. Current KnowledgeChunk has no canonical source ID/version fields; the synthetic single-record authority provides the exact source-to-document mapping. Ambiguous mapping and production uniqueness/reconciliation require further design/evidence. Shared/global admission is intentionally unsupported by this minimal private-tenant composition.

Existing RagRuntimeService still performs authorization, routing-scope resolution, integrity checking and candidate security checks. Store wrapper has a rejecting upsert entry and no write dependency. No ingestion/re-index operation is introduced.

## Synthetic consistency ordering

This is a single JavaScript-agent authority fixture:

1. Admission synchronously reads the exact current record/revision and registers a lease.
2. Each store/embedding/ranker boundary checks lease validity before call and after awaited completion.
3. Withdrawal synchronously changes record revision/state, increments epoch and aborts all active leases. No timer, TTL or delayed invalidation.
4. A final lease check precedes public response completion.
5. Completed responses ordered before withdrawal cannot be retroactively recalled; subsequent admission denies.

Tests explicitly order withdrawal before admission, during store, during embedding and during ranking. In-flight dependency work already begun may execute until its cooperative cancellation takes effect; its result cannot proceed through the next guarded boundary or public return. This does not prove physical cancellation, distributed linearizability, all-store propagation or deletion. Active eligibility revocation in this local adapter is distinct from required derived-artifact deletion/reconciliation, which remain open.

The helper is disabled unless enabled is explicitly true and environment exactly test. Authority fixture controls are accessible only as test setup, not retrieval business input. Public requests cannot approve or reactivate.

## Test inventory

60 cases:

- 1 exact positive control, including identity/issuer/decision/revision/context arguments observed at readExact;
- 3 disabled/non-test gates;
- 15 unknown, unverified, malformed, foreign-tenant or inactive authority cases;
- 5 exact identity-change denials;
- 4 invalid canonical source identifiers;
- 1 uppercase digest alias and 1 unsupported checksum representation;
- 6 changed trusted context cases;
- 6 returned chunk substitution cases;
- 5 raw whitespace-alias cases for document ID/version, tenant ID, source owner and source URI;
- 6 withdrawal/ordering/frozen-evidence cases.
- 7 deferred async cases: caller-input mutation during store, returned identity mutation before store completion, captured-chunk mutation during embedding, late rejection after withdrawal at each of store/embedding/ranking, and recovery after a settled store error while authority remains active.

Pre-admission negatives have zero exact-store, embedding and ranking calls. Returned substitutions have one store and zero embedding/ranking calls. Positive control observes 1/1/1. During-store withdrawal observes 1/0/0, during-embedding 1/1/0 and during-ranking 1/1/1 but rejects output. Serialized public errors and audits are checked for raw chunk content and the synthetic decision identifier. This is bounded canary evidence, not exhaustive noninterference or a real audit-system proof.

## Validation

Initial candidate: 47 PASS, lint/type exit 0. A bounded refinement named the checksum representation and added its negative case: 48 PASS, lint/type exit 0. Independent review then identified a P2 normalization defect despite independently passing those 48 tests.

The corrected helper snapshots returned objects and compares raw admission-bound values before the shared schema can trim them. Schema validation and subsequent runtime integrity checks remain intact. Five whitespace mutations reject after one exact-store call and zero embedding/ranking calls; the exact positive control is retained. The first corrected run passed 53 tests and typecheck but lint flagged an optional fixture field; an explicit string assertion fixed that test issue. The checkpoint rerun passed 53 tests, lint and typecheck.

Recovery on 2026-10-24 verified the corrected code hashes and established that the interrupted notes update had not landed (notes still matched 1A4CD0CEDF9B28FBB5CBA5702A1772D86C98A60061D4BBE02CE7F0FFAE22F360). Only these notes were edited during recovery. Focused validation was rerun against the unchanged corrected code with direct Node 22.23.3 and Vitest 4.1.11 using the commands below: 53 PASS, zero skipped; Vitest, scoped ESLint and scoped TypeScript each exited 0. Final preservation is recorded in the completion response.

```powershell
& 'C:\Users\gantu\Documents\Codex\2026-10-15\task\ibex-tooling\node\node-v22.23.3-win-x64\node.exe' node_modules/vitest/vitest.mjs run tests/integration/source-admission.test.ts --config vitest.config.ts --configLoader runner --no-cache --pool=threads --experimental.fsModuleCache=false --reporter verbose
& 'C:\Users\gantu\Documents\Codex\2026-10-15\task\ibex-tooling\node\node-v22.23.3-win-x64\node.exe' node_modules/eslint/bin/eslint.js tests/testing/source-admission.ts tests/integration/source-admission.test.ts --max-warnings 0
& 'C:\Users\gantu\Documents\Codex\2026-10-15\task\ibex-tooling\node\node-v22.23.3-win-x64\node.exe' node_modules/typescript/bin/tsc -p tests/integration/source-admission.tsconfig.json --noEmit
```

SHA-256:

- tests/testing/source-admission.ts: 0ECA4B5EBD1032D7E7452D69C9C451ECD232D0C3E166F4195E5791D3AF2599D6
- tests/integration/source-admission.test.ts: D6CC5C7E5DA73262A0ABA6A4E33CCA5683BD05E892BC4CD9E527F90110642191
- tests/integration/source-admission.tsconfig.json: 0055DFE768C9AF725E25E2C4E33826588C38183F943ED915FF0A5C2B117474C7

## Preservation and remaining prerequisites

Correction changed the helper from F151055C3D470D7CFD8BD58A91A7A86664B9C93DB93847267E8471C92F039EA2 and the test from D2B48E1A94CBD223EEC94797DA45E5E988D7992D46512E5A056B8DF910556387 to the hashes above. Config is unchanged. Recovery began with the expected 35 dirty/new entries and 43 refs, branch and HEAD unchanged. A fresh complete hash/status/ref inventory was captured before the notes edit for comparison afterward.

The previously missing adversarial asynchronous mutation and late-rejection coverage is now partially addressed by seven explicit deferred-schedule cases. They are not an exhaustive async schedule exploration; distributed authority, physical cancellation, deletion and reconciliation guarantees remain unproven. Independent review of this extension remains pending; no closure or live guarantee is claimed.

## Bounded async extension, 2026-10-24

The approved lifecycle baseline at lines 66, 157 and 174 requires rejecting mismatched authority and immediate withdrawal eligibility loss, with no reuse of withdrawn evidence. Existing review explicitly identified async mutation/late-rejection tests as a gap. This extension exercises those requirements without introducing authority, lifecycle transitions or production changes. The current findings registry remains incomplete/unreviewed with unknown completeness; it is not modified by this extension. Organization identity edits and all other pre-existing work are preserved.

Tests use explicit entered/pending deferred promises rather than timing sleeps. Caller-owned context/query, identity and initial authority-record mutations during pending store work do not alter captured evidence. Initial-record mutation is not an authoritative withdrawal; withdrawal still uses the fixture's explicit control. Mutating the returned document identity before store completion rejects with 1/0/0 downstream calls. Mutating an original returned chunk after capture, while embedding is pending, cannot alter the ranker candidate or public content.

For store, embedding and ranking separately, withdrawal occurs after the dependency has entered but before its promise settles. The retrieval rejects before the dependency later rejects; two event-loop turns allow the late rejection to drain. Audit output does not change afterward, the private rejection canary does not leak, and subsequent retrieval on the withdrawn authority still denies without extra dependency calls. Vitest reported no unhandled rejections. A separate pending store-error case permits a later successful invocation only because that authority was never withdrawn; this is dependency-error recovery, not reopening or automatic retry.

Initial focused execution: 60 PASS and typecheck exit 0; lint found deferred-signal and rejection-callback test typing issues. One correction cycle used undefined signals and explicit unknown callback parameters. No helper/adapter correction was needed. Final scoped ESLint and TypeScript checks (commands above) exit 0. Related aggregate: eight files passed, 364 tests passed and three pre-existing downstream-consumer integration cases remained skipped (367 total), exit 0. This is a related regression aggregate, not a full repository validation/build or an official OE-10 run.

Aggregate command, using the same pinned Node executable above:

```text
node_modules/vitest/vitest.mjs run tests/integration/source-admission.test.ts tests/integration/rag-routing-binding.test.ts tests/integration/f06-rag-authorization.test.ts tests/integration/f06-shared-knowledge.test.ts tests/phase8/scoped-factual-grounding.test.ts tests/phase8/asset-parent-read-simulation.test.ts tests/evaluation/findings-registry.test.ts tests/evaluation/phase10-assessment.test.ts --config vitest.config.ts --configLoader runner --no-cache --pool=threads --experimental.fsModuleCache=false
```

Pre-extension inventory: 39 dirty/new entries, 43 refs. Only source-admission.test.ts and these notes are changed. Helper remains 0ECA4B5EBD1032D7E7452D69C9C451ECD232D0C3E166F4195E5791D3AF2599D6; config remains 0055DFE768C9AF725E25E2C4E33826588C38183F943ED915FF0A5C2B117474C7. Previous test hash was 296BCB5E6BFEC35DDA8E984E72F824CE7DF0785075E5566E410644CE7F8D16E1. Final preservation comparison and notes hash accompany completion. No authenticated human approval, distributed consistency, production RAG activation or finding closure is inferred from the fixtures.

Initial 31 dirty/new entries, 43 refs; branch codex/local-model-typing-recovery; HEAD 028934845591b3e569a1c5d639f81df7c72ca8ac. Existing inventory captured before edits; historical 20-file hashes checked against prior notes. No index lock or additional same-workspace active writer was observed in available app inventory; the active Core task uses a different workspace. No subagents or other writers started. Final preservation comparison accompanies completion.

Four additions only: helper, test, focused config and these notes. Production packages/apps, accepted tests, baselines, governance, manifests and lockfiles remain unchanged. No installs, network/live calls, credentials, permissions changes or Git mutations.

Before production: approve full canonical record mapping and checksum representation, authenticate real ownership and exact-version human approval authority, implement lifecycle/reconciliation/deletion and revision monotonicity across authoritative updates, implement exact-store semantics and distributed revocation/cancellation, and establish deployment/operational controls. This candidate deliberately provides no approve/reopen/replace transition. Strict OE-10 requirements and production activation remain open. Independent review pending; no official evidence run or finding closure.
