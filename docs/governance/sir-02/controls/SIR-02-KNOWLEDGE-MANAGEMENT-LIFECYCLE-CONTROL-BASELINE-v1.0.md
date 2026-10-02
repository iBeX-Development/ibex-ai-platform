# SIR-02 Knowledge Management Lifecycle-Control Baseline

> Historical lifecycle-control snapshot: created at `48407614af13e8f8239a9e63454c013dc43e432b`, recorded approval at `c48a40d58c9235621ace82ad0c6440f69b8f2ad5`, and linked through `9f9ab7b94f669581ef107aefddc2f10dff4b7516`. `Approved / Not Operationalized` is the recorded baseline status, not independently authenticated personal approval or operational activation. The required operational-evidence package and immutable reference remain absent; `SIR02-DEF-02` stays `Missing / Not Reviewed`. Ingestion and Shadow remain inactive.

## Document control

| Field                          | Value                                                    |
| ------------------------------ | -------------------------------------------------------- |
| Document title                 | `SIR-02 Knowledge Management Lifecycle-Control Baseline` |
| Version                        | `v1.0`                                                   |
| Status                         | `Approved / Not Operationalized`                         |
| Owner                          | **GANTUMUR Erdenedalai — Founder / Administrator**       |
| Reviewer                       | **SODBILEG Erkhembayar — Administrator**                 |
| Environment scope              | `Shadow`                                                 |
| Decision date                  | `2026-09-25`                                             |
| Approval status                | `Approved`                                               |
| Immutable baseline reference   | `48407614af13e8f8239a9e63454c013dc43e432b`               |
| Immutable approval reference   | `c48a40d58c9235621ace82ad0c6440f69b8f2ad5`               |
| Operational-evidence reference | `Not Available — evidence must be produced and reviewed` |

This baseline defines governance and readiness controls only. It does not authorize or activate document ingestion, parsing, chunking, embeddings, indexing, vector storage, retrieval, RAG, credentials, deployment, traffic, or production use.

## Formal governance approval

**Approval statement:**

> The SIR-02 Knowledge Management Lifecycle-Control Baseline v1.0 is formally approved as the governance control baseline required before any future reopening of document ingestion or related RAG knowledge-processing activities.

**Approval conditions:**

- The baseline remains non-operational until all required operational evidence is produced and independently reviewed.
- Approval does not authorize ingestion, RAG, embeddings, indexing, vector-store population, retrieval, deployment, Shadow activation, or production use.
- No automatic reopening is permitted.
- Any future reopening requires the required operational evidence plus separate explicit governance approval.
- Changes to the baseline require a new version and separate approval.

## Purpose and authority boundary

This document is the approved, non-operational lifecycle-control reference required by `SIR02-DEF-02`. It governs the full knowledge-source lifecycle that must be operationally evidenced before SIR-09 ingestion may be considered for reopening.

The following approved architecture remains authoritative:

- `docs/baseline/01-master-ai-policy-v1.0.md`
- `docs/baseline/02-tenant-security-contract-v1.0.md`
- `docs/baseline/06-rag-architecture-v1.0.md`
- `docs/baseline/08-audit-observability-architecture-v1.0.md`
- `docs/baseline/15-implementation-readiness-review-v1.0.md`
- `docs/baseline/16-technical-design-v1.0.md`
- `docs/baseline/17-implementation-plan-v1.0.md`

Related SIR-02 governance evidence:

- `docs/governance/sir-02/decisions/SIR02-DEF-02-KNOWLEDGE-MANAGEMENT-DEPENDENCY-READINESS-DECISION-v1.0.md`
- `docs/governance/sir-02/decisions/SIR02-DEF-01-KNOWLEDGE-MANAGEMENT-INGESTION-DEFERRAL-ACCEPTANCE-v1.0.md`
- `docs/governance/sir-02/decisions/SIR02-DEF-03-KNOWLEDGE-MANAGEMENT-REVIEW-EXPIRY-ACCEPTANCE-v1.0.md`
- `docs/governance/sir-02/configuration/SIR-02-SHADOW-RAG-DISABLEMENT-v1.0.json`

This baseline cannot override those documents. A conflict, missing control, or missing evidence fails closed and keeps ingestion disabled.

## Mandatory control principles

