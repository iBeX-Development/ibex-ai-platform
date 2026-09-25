# SIR02-GOV-03 — RAG Architecture Approval v1.0

## Approval record

| Field                          | Value                                                                                   |
| ------------------------------ | --------------------------------------------------------------------------------------- |
| Evidence ID                    | `SIR02-GOV-03`                                                                          |
| Document                       | `SIR02-GOV-03 — RAG Architecture Approval`                                              |
| Version                        | `v1.0`                                                                                  |
| Record status                  | `Owner Decision Recorded / Awaiting Immutable Reference`                                |
| Evidence status                | `Missing / Not Reviewed`                                                                |
| Scope                          | Formal RAG Architecture approval for the reduced initial Shadow scope with RAG excluded |
| Approval owner                 | **GANTUMUR Erdenedalai — Founder / Administrator**                                      |
| Reviewer                       | **SODBILEG Erkhembayar — Administrator**                                                |
| Approval status                | `Approved`                                                                              |
| Decision date                  | `2026-09-25`                                                                            |
| Immutable repository reference | `Owner Input Required` — immutable commit containing the completed approval             |

## Required approval statement

**RAG Architecture formally approves the reduced Initial Shadow scope with RAG excluded, subject to the approved exclusion manifests, fail-closed controls, no-automatic-reenablement rule, and separate approval for any future RAG activation.**

An approval must also confirm that:

- the accepted canonical agent, intent, and capability exclusion manifests define the excluded RAG scope;
- wildcard or implicit broad inclusion is prohibited;
- no fallback, tenant, role, entitlement, caller, agent, model, or provider setting may enable RAG;
- missing or conflicting configuration fails closed;
- review or expiry never enables RAG automatically;
- re-enablement requires a new explicit governance approval and approved configuration change;
- approval of this governance record does not deploy the configuration or authorize Shadow Mode entry.

## Supporting evidence

- Agent-definition and Product evidence snapshot: `4779dce2e53e8fdc65ccf947084130b1b22ff2f8`
- Configuration artifact commit: `52e437f053cdca25492410cecbd182ebc19a4afd`
- Product approval record: `df112abde861a908fd5838ba10dad54e96053b65`
- Product evidence review: `4b7fcb77343f5009f5b521f6d580ab6088d3c9f4`
- RAG Architecture response: `baa007af56cbb0aa70ccbb64618291c13c27369c`
- RAG Architecture evidence review: `c27254f3cbcc74403125269e19a15839ff1e4c7f`
- Configuration ID/version/checksum: `SIR02-SHADOW-RAG-DISABLEMENT` / `v1.0` / `123e7761265dc753ceb42f52ed8e0b7c8d7796a3f6ff6b5510e66610846274b6`

## Acceptance-criteria mapping

| Criterion                                                             | Current value                              | Satisfied now? |
| --------------------------------------------------------------------- | ------------------------------------------ | -------------- |
| Exact reduced Shadow scope and exclusions are documented              | Prefilled from immutable accepted evidence | `Yes`          |
| Approval owner and reviewer are identified                            | Established governance roles               | `Yes`          |
| Explicit RAG Architecture approval statement and outcome are supplied | Owner statement and `Approved` outcome     | `Yes`          |
| Decision date is supplied                                             | `2026-09-25`                               | `Yes`          |
| Completed approval has an immutable repository reference              | `Owner Input Required`                     | `No`           |

## Owner completion

- Approval status: **Approved**
- Explicit approval statement: **RAG Architecture formally approves the reduced Initial Shadow scope with RAG excluded, subject to the approved exclusion manifests, fail-closed controls, no-automatic-reenablement rule, and separate approval for any future RAG activation.**
- Decision date: **2026-09-25**
- Approval conditions: **This approval does not authorize deployment, Shadow activation, ingestion enablement, or production use.**
- Immutable repository reference after completion: **Owner Input Required**

The owner approval is recorded. This evidence remains `Missing / Not Reviewed` until the immutable commit containing this completed approval is linked. Product evidence does not substitute for this RAG Architecture approval.
