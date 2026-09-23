# Model Gateway package

Phase 4 provider-independent Model Gateway foundation.

- Canonical request and response contracts contain no provider-specific parameters.
- `ModelRegistry` admits only approved, enabled, environment-compatible models and providers.
- Deterministic policy routing checks trusted context, permission, entitlement, capability,
  confidentiality, context size, structured output, tool-use support, and provider health.
- Provider adapters normalize invocation formats and errors behind a stable internal boundary.
- Bounded retry and fallback never weaken policy checks.
- Audit and usage metrics contain metadata only; raw input, model output, credentials, and
  chain-of-thought are excluded.

Live adapters require an approved HTTPS endpoint, a credential reference, an injected
`SecretProvider`, and an explicitly registered adapter implementation. The repository supplies no
production provider SDK or credential.
