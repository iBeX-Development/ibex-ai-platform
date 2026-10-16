# Inactive dispatcher and synthetic Core component composition

This test fixture executes the actual Gateway service, InactiveToolDispatcher,
SharedAgentRuntime routing, PilotAgentRuntime, Tool Runtime, existing offline Asset
adapter and stateful SyntheticAssetCore. Gateway forwards its existing structured
`tools` payload to the published dispatcher, which routes before invoking Pilot.
The fixture no longer implements its own payload parser, grounding closure, Pilot
construction or response projection. No production source is changed by this
composition increment.

`tests/testing/asset-component-chain.ts` supplies deterministic routing/policy ports,
two synthetic authenticated identities and Core users/sessions/assets. One registry
instance is shared by Tool Runtime, ToolBindingCatalog and dispatcher. Routing and
the fixture Pilot policy use conceptual `asset.get`; an exact server-owned test
descriptor binds agent/version/domain/ASSET_LOOKUP/capability to concrete
`asset.asset.get.v1` / `0.1.0-proposed` and the registered input/output schema IDs.
The exported production Asset profile and offline registration stay blocked/disabled.
Only the fixture's local copies authorize this single read intent.

The dispatcher owns per-request immutable arguments and full captured trusted
context. Tool responses are observed without replacing their identity or content;
Pilot citations retain concrete Tool ID/version/source. Answers confirm only the
synthetic returned Asset ID. The Core simulator independently rechecks current
session, tenant, user, permission, entitlement, resource and field grants; a Platform
allow decision does not override those checks.

Combined-path tests cover success for both tenants, exact evidence/correlated audit
order, Gateway denial and identity spoofing, ownership denial in both directions,
Core session/permission/field revocation, unavailable or malformed/oversized/wrong-ID/
overbroad Core results, inactive/empty mappings, disabled registration, blocked
production policy, forged binding configuration and concrete selection broadening.
Two tenants also complete overlapping requests in reverse order with separate
immutable inputs, identities, Tool evidence, citations, audits and Core completedReads.
Faulty Core output can record an authorized simulated Core read, but is discarded
before a successful Tool response or operational answer is released. Dependency and
validation failures retain existing Tool error audit events and Pilot abstention;
Gateway returns partial status with no citations. No new error envelope is invented.

This implements existing baseline 05 sections 58-59 (trust and ownership), technical
design 16 sections 7, 17-19 and 21 (routing, conceptual mapping and Core final
authority), and implementation plan 17 Phase 5. It changes no approved architecture,
baseline, general plan, public wire contract or production bootstrap. Existing
legacy no-binding compatibility tests remain intact.

This is synthetic integration evidence, not natural-language lookup, real Core
authentication/HTTP integration or full-system acceptance. No Model Gateway/provider,
RAG, external service, listener, secret or new dependency is used. Routing model-policy
selection and prompt approval labels are synthetic metadata, not model inference or
human governance approval. Core identity/delegation, actual permission/field mapping,
transport/deadlines, durable audit, deployment and eventual real-case operational
verification remain open. The proposed Core decisions D01-D09 and existing release
governance gates are not closed by these tests; no live service is enabled.
