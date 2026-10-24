# RAG Runtime

Phase 6 provides the controlled ingestion and retrieval foundation for approved
document knowledge. It validates trusted context, server authorization,
governance approval, a server-resolved Shared Agent Runtime routing scope,
document integrity, tenant and access metadata, stable chunk identity,
citations, and sanitized audit correlation.

Embedding, ranking, and knowledge storage are provider-neutral ports. This
package selects no production embedding provider or vector-store technology.
Deterministic adapters exist only in tests. A production adapter requires an
approved source, identity, security, provider, storage, retention, and
operational contract.

Caller-supplied agent, domain, and knowledge scopes are rejected. Security
filters are derived from the approved routing decision, applied before ranking,
and verified again before results are assembled. Stored chunk identities and
canonical citation evidence are recomputed before ranking. Citation evidence
binds source URI, title, document checksum, source location, and content
integrity. Successful audit events retain structured document/version/chunk,
source-location, and sanitized ranking-score associations without query or
content payloads. Retrieved content is explicitly marked as untrusted data with
no instruction authority. Live transactional Core data is outside this runtime
and remains accessible only through approved Tool/API boundaries.

## Stored chunk provenance compatibility

Baseline 06 section 8 requires document `source_owner`, `created_at`, and
`updated_at`; its chunking requirements state that chunks inherit parent metadata.
Each stored `KnowledgeChunk` now requires `source_owner`, `document_created_at`,
and `document_updated_at`, copied directly from validated parent metadata.
Both document timestamps must satisfy the existing datetime syntax, and update
time must be greater than or equal to creation time. These retained declarations
do not authenticate ownership, establish trusted chronology, or replace approval,
authorization, tenant filtering, expiry, revocation, or integrity checks.

This tightens the internal stored-record contract. Older records missing owner or
creation time are rejected at retrieval with the existing sanitized
`INVALID_RESPONSE` error; no owner or timestamp is inferred or backfilled.
Reingest affected documents only from original, complete metadata through the
normal validated and authorized ingestion path. If that metadata is unavailable,
keep the records unavailable rather than fabricate provenance. Any deployed
store migration or reingestion requires a separately reviewed operational plan;
this repository supplies only deterministic test storage and performs no
production reingestion.

Stable chunk IDs, document checksums and citation evidence hashes retain their
existing inputs: owner and creation time are not added to their integrity claims.
Public ingestion/retrieval responses, citations and telemetry do not expose the
new fields. Repository-owned synthetic chunk fixtures explicitly provide them;
other test chunks inherit them through ingestion. AQ06 and governance findings
remain open beyond this bounded provenance-retention fix.
