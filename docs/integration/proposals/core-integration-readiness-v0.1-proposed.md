# Core Integration Readiness Matrix v0.1 — PROPOSED

Status: **PLANNING ONLY; NO APPROVAL OR INTEGRATION ACTIVATION.**
Companion to [Core Integration Contract v0.1 — PROPOSED](core-integration-contract-v0.1-proposed.md),
prepared 2026-10-15 against inspected development commit
`ad743b3438df36d1ba2accbde9723072976ee676`, not a newly owner-approved baseline.
The supplied baseline set is complete according to the owner. Missing operational
details below are decisions or future implementation evidence, not requests to
resubmit existing Core documentation. No tests were executed for this package.

## 1. Evidence interpretation

The approved baselines establish logical requirements, not deployed handlers or
working Core integration. Document 15 §20 TD-02/03/04 (lines 703–742) requires
trusted identity, concrete tool inventory and actual API mapping. Document 16 §19
(lines 640–661) calls tool names conceptual; §69 TD-09 and §70 (1923–1943) leave
authentication and read endpoints to resolve; §75 (2065–2088) requests implementation
specifications. Document 17 §10 (432–444) lists endpoint classes, not deployed Core
routes. The contract's R01–R10 table provides exact file links and requirement
traceability. Gate identifiers from documents 15 and 16 are different namespaces.

Statuses used here: **REQUIRED** = existing logical obligation; **PROPOSED** = new
design choice awaiting agreement; **UNVERIFIED** = absent real implementation or
environment evidence. None means implementation complete, test PASS, human
governance approval or release readiness. Prior synthetic tests in the repository
do not establish a working Core connection for these proposed interfaces.

The current source boundary is separate from the logical baseline: preserve
[Tool Runtime contracts](../../../packages/tool-runtime/src/contracts.ts),
[service behavior](../../../packages/tool-runtime/src/service.ts),
[adapter invocation](../../../packages/tool-runtime/src/adapters.ts) and
[PlatformError](../../../packages/errors/src/index.ts). Registry version `3.0`,
error model `ibex.tool-error.v1`, resource-ownership precheck with
`ownership_validation: 'resource'` and `resource_reference`, feature/environment
gates, rate admission and approved live-tool allowlist remain mandatory. Signed
delegation cannot bypass them. No runtime interface expansion is authorized.

## 2. Four-agent capability-to-operation map

Every row maps conceptual scope to operation categories only. **All actual deployed
routes, handler identities, service identities and permission/entitlement codes are
UNVERIFIED.** The single candidate route in the companion contract is newly
proposed; no route is inferred from this table. Capability classes are not actual
permission strings. Each future operation needs its own field and resource policy.

| Pilot agent  | Conceptual capability and Core operation category                                                                                                                     | Boundary / precise baseline reference                                                                                                                                                                                                                                                                                                                        |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| General iBeX | Authorized user-context, system/navigation metadata; permitted record search and summary, including own-task lookup                                                   | [11 §§6.1, 11.1, 12](../../baseline/11-general-ibex-agent-specification-v1.0.md), lines 174–269 and 448–520; [05 §32.1](../../baseline/05-tool-api-contract-v1.0.md), 824–831. Knowledge explanation uses approved RAG, routing is platform behavior, and domain operations route to specialized agents. No broad cross-tenant search.                       |
| Maintenance  | Work Order/Work Request get and search; maintenance/failure history; assignment, checklist, execution status and material-requirement reads; authorized Asset context | [12 §§13–14, 37](../../baseline/12-maintenance-agent-specification-v1.0.md), 392–464 and 1043–1059; [16 §37](../../baseline/16-technical-design-v1.0.md), 1093–1119. Draft request/update/note proposals are separate later contracts, not writes or approvals in this slice. Core owns permission and workflow rules.                                       |
| Asset        | Exact-ID lookup (only proposed first slice), search, hierarchy/parent/child, location, related WO/PM/inspection/parts reads and authorized context composition        | [13 §§6.1, 7, 14, 21](../../baseline/13-asset-agent-specification-v1.0.md), 166–231, 413–429, 599–616; [16 §38](../../baseline/16-technical-design-v1.0.md), 1123–1143. Manuals use RAG; related maintenance uses approved domain tools. Conceptual PdM/Datahub context does not authorize prediction or prove an available source. No master-data mutation. |
| Warehouse    | Warehouse/part lookup, stock balances/status, receipt/issue reads, WO material requirements, Asset-part relationship reads                                            | [14 §§14–16, 36](../../baseline/14-warehouse-agent-specification-v1.0.md), 395–478 and 1061–1098; [16 §39](../../baseline/16-technical-design-v1.0.md), 1147–1163. Recommendation is not a stock transaction; issue draft is a separate controlled phase. No quantity adjustment or autonomous issue/receipt.                                                |

