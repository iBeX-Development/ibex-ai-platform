# Phase 10 Evaluation Report v1.0.0

## Release candidate

- Baseline: Phase 0–9 on `main` at `195f06dc7f2833fa74e16b67003c056fb43f917c`
- Hardening branch: `phase-10/hardening`
- Evaluation dataset: `ibex-pilot-hardening` v1.0.0
- Dataset classification: synthetic, test-only
- Decision: **PASS**

This report covers Increment 10 Hardening only. It does not authorize Shadow Mode, Controlled Pilot,
Production Readiness, production promotion, or a live Core/model-provider integration.

## Evaluation isolation

Golden cases and expected labels reside only under
`tests/evaluation/datasets/pilot-agents/v1.0.0.ts`. Runtime packages, agent prompts, RAG corpora,
Tool results, and agent context cannot import the test tree. Agent profiles carry only a dataset
version reference. The import-boundary and known-label scans pass.

## Critical Safety Gate

| Gate                        | Result |
| --------------------------- | ------ |
| Tenant isolation            | PASS   |
| Authorization               | PASS   |
| Permission enforcement      | PASS   |
| Tool allowlisting           | PASS   |
| Action approval             | PASS   |
| Data leakage prevention     | PASS   |
| Prompt injection resistance | PASS   |
| Confidentiality             | PASS   |
| Audit completeness          | PASS   |

Critical Safety Gate: **9/9 PASS (100%)**. Results are derived from 44 executed Pilot Agent runtime
observations and 56 unique normalized audit events. Every gate names its supporting case and audit
event identifiers and fails closed for missing, duplicate, malformed, inconsistent, or failed
evidence. Conditional acceptance is unsupported. No unresolved Critical or High finding remains.

## Quality baseline

The versioned synthetic dataset contains 44 cases: 11 categories for each of the four Pilot Agents.

| Metric                     | Target | Result | Status |
| -------------------------- | -----: | -----: | ------ |
| Agent routing accuracy     |   ≥95% |   100% | PASS   |
| Tool selection accuracy    |   ≥95% |   100% | PASS   |
| Tool parameter correctness |   ≥98% |   100% | PASS   |
| RAG groundedness           |   ≥95% |   100% | PASS   |
| Citation correctness       |   ≥95% |   100% | PASS   |
| Domain task success        |   ≥90% |   100% | PASS   |

These scores compare golden labels only after executing the approved Pilot Agent runtime. Routing,
Tool allowlisting and parameters, RAG grounding, citation integrity, abstention, permission, and
output-contract behavior are observed from runtime responses, normalized errors, and correlated
audit events. They are deterministic evaluation results, not evidence of live-provider or live-Core
performance.

## Evaluation evidence

Each observation records the evaluation run and case identifiers, trusted synthetic tenant scope,
request/correlation/trace binding, agent/prompt/config and relevant Tool/RAG/model versions,
expected-result reference, observed result, applicable metric scores, sanitized failure and severity,
timestamp, automated evaluator identity, deterministic measurement classification, and normalized
audit event identifiers. Golden expected values remain in the test-only dataset. No raw prompt,
retrieved content, Tool payload, secret, confidential reasoning, or chain-of-thought is stored.
The versioned test-only evidence artifact is
`tests/evaluation/evidence/phase10-runtime-evidence-v1.0.0.json`; CI regenerates the runtime result
in memory and rejects any mismatch with that artifact.

## Latency and cost evidence

| Evidence source          |  P50 |   P95 |   P99 | Cost               |
| ------------------------ | ---: | ----: | ----: | ------------------ |
| Deterministic simulation | 4 ms | 12 ms | 12 ms | 44 synthetic units |
| Approved live provider   |  N/A |   N/A |   N/A | Not measured       |
| Approved live Core       |  N/A |   N/A |   N/A | Not measured       |

The measurement contract rejects a live measurement without an approval reference and prevents a
simulated run from using an approved-currency label.

## Regression and operational evidence

| Validation                                                      | Result             |
| --------------------------------------------------------------- | ------------------ |
| Phase 10 focused hardening, Phase 8, security, and tenant suite | 110/110 PASS       |
| Full Phase 1–9 and repository regression suite                  | 310/310 PASS       |
| Typecheck, lint, build, and repository formatting               | PASS               |
| Dependency audit                                                | No vulnerabilities |
| Direct Core database scan                                       | PASS               |
| Agent/runtime provider-coupling scan                            | PASS               |
| Phase 11 scope scan                                             | PASS               |
| Secret scan                                                     | PASS               |

The secret scan matches only deliberate synthetic redaction sentinels in security tests. No real
credential or secret is present.

Operational checks confirm:

- global platform, agent, RAG, Tool, Action Tool, Model Gateway, and fallback flags default off;
- Pilot Agents and unapproved live Tool/Core capabilities remain disabled;
- disabled agent, Tool, provider/model, and versioned configuration paths support rollback;
- audit sink/export failures remain observable, mark health degraded, and fail closed;
- Gateway → Agent → Tool/RAG → Model → Response reconstruction preserves trusted tenant, request,
  correlation, and trace binding;
- proposal execution retains Phase 9 authoritative approval revalidation and replay protection.
- global platform, individual agent, RAG, Tool, Action Tool, Model Gateway, and model fallback
  controls are enforced at their runtime boundaries before protected execution;
- the CI workflow runs the evidence-derived evaluation plus dependency, secret, direct Core DB,
  provider-coupling, evaluation-leakage, and Phase 11 scope gates as named fail-fast steps.

## Findings and blockers

- Critical findings: none
- Unresolved High findings: none
- Live Core contracts, service identities, authentication details, schemas, and authorization
  mappings remain unapproved integration blockers.
- Live provider latency and cost evidence is unavailable and is not inferred from simulation.

## Completion decision

**Phase 10 Status: PASS**

This result supports a separate approval decision for the later Shadow/Pilot increment. It does not
start or approve that increment.
