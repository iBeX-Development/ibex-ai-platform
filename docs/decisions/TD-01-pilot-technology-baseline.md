# TD-01 — Pilot technology baseline

- Status: Approved
- Date: 2026-09-23
- Scope: Pilot Phase 0 platform foundation

## Decision

Use TypeScript on Node.js with pnpm workspaces, Zod validation, Vitest, Pino structured logging, OpenTelemetry APIs, and a Docker Compose local skeleton. Local development obtains secrets from environment variables. Staging and production require an external secret-manager abstraction.

The Pilot begins as a modular platform with strict internal contracts. Model providers remain behind Model Gateway, and domain agents must not depend on a provider. Future justified Python services can integrate through these boundaries. Predictive AI, PdM, and ML workloads remain R&D/Future.

## Architecture relationship

This is an implementation-level decision under Technical Design v1.0 section 69. It does not amend or override any v1.0 architecture document.
