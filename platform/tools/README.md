# Tool Runtime

Phase 5 implementation is provided by `packages/tool-runtime`.

The runtime contains registry, policy, tenant and ownership enforcement,
schema validation, timeout and safe read retry controls, proposal-only action
handling, and audit/tracing boundaries. No live Core adapter is active because
approved endpoint, service identity, authentication, and concrete schema
contracts are not yet available in `docs/baseline/`.
