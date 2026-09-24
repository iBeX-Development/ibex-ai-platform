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

## Production integration boundary

`AuditEvidenceStore`, `AuditExporter`, `SecurityEventExporter`, `AuditMetricsExporter`, and
`AuditHealthExporter` are vendor-neutral ports. Production activation requires separately approved
storage immutability, retention, encryption, tenant access, data residency, buffering/retry,
dashboard, alert, SIEM, and exporter configuration. `InMemoryAuditEvidenceStore` is a deterministic
test adapter only.

No production telemetry or storage vendor is selected by Phase 7.
