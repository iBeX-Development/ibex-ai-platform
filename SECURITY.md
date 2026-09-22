# Security foundation rules

- Treat every tenant as isolated. Deny cross-tenant operations by default.
- Accept tenant identity only from authenticated, trusted Core iBeX or AI Gateway context. Never promote a prompt or untrusted request field to tenant context.
- Perform authorization on the server. Agents must not infer roles, permissions, or entitlements.
- Do not access the Core iBeX database directly. Use approved Tool/APIs for live data.
- Route action/write operations through Core workflows and required human approval.
- Keep secrets, credentials, access tokens, passwords, and production environment files out of source control and logs.
- Do not expose internal diagnostics or stack traces in production responses.

Implementation-specific controls remain pending the approved security and technical design documents.
