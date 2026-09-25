# SIR02-CFG-05 — Platform Operations Custody and Ownership Decision v1.0

## Decision record

| Field                                      | Value                                                               |
| ------------------------------------------ | ------------------------------------------------------------------- |
| Evidence ID                                | `SIR02-CFG-05`                                                      |
| Document                                   | `SIR02-CFG-05 — Platform Operations Custody and Ownership Decision` |
| Version                                    | `v1.0`                                                              |
| Record status                              | `Owner Input Required`                                              |
| Current evidence status                    | `Missing / Not Reviewed`                                            |
| Platform Operations owner                  | **GANTUMUR Erdenedalai — Founder / Administrator**                  |
| Reviewer                                   | **SODBILEG Erkhembayar — Administrator**                            |
| Custody/ownership decision                 | `Owner Input Required`                                              |
| Accountable operational owner/managed team | `Owner Input Required`                                              |
| Environment scope                          | `Owner Input Required`                                              |
| Configuration integrity responsibility     | `Owner Input Required`                                              |
| Drift-detection responsibility             | `Owner Input Required`                                              |
| Change-control responsibility              | `Owner Input Required`                                              |
| Secret/configuration-management ownership  | `Owner Input Required`                                              |
| Decision date                              | `Owner Input Required`                                              |
| Operating conditions                       | `Owner Input Required`                                              |
| Immutable repository reference             | `Owner Input Required — completed-decision commit`                  |

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

| Criterion                                                                     | Current evidence                                   | Satisfied now? |
| ----------------------------------------------------------------------------- | -------------------------------------------------- | -------------- |
| Versioned Platform Operations custody record exists                           | This `v1.0` record                                 | `Yes`          |
| Required integrity, drift, change, secret, and fail-closed duties are defined | Required scope and mandatory conditions above      | `Yes`          |
| No activation or operational authority is implied                             | Mandatory control conditions above                 | `Yes`          |
| Owner supplies explicit custody/ownership decision                            | `Owner Input Required`                             | `No`           |
| Accountable owner/team and environment scope are supplied                     | `Owner Input Required`                             | `No`           |
| Integrity, drift, change-control, and secret-management duties are assigned   | `Owner Input Required`                             | `No`           |
| Decision date and operating conditions are supplied                           | `Owner Input Required`                             | `No`           |
| Completed decision has an immutable repository reference                      | `Owner Input Required — completed-decision commit` | `No`           |

## Owner completion

- Custody/ownership decision (`Accepted`, `Rejected`, or `Deferred`): **Owner Input Required**
- Accountable operational owner or managed team: **Owner Input Required**
- Environment scope: **Owner Input Required**
- Configuration integrity responsibility: **Owner Input Required**
- Drift-detection responsibility: **Owner Input Required**
- Change-control responsibility: **Owner Input Required**
- Secret/configuration-management ownership: **Owner Input Required**
- Decision date: **Owner Input Required**
- Operating conditions: **Owner Input Required**
- Immutable repository reference after completion: **Owner Input Required**

Evidence status remains `Missing / Not Reviewed` until every mandatory owner field and the immutable completed-decision reference are supplied.
