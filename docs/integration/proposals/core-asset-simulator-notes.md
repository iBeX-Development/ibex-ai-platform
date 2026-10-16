# Stateful synthetic Core Asset simulator

This test-only simulator exercises the approved logical tenant/Tool API boundaries
and the existing [offline prototype](core-asset-offline-prototype-notes.md).
It is not real Core, a deployed endpoint, authentication infrastructure or evidence
that the [proposed contract](core-integration-contract-v0.1-proposed.md) decisions
have been adopted. D01–D09 and all real integration findings stay open.

`tests/testing/core-asset-simulator.ts` implements an in-process logical GET handler.
It holds copied synthetic users, sessions, permissions, entitlements, resource grants,
field grants and tenant-keyed assets. Session handles and `fixture:core:*` identifiers
are test labels, not credentials, persistent grants or actual Core policy mappings.
There is no listener, HTTP client, network access, database or new dependency.
Tests explicitly compose it with the existing disabled offline adapter registration;
production composition, registry 3.0 and ownership interfaces are unchanged.

Platform authorization and `{type,id}` ownership lookup run before the adapter.
The simulator independently checks current session/user/tenant binding, enabled
user state, its own permission/entitlement/resource policy and visibility of the
sole returned field `asset_id`. A missing ID field grant denies the lookup rather
than inventing another response. Caller-supplied permissions cannot grant simulator
rights. Revocation is checked again for each call, including after a deterministic
in-flight scheduling boundary. It implements no expiry clocks, signed identity,
issuer, JWT, mTLS, key rotation or real session authentication.

Denied logical results are identical for unauthorized and absent resources, with
no owner or business payload. This proves fixture body/category equality only,
not timing-side-channel resistance or actual Core HTTP status compatibility.
The test-only bridge maps logical denial to existing adapter `permanent` failure
and dependency outage to `unavailable`; Tool Runtime normalizes these to correlated
`DEPENDENCY_ERROR` and `SERVICE_UNAVAILABLE`. This is no decision on Core HTTP
denial/not-found semantics. No new outward error envelope or permission path exists.

Fault switches deliberately produce malformed, oversized, mismatched and extra-field
success bodies after simulated authorization. Existing adapter checks reject them
without audit payload leakage. Cancellation prevents accepting a simulated result.
The fixture completed-read ledger records only synthetic authorization observations;
it is not the platform audit, durable evidence, or proof of adapter acceptance.

Two tenants may hold `shared-id` in the simulator's internal `(tenant,id)` map.
Tests demonstrate this directly at the Core handler only. Platform's unchanged
global `{type,id} -> tenant` resolver cannot express both owners: end-to-end tests
use distinct IDs, and a shared-ID Platform lookup explicitly fails closed.

Before real-case acceptance, agree real identity/delegation and Core ownership
authority, identifier rules, resource/field policy, endpoint and error mappings,
provenance, end-to-end deadlines and durable audit. Validate real authorized and
denied cases in an approved environment after system completion, including session
revocation, tenant isolation, transport/security behavior and operational failures.
Synthetic PASS cannot close these requirements or change existing release gates.
