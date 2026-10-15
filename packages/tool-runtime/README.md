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

## Registration format 2.0 migration

Tool registration metadata now requires these exact literals:

```ts
metadata: {
  registration_version: '2.0',
  error_model: 'ibex.tool-error.v1',
  // Existing Tool metadata, including its own version, follows.
}
```

`registration_version` identifies the registration schema's new major format.
It is distinct from `metadata.version`, which identifies an individual Tool and
remains part of the registry key, and from the `v1` error-model identifier.
The execution response's `contract_version: '1.0'` is unchanged.

`ibex.tool-error.v1` is the sole supported error model. It names the existing
standardized error envelope (`error.code`, `error.message`, and trusted
`trace_id`/`request_id` when available) implemented by `packages/errors` and the
Tool Runtime's sanitized error boundary. It does not introduce error categories,
configure adapter mappings, or grant retry authority. Authorization, tenant
isolation, cancellation, proposal-only execution, and audit behavior remain intact.

This is a breaking registration-format change, not backward compatibility with
the previous unversioned shape. Migrate each registration explicitly by adding
both literals to its metadata after verifying that it uses the existing error
contract. There is no default, coercion, whitespace normalization, or legacy
fallback for either field. Missing or unsupported values fail closed at the
registry boundary with sanitized `CONFIGURATION_ERROR` (500),
`Tool registry configuration is invalid`. Supplying an individual Tool version
does not opt an old registration into the new format.

Repository-owned read and proposal fixtures in
`tests/testing/tool-runtime-fixtures.ts` and registrations constructed by the
deterministic evaluation support helper `runtime-evaluator.ts` are explicitly migrated together.
Registrations derived from these fixtures inherit the explicit new metadata.
There are no production registrations or live-adapter migrations in this package.

Requirement traceability:

- Baseline 13, section 15: supplies the required `error_model` metadata.
- Baseline 05, section 20: identifies the existing standardized, sanitized error
  contract without changing its public failure taxonomy.
- Baseline 05, sections 39–40: marks the required-field change as a new major
  registration format and documents explicit migration and legacy rejection.

This bounded AQ04 package does not close AQ04. `rate_limit` metadata/enforcement,
production quota decisions, and approved live integration contracts remain
outside this change. Approved baselines and governance findings are unchanged.
