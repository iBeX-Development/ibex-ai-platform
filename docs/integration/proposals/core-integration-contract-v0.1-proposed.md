# Core Integration Contract v0.1 — PROPOSED

Status: **PROPOSED; NOT APPROVED, IMPLEMENTED OR ACTIVATED BY THIS DOCUMENT.**
Prepared for owner review on 2026-10-15 against inspected development commit
`ad743b3438df36d1ba2accbde9723072976ee676`.

This is an implementation-contract proposal, not an amendment to the approved
architecture, implementation plan, security policy or release gates. No endpoint,
Core handler, service account, credential, network access, test execution or owner
signoff is established here. The owner has supplied all available documents; the
remaining items are decisions and implementation work, not requests for further
existing documentation. See [the readiness matrix](core-integration-readiness-v0.1-proposed.md).

## 1. Authority and traceability

All references below are to the unchanged files in `docs/baseline/`. Section
numbers are authoritative locators; line spans refer to the commit above.
**Required** means an existing logical baseline obligation. **Proposed** means a
new implementation choice requiring agreement. **Unverified** means no real Core
implementation/environment evidence is supplied, even if a local mock is possible.

| ID  | Approved requirement and precise source                                                                                                    | Contract consequence                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R01 | [15, §20 TD-02](../../baseline/15-implementation-readiness-review-v1.0.md), lines 703–717                                                  | Trusted authentication source, context format and propagation must be resolved; §3 proposes a transport approach.                                                                              |
| R02 | [15, §20 TD-03 and TD-04](../../baseline/15-implementation-readiness-review-v1.0.md), lines 721–742                                        | Freeze concrete tool metadata and map to real Core APIs; no direct database access. §2 is only a candidate binding.                                                                            |
| R03 | [16, §§17–21](../../baseline/16-technical-design-v1.0.md), lines 583–712; especially §19, line 661                                         | Registry-mediated validation and three authorization layers; conceptual names do not establish routes. Core remains final authorization authority.                                             |
| R04 | [16, §69 TD-09, §70, §75](../../baseline/16-technical-design-v1.0.md), lines 1923–1943 and 2065–2088                                       | Transport/authentication, read endpoints and interface specifications are implementation decisions. This draft does not mark their gates complete. TD numbering here differs from document 15. |
| R05 | [17, §10 Initial endpoint classes and §13](../../baseline/17-implementation-plan-v1.0.md), lines 432–457 and 608–685                       | Endpoint classes are not deployed Core routes. The model cannot select an arbitrary URL; read and action categories remain separate.                                                           |
| R06 | [02, §§3–7, 15–17, 36–38](../../baseline/02-tenant-security-contract-v1.0.md), lines 53–183, 364–441, 826–875                              | Immutable trusted tenant; per-resource ownership and permissions; least privilege, minimization, sanitized errors and fail closed.                                                             |
| R07 | [05, §§9–13, 18–22, 58–59](../../baseline/05-tool-api-contract-v1.0.md), lines 264–399, 516–626, 1369–1444                                 | Versioned schema, minimal output/provenance, bounded timeout policy, typed errors and audit; Core owns business authorization and records.                                                     |
| R08 | [13, §§6.1, 11–16, 21, 43, 52](../../baseline/13-asset-agent-specification-v1.0.md), lines 166–210, 330–490, 599–616, 1062–1072, 1343–1353 | Read-first Asset lookup, no guessed identity, field-level authorization, approved tools and grounded output.                                                                                   |
| R09 | [08, §§5–8, 12–13, 41](../../baseline/08-audit-observability-architecture-v1.0.md), lines 140–275, 365–428, 1116–1132                      | Trusted correlation, versioned audit, no full sensitive payload logging; audit failure needs an explicit strategy.                                                                             |
| R10 | [17, §19 T1–T4 and §23](../../baseline/17-implementation-plan-v1.0.md), lines 1019–1074 and 1198–1247                                      | Separate offline contract/security tests from real Core development integration and later rollout gates.                                                                                       |

## 2. Minimal read-only Asset slice — proposed binding

Use case: an already resolved, exact Asset ID is looked up in the current user's
authorized tenant scope. A successful result confirms only that the identifier was
returned by the authorized lookup. It does not establish availability, health,
maintenance condition, inventory quantity, transaction approval or execution.
Ambiguous names are outside this slice; ask for an identifier rather than guess.

