import { PlatformError } from '../../errors/src/index.js';
import { createTrustedRequestContext } from '../../security/src/index.js';
import {
  agentEvidenceSchema,
  pilotAgentAuditEventSchema,
  pilotAgentProfileSchema,
  pilotAgentResponseSchema,
  type PilotAgentExecutionRequest,
  type PilotAgentAuditPort,
  type PilotAgentProfile,
  type PilotAgentResponse
} from './contracts.js';

const ABSTENTION = 'Insufficient approved evidence is available for this request.';

function hasAll(actual: readonly string[], required: readonly string[]): boolean {
  return required.every((value) => actual.includes(value));
}

function freezeResponse(response: PilotAgentResponse): PilotAgentResponse {
  return Object.freeze({
    ...response,
    citations: Object.freeze([...response.citations]),
    limitations: Object.freeze([...response.limitations])
  });
}

export class PilotAgentRuntime {
  private readonly profile: PilotAgentProfile;

  constructor(
    profile: unknown,
    private readonly audit: PilotAgentAuditPort
  ) {
    this.profile = pilotAgentProfileSchema.parse(profile);
  }

  execute(request: PilotAgentExecutionRequest, now = new Date()): PilotAgentResponse {
    const context = createTrustedRequestContext(request.context);
    const evidence = agentEvidenceSchema.parse(request.evidence);

    const boundaryMatches =
      request.agent_id === this.profile.agent_id &&
      request.agent_version === this.profile.versions.agent &&
      request.domain === this.profile.domain &&
      request.trace_id === evidence.trace_id &&
      context.tenant_id === evidence.tenant_id &&
      context.user_id === evidence.user_id &&
      context.session_id === evidence.session_id &&
      context.request_id === evidence.request_id &&
      context.correlation_id === evidence.correlation_id;
    if (!boundaryMatches) {
      this.emitAudit(request, context, 'denied', [], false, now);
      throw new PlatformError('TENANT_CONTEXT_ERROR', 'Request context is invalid', 403);
    }

    const policy = this.profile.intents.find((item) => item.intent === request.intent);
    if (!policy)
      return this.abstain(request, context, 'Intent is outside the approved agent scope', now);

    if (
      !hasAll(context.permissions, policy.required_permissions) ||
      !hasAll(context.entitlements, policy.required_entitlements)
    ) {
      this.emitAudit(request, context, 'denied', [], policy.proposal_only, now);
      throw new PlatformError('PERMISSION_DENIED', 'Access denied', 403);
    }

    if (
      request.requested_rag_scopes.some((scope) => !policy.rag_scopes.includes(scope)) ||
      request.requested_tool_capabilities.some(
        (capability) => !policy.tool_capability_classes.includes(capability)
      )
    ) {
      this.emitAudit(request, context, 'denied', [], policy.proposal_only, now);
      throw new PlatformError('PERMISSION_DENIED', 'Access denied', 403);
    }

    if (policy.tool_capability_classes.length > 0 && evidence.tool_execution_mode === 'live_core') {
      // Exact live Core contracts and identities are not approved. Phase 8 keeps live paths disabled.
      return this.abstain(request, context, 'Live Core Tool/API binding is not approved', now);
    }

    const evidenceAllowed =
      evidence.rag_citations.every(
        (citation) =>
          policy.rag_scopes.includes(citation.scope) &&
          request.requested_rag_scopes.includes(citation.scope)
      ) &&
      evidence.tool_citations.every(
        (citation) =>
          policy.tool_capability_classes.includes(citation.capability_class) &&
          request.requested_tool_capabilities.includes(citation.capability_class) &&
          citation.source_id === citation.capability_class
      );
    if (!evidenceAllowed) {
      this.emitAudit(request, context, 'denied', [], policy.proposal_only, now);
      throw new PlatformError('PERMISSION_DENIED', 'Access denied', 403);
    }

    const ragSufficient = evidence.rag_citations.length > 0;
    const toolSufficient = evidence.tool_citations.length > 0;
    const sufficient =
      policy.evidence === 'none' ||
      (policy.evidence === 'rag' && ragSufficient) ||
      (policy.evidence === 'tool' && toolSufficient) ||
      (policy.evidence === 'tool_and_rag' && ragSufficient && toolSufficient);
    if (!sufficient)
      return this.abstain(request, context, 'Required approved evidence is unavailable', now);

    const citations = Object.freeze(
      [...evidence.tool_citations, ...evidence.rag_citations].map((citation) => ({
        source_type: citation.source_type,
        source_id: citation.source_id,
        source_version: citation.source_version,
        source_reference: citation.source_reference,
        ...(citation.content_hash ? { content_hash: citation.content_hash } : {}),
        ...(citation.citation_evidence_hash
          ? { citation_evidence_hash: citation.citation_evidence_hash }
          : {})
      }))
    );
    const response = freezeResponse(
      pilotAgentResponseSchema.parse({
        contract_version: '1.0',
        request_id: context.request_id,
        correlation_id: context.correlation_id,
        trace_id: request.trace_id,
        agent_id: this.profile.agent_id,
        agent_version: this.profile.versions.agent,
        prompt_version: this.profile.versions.prompt,
        intent: policy.intent,
        response_type: policy.response_type,
        evidence_status: 'sufficient',
        answer: request.candidate_answer,
        citations,
        approval_required: policy.proposal_only,
        limitations:
          policy.response_type === 'recommendation'
            ? ['AI recommendation is not an approved engineering decision']
            : []
      })
    );
    this.emitAudit(
      request,
      context,
      'allowed',
      citations.map((citation) => citation.source_reference),
      policy.proposal_only,
      now
    );
    return response;
  }

  private abstain(
    request: PilotAgentExecutionRequest,
    context: ReturnType<typeof createTrustedRequestContext>,
    reason: string,
    now: Date
  ): PilotAgentResponse {
    const response = freezeResponse(
      pilotAgentResponseSchema.parse({
        contract_version: '1.0',
        request_id: request.context.request_id,
        correlation_id: request.context.correlation_id,
        trace_id: request.trace_id,
        agent_id: this.profile.agent_id,
        agent_version: this.profile.versions.agent,
        prompt_version: this.profile.versions.prompt,
        intent: request.intent,
        response_type: 'abstain',
        evidence_status: 'insufficient',
        answer: ABSTENTION,
        citations: [],
        approval_required: false,
        limitations: [reason]
      })
    );
    this.emitAudit(request, context, 'abstained', [], false, now);
    return response;
  }

  private emitAudit(
    request: PilotAgentExecutionRequest,
    context: ReturnType<typeof createTrustedRequestContext>,
    outcome: 'allowed' | 'abstained' | 'denied',
    evidenceReferences: readonly string[],
    approvalRequired: boolean,
    now: Date
  ): void {
    this.audit.emit(
      pilotAgentAuditEventSchema.parse({
        event_type: 'pilot_agent_execution',
        trust: 'trusted_context_bound',
        timestamp: now.toISOString(),
        tenant_id: context.tenant_id,
        user_id: context.user_id,
        role: context.role,
        session_id: context.session_id,
        request_id: context.request_id,
        correlation_id: context.correlation_id,
        trace_id: request.trace_id,
        agent_id: this.profile.agent_id,
        agent_version: this.profile.versions.agent,
        prompt_version: this.profile.versions.prompt,
        permission_references: context.permissions,
        entitlement_references: context.entitlements,
        intent: request.intent,
        outcome,
        evidence_references: evidenceReferences,
        approval_state: approvalRequired ? 'required_not_executed' : 'not_required'
      })
    );
  }
}
