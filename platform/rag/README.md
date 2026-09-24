# RAG Runtime

Phase 6 implementation is provided by `packages/rag-runtime`.

The runtime contains approved-document admission, stable structure-aware chunk
identity, integrity evidence, provider-neutral embedding and storage ports,
tenant and access filtering before ranking, post-filter verification,
citations, and sanitized audit/tracing. No production embedding provider,
vector store, document connector, or live transactional Core data source is
configured.
