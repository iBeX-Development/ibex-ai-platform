# Model Gateway module

Phase 4 implements the provider-independent gateway in `packages/model-gateway` with canonical
contracts, an approved model/provider registry, deterministic policy routing, provider adapters,
bounded retry and fallback, normalized errors, tenant-aware audit, and usage metrics.

No production provider SDK or credential is included. Live adapters activate only through
approved HTTPS configuration, injected secrets, and an explicitly registered adapter. Model,
Tool, and RAG execution outside the Model Gateway remain later phases.