| Item                            | Proposed value; none is an activated registry entry                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Conceptual capability           | `asset.get` from document 16 §19 and document 13 §14                                                                                                   |
| Concrete tool ID                | `asset.asset.get.v1`, adopting the naming example in document 05 §9 for this proposed binding                                                          |
| Tool contract version           | `0.1.0-proposed`; not an assertion of an existing runtime version                                                                                      |
| New candidate Core method/path  | `GET /integration/ai/v1/assets/{asset_id}`; **newly proposed, not known to exist or be deployed**                                                      |
| Authority/base URL/handler      | **UNVERIFIED / UNASSIGNED**; no hostname or handler name proposed as an existing fact                                                                  |
| Class and scope                 | READ, tenant-scoped, single record; no writes, search, pagination, joins, cache or action fallback in this slice                                       |
| Required permission/entitlement | **UNRESOLVED** Core codes and resource/field policy. No invented code and no empty-permission allow fallback; disable binding until explicitly mapped. |
| Approval                        | Read operation still requires authorization; it grants no action approval. No protected action capability is included.                                 |
| Audit and rate policy           | Audit required; tenant/user/service rate limits and data classification require agreement before activation.                                           |

The fixed path is built by server code from a validated, encoded identifier, never
from model-provided URL text. Reject redirects and unexpected media types; use an
explicit environment-specific destination allowlist once infrastructure is agreed.
The Core owner may implement this route or agree an equivalent versioned adapter
mapping. Neither possibility is represented as already implemented.

### Existing runtime constraints — preserved, not redesigned

The inspected [Tool Runtime contracts](../../../packages/tool-runtime/src/contracts.ts)
(`toolMetadataSchema`, `ToolRegistration`, `toolAdapterResultSchema`,
`toolExecutionResponseSchema`) and [service](../../../packages/tool-runtime/src/service.ts)
(`execute`, `invokeAdapter`) remain unchanged. Registration must retain
`registration_version: '3.0'`, `error_model: 'ibex.tool-error.v1'`, a valid rate-limit
reference, strict input/output schemas and all other required metadata. The
candidate tool version above is distinct from registration and response versions;
it neither registers a tool nor approves a new runtime contract.

For this exact-resource lookup, require `ownership_validation: 'resource'` and a
`resource_reference(validatedInput)` mapping to the agreed resource type and Asset
ID. Preserve the server-side ownership-resolver precheck before adapter execution,
as well as Core's independent final ownership/authorization check. The resolver's
real authority and resource-type mapping remain pending; neither an echoed ID nor
signed delegation substitutes for that precheck. Preserve platform/tools feature
gates, enabled/environment restrictions, authorization, rate admission, matching
adapter execution mode, and the approved live-tool allowlist for `live_core`.
This proposal enables none of them and does not downgrade ownership to tenant scope.

## 3. Trusted identity and Core authorization

**Required properties:** authenticate both the service caller and delegated end
user; preserve tenant/user/session binding; validate issuer, intended recipient,
expiry and integrity; prevent caller-supplied tenant/role/permission replacement;
retain least privilege and revocation/freshness checks. Missing, inconsistent or
unverifiable context must deny execution before Core dispatch. Identity alone is
not authorization. Core independently re-evaluates permission, entitlement,
resource ownership and field visibility for each lookup; gateway/platform allow
decisions cannot override a Core denial.

The logical context contains `tenant_id`, `user_id`, `role`, `permissions`,
`entitlements`, `session_id`, and `request_id` as required by document 02 §3.
Existing trusted context also carries `correlation_id`; the runtime request and
response carry `trace_id`. Baseline tool-call audit linkage is a requirement whose
concrete Core transport mapping remains pending.
These are not fields in the LLM tool argument schema. A prompt, document, tool
result, client header or browser claim cannot replace trusted context. Invalid
incoming correlation is rejected or replaced by a trusted server identifier with
an internal linkage record, never accepted as an authorization fact.

**Proposed transport approach:** authenticated TLS service-to-service transport,
with a short-lived signed, audience-restricted delegation assertion issued by a
trusted Core/Gateway authority after validating the user's session. Bind the
assertion to tenant, user, session, intended operation/resource and trusted correlation;
Core verifies it and rechecks current authorization. Use replay controls bound to
the invocation and reject expired or mismatched assertions. Do not forward a
browser credential or let the model create an assertion. Mutual TLS is a candidate
for service authentication, not a configured or confirmed capability.

Issuer, key discovery/rotation, audience, claim encoding, transport header names,
maximum lifetime/clock skew, replay-store behavior, revocation mechanism and Core
auth compatibility are **OPEN**. No token format, service identity or trust store
is activated here. If Core cannot support this approach, agree an equivalent
authenticated delegation design meeting the mandatory properties before coding
the real authentication adapter. Do not substitute unsigned context headers.

