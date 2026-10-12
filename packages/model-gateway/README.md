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

## Accounting foundation (F09 remains open)

Provider dispatch now requires an injected, server-controlled `ModelAccountingPolicyInput`:
an immutable versioned budget/pricing snapshot and a trusted `ModelAccountingPort`. Missing,
invalid, expired, unconfigured or uncertain accounting denies dispatch. Request payloads cannot
supply policy or bypass it. No production accounting adapter, authority, values or dependencies
are supplied. Model registry cost estimates are not the accounting authority.

The policy requires finite per-attempt input/output bounds, invocation token/cost/attempt caps,
a global monthly token/cost/attempt cap and warning threshold, integer pricing units, exact
provider/model/version tariffs, and explicit validity, monthly boundaries, timezone and operation
budget. Tenant, tenant-scoped agent, provider, model and environment limits are optional policy
scopes; every attempt retains these attribution dimensions. Production caps, currency/unit,
timezone/calendar, tariffs, custodians and policy approval remain unresolved. Backend authority
must validate the actual calendar and current policy independently; an `authority_ref` or hash
does not authenticate itself.

Each actual retry/fallback attempt receives a new server-generated identity under one invocation.
Before dispatch, the adapter must certify the complete formatted input and enforce both the
input bound and `max_output_tokens`. The byte estimate is routing-only. Unsupported guarantees,
missing tariffs, capacity denial or malformed acknowledgements admit no provider call. Frozen
input, exact model identity, bounds version and input digest bind counting to dispatch. A declared
adapter guarantee still needs implementation review and direct backend evidence before live use.

`reserve` must atomically check current authority/pricing, all applicable caps and concurrent
admissions, then durably record maximum liability and a warning outbox before acknowledging.
Known validated usage is settled idempotently in integer units against the original reservation
and period. Duplicate identical commands must not charge twice; changed commands under an
existing identity must fail. Command hashes bind content, not identity or signatures. Dispatch
never retries an accounting command or resumes from a late acknowledgement.

Cancellation, provider timeout, malformed/over-bound usage, lost acknowledgement and ambiguous
outcomes retain unresolved liability. There is no release API or hold expiry. Even known
non-dispatch after reservation is conservatively retained for separate reconciliation. A lost
settlement acknowledgement can leave the backend settled while the caller reports uncertainty.
Audit `unresolved` means possible retained liability, not proof a backend commit happened.
Timeout is terminal: it cannot trigger automatic retry/fallback. Existing permitted retries for
explicit retryable provider failures and approved fallback require another independent reservation;
earlier uncertain attempts remain charged at their bound. Invocation IDs do not establish
request-wide at-most-once processing across separate client requests.

Counting, reserve and settle waits have the supplied finite operation budget, bounded further by
policy/period expiry; cancellation and freshness are checked after each wait and at actual dispatch.
Each operation captures a fixed absolute deadline from the injected `monotonicClock` (default
`performance.now()`), separate from the wall clock for policy/period validity. Entry and both
fulfillment/rejection are checked against that deadline even if the timeout callback has not run.
Synchronous work cannot be preempted, but an expired outcome is rejected once control returns,
before the next port call, metrics or success. Cancellation retains priority; late settlement
still reports uncertainty even if its backend commit succeeded. No hold is released.
Late outcomes are observed without continuation. Month rollover closes admission under the old
policy; a new authoritative period must be supplied, and prior holds are never silently cleared.
Completion across expiry is conservatively withheld pending independent reconciliation. Such
reconciliation needs separately authorized evidence and cannot continue a cancelled request.
These waits do not terminate dependencies, synchronous blocking code or already-dispatched work.

Usage metrics bind pricing/unit/period/attempt identities; audit records carry whitelisted receipt
metadata. The existing independent 1,000 ms best-effort failure-audit budget is unchanged. Telemetry
is not an accounting ledger or proof of durable retention. Warning delivery/outbox recovery,
cross-instance atomicity, crash/power-loss durability, revocation, clock trust, provider usage
verification and reconciliation require a protected backend and separate deployment/authority
decisions. The in-memory adapter and numeric values under `tests/testing/` are explicitly synthetic;
tests demonstrate the service contract and single-process admission, not distributed durability.
F09 and F06 remain open; this foundation grants no infrastructure, OE/R&D or deployment authority.
