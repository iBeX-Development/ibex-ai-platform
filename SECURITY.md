# Security

## Tenant isolation

- Treat every tenant as isolated and deny cross-tenant operations by default.
- Accept identity and tenant context only from authenticated Core iBeX or AI Gateway server context.
- Never promote a prompt, uploaded document, model output, or client request field to trusted tenant context.
- Keep trusted request context immutable after validation and preserve it across module boundaries.
- Enforce authorization on the server. Agents cannot infer or expand roles, permissions, or entitlements.

Phase 0 supplies validated context types and a default-deny tenant guard. Full authentication and authorization enforcement belongs to Phase 1.

## Data and actions

- Do not connect directly to the Core iBeX database.
- Use approved Tool/APIs for live operational data and approved RAG sources for documents.
- Route protected actions through Core workflows and required human approval.
- Keep model providers behind Model Gateway. Domain agents must not import provider SDKs.

## Secrets and diagnostics

- Never commit `.env`, passwords, tokens, API keys, credentials, or production secrets.
- Local development may use environment variables. Staging and production require an external secret provider.
- Structured logs redact common credential fields. Add new sensitive field names to the central redaction policy before logging related objects.
- Public error envelopes exclude diagnostics and stack traces. Internal diagnostics remain server-side.

Report suspected credential exposure through the organization's approved private security channel and rotate affected credentials immediately.
