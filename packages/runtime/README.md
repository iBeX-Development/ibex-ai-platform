# Shared runtime package

Phase 3 shared routing contracts and orchestration foundation.

- `AgentRegistry` stores validated, versioned agent metadata and fails closed for disabled,
  unauthorized, or ambiguous routes.
- `PromptRegistry` resolves approved prompt metadata in immutable Master → Orchestrator → Domain
  order.
- `SharedAgentRuntime` preserves trusted context and correlation while validating injected intent,
  RAG planning, Tool planning, and model policy decisions.
- Runtime controls provide context limits, timeout and cancellation, token budget metadata, retry
  policy metadata, and approved model fallback constraints.

The package does not implement domain reasoning, provider calls, model execution, RAG retrieval,
Tool execution, approval workflow, or autonomous multi-agent behavior.