1. Knowledge must never cross tenant boundaries.
2. Ingestion remains disabled until an explicit reopening decision and all required approvals are recorded.
3. Review, expiry, elapsed time, fallback, or configuration absence cannot reopen ingestion automatically.
4. Wildcards, broad allow rules, implicit inheritance, and caller supplied scope cannot approve a source.
5. Missing or conflicting owner, provenance, version, approval, classification, permission, or tenant binding denies source use.
6. Superseded, withdrawn, rejected, expired, stale, or quarantined content cannot remain active knowledge.
7. Every future ingestion and re-index operation must trace to an approved source and exact version.
8. No unapproved document, chunk, embedding, index, vector, cache, retrieval, or equivalent knowledge artifact may be created or retained.
9. Tenant and permission checks occur before any source processing, semantic search, or content exposure.
10. Future RAG use requires separate approved RAG, security, data-governance, configuration, deployment, and operational controls.

## Canonical source record

Every source proposed for future onboarding must have a server-controlled, versioned record containing at least:

- canonical `source_id` with no wildcard value;
- exact `source_version`;
- source title and type;
- accountable source owner;
- trusted tenant binding and permitted knowledge scope;
- classification and access scope;
- approval status and approving authority;
- provenance and authoritative origin reference;
- immutable content checksum;
- effective date and, when governed, expiry date;
- revision, supersession, withdrawal, retention, and deletion state;
- created, reviewed, approved, changed, and reconciled timestamps;
- request, correlation, trace, and audit references for lifecycle events.

Missing or inconsistent mandatory fields cause rejection or quarantine. User supplied or document supplied metadata cannot replace trusted ownership, tenant, authorization, or approval evidence.

## Lifecycle states and transitions

Allowed governance states are:

```text
Registered → Under Review → Approved → Active
                     ├──→ Rejected
Active → Superseded → Archived / Deleted under approved policy
Active → Stale / Quarantined → Reviewed → Active or Withdrawn
Any non-deleted state → Withdrawn → Archived / Deleted under approved policy
```

Only an exact source version in `Approved` and, after authorized operationalization, `Active` state may become eligible for ingestion. State changes require an authorized server-side transition, immutable audit evidence, and reconciliation of derived artifacts. AI, retrieved content, user prompts, fallback logic, and expiry timers cannot approve a source or change lifecycle state.

## Control domains

### 1. Source registration and ownership

- Register each source with a unique canonical ID and exact version.
- Bind the source to one accountable owner and a trusted tenant or explicitly approved global scope.
- Verify ownership through an authoritative server-side process before review.
- Reject wildcard tenant, owner, source, domain, agent, or knowledge-scope values.
- Fail closed when ownership or tenant binding is absent, conflicting, or unverified.

### 2. Source approval and rejection

- An authorized human governance role must approve or reject each exact source version.
- Approval must record approver identity, authority, decision, conditions, date, source checksum, and audit correlation.
- Approval of one version does not approve another version or a source family.
- Rejected content cannot proceed to parsing, embedding, indexing, storage, or retrieval preparation.
- AI cannot approve, impersonate an approver, or mutate approval state.

### 3. Version control and revision handling

- Every content change creates a distinct source version and checksum.
- A revision must preserve linkage to its predecessor and record the change reason.
- Material or content changes require a new review and approval; approval is never inherited silently.
- Processing and retrieval evidence must identify the exact approved source version.
- Version ambiguity, checksum mismatch, or missing history causes quarantine and blocks processing.

### 4. Provenance and traceability

- Preserve authoritative origin, custody history, source owner, tenant, version, checksum, approvals, and lifecycle events.
- Trace every future derived artifact to the exact approved source/version and processing operation.
- Preserve request, correlation, trace, actor, timestamp, and outcome evidence through the normalized audit pipeline.
- Raw confidential content, credentials, secrets, and chain-of-thought must not be placed in governance or telemetry evidence.

### 5. Supersession

- Approval of a replacement must explicitly identify every superseded version.
- A superseded version becomes ineligible for active ingestion and default retrieval.
- Derived artifacts for superseded content must be quarantined, removed, or made inaccessible according to approved reconciliation and retention controls.
- Retrieval must fail closed if both predecessor and replacement appear active without an approved coexistence rule.

### 6. Stale-content identification and quarantine

- Staleness signals include expired review, revoked ownership, changed authoritative source, checksum conflict, unresolved reconciliation, or superseding version.
- Stale content and its derived artifacts must be quarantined from active knowledge use pending authorized review.
- Quarantine cannot be bypassed by fallback, cache, agent, tenant, role, entitlement, or caller input.
- Restoration requires exact-version revalidation and explicit approval.

### 7. Retention, deletion, and withdrawal

