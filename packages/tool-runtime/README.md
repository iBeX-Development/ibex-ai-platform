# Tool Runtime

Phase 5 provides the versioned Tool Registry, strict input/output validation,
server-side authorization and tenant ownership enforcement, bounded retry for
safe idempotent reads, proposal-only action handling, and sanitized audit and
trace evidence.

No concrete Core iBeX endpoint, service identity, authentication mechanism, or
live schema has been approved in the repository. Therefore this package ships
no live Core adapter or production tool registration. `live_core` registrations
remain disabled unless their versioned key is explicitly supplied through the
composition root after those integration contracts are approved.

Action tools never call an adapter. They return an approval-required proposal;
authoritative execution and Human Approval Runtime are outside Phase 5.
