# Asset ID offline prototype — synthetic evidence only

The owner authorized an offline schema/adapter prototype on 2026-10-15. This does
not approve all choices in the [proposed contract](core-integration-contract-v0.1-proposed.md)
or close decisions in the [readiness matrix](core-integration-readiness-v0.1-proposed.md).
Both proposal documents retain their status. Approved tenant/security and Tool API
requirements remain unchanged.

The implementation lives entirely in `tests/testing/core-asset-offline-prototype.ts`,
excluded from the production build and imported only by its integration test.
Its exported registration is disabled, test-environment-only, deterministic and
resource-ownership checked. Tests explicitly enable their local registry copy.
Existing fixture permissions, rate policy and timeout are synthetic test values,
not Core permission mappings or adopted end-to-end deadlines.

The prototype validates one exact, untrimmed ASCII Asset ID (1–128 characters,
letters/digits/underscore/hyphen), accepts only an ID-only matching JSON result,
and bounds its UTF-8 body at 16 KiB before parsing. An injected synthetic JSON
function receives validated caller context and cancellation; no HTTP client,
endpoint, authentication, credentials or production composition is added.
The cap bounds accepted text, not transport allocation or streaming behavior.
Duplicate JSON object member detection is not implemented; parsed payloads must
have exactly the one allowed field. No claim of real Core canonicalization follows.

Existing Tool Runtime performs authorization and its unchanged `{type,id}`
ownership precheck, constructs correlated responses/errors, and emits audits.
Invalid upstream identity/schema uses `invalid_response` → `INVALID_RESPONSE`;
unrecognized synthetic transport errors follow existing `DEPENDENCY_ERROR`
normalization. This defines no Core HTTP denial/status mapping. Synthetic provenance
and receipt timestamps are not authenticated Core or durable-audit evidence.

Tests cover A/B allowed and cross-tenant denied references using the existing
resolver interface. Distinct resource IDs are required for this shared resolver;
same-textual-ID multi-owner semantics remain unresolved. Context schema validation
does not authenticate an identity; trusted context originates at the existing
server boundary. Production/live registrations remain unactivated. Real Core
authentication/delegation, ownership authority, permission/field mapping, endpoint,
provenance, deadlines and operational evidence remain open under D01–D09.
