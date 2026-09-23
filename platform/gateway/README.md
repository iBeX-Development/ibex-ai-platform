# Gateway module

Phase 2 implements the versioned AI Gateway contract and HTTP boundary adapters in
`packages/gateway` and `apps/api/src/gateway.ts`.

The boundary validates authenticated tenant context, endpoint payloads, entitlements,
authorization decisions, payload limits, rate limits, response envelopes, audit correlation, and
trace propagation. Production authentication, authorization, audit, distributed rate-limit, and
platform adapters remain deployment integrations.

`/tools` and `/approvals` expose contract validation and forwarding boundaries only. This module
does not execute tools, change approval state, or implement later runtime phases.
