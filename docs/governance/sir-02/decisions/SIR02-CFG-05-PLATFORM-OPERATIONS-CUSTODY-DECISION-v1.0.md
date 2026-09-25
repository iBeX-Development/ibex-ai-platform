# SIR02-CFG-05 — Platform Operations Custody and Ownership Decision v1.0

## Decision record

| Field                                      | Value                                                               |
| ------------------------------------------ | ------------------------------------------------------------------- |
| Evidence ID                                | `SIR02-CFG-05`                                                      |
| Document                                   | `SIR02-CFG-05 — Platform Operations Custody and Ownership Decision` |
| Version                                    | `v1.0`                                                              |
| Record status                              | `Owner Decision Recorded — Evidence Incomplete`                     |
| Current evidence status                    | `Missing / Not Reviewed`                                            |
| Platform Operations owner                  | **GANTUMUR Erdenedalai — Founder / Administrator**                  |
| Reviewer                                   | **SODBILEG Erkhembayar — Administrator**                            |
| Custody/ownership decision                 | `Approved`                                                          |
| Accountable operational owner/managed team | **GANTUMUR Erdenedalai — Founder / Administrator**                  |
| Environment scope                          | `Shadow`                                                            |
| Configuration integrity responsibility     | Accepted by Platform Operations owner                               |
| Drift-detection responsibility             | Accepted by Platform Operations owner                               |
| Change-control responsibility              | Accepted by Platform Operations owner                               |
| Secret/configuration-management ownership  | `Owner Input Required — accountable secret-management owner`        |
| Decision date                              | `2026-09-25`                                                        |
| Operating conditions                       | Owner-approved conditions below                                     |
| Immutable owner-decision reference         | `333daeeaf0579c48f5fc9aac3d300c6f0117ac9b`                          |

## Required custody and control scope

The Platform Operations owner decision must explicitly accept, reject, or defer operational custody and define:

- the accountable operational owner or managed team;
- the exact environment scope covered by the decision;
- responsibility for configuration integrity and checksum verification;
- responsibility for detecting, reporting, and remediating configuration drift;
- responsibility for versioned change control, review, approval, and rollback coordination;
- ownership of secret and configuration management, including approved external secret-manager integration when required;
- monitoring and evidence obligations for configuration state and unauthorized change attempts;
- escalation and fail-safe handling for missing, conflicting, incomplete, unavailable, or expired configuration.

## Owner decision statement

> Platform Operations accepts operational custody and change-control responsibility for the proposed Shadow configuration baseline. Configuration integrity, drift control, versioned change management, and environment configuration governance remain mandatory.

## Owner-approved conditions

> Secret and configuration material must remain externally managed through approved mechanisms. .env.example and untracked local .env files are not authoritative operational configuration. Missing, conflicting, or incomplete configuration must fail closed. This decision does not authorize deployment, activation, credential creation, traffic enablement, or production use.

## Mandatory control conditions

- `.env.example` is illustrative and is not authoritative runtime configuration.
- Untracked local `.env` files are not governance evidence.
- Missing, conflicting, incomplete, unavailable, or expired configuration denies and fails closed.
- Any configuration change requires a new version, integrity evidence, change review, and approval.
- This record does not authorize deployment, Shadow activation, credential creation, secret changes, traffic enablement, ingestion, RAG, storage access, or production use.
- Any future activation requires a separate authorized deployment and change process.

## Supporting immutable evidence

- Platform Operations evidence assessment: `87d5c23144357d7036cd68d92a1dc314f5f7f21c`
- Product configuration approval: `df112abde861a908fd5838ba10dad54e96053b65`
- Accepted Product review: `4b7fcb77343f5009f5b521f6d580ab6088d3c9f4`
- Proposed Shadow disablement configuration: `52e437f053cdca25492410cecbd182ebc19a4afd`
- Typed configuration and fail-closed feature controls: `e579a00e6c3ac8df0a0efbc4437f047caaec5ba2`
- External secret-provider abstraction: `1bc863768062a267e1d21583ed453a41b765bc9e`

## Acceptance-criteria mapping

| Criterion                                                                     | Current evidence                                  | Satisfied now? |
| ----------------------------------------------------------------------------- | ------------------------------------------------- | -------------- |
| Versioned Platform Operations custody record exists                           | This `v1.0` record                                | `Yes`          |
| Required integrity, drift, change, secret, and fail-closed duties are defined | Required scope and mandatory conditions above     | `Yes`          |
| No activation or operational authority is implied                             | Mandatory control conditions above                | `Yes`          |
| Owner supplies explicit custody/ownership decision                            | `Approved`                                        | `Yes`          |
| Accountable owner/team and environment scope are supplied                     | Named owner; `Shadow`                             | `Yes`          |
| Integrity, drift, change-control, and secret-management duties are assigned   | Operational duties accepted; secret owner unnamed | `No`           |
| Decision date and operating conditions are supplied                           | `2026-09-25`; owner-approved conditions           | `Yes`          |
| Owner decision has an immutable repository reference                          | `333daeeaf0579c48f5fc9aac3d300c6f0117ac9b`        | `Yes`          |

## Owner completion

- Custody/ownership decision: **Approved**
- Accountable operational owner: **GANTUMUR Erdenedalai — Founder / Administrator**
- Environment scope: **Shadow**
- Configuration integrity responsibility: **Accepted by Platform Operations owner**
- Drift-detection responsibility: **Accepted by Platform Operations owner**
- Change-control responsibility: **Accepted by Platform Operations owner**
- Secret/configuration-management ownership: **Owner Input Required — accountable secret-management owner**
- Decision date: **2026-09-25**
- Operating conditions: **Owner-approved conditions recorded above**
- Immutable owner-decision reference: **`333daeeaf0579c48f5fc9aac3d300c6f0117ac9b`**

Evidence status remains `Missing / Not Reviewed` until the accountable secret-management owner is supplied. A later linkage/status commit does not make the incomplete decision acceptable.
