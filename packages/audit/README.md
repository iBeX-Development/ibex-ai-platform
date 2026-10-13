# Audit and observability foundation

Phase 7 normalizes the audit events produced by Gateway, Shared Agent Runtime, Tool Runtime, RAG
Runtime, and Model Gateway into one versioned canonical envelope. The original sanitized evidence
is retained inside the immutable envelope so normalization does not remove mandatory evidence.

## Safety properties

- Trusted tenant, user, role, session, permission, entitlement, request, correlation, and trace
  references are validated before delivery.
- The configured environment is enforced to prevent development and production evidence mixing.
- Raw prompts, model responses, retrieved content, tool payloads, credentials, confidential
  reasoning, and chain-of-thought are rejected before audit persistence.
- Security rejections receive sanitized severity and reason-code evidence.
- Metric labels are restricted to explicit service and environment allowlists plus fixed event and
  outcome vocabularies. Raw tenant, user, request, session, correlation, and trace identifiers are
  never labels.
- Evidence is written to the append-only store port before exporters run. Exporter failures create
  critical health evidence, mark the pipeline degraded, and fail closed to the caller.

## Bounded failure reporting

After normalization or primary store/exporter failure, secondary health persistence and independent
export attempts share one server-owned **1,000 ms best-effort ceiling**. They start independently
within that budget so a stalled store cannot starve a healthy exporter. A single timer bounds
never-settling waits; an absolute monotonic deadline (injectable `monotonicClock`, default
`performance.now()`) is checked before each invocation and after fulfillment/rejection, even when
timer delivery is delayed. Expired synchronous outcomes stop further reporting once control returns.
No caller cancellation signal controls this reporting budget and it installs no abort listeners.

The original normalization error or sanitized, correlated `AuditDeliveryError` remains the caller
failure. Secondary rejection, synchronous throw, clock failure or timeout cannot replace it or
produce success. The pipeline stays degraded. Late outcomes are observed without retries, additional
reporting or caller continuation, and the reporting timer is cleared on every outcome. A failed
primary store is not retried through health persistence.

This ceiling applies only to secondary failure reporting; ordinary primary persistence/export
waits are unchanged. Synchronous blocking cannot be preempted, and timeout neither terminates a
dependency nor proves rollback, delivery or durable evidence retention. A timed-out exporter may
still finish later. F07 remains open for independently durable failure storage, custody and
deployment proof; healthy test adapters do not establish those properties.

## Production integration boundary

`AuditEvidenceStore`, `AuditExporter`, `SecurityEventExporter`, `AuditMetricsExporter`, and
`AuditHealthExporter` are vendor-neutral ports. Production activation requires separately approved
storage immutability, retention, encryption, tenant access, data residency, buffering/retry,
dashboard, alert, SIEM, and exporter configuration. `InMemoryAuditEvidenceStore` is a deterministic
test adapter only.

No production telemetry or storage vendor is selected by Phase 7.
