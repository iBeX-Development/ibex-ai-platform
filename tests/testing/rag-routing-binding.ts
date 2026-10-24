// Test-only composition; no cache, production registration or new authority backend.
import { randomUUID } from 'node:crypto';
import { PlatformError } from '../../packages/errors/src/index.js';
import {
  createTrustedRequestContext,
  type TrustedRequestContext
} from '../../packages/security/src/index.js';
import type { OrchestratorRequest, SharedAgentRuntime } from '../../packages/runtime/src/index.js';
import type {
  RagRetrievalScopePort,
  RagRuntimeService
} from '../../packages/rag-runtime/src/index.js';
import { structuredSnapshot } from './scoped-factual-grounding-ingress.js';

export async function bindRagInvocation(
  orchestrator: SharedAgentRuntime,
  request: OrchestratorRequest,
  buildRetriever: (port: RagRetrievalScopePort) => Pick<RagRuntimeService, 'retrieve'>,
  routingTime: Date
) {
  const deny = () => new PlatformError('PERMISSION_DENIED', 'RAG invocation denied', 403);
  // Snapshot before await. These are synthetic harness limits, not production policy.
  const context = createTrustedRequestContext(
    structuredSnapshot(request.context, { bytes: 16384, depth: 16 })
  );
  const trace = request.trace_id;
  const input = structuredSnapshot(request.input, { bytes: 16384, depth: 16 });
  const result = await orchestrator.route(
    { ...request, context, trace_id: trace, input },
    routingTime
  );
  if (
    result.status !== 'routed' ||
    !result.decision.rag_required ||
    result.decision.rag_scopes.length === 0
  )
    throw deny();
  const decision = result.decision;
  if (
    decision.request_id !== context.request_id ||
    decision.correlation_id !== context.correlation_id ||
    decision.trace_id !== trace
  )
    throw deny();
  // Actual Orchestrator output is frozen, including required_capabilities. Registry
  // authorize() already checked those capabilities; this adapter invents no capability policy.
  const routingId = randomUUID();
  const scope = Object.freeze({
    routing_decision_id: routingId,
    tenant_id: context.tenant_id,
    user_id: context.user_id,
    request_id: context.request_id,
    correlation_id: context.correlation_id,
    agent_id: decision.selected_agent,
    agent_version: decision.agent_version,
    domain: decision.domain,
    knowledge_scopes: Object.freeze([...decision.rag_scopes])
  });
  const serializedContext = JSON.stringify(context);
  const port: RagRetrievalScopePort = Object.freeze({
    resolve: (candidate: TrustedRequestContext, id: string) => {
      try {
        const supplied = createTrustedRequestContext(
          structuredSnapshot(candidate, { bytes: 16384, depth: 16 })
        );
        if (id !== routingId || JSON.stringify(supplied) !== serializedContext) throw deny();
        return Promise.resolve(
          Object.freeze({ allowed: true as const, decision_id: routingId, scope })
        );
      } catch {
        return Promise.resolve(
          Object.freeze({ allowed: false as const, reason: 'RAG invocation denied' })
        );
      }
    }
  });
  const retriever = buildRetriever(port);
  return Object.freeze({
    routingId,
    decision,
    scope,
    port,
    retrieve: (raw: Record<string, unknown>, now: Date) => {
      const snapshot = structuredSnapshot(raw, { bytes: 16384, depth: 16 });
      if (
        typeof snapshot !== 'object' ||
        snapshot === null ||
        !('trace_id' in snapshot) ||
        snapshot.trace_id !== trace
      )
        return Promise.reject(deny());
      return retriever.retrieve(snapshot, {}, now);
    }
  });
}
