# RAG Runtime

Phase 6 provides the controlled ingestion and retrieval foundation for approved
document knowledge. It validates trusted context, server authorization,
governance approval, document integrity, tenant and access metadata, stable
chunk identity, citations, and sanitized audit correlation.

Embedding, ranking, and knowledge storage are provider-neutral ports. This
package selects no production embedding provider or vector-store technology.
Deterministic adapters exist only in tests. A production adapter requires an
approved source, identity, security, provider, storage, retention, and
operational contract.

Security filters are applied before ranking and verified again before results
are assembled. Retrieved content is explicitly marked as untrusted data with
no instruction authority. Live transactional Core data is outside this
runtime and remains accessible only through approved Tool/API boundaries.