The existing [ToolAdapterRequest](../../../packages/tool-runtime/src/adapters.ts)
and `service.ts` invocation pass only `context`, `tool`, `input` and `signal`.
They do not pass separate `trace_id` or `tool_call_id` fields. Do not add such fields,
smuggle them into business arguments, or assume the adapter already receives them.
End-to-end trace/tool-call/delegation correlation needs an agreed interface mapping
within the existing boundaries or a separately authorized change; this document
authorizes no interface expansion. Core correlation compatibility is unverified.

## 4. Proposed data contract and examples

All examples are synthetic illustrations, not requests sent to Core or observed
Core responses. The one business field is the Asset identifier, justified by
document 05 §10 and document 13 §21. Its wire name and constraints are proposed.

Tool arguments, with no tenant or authorization fields:

```json
{ "asset_id": "synthetic-asset-a-001" }
```

Proposed strict request schema (also the minimum Core success-data schema):

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["asset_id"],
  "properties": {
    "asset_id": {
      "type": "string",
      "minLength": 1,
      "maxLength": 128,
      "pattern": "^[A-Za-z0-9_-]+(?![\\s\\S])"
    }
  }
}
```

The character set and 128-character limit are **proposed bounds**, not verified
Core identifier rules. Validate the entire string without coercion or trimming;
reject trailing newlines as well as delimiters/path traversal. Core ID type,
case-sensitivity, canonicalization and length require agreement. Do not invent
name, status, location, serial number or other business fields to fill that gap.

Candidate Core success body is exactly `{"asset_id":"synthetic-asset-a-001"}`.
It is accepted only from the configured authenticated Core endpoint for the same
request, after Core authorization and ownership enforcement. The adapter checks
the returned identifier equals the requested canonical identifier and rejects
unexpected fields rather than sending them to a model. An echoed ID is not proof
of ownership: actual ownership enforcement must be implemented and tested in Core.

The Core wire body above is separate from the existing strict `ToolAdapterResult`.
Proposed mapping into that existing boundary: validate the ID-only Core body into
`output`, supply a sanitized `source: {system, reference}` derived from the agreed
authenticated binding/provenance policy, and set `observed_at` to adapter receipt
time. Reference format and Core provenance mapping still require agreement.
Illustrative adapter result, using a synthetic reference only:

```json
{
  "output": { "asset_id": "synthetic-asset-a-001" },
  "source": { "system": "Core iBeX", "reference": "synthetic-reference-001" },
  "observed_at": "2026-10-15T00:00:00.000Z"
}
```

Preserve `toolAdapterResultSchema`: only `output`, strict object `source` with
nonempty `system`/`reference`, and datetime `observed_at`. The registration's output
schema separately validates the business payload. `observed_at` is not a Core
last-modified time. No `data`, string-valued `source`, `warnings` or error-return
branch is added to this boundary.

The service, not the adapter, constructs the existing Tool Runtime response
(exported type `ToolExecutionResponse`): `contract_version: '1.0'`,
`status: 'success'`, trusted `request_id`, `correlation_id`, validated `trace_id`,
registry `tool_id`/`tool_version`, validated `output`, object `source`,
`observed_at`, and positive integer `attempts`. Its strict schema and separate
`status: 'proposed'` branch remain unchanged; this read slice does not use the
proposal branch. The adapter must not construct a competing response envelope.
Source text alone authenticates nothing and is not live-integration evidence.
Do not use synthetic test output `status: available` as an Asset business fact.

Both sides must agree these schemas and an upper response-size bound before
implementation. Proposed cap: 16 KiB for the Core JSON body, with bounded headers
and no streaming partial business result. Field expansion requires a versioned
contract decision and Core field-visibility policy; additional fields are not
silently accepted. This slice intentionally does not satisfy a full Asset summary.

## 5. Failure categories and the existing error boundary

The existing runtime throws correlated `PlatformError`; it does not return a
`status: 'error'` Tool response. Preserve `normalizedAdapterError`,
`cancellationError` and `correlated` in `service.ts`, and
[PlatformError/toErrorEnvelope](../../../packages/errors/src/index.ts). Do not
replace runtime v1 or its `ibex.tool-error.v1` registration declaration. Restricted
audit distinguishes pre-dispatch denial from an upstream error.
Never pass through raw Core messages, response bodies, stack traces, URLs,
credentials, policy internals or another tenant's identifiers.

| Existing inspected behavior                                               | Runtime result to preserve                                                                                                     |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `ToolAdapterError('invalid_response')` or runtime response-schema failure | `INVALID_RESPONSE`, sanitized message, HTTP status 502                                                                         |
| External cancellation                                                     | `TIMEOUT_ERROR`, "Tool request was cancelled", HTTP status 408                                                                 |
| Adapter timeout                                                           | `UPSTREAM_TIMEOUT`, HTTP status 504                                                                                            |
| Adapter transient/unavailable failure                                     | `SERVICE_UNAVAILABLE`, HTTP status 503                                                                                         |
| Adapter permanent/unrecognized failure                                    | `DEPENDENCY_ERROR`, HTTP status 502; throwing a new adapter PlatformError code is not a supported bypass of this normalization |
| Runtime argument failure / denied rate admission                          | `INVALID_INPUT` / `RATE_LIMITED`, respectively                                                                                 |

Proposed integration failure categories still need a Core-to-adapter mapping:
authentication failure, capability denial, resource unavailable, rate limiting,
timeout, cancellation, invalid upstream response, unavailable dependency and audit
uncertainty. `RESOURCE_UNAVAILABLE`, `CANCELLED`, `UPSTREAM_CONTRACT_ERROR` and
`AUDIT_UNAVAILABLE` are proposal vocabulary, **not existing runtime error codes**.
Likewise, do not assume `AUTHENTICATION_FAILED` or `AUTHORIZATION_DENIED` are current
PlatformError names. The existing code catalog uses its own authentication and
authorization names. Preserve all current codes and their sanitized behavior.

If a future facade needs distinct outward labels, its explicit mapping, schema and
version must be agreed separately. No facade is implemented or authorized here;
none may silently substitute a new runtime error branch. In particular, map invalid
wire/schema/ID responses through the existing `invalid_response` failure kind;
retain `TIMEOUT_ERROR` for runtime cancellation. Core HTTP denial/not-found/rate
mapping and any finer-grained classification are pending D06, not invented adapter
failure kinds. No failure permits cache/mock fallback as current Core data.

Example safe resource message: "Requested resource is unavailable within the
current authorized scope." Core must also prevent existence leakage through its
outward body/status behavior; concrete HTTP status mappings and timing/rate
mitigations are review decisions, not verified properties. Internal restricted
audit may retain a reason category without leaking the record or foreign tenant.
Not-found/unavailable is not evidence that an Asset does not exist globally.

## 6. Timeout, cancellation and audit — proposed limits

Candidate limits for review: one Core attempt, no automatic retry, at most 2,000 ms
for that attempt and at most 3,000 ms for the adapter operation from admission
through validation and required audit acknowledgements. The shorter remaining
parent deadline always wins. These are design candidates, not measured service
objectives or claims about the current runtime. Enforcing them across all phases
and accounting for existing runtime/audit waits requires implementation review.

Use a monotonic deadline, cancellation propagation, and checks before dispatch and
before accepting results; ignore late success after cancellation/expiry. Abort
requests cooperatively but do not claim Core computation or a late audit write
has stopped. A timeout is not an execution-success or durable-audit proof. Keep
security and audit uncertainty fail closed; do not retry through that uncertainty.

Required audit linkage follows R07/R09: trusted tenant/user/role/session/request,
trace/tool-call identifiers, agent/tool/version, permission decision, READ class,
operation, approval state (not applicable to this read), outcome, timestamp,
duration, error category and applicable model/prompt references. Record denials,
dispatch, completion, cancellation, timeout and rejected responses using a reviewed
versioned event mapping. Do not fabricate model references when no model is used.
Never log assertions, secrets, full prompts or business payloads by default.

Proposed read policy: require start and outcome audit acknowledgement before
releasing success. Preserve current runtime audit error handling; any outward
`AUDIT_UNAVAILABLE` facade classification is pending agreement, not a runtime code.
The service already awaits start/success audit emission, but that does not prove
durability or the proposed end-to-end deadline. Audit service, event
mapping, retention, access controls, durability, failure buffering and acceptable
acknowledgement semantics remain unverified. This document does not claim an
in-memory acknowledgement is durable evidence or close an existing audit finding.

## 7. Decision boundary

Only the two proposal documents are delivered now. Schema/adapter prototypes and
synthetic fixtures can be implemented offline after the contract choices are
agreed and that work is authorized. They cannot demonstrate Core authorization,
real endpoint compatibility, credentials, audit durability or operational readiness.
The readiness matrix lists the pending decisions and later evidence needed.
No decision in this draft supersedes the approved implementation sequence or
authorizes connecting, deploying, issuing credentials, enabling tools or actions.
