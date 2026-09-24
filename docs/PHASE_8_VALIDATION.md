# Phase 8 Validation — Pilot Domain Agents

## Status: PASS

## Scope

Phase 8 implements evaluation-stage foundations for the four approved Pilot agents in order:

1. General iBeX
2. Maintenance
3. Asset
4. Warehouse

Each profile has independently versioned agent definition, Level 3 domain prompt, permission policy, conceptual Tool allowlist, RAG scope, output contract, and synthetic evaluation dataset. The shared response guard accepts no caller-supplied answer, evidence, provenance, citation, or execution mode. It binds trusted request/correlation/trace context, resolves evidence through a server-side port using Phase 5 Tool and Phase 6 RAG contracts, verifies RAG content/chunk/citation integrity, and abstains on unavailable or invalid evidence.

## Live integration blockers

Exact Core Tool/API identifiers, endpoints, schemas, service identities, authentication details, ownership checks, field filtering, entity resolution, and Core permission mappings remain unapproved. All live Tool bindings are therefore disabled. Logical capability classes are retained only as versioned agent configuration; deterministic test evidence is used for acceptance.

## Exclusions

- Human Approval Runtime or approval execution
- authoritative or autonomous transactional writes
- PM/PdM specialized or predictive logic
- autonomous multi-agent execution
- Shadow Mode, Controlled Pilot, or production rollout
- Phase 9 or later capability

## Validation

| Gate                                                               | Result |
| ------------------------------------------------------------------ | ------ |
| General iBeX Agent acceptance: 1 file / 11 tests                   | PASS   |
| Maintenance Agent acceptance: 1 file / 7 tests                     | PASS   |
| Asset Agent acceptance: 1 file / 6 tests                           | PASS   |
| Warehouse Agent acceptance: 1 file / 6 tests                       | PASS   |
| Integrated Pilot Agent acceptance: 1 file / 6 tests                | PASS   |
| Gate P8 focused: 5 files / 36 tests                                | PASS   |
| Phase 1 regression: 6 files / 25 tests                             | PASS   |
| Phase 2 regression: 3 files / 16 tests                             | PASS   |
| Phase 3 regression: 4 files / 25 tests                             | PASS   |
| Phase 4 regression: 4 files / 28 tests                             | PASS   |
| Phase 5 regression: 4 files / 29 tests                             | PASS   |
| Phase 6 regression: 4 files / 50 tests                             | PASS   |
| Phase 7 regression: 3 files / 36 tests                             | PASS   |
| Full suite: 35 files / 251 tests                                   | PASS   |
| Formatting, lint, typecheck, and build                             | PASS   |
| Dependency audit: 0 known vulnerabilities                          | PASS   |
| Secret, direct Core DB, provider coupling, and Phase 9 scope scans | PASS   |

## Acceptance evidence

- Trusted tenant, user, session, request, correlation, and trace bindings are validated against server-resolved Tool/RAG evidence.
- A server-generated boundary trace, request, and correlation identity plus an OpenTelemetry span are established before caller data is parsed; malformed correlation values are never reflected into audit evidence or public errors.
- The canonical Maintenance Agent identity is `maintenance-agent` across Pilot configuration, shared routing/RAG fixtures, evaluation tests, and audit evidence; `maintenance` remains only the domain name.
- Production agent definitions and intents remain disabled while authorization mappings are unapproved; explicit deterministic capabilities exist only in test fixtures.
- Per-intent permissions, entitlements, Tool capability classes, and RAG scopes fail closed on missing or widened requests.
- RAG-backed responses require source, content, and citation-integrity evidence; Tool-backed evaluation responses require trusted deterministic Tool evidence.
- Live Core evidence is rejected because every live binding remains disabled pending approved contracts.
- Missing evidence and unsupported intents abstain without fabricating operational data.
- Agent audit events use the normalized Phase 7 pipeline and contain context, prompt hierarchy, versions, permission/entitlement references, outcome, evidence status, and Tool/RAG source references without raw prompts, answers, Tool payloads, or retrieved content. Boundary rejections are recorded before completion and audit sink failure propagates.
- Proposed actions remain non-executable, approval-required boundaries; no Human Approval Runtime exists.
