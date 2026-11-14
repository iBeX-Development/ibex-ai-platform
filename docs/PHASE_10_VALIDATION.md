# Phase 10 Hardening Validation

Phase 10 adds no runtime business capability. It separates versioned synthetic evaluation labels
from production modules, supplies a fail-closed offline release gate, expands default-off rollout
controls, validates Phase 1–9 behavior, and records results in
`docs/evaluation/PHASE_10_EVALUATION_REPORT_v1.0.0.md`.

## Scope of the recorded results

The results below describe the historical Phase 10 hardening evaluation linked above,
not a fresh validation of the current checkout or its uncommitted changes. Consult the
[current findings registry](evaluation/findings/registry.v1.json) for its recorded scope
and review state; historical PASS counts do not establish current finding closure.
The current release assessment keeps artifact admission blocked until independent
artifact binding is established, separately from engineering test results. See
[`phase10-assessment.ts`](../tests/evaluation/support/phase10-assessment.ts).

## Historical validation result

| Gate                                      | Result       |
| ----------------------------------------- | ------------ |
| Critical Safety Gate                      | 9/9 PASS     |
| Approved quality thresholds               | PASS         |
| Phase 10 focused suite                    | 114/114 PASS |
| Full regression suite                     | 314/314 PASS |
| Formatting, lint, typecheck, and build    | PASS         |
| Dependency and repository security scans  | PASS         |
| Audit reconstruction and fail-safe health | PASS         |
| Feature flags and rollback evidence       | PASS         |

The Critical Safety Gate and quality scores are reconstructed from 44 executed Pilot Agent runtime
records, eight deterministic Tool Runtime executions, and 68 unique normalized audit events. The CI
workflow also enforces dependency, secret,
direct Core database, provider-coupling, evaluation-leakage, and later-phase scope scans.

Shadow Mode, Controlled Pilot, Production Readiness, production promotion, and Phase 11+
capabilities are excluded.

## Resumed local validation — 2026-11-14

This dated handoff describes the current recovery working tree at HEAD
`e6ed2c91bcfabf6fe5a7eff7a766185dbdb62ac2`, including preserved earlier uncommitted work.
It is not a validation of HEAD alone, a new full-suite result, or release admission.
The following six files comprise the resumed source/document changes:

| File | Resumed change |
| --- | --- |
| `packages/audit/src/pipeline.ts` | Revalidate detached evidence after copying, rejecting prohibited data introduced by changing getters. Earlier reference-snapshot and reconstruction changes in this file are separate preserved work. |
| `tests/unit/audit-telemetry-pipeline.test.ts` | Four root/nested, trusted/unavailable getter regressions; explicitly typed negative fixture. |
| `apps/api/src/index.ts` | Global platform disable prevents dispatch to an injected Gateway handler. |
| `tests/integration/api-error-boundary.test.ts` | Six disabled-route regressions and explicit enabled/disabled fixture configuration. |
| `tests/integration/f06-rag-authorization.test.ts` | Empty scope `decision_id` yields `AUTHORIZATION_ERROR`, sanitized rejection and zero store/embed/rank/upsert calls. |
| `docs/PHASE_10_VALIDATION.md` | Separate historical results from this dated local handoff. |

The source corrections and the local result packets below received independent review
without a blocking finding. Review of a local packet does not authorize finding closure.
The documentation handoff itself records those results; it is not a new reviewer attestation.

| Check actually run with restored pinned dependencies | Result |
| --- | --- |
| Audit pipeline + audit reference snapshot | 98/98 passed (71 + 27) |
| F06 authorization suite | 33/33 passed |
| P7 Tool/RAG runtime-emitted audit composition | 8/8 passed (5 + 3) |
| F09 accounting boundary | 61/61 passed |
| API boundary + API asset composition | 86 passed, 4 failed with `connect EACCES` (54/58 + 32/32) |
| TypeScript `--project tsconfig.json --noEmit --incremental false` | Passed after the negative-test fixture correction; latest run includes F06 change |
| Non-fixing ESLint, no cache | Passed on the five changed TypeScript files, across the four-file check and subsequent F06 check |

Node 22.23.3, Vitest 4.1.12 and TypeScript 5.9.3 were used for these final checks.
The earlier mismatched-dependency diagnostic and initial TS2345 result remain historical
evidence, not substituted PASS results. No full regression/build/security-scan rerun is claimed.

Retained local evidence is identified by packet basename and SHA-256 of its
`review-manifest.json` below. Packets are held outside the repository in the local evidence
archive; these locators do not imply that another checkout can access them. They are not
new registry authority or HTTPS evidence entries. Exact commands, logs, source pins and
before/after inventories are retained in the packets.

| Packet basename | Manifest SHA-256 |
| --- | --- |
| `ibex-f07-fixture-typing-20261114-v1` | `cdc36a0f208a44945d8ae12b48cda35ec00a0b7e92d07e2bcd6ba19d532b0c91` |
| `ibex-f08-focused-validation-20261114-v1` | `03804499ece527990785482ca0e6c3386b1e817d99a2a7a93e8c115f58a98cfd` |
| `ibex-focused-lint-20261114-v1` | `c6a05df2b37325cfccc96c355d91fe3fc87a9c9f53050674ce2ae520c44aad65` |
| `ibex-f06-malformed-scope-20261114-v1` | `2cce4606ef6f803b7eb5acc8e9dac534abd0168535d463976f1394801ca48602` |
| `ibex-p7-composition-validation-20261114-v1` | `bc178c9543703c6453e49ef3af92caf0cfadd1ac275957cb6791feb1e1aafba1` |
| `ibex-f09-accounting-validation-20261114-v1` | `9387a85fb62659bba0c6d1cf0559a1ab7a648f94d0e68411380c9919463648a7` |

Validation preserved source, Git/index/refs, dependency store/backup and inventoried prior
evidence. The recorded Vitest results-cache updates are tooling output, not source changes.
This documentation addition necessarily has a later source hash than those test snapshots.

Remaining limitations are unchanged:

- **F06 / OE-10 remains open:** synthetic policy/scope and store fixtures do not establish
  deployed authority or independent store isolation. Post-store metadata rejection is not
  pre-store authorization proof; no `source_owner == user_id` rule was introduced.
- **F07 / P7 remains open:** plain-object/array getter regressions and runtime-emitted
  in-memory traces do not prove arbitrary-object safety, durable delivery, external export
  or complete failed-request reconstruction.
- **F08 transport remains unresolved:** three HTTP cases failed before intended response
  assertions; the partial-response case received `connect EACCES` instead of the expected
  connection-close error. The cause is not proven to be an application defect. Those cases
  were not rerun or worked around. Disabled routes, enabled dispatch and health controls passed.
- **F09 production closure remains open:** synthetic admission/no-replay tests do not establish
  distributed accounting, approved real caps/tariffs/calendar authority, durable warnings,
  reconciliation or live adapter certification.

Baseline, architecture, finding severity/status and blocked release-artifact admission are
unchanged. No live Core/provider integration, hosted run, deployment or security-setting
change was performed in this resumed validation batch.
