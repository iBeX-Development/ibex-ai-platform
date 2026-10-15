# Warehouse Agent

Phase 8 evaluation-stage implementation with versioned intent policy, prompt, logical Tool allowlist, RAG scopes, output contract, and evaluation dataset.

Live inventory, Part, Receipt, Issue, and Work Order material reads remain disabled pending approved Core contracts. Issue preparation remains a disabled proposal-only boundary. No stock reservation, issue, transfer, receipt, adjustment, or approval can execute here.

`PilotAgentRuntime.executeWarehouseRead(request)` projects verified runtime evidence into the baseline 14 section 24 read response. Warehouse knowledge maps to informational/R0; inventory and Work Order material queries map to analysis/R1. It preserves the validated answer, limitations, and complete citations, separating RAG citations into `sources` and Tool citations into `tools_used`. Evidence status is `Sufficient`, proposed action is null, approval is false, and warnings are empty. No records, quantities, readiness calculations, or additional evidence are generated.

The method executes request, authorization, and evidence validation internally; a typed response object or an override of public `execute` cannot supply evidence. Unsupported intents, contradictory classifications, proposals, routing, and insufficient evidence fail closed. The exported strict schema validates shape only and does not attest provenance. Generic `execute` responses remain unchanged. This partial AQ03 evaluation surface adds no endpoint, live capability, risk audit compliance claim, or release readiness; successful examples require the explicit synthetic P0 harness.
