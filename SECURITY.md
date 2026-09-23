# Security

## Tenant isolation

- Treat every tenant as isolated and deny cross-tenant operations by default.
- Accept identity and tenant context only from authenticated Core iBeX or AI Gateway server context.
- Never promote a prompt, uploaded document, model output, or client request field to trusted tenant context.
- Keep trusted request context immutable after validation and preserve it across module boundaries.
- Enforce authorization on the server. Agents cannot infer or expand roles, permissions, or entitlements.

Phase 1 supplies the trusted Gateway boundary, authentication and authoritative authorization
interfaces, immutable request binding, resource ownership enforcement, and fail-closed guards.
Production adapters must authenticate the approved Core/AI Gateway channel and delegate final
authorization and ownership decisions to approved server-side sources.

Phase 2 preserves this binding through the AI Gateway contract boundary. Gateway requests are
strictly schema validated, payload limited, entitlement checked, server authorized, rate limited,
audit correlated, and forwarded through an abstract platform adapter. `/tools` and `/approvals`
provide contract boundaries only and contain no execution or approval runtime.

Phase 3 revalidates and freezes trusted context at the shared runtime boundary. Agent selection is
restricted by registry status, domain, intent, permissions, entitlements, and declared capability.
RAG scopes, Tool candidates, model policy aliases, and prompt versions must remain within approved
registry allowlists. Unknown intent returns a safe fallback and ambiguous routing fails closed.

Phase 4 centralizes model access behind the Model Gateway. It validates the approved policy
version, agent capability, invoke permission, tenant entitlement, confidentiality class, context
limit, provider/model lifecycle, environment, and provider health before invocation. Fallback
reuses the same policy-filtered candidate set and cannot weaken tenant, confidentiality,
entitlement, capability, or enablement requirements. Live adapters require approved HTTPS
configuration and injected secrets; provider credentials never enter agent code, prompts, audit,
metrics, or source control.

Phase 5 centralizes live-data access behind the Tool Runtime. Tool input cannot supply trusted
tenant, identity, permission, entitlement, session, request, correlation, or authorization
context. Registry enablement, environment, strict input/output schemas, server authorization,
and resource ownership checks all fail closed before adapter invocation. Only safe idempotent
Read Tools may use bounded retries. Action Tools produce approval-required proposals and never
perform authoritative writes. No live Core adapter is enabled until its endpoint, service
identity, authentication, resource-scope, and versioned schema contracts are explicitly approved.

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
