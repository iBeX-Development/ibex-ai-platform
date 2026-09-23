# Orchestrator module

Phase 3 implements the shared routing runtime in `packages/runtime`. It validates an injected
intent classification, selects one authorized active agent from the versioned registry, resolves
the approved Master → Orchestrator → Domain prompt hierarchy, validates planning metadata, and
preserves request, trace, tenant, and audit correlation.

Intent classification and RAG, Tool, and model policy planning are injected interfaces. This
module contains no provider calls, document retrieval, Tool execution, approval workflow, domain
reasoning, or autonomous multi-agent execution.
