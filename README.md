# iBeX Hybrid Intelligent AI Platform

Standalone, tenant-safe AI platform foundation for iBeX. The approved boundary is:

```text
Core iBeX → AI Gateway → iBeX Hybrid Intelligent AI Platform
```

Core iBeX remains the system of record. This platform has no direct Core database access. Live operational data must use approved Tool/APIs, while approved document knowledge uses RAG. Phase 5 adds a versioned Tool Registry and controlled runtime with strict schemas, server-side authorization, tenant ownership enforcement, bounded retries for safe idempotent reads, proposal-only actions, and sanitized audit/tracing. Concrete Core integrations remain disabled until their endpoint, identity, authentication, and schema contracts are approved. Domain reasoning, RAG retrieval, approval runtime, Core production integrations, and authoritative actions remain later work.

## Requirements

- Node.js 22 or later
- Corepack and pnpm 11.19.0
- Docker Compose is optional for container-based local execution

## Local setup

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
pnpm validate
pnpm dev
```

PowerShell equivalent for the configuration file:

```powershell
Copy-Item .env.example .env
```

The service exposes `GET /health` on `http://localhost:3000`. Node does not load `.env` automatically; export the `.env.example` values in the shell when running directly, or use Docker Compose, which loads `.env`.

## Commands

| Command             | Purpose                             |
| ------------------- | ----------------------------------- |
| `pnpm dev`          | Start the API skeleton              |
| `pnpm build`        | Compile TypeScript to `dist/`       |
| `pnpm start`        | Start the compiled API              |
| `pnpm format:check` | Verify formatting                   |
| `pnpm lint`         | Run strict ESLint checks            |
| `pnpm typecheck`    | Run TypeScript static checks        |
| `pnpm test`         | Run all tests                       |
| `pnpm validate`     | Run the complete local quality gate |

## Environment and secrets

Configuration is validated centrally with Zod and fails during startup when required values are missing or invalid. Supported environments are `local`, `development`, `test`, `staging`, and `production`. Local development may read secret values from environment variables. Staging and production require the external secret-provider abstraction and must not use repository files for credentials.

Never commit `.env`, API keys, access tokens, passwords, or production endpoints. See [SECURITY.md](SECURITY.md).

## References

- [Approved architecture baseline](docs/ARCHITECTURE_REFERENCE.md)
- [TD-01 Pilot technology decision](docs/decisions/TD-01-pilot-technology-baseline.md)
- [Phase 0 validation](docs/PHASE_0_VALIDATION.md)
- [Phase 1 validation](docs/PHASE_1_VALIDATION.md)
- [Phase 2 validation](docs/PHASE_2_VALIDATION.md)
- [Phase 3 validation](docs/PHASE_3_VALIDATION.md)
- [Phase 4 validation](docs/PHASE_4_VALIDATION.md)
- [Phase 5 validation](docs/PHASE_5_VALIDATION.md)
