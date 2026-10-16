# Synthetic structured-tools component composition

This test fixture executes actual Gateway service, SharedAgentRuntime routing,
PilotAgentRuntime, Tool Runtime, existing offline Asset adapter and SyntheticAssetCore.
It is not natural-language lookup, production dispatch, real Core authentication,
HTTP integration or a full-system acceptance result. No Model Gateway/provider,
RAG runtime, external service, listener or new dependency is used.

`tests/testing/asset-component-chain.ts` supplies deterministic routing/policy ports
and a dispatcher, not a production application container. Existing routing still
performs its model-policy selection guard using fixture policy metadata; no model
inference or retrieval is executed. Prompt registry approval labels and Gateway
identity handles are explicitly synthetic fixture data, not governance approval or
credentials. Existing feature/authorization/ownership/audit guards run unchanged.

Structured `tools` payload preserves `input.asset_id`; the fixture validates the
fixed concrete ID/version and exact minimal input before routing. It never treats
a trimmed chat message as a canonical Asset identifier. Each forward call owns an
immutable captured argument object and a new grounding closure. No shared mutable
current-request slot supplies Tool input. The actual routed decision selects the
Asset pilot; grounding invokes Tool Runtime only after pilot authorization.

The fixture authorizes only ASSET_LOOKUP in a local profile copy, explicitly binding
it to `asset.asset.get.v1` / `0.1.0-proposed`. Production Asset profile and exported
offline registration remain blocked/disabled. The conceptual-to-concrete binding
and general request/argument dispatch contract are still unresolved for production.
No capability alias or forged evidence is used: the exact ToolExecutionResponse
object becomes grounding evidence, and pilot citations derive from its actual
tool/version/source. Answer text confirms only the returned synthetic Asset ID.

Tests exercise both tenants, Gateway denial/spoofing, Platform ownership denial,
Core revocation, structured-input broadening, blocked production policy and overlapping
requests with reverse completion. Nonvacuous service-event counts/order and trusted
request/correlation/trace are checked. Tool/Core failures become existing pilot
abstention; the fixture Gateway projection uses partial status and no operational
answer/citations, rather than inventing a new runtime error envelope.

Real identity/delegation, actual application dispatch/binding, endpoint/error mapping,
durable audit, transport/deadlines and real-case operational acceptance remain open.
This composition closes no governance finding and activates no proposed security or
deployment decision. See the existing Core proposal and simulator limitations.