- Content retention periods, legal holds, deletion timelines, and residual audit-metadata retention require separately approved data-governance policy; this baseline does not invent numeric periods.
- Withdrawal immediately removes the source and its derived artifacts from eligibility for active processing or retrieval.
- Deletion must propagate to document, chunk, embedding, index, vector, cache, and retrieval-preparation artifacts while preserving only approved minimum audit metadata.
- Deletion completion and exceptions require reconciled, immutable evidence.
- Missing retention or deletion authority fails closed and prevents reopening.

### 8. Source reconciliation

- Reconcile the authoritative source inventory against lifecycle records and all derived-artifact inventories.
- Detect orphaned, duplicate, missing, stale, superseded, withdrawn, cross-tenant, and checksum-mismatched records.
- Block source use while discrepancies remain unresolved.
- Record reconciliation scope, counts, exceptions, resolution, tenant binding, and audit correlation.

### 9. Re-ingestion and re-indexing

- Re-ingestion or re-indexing requires an approved exact source/version, valid ownership and tenant binding, current authorization, and an authorized operation record.
- Changed content requires a new version, checksum, review, and approval before processing.
- Retry is allowed only under an approved idempotent operation contract and must not create duplicate artifacts.
- No operation may reuse stale, revoked, superseded, withdrawn, or mismatched approval evidence.
- Operation results must reconcile all resulting artifacts to the authorized source/version.

### 10. Duplicate and conflict handling

- Detect duplicates using canonical identity, version, checksum, authoritative origin, and tenant scope.
- Exact duplicates must not create additional active artifacts.
- Conflicting sources, versions, ownership, tenant scope, approval state, or content hashes are quarantined for human resolution.
- Source trust and approval policy, rather than similarity or recency alone, determines the accepted source.
- A conflict cannot be resolved by AI inference, fallback, or silent precedence.

### 11. Tenant isolation and authorization

- Tenant context must come from the trusted Core or AI Gateway boundary and cannot be overridden by source content or caller input.
- Source registration, review, approval, processing, reconciliation, and retrieval preparation must enforce server-side tenant, permission, entitlement, ownership, and access-scope checks.
- Global knowledge requires explicit global classification and approval; absent evidence never implies global access.
- Cross-tenant source, metadata, document, chunk, embedding, index, vector, cache, or retrieval sharing is prohibited.
- Authorization denial, tenant mismatch, or unavailable authority is non-retriable and fails closed.

### 12. Controlled source onboarding

Before a source can be operationally onboarded, all of the following must exist and pass review:

- exact registered source/version and checksum;
- verified source owner and tenant binding;
- classification, scope, and authorization mapping;
- explicit human approval for the exact version;
- provenance and lifecycle metadata;
- security and file validation requirements;
- approved retention, deletion, supersession, and reconciliation rules;
- enabled infrastructure and configuration through a separately authorized change;
- operational evidence package defined below;
- successful audit reconstruction and fail-closed negative tests.

No onboarding step is authorized while SIR-09 remains deferred.

## Reopening prerequisites after SIR-09 deferral

Ingestion remains disabled unless all prerequisites below are satisfied:

1. This lifecycle-control baseline is formally approved with a decision date and immutable approval reference.
2. The complete operational-evidence package is produced, reviewed, and approved.
3. SIR-09 deferral is reopened through an explicit governance decision; review or expiry alone is insufficient.
4. RAG Architecture, Security, Data Governance, Knowledge Management, Platform Operations, and required Product owners approve their respective boundaries.
5. Exact tenant, user, role, agent, source, and capability allowlists are approved without wildcards.
6. Production-like infrastructure, source connectors, parsing, malware controls, embedding, indexing, vector-store, retention, deletion, and reconciliation decisions are approved when in scope.
7. Tenant isolation, permission, authorization, ownership, prompt-injection, integrity, deletion, rollback, and audit reconstruction tests pass.
8. A new versioned configuration explicitly enables only the approved scope through an authorized deployment and change process.
9. Health, alerting, incident ownership, rollback, and stop controls are operationally evidenced.
10. No unresolved Critical or High security, privacy, data-governance, or lifecycle finding remains.

Failure of any prerequisite keeps ingestion, embedding, indexing, vector storage, retrieval preparation, and RAG disabled.

## Required operational-evidence package

The following evidence must be produced from an approved deterministic or production-like test environment. This document defines the evidence; it does not assert that any item exists.

