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

Critical Safety Gate: **9/9 PASS (100%)**. Conditional acceptance is unsupported. No unresolved
Critical or High finding remains.

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

These are deterministic evaluation results. They are not evidence of live-provider or live-Core
performance.

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
| Phase 10 focused hardening, Phase 8, security, and tenant suite | 104/104 PASS       |
| Full Phase 1–9 and repository regression suite                  | 303/303 PASS       |
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
