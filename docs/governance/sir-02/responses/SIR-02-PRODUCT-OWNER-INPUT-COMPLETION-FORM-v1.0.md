# SIR-02 Product Owner Input Completion Form v1.0

## Completion rules

- Scope is limited to `SIR02-CFG-06`, `SIR02-CFG-07`, and `SIR02-DEF-03`.
- Replace every `Owner Input Required` value with an explicit owner-supplied value.
- An evidence item remains `Missing` unless every mandatory field for that evidence ID is supplied.
- A fully completed item may move only to `Received`.
- Completion of this form does not review, accept, or approve evidence.
- After Config Scope and Final Sign-Off items are outside this form.

## SIR02-CFG-06 — Effective date bound to authoritative configuration

| Required field                                         | Owner-supplied or verified value                                                                                                                                                              |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authoritative immutable Shadow configuration reference | `docs/governance/sir-02/configuration/SIR-02-SHADOW-RAG-DISABLEMENT-v1.0.json`; ID `SIR02-SHADOW-RAG-DISABLEMENT`; SHA-256 `123e7761265dc753ceb42f52ed8e0b7c8d7796a3f6ff6b5510e66610846274b6` |
| Authoritative Shadow environment configuration version | `v1.0` — proposed, pending formal governance approval                                                                                                                                         |
| Repository configuration schema version                | `IBEX_CONFIG_VERSION = 1`                                                                                                                                                                     |
| Repository platform control                            | `IBEX_AI_PLATFORM_ENABLED` → default `false`                                                                                                                                                  |
| Repository RAG control                                 | `IBEX_FEATURE_RAG_ENABLED` → default `false`                                                                                                                                                  |
| Repository assessment                                  | `Insufficient as authoritative Shadow configuration reference`                                                                                                                                |
| Explicit effective date                                | `2026-10-01`                                                                                                                                                                                  |
| Configuration owner                                    | `GANTUMUR Erdenedalai — Founder / Administrator`                                                                                                                                              |
| Decision date                                          | `Owner Input Required — replace <approved decision date>`                                                                                                                                     |

`IBEX_CONFIG_VERSION = 1` is the repository configuration schema version. It is not the Shadow environment configuration release/version.

**Blocker:** The proposed immutable Shadow configuration reference/version must be formally approved, and an actual decision date must replace the placeholder before this evidence item can move to `Received`.

**Completion status:** `Incomplete — Missing / Not Reviewed`

## SIR02-CFG-07 — RAG exclusion review/expiry rule

| Required field                                                  | Owner-supplied value                                      |
| --------------------------------------------------------------- | --------------------------------------------------------- |
| Review cadence or expiry date                                   | `Every 90 days`                                           |
| Accountable reapproval owner                                    | `GANTUMUR Erdenedalai — Founder / Administrator`          |
| Decision date                                                   | `Owner Input Required — replace <approved decision date>` |
| Confirmed rule: expiry/review does not automatically enable RAG | `Confirmed — no automatic RAG enablement`                 |

Re-enablement requires a new explicit governance decision and an approved configuration change.

**Completion status:** `Incomplete — Missing / Not Reviewed`

## SIR02-DEF-03 — SIR-09 deferral review/expiry rule

| Required field                                                                                      | Owner-supplied value                                                                                      |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Review cadence or expiry date                                                                       | `Every 90 days`                                                                                           |
| Accountable SIR-09 owner                                                                            | `GANTUMUR Erdenedalai — Founder / Administrator`                                                          |
| Decision date                                                                                       | `Owner Input Required — replace <approved decision date>`                                                 |
| Confirmed scope: document ingestion, embeddings, indexing, storage, and related deferred processing | `Confirmed — deferred scope covers document ingestion-related activity and the listed related processing` |
| Confirmed rule: expiry does not automatically enable ingestion or RAG                               | `Confirmed — no automatic enablement of ingestion, embeddings, indexing, or RAG`                          |

Reopening requires explicit approval.

**Completion status:** `Incomplete — Missing / Not Reviewed`

## Completion validation

| Evidence ID    | Mandatory fields supplied | Eligible to move to `Received` | Current evidence status | Review status  |
| -------------- | ------------------------- | ------------------------------ | ----------------------- | -------------- |
| `SIR02-CFG-06` | `Partial`                 | `No`                           | `Missing`               | `Not Reviewed` |
| `SIR02-CFG-07` | `Partial`                 | `No`                           | `Missing`               | `Not Reviewed` |
| `SIR02-DEF-03` | `Partial`                 | `No`                           | `Missing`               | `Not Reviewed` |

No evidence is reviewed or approved by this form.