| Evidence item                          | Minimum required evidence                                                                                                               | Acceptance condition                                                                                                    |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Approved source registration sample    | Canonical source ID/version, checksum, classification, status, timestamps, and immutable record reference                               | Exact, versioned, non-wildcard record is complete and reconstructable                                                   |
| Source owner and tenant binding        | Authoritative owner evidence plus trusted tenant or explicitly approved global binding                                                  | Owner and scope are server verified; cross-tenant substitution fails                                                    |
| Source approval record                 | Human approver identity/authority, exact source/version/checksum, outcome, conditions, date, and audit reference                        | Approval is valid for one exact version and cannot be supplied or altered by AI/caller                                  |
| Source version identifier              | Version lineage, predecessor linkage, content checksum, and change reason                                                               | Version history is complete; mismatch or ambiguity fails closed                                                         |
| Provenance trace                       | Origin, custody, owner, tenant, version, checksum, approvals, processing links, and audit correlation                                   | End-to-end source-to-artifact reconstruction succeeds without prohibited content                                        |
| Supersession test                      | Approved replacement, predecessor transition, derived-artifact reconciliation, and retrieval exclusion evidence                         | Superseded content and artifacts cannot remain active or retrievable                                                    |
| Stale-content handling test            | Staleness trigger, quarantine, denial, review, and permitted resolution evidence                                                        | Stale/quarantined content is unavailable and cannot be restored without approval                                        |
| Retention/deletion test                | Approved policy reference, withdrawal/deletion request, propagation across derived artifacts, exceptions, and completion reconciliation | Active access ends; deletion propagates; only policy-approved audit metadata remains                                    |
| Reconciliation test                    | Authoritative inventory comparison, discrepancy detection, resolution, and final reconciled counts                                      | Orphan, duplicate, mismatch, stale, withdrawn, and cross-tenant cases are detected and blocked                          |
| Permission and tenant-isolation test   | Positive authorized case plus cross-tenant, unauthorized role, missing entitlement, ownership mismatch, and scope-spoofing negatives    | Only the exact authorized tenant/scope succeeds; every negative case fails closed before processing                     |
| Missing-evidence fail-closed test      | Separate cases for missing approval, version, provenance, owner, tenant binding, checksum, and conflicting metadata                     | Each case creates no derived artifact and emits a sanitized denial/audit outcome                                        |
| Lifecycle audit evidence               | Normalized events for registration, review, approval/rejection, revision, supersession, quarantine, reconciliation, withdrawal/deletion | Events preserve trusted tenant/request/correlation/trace, actor, source/version, status, timestamp, and outcome binding |
| Duplicate/conflict test                | Exact duplicate, divergent duplicate, ownership conflict, version conflict, and tenant conflict cases                                   | No duplicate artifacts are created; every unresolved conflict is quarantined                                            |
| Re-ingestion/re-index idempotency test | Authorized exact-version operation, repeat attempt, changed-version attempt, and interrupted-operation recovery                         | Repeat is safe under an approved contract; unauthorized or stale operations create no artifact                          |
| Controlled reopening test              | All prerequisite evidence, explicit reopening approval, approved configuration, direct-boundary controls, rollback, and audit trail     | Enablement occurs only through the approved change path; missing or conflicting prerequisite keeps every boundary off   |

Each evidence record must include an evidence ID, version, environment, trusted tenant/test scope, owner, reviewer, execution timestamp, immutable artifact or run reference, request/correlation/trace identifiers, expected result, observed result, pass/fail outcome, exceptions, and linked normalized audit evidence. Raw confidential content, secrets, credentials, and chain-of-thought are prohibited.

## Acceptance criteria for formal baseline approval

This baseline is approval-ready only when:

- owner and reviewer confirm the complete control scope;
- `Approval status` and `Decision date` are supplied;
- an immutable repository approval reference is recorded;
- no requirement conflicts with the approved Phase 0–10 or SIR-02 baselines;
- retention/deletion policies and future operational technology choices remain explicitly blocked where unapproved;
- the baseline remains `Not Operationalized` until separate operational evidence and reopening approvals exist.

Formal approval of this document satisfies only the lifecycle-control-reference portion of `SIR02-DEF-02`. It does not satisfy the operational-evidence-reference portion and must not move `SIR02-DEF-02` from `Missing` by itself.

## Change control

Any change to a control, scope, prerequisite, lifecycle state, evidence requirement, tenant rule, authorization rule, or reopening condition requires:

1. a new document version;
2. recorded rationale and change history;
3. owner and reviewer approval;
4. an immutable repository reference;
5. reassessment of dependent SIR-02 and SIR-09 evidence.

No edit to this document authorizes runtime or configuration change.
