# SIR02-GOV-01 — Joint RAG Architecture Decision Review v1.0

## Decision record

| Field                          | Value                                                                             |
| ------------------------------ | --------------------------------------------------------------------------------- |
| Evidence ID                    | `SIR02-GOV-01`                                                                    |
| Document                       | `SIR02-GOV-01 — Joint RAG Architecture Decision Review`                           |
| Version                        | `v1.0`                                                                            |
| Record status                  | `Owner Decision Recorded / Awaiting Immutable Reference`                          |
| Evidence status                | `Missing / Not Reviewed`                                                          |
| Scope                          | Initial Shadow Mode with RAG excluded                                             |
| Primary owner                  | **GANTUMUR Erdenedalai — Founder / Administrator**                                |
| Reviewer                       | **SODBILEG Erkhembayar — Administrator**                                          |
| Decision outcome               | `Approved`                                                                        |
| Decision date                  | `2026-09-25`                                                                      |
| Immutable repository reference | `Owner Input Required` — immutable commit containing the completed owner decision |

## Decision scope

The joint review must decide whether initial Shadow Mode proceeds with all of the following excluded and disabled:

- RAG retrieval;
- embeddings and embedding access;
- vector search and vector-store access;
- document ingestion and related processing;
- every canonical RAG-dependent agent, intent, and capability in the accepted exclusion manifests;
- every fallback, tenant, role, entitlement, caller, agent, model, or provider path that could widen or re-enable the excluded scope.

This record does not authorize deployment, Shadow Mode entry, traffic, credentials, live configuration changes, or RAG activation.

## Supporting evidence

| Evidence                                                   | Immutable reference                                                                                          |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Accepted canonical agent, intent, and capability manifests | `4779dce2e53e8fdc65ccf947084130b1b22ff2f8`                                                                   |
| Proposed Shadow RAG-disablement configuration artifact     | `52e437f053cdca25492410cecbd182ebc19a4afd`                                                                   |
| Product decision approving the reduced Shadow scope        | `df112abde861a908fd5838ba10dad54e96053b65`                                                                   |
| Product evidence review                                    | `4b7fcb77343f5009f5b521f6d580ab6088d3c9f4`                                                                   |
| RAG Architecture evidence response                         | `baa007af56cbb0aa70ccbb64618291c13c27369c`                                                                   |
| RAG Architecture evidence review                           | `c27254f3cbcc74403125269e19a15839ff1e4c7f`                                                                   |
| Configuration artifact ID/version/checksum                 | `SIR02-SHADOW-RAG-DISABLEMENT` / `v1.0` / `123e7761265dc753ceb42f52ed8e0b7c8d7796a3f6ff6b5510e66610846274b6` |

## Acceptance-criteria mapping

| Criterion                                                                                  | Current evidence                                       | Satisfied now? |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------ | -------------- |
| Initial Shadow Mode scope explicitly excludes RAG and related services                     | Product decision and proposed configuration artifact   | `Yes`          |
| Canonical agent, intent, and capability exclusions are exact, versioned, and wildcard-free | Accepted manifests in the immutable snapshots          | `Yes`          |
| Missing/conflicting configuration and fallback paths fail closed                           | Configuration artifact `v1.0`                          | `Yes`          |
| RAG Architecture owner records an explicit joint-review outcome                            | Owner outcome is `Approved`                            | `Yes`          |
| Decision date is supplied                                                                  | `2026-09-25`                                           | `Yes`          |
| Immutable completed-decision reference exists                                              | Awaiting the commit containing this completed decision | `No`           |

## Owner completion

- Decision outcome: **Approved**
- Decision date: **2026-09-25**
- Conditions: **RAG remains excluded from Initial Shadow Mode; all fail-closed controls and review requirements remain mandatory.**
- Owner decision statement: **Initial Shadow Mode will operate with RAG excluded. The accepted canonical agent, intent, and capability exclusion manifests, together with the approved Shadow RAG-disablement configuration baseline, define the reduced Shadow scope. No RAG capability may be re-enabled without a new explicit governance decision and approved configuration change.**
- Immutable repository reference after completion: **Owner Input Required**

The owner decision is recorded. This evidence remains `Missing / Not Reviewed` until the immutable commit containing this completed decision is linked.
