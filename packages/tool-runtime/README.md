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

## Registration format 3.0 and rate admission

This breaking major registration format requires exact `registration_version: '3.0'`,
retains `error_model: 'ibex.tool-error.v1'`, and adds required `rate_limit` metadata:

```ts
rate_limit: { policy_id: 'server-owned-policy-id', version: 'explicit-version' }
```

The reference is an immutable, exact ASCII token pair (1–128 characters each;
letters/digits followed by letters/digits, dot, underscore, colon or hyphen).
No trimming, coercion, caller override, legacy 2.0 fallback, default quota or
unlimited fallback is supported. Tool version, registration version and policy
version are separate. The public response contract remains 1.0 and the existing
error model and audit schema remain unchanged.

The server composition root must inject a `ToolRateLimitCatalog` and a
`ToolRateLimiter`. Catalog construction copies and freezes strict versioned
policies; duplicate references or malformed policies fail configuration closed.
Unknown references fail with sanitized `CONFIGURATION_ERROR`. Each policy
explicitly supplies an integer `limit` (1 through Number.MAX_SAFE_INTEGER) and
integer `window_ms` (1 through 2,147,483,647). These are representation bounds,
not recommended production quotas. Policy changes require a new reference version.
Only explicitly synthetic quotas exist in test fixtures and evaluation support.
Existing repository-owned registrations and composition roots are migrated
explicitly; external 2.0 registrations need a reviewed policy before migrating.

After schema, server authorization and ownership validation, every read adapter
attempt (including retries) consumes one admission before invocation. Proposal
creation consumes once and never calls a write adapter. Invalid, unauthorized,
disabled and ownership-denied requests do not consume. Exhaustion alone returns
`RATE_LIMITED` (429). Malformed, throwing, rejected or timed-out limiter outcomes
return sanitized `SERVICE_UNAVAILABLE` (503), without retrying uncertain admission.
Caller cancellation retains `TIMEOUT_ERROR`. No admitted/uncertain consumption
is refunded, including cancellation, adapter errors or subsequent audit failures.
Adapter errors retain the existing retry policy; limiter uncertainty never retries.

Admission shares the existing per-attempt timeout budget with the read adapter;
proposal admission uses that Tool timeout budget too. Abort signals and late
promise outcomes are observed, with timer/listener cleanup. A late allow cannot
invoke an adapter after cancellation or deadline. This bounds waiting, not a
synchronously blocking injected dependency or remote execution. A limiter must
honor the atomic check-and-consume interface and is trusted server code.

`InMemoryToolRateLimiter` is a deterministic nonproduction adapter: consumption
is synchronous before returning its promise, atomic only within one instance in
one JavaScript isolate. Its collision-safe tuple key includes trusted tenant ID,
Tool ID/version, captured server environment, policy identity/version and policy
values. Caller input cannot choose quota, environment or bucket. A window starts
on first admission and resets at elapsed >= window_ms. Invalid or backward clock
readings fail closed without consumption; the high-water clock reading is retained
until time catches up. The clock is injected explicitly.

There is no persistence, cross-process/distributed coordination, restart continuity,
or production activation. Buckets live for the instance lifetime with no automatic
eviction; this adapter is intended only for bounded deterministic tests. Production
quota decisions, durable/distributed enforcement, memory lifecycle, clock trust,
user/agent/endpoint dimensions and live integration require separate approval.

Traceability: baseline 05 sections 20 (sanitized error taxonomy), 24 and 43
(rate controls and retry-loop protection), 39–40 (explicit major migration);
baseline 13 section 15 (required rate_limit metadata); technical design section 6
(trusted tenant identity and no caller override). Approved baselines, findings,
stock mutation restrictions and live capability blocks are unchanged. This
foundation does not close AQ04 or establish full production rate-limit compliance.

## Per-attempt error audit wait

After an adapter or admission error, the existing sanitized error audit event has
a server-owned 1,000 ms acknowledgement ceiling. The runtime checks the monotonic
deadline before invoking the sink and after observing settlement. Acknowledgement
at or after the deadline, an invalid/backward clock, rejection or synchronous
throw stops retry and preserves the original normalized Tool/admission error and
correlation. Active caller cancellation takes precedence while waiting. Only a
timely acknowledgement with an active caller permits the existing safe-read retry
policy to proceed. Audit failures record the sanitized span event
`tool_runtime.audit.emission_failed`; no sink error details are exposed.

The wait timer and cancellation listener are cleaned up. Late fulfillment or
rejection is observed without any retry, admission, adapter or success continuation.
Timeout stops waiting; it cannot cancel the sink, undo its writes, or prevent late
pipeline persistence/export. A synchronously blocking sink cannot be preempted;
the monotonic post-settlement check prevents its late result authorizing retry.

Terminal failure reporting retains its separate 1,000 ms ceiling. If both waits
hang, the reporting tail can therefore reach two seconds, subject to event-loop
scheduling and synchronous blocking. This is not a whole-request deadline:
primary started/proposed/succeeded audit waits are unchanged. Persistence,
export, durability and retention contracts are unchanged; this repair supplies
no durability proof or F07 closure. Traceability: baseline 05 sections 18, 19 and
22 (bounded safe retries, timeout uncertainty and sanitized audit), and baseline
08 section 41 (explicit audit failure handling).
