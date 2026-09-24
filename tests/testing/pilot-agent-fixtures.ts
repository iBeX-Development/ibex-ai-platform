import {
  PilotAgentRuntime,
  type AgentEvidence,
  type PilotAgentAuditEvent,
  type PilotAgentExecutionRequest,
  type PilotAgentProfile
} from '../../packages/pilot-agents/src/index.js';
import { createTrustedRequestContext } from '../../packages/security/src/index.js';

export const pilotValidationTime = new Date('2026-09-24T02:00:00.000Z');

export function pilotContext(overrides: Record<string, unknown> = {}) {
  return createTrustedRequestContext({
    tenant_id: 'tenant-a',
    user_id: 'user-1',
    role: 'operator',
    permissions: [],
    entitlements: [],
    session_id: 'session-1',
    request_id: 'request-p8-1',
    correlation_id: 'correlation-p8-1',
    channel: 'web',
    locale: 'mn',
    ...overrides
  });
}

export function pilotEvidence(overrides: Partial<AgentEvidence> = {}): AgentEvidence {
  return {
    tenant_id: 'tenant-a',
    user_id: 'user-1',
    session_id: 'session-1',
    request_id: 'request-p8-1',
    correlation_id: 'correlation-p8-1',
    trace_id: 'trace-p8-1',
    trust: 'trusted_internal_runtime',
    tool_execution_mode: 'deterministic_test',
    rag_citations: [],
    tool_citations: [],
    ...overrides
  };
}

export function ragCitation(sourceId = 'document-1', scope = 'ibex-handbook') {
  return {
    source_type: 'rag' as const,
    producer: 'rag_runtime' as const,
    source_id: sourceId,
    source_version: '1.0',
    source_reference: 'knowledge://approved/document-1#section-1',
    content_hash: `sha256:${'a'.repeat(64)}`,
    citation_evidence_hash: `sha256:${'b'.repeat(64)}`,
    scope
  };
}

export function toolCitation(capabilityClass: string) {
  return {
    source_type: 'tool' as const,
    producer: 'tool_runtime' as const,
    source_id: capabilityClass,
    source_version: 'test-1.0',
    source_reference: `test-tool://${capabilityClass}/result-1`,
    capability_class: capabilityClass
  };
}

export function pilotRequest(
  agent: {
    readonly agent_id: string;
    readonly domain: string;
    readonly versions: { readonly agent: string };
  },
  overrides: Partial<PilotAgentExecutionRequest> = {}
): PilotAgentExecutionRequest {
  return {
    context: pilotContext(),
    trace_id: 'trace-p8-1',
    agent_id: agent.agent_id,
    agent_version: agent.versions.agent,
    domain: agent.domain,
    intent: 'GENERAL_KNOWLEDGE',
    requested_rag_scopes: [],
    requested_tool_capabilities: [],
    candidate_answer: 'Approved evidence-backed answer.',
    evidence: pilotEvidence(),
    ...overrides
  };
}

export function createPilotAgentRuntime(
  profile: PilotAgentProfile,
  audits: PilotAgentAuditEvent[] = []
): PilotAgentRuntime {
  return new PilotAgentRuntime(profile, { emit: (event) => audits.push(event) });
}