This map does not reorder the approved pilot rollout or assert every conceptual
capability belongs in the first integration increment. The Asset exact-ID lookup
is a proposed contract-validation slice, not a replacement general implementation
plan or a declaration that other agents are complete.

## 3. Readiness and pending decision register

The responsibility column identifies proposed review roles, not assigned people,
existing service accounts or recorded signoffs. Every decision below is **OPEN**.

| Decision                                 | Required / proposed / unverified separation                                                                                                                                                                                                                                                                             | Offline work possible after agreement                                                                                                                              | Core/environment work and evidence required                                                                                                                                                                                                                                      | Proposed review responsibility                                 |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| D01 Scope and registry binding           | REQUIRED: approved READ boundary and concrete metadata (R02/R03/R08). PROPOSED: `asset.asset.get.v1`, version `0.1.0-proposed`, exact-ID-only slice. UNVERIFIED: any approved/active mapping.                                                                                                                           | Draft schemas, registry descriptor and disabled adapter interface; no live enablement.                                                                             | Agree binding/version lifecycle, classification and capability allowlist; confirm a concrete read operation.                                                                                                                                                                     | Platform owner and Core integration owner                      |
| D02 Identity transport                   | REQUIRED: trusted immutable context, existing runtime prechecks and Core final authorization (R01/R03/R06). PROPOSED: authenticated TLS plus short-lived signed delegation, possible mutual TLS. UNVERIFIED: Core auth/correlation compatibility.                                                                       | Validator fixtures for issuer/audience/expiry/session/tenant binding and rejection paths, within existing interfaces.                                              | Agree authentication and correlation mapping, claim/header encoding, key lifecycle, freshness/revocation/replay controls and service authentication. Adapter invocation has only context/tool/input/signal, not separate trace_id/tool_call_id; no expansion is authorized here. | Core identity/security and platform security                   |
| D03 Asset identifier and business fields | REQUIRED: strict minimal schema and no guessed identity (R07/R08). PROPOSED: `asset_id` only, exact ASCII identifier 1–128 characters; no business status. UNVERIFIED: actual Core ID type and useful authorized field set.                                                                                             | Schema tests using clearly synthetic IDs.                                                                                                                          | Agree canonical ID rules and allowed business fields; implement a projection enforcing Core field permissions. Decide whether ID-only lookup is sufficiently useful before extending it.                                                                                         | Core Asset/domain owner and platform owner                     |
| D04 Permissions and ownership            | REQUIRED: runtime resource-ownership precheck plus Core final permission, entitlement, tenant, resource and field checks (R03/R06). PROPOSED: unavailable mapping disables binding. UNVERIFIED: real permission codes, resolver authority and Core enforcement.                                                         | Deny-by-default fixtures for ownership_validation: resource and resource_reference mapping; no claimed real code mapping.                                          | Agree resource type/ID mapping and authoritative ownership resolver, actual permission codes and field policy; preserve precheck and implement independent Core checks; prove A cannot access B, including same-ID collisions.                                                   | Core authorization/security and Asset owner                    |
| D05 Endpoint and infrastructure          | REQUIRED: controlled API, no direct DB/unrestricted HTTP (R02/R05). PROPOSED: `GET /integration/ai/v1/assets/{asset_id}`. UNVERIFIED: route, handler, base URL, network, certificates and service identity.                                                                                                             | Fixed-route adapter against a local fixture transport.                                                                                                             | Implement or agree an equivalent mapped handler; provision approved development environment, destination allowlist and least-privilege service access through the normal process.                                                                                                | Core API and infrastructure owners                             |
| D06 Response and failure mapping         | REQUIRED: strict existing ToolAdapterResult and ToolExecutionResponse v1.0 plus PlatformError behavior. PROPOSED: ID-only Core wire body mapped to output/object source/observed_at, 16 KiB cap; integration failure categories are not new runtime codes. UNVERIFIED: Core response/status and provenance conventions. | Parser/sanitizer fixtures preserving INVALID_RESPONSE for invalid_response and TIMEOUT_ERROR for cancellation; no data/string-source/warnings/error-return branch. | Agree Core wire/status mapping, source.reference policy and non-disclosure. Any facade labels/schema/version require explicit separate agreement; CANCELLED, UPSTREAM_CONTRACT_ERROR and AUDIT_UNAVAILABLE do not replace runtime codes.                                         | Core API/security and platform owner                           |
| D07 Deadlines and capacity               | REQUIRED: timeout policy and truthful cancellation/failure handling (R07). PROPOSED: 2 s Core attempt, 3 s adapter deadline, one attempt/no retries. UNVERIFIED: achievable latency, cancellation behavior and rate policy.                                                                                             | Fake-clock, cancellation and late-response cases; these do not measure Core.                                                                                       | Agree deadline allocation and tenant/user/service rate limits; integrate cancellation; measure real latency/overload and observe late work. Review composition with existing runtime waits.                                                                                      | Platform runtime and Core operations                           |
| D08 Audit and correlation                | REQUIRED: trusted linked events, protected audit data and existing runtime failure handling (R09). PROPOSED: start/outcome acknowledgement policy; not a new AUDIT_UNAVAILABLE runtime code. UNVERIFIED: durable sink, Core propagation mapping and operational failure policy.                                         | Existing event-schema/sanitization fixtures and bounded-failure simulation; retain current adapter invocation fields.                                              | Agree event identifiers/version, metadata minimization, cross-service correlation mapping, storage/retention/access and durability/ack semantics. Current awaited audit emission alone proves neither durability nor a global deadline. No audit finding is closed by a mock.    | Audit/security and Core/platform owners                        |
| D09 Integration acceptance               | REQUIRED: real development integration plus security/evaluation gates (R10). PROPOSED: planned two-tenant cases below. UNVERIFIED: executed Core results or signoff.                                                                                                                                                    | Implement offline suite once contract agreed, labeling outputs synthetic.                                                                                          | Execute against approved Core test environment with verified identities/policies; retain versions, actual results and reviewed evidence; follow existing release process.                                                                                                        | Core/platform QA, security and authorized governance reviewers |

No new credentials or permission configuration is included. No owner acceptance,
policy exception, deployment approval, route availability or test completion is
recorded in this proposal. A missing decision keeps the corresponding live binding
unavailable rather than filling the gap with an invented value.

## 4. Synthetic two-tenant contract/security test plan — NOT EXECUTED

Future synthetic population: tenants A and B, separate authorized users, a denied
user in each tenant, distinct Asset IDs plus a deliberately duplicated local ID
across tenants. These are fixture roles/labels, not real accounts. Core must still
prove isolation with actual approved development identities later. Assertions
below are intended checks, not measured results.

| Planned case                                          | Stimulus                                                                                     | Expected contract/security behavior                                                                                                                                                      | What a mock cannot prove                                                                                 |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| S01 Authorized lookup, A and B separately             | Correct trusted identity, mapped permission, same-tenant exact ID                            | Preserve ownership precheck and live-tool gates; map Core ID-only body to existing adapter result; runtime v1.0 success has output, object source, correlation_id, trace_id and attempts | Real Core permission/ownership enforcement, provenance/correlation mapping and actual route availability |
| S02 A requests B ID; B requests A ID                  | Valid caller with foreign identifier                                                         | No data, common sanitized resource-unavailable outcome; no foreign-tenant identifier/existence detail                                                                                    | Core resource filtering, status/timing non-disclosure                                                    |
| S03 Same ID exists in A and B                         | Identical textual ID, independently trusted tenant contexts                                  | Correct tenant-scoped resolution, no result reuse between tenants                                                                                                                        | Core storage/query scoping; no database inspection is authorized here                                    |
| S04 Permission/entitlement denial and unknown mapping | Same-tenant identity lacks required authorization                                            | Fail closed; platform rejection when mapping unknown; Core denial wins even if platform allowed                                                                                          | Actual codes, revocation/freshness and policy-engine behavior                                            |
| S05 Tenant/context tampering                          | Tenant/user/role/permissions in tool args, prompt, forged headers or tool result             | Strict argument rejection or ignored untrusted claims; trusted context never replaced; no unauthorized dispatch                                                                          | Real gateway/delegation authenticity                                                                     |
| S06 Invalid authentication                            | Wrong issuer/audience, expiry, altered binding, replayed assertion, missing context          | Denial before data; no default tenant or broad service privilege fallback                                                                                                                | Actual key management, replay store, clock and revocation controls                                       |
| S07 Input and identity ambiguity                      | Extra fields, empty/oversized ID, traversal/newline, guessed name instead of exact ID        | Reject invalid ID; resolve ambiguity explicitly; no model-chosen URL or DB access                                                                                                        | Fit of proposed ID rules to actual Core identifiers                                                      |
| S08 Invalid/overbroad Core response                   | Wrong ID, malformed JSON, extra business fields, wrong media type, oversize body or redirect | Discard data; invalid_response maps to existing INVALID_RESPONSE; no partial success or new error-return envelope                                                                        | Real response minimization, network allowlist enforcement                                                |
| S09 Correlation and audit                             | Missing/mismatched trusted request linkage; delayed/failed audit acknowledgement             | Reject mismatch; preserve current PlatformError/audit handling; withhold success on audit failure; no invented adapter trace/tool-call fields or AUDIT_UNAVAILABLE runtime code          | Agreed Core correlation mapping, end-to-end trace integrity, durable storage and operational retention   |
| S10 Deadline/cancellation                             | Cancel before dispatch, during read, during audit; response exactly at/after deadline        | Preserve TIMEOUT_ERROR for runtime cancellation and UPSTREAM_TIMEOUT for adapter timeout; no late success; proposed global wait budget requires separate implementation agreement        | Server-side cancellation effectiveness and actual latency envelope                                       |
| S11 Dependency/rate failure                           | Core unavailable, rate-limited or unexpected error body                                      | Sanitized typed error, no automatic retries, mock/cache fallback or fabricated Asset status                                                                                              | Real capacity, recovery behavior and configured limits                                                   |
| S12 Isolation beyond transport                        | Attempt reuse of A's result in B conversation/cache/model context                            | No cross-tenant reuse; no shared business cache in this slice; sensitive payload absent from logs                                                                                        | Real distributed cache/session/log authorization and retention                                           |
| S13 Read/action boundary                              | Request to update/create/delete asset, approve WO or change stock                            | Unsupported by this binding; no mutation route, workflow or approval inferred                                                                                                            | Actual absence of Core side effects, verified later in integration evidence                              |
| S14 Evidence honesty                                  | Synthetic success presented as live or missing result inferred as global absence             | Label fixture results synthetic; no live availability, health, quantity or transaction claim                                                                                             | Actual integration and business correctness; mocks cannot substitute                                     |

Traceability: S01–S08 map to R03/R05/R06/R07/R08; S09 to R09; S10–S11 to R07;
S12–S13 to R05/R06 and agent boundaries; all cases to R10 and document 17 §19 T4.
Tests must cover both tenant directions, correlate outcomes without leaking B to A,
and include negative assertions that no unauthorized dispatch or data release occurs.

## 5. Review sequence and acceptance evidence

1. Owner/Core/platform reviewers decide D01–D08; record proposed choices accepted,
   revised or rejected through the existing process. This document records none as
   accepted and does not create a new governance authority.
2. Once authorized, implement bounded offline schemas/adapter fixtures and the
   planned tests; retain synthetic classification and versioned results. Do not
   register a live route or fabricate prior operational evidence.
3. Core-side implementation and an approved development environment are necessary
   for real integration. Identify deployed operation, authenticated service/user
   context, permission/field mappings, audit behavior and test population before
   executing the real contract/security suite.
4. Record actual commit/contract/environment versions, cases executed, sanitized
   outcomes, correlation evidence, known limits and independent reviews. Decide
   D09 using real evidence and the existing release gates; a mock PASS cannot
   establish operational readiness or replace Core authorization evidence.

This proposed work follows, and does not change, document 17 §23's Local →
Development Integration → Test → later controlled rollout sequence. Production,
actions, human governance approval and existing finding closure remain outside
this drafting package.
