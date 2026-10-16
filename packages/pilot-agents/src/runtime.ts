import { randomUUID } from 'node:crypto';
import { SpanStatusCode, type Span } from '@opentelemetry/api';
import { PlatformError } from '../../errors/src/index.js';
import { agentFeatureEnabled, type FeatureControls } from '../../configuration/src/index.js';
import {
  createOrchestratorAuditEvent,
  type AuditEventSink,
  type PromptHierarchyAuditEvidence
} from '../../audit/src/index.js';
import {
  citationEvidenceHashForStoredChunk,
  knowledgeChunkSchema,
  ragRetrievalResponseSchema,
  stableChunkIdForStoredChunk,
  sha256Evidence
} from '../../rag-runtime/src/index.js';
import { createTrustedRequestContext } from '../../security/src/index.js';
import { tracer } from '../../observability/src/index.js';
import {
  toolExecutionResponseSchema,
  type ToolBindingCatalog
} from '../../tool-runtime/src/index.js';
import { warehouseReadResponseSchema, type WarehouseReadResponse } from './warehouse-read.js';
import {
  pilotAgentExecutionRequestSchema,
  pilotAgentProfileSchema,
  pilotAgentResponseSchema,
  type AgentCitation,
  type PilotAgentExecutionRequest,
  type PilotAgentGroundingPort,
  type PilotAgentProfile,
  type PilotAgentResponse,
  type PilotIntentPolicy
} from './contracts.js';

const ABSTENTION = 'Insufficient approved evidence is available for this request.';

// Server-owned reporting budget; independent of caller cancellation and attempt policy.
const failureReportingBudgetMs = 1_000;

async function awaitFailureReport(emit: () => Promise<void>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error('Failure audit reporting timed out'));
        }, failureReportingBudgetMs);
      }),
      // Observe late rejection/fulfillment even when the reporting budget expires.
      Promise.resolve().then(emit)
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export interface PilotAgentRuntimeOptions {
  readonly featureControls: FeatureControls;
  readonly service: string;
  readonly environment: string;
  readonly promptHierarchy: PromptHierarchyAuditEvidence;
  readonly allowDeterministicTestAdapters?: boolean;
  readonly toolEvidenceBindings?: ToolBindingCatalog;
  readonly boundaryIdentityFactory?: () => Readonly<{
    trace_id: string;
    request_id: string;
    correlation_id: string;
  }>;
}

interface PilotBoundaryIdentity {
  readonly trace_id: string;
  readonly request_id: string;
  readonly correlation_id: string;
}

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

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function validatedCorrelationIdentifier(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > 256) return undefined;
  if (value.trim() !== value) return undefined;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit <= 31 || codeUnit === 127) return undefined;
  }
  return value;
}

function createBoundaryIdentity(factory?: PilotAgentRuntimeOptions['boundaryIdentityFactory']) {
  const fallback = (): PilotBoundaryIdentity =>
    Object.freeze({
      trace_id: randomUUID(),
      request_id: randomUUID(),
      correlation_id: randomUUID()
    });
  if (!factory) return fallback();
  try {
    const candidate = factory();
    const traceId = validatedCorrelationIdentifier(candidate.trace_id);
    const requestId = validatedCorrelationIdentifier(candidate.request_id);
    const correlationId = validatedCorrelationIdentifier(candidate.correlation_id);
    if (!traceId || !requestId || !correlationId) return fallback();
    return Object.freeze({
      trace_id: traceId,
      request_id: requestId,
      correlation_id: correlationId
    });
  } catch {
    return fallback();
  }
}

export class PilotAgentRuntime {
  private readonly profile: PilotAgentProfile;

  constructor(
    profile: unknown,
    private readonly grounding: PilotAgentGroundingPort,
    private readonly audit: AuditEventSink,
    private readonly options: PilotAgentRuntimeOptions
  ) {
    this.profile = pilotAgentProfileSchema.parse(profile);
  }

  async execute(rawRequest: unknown, now = new Date()): Promise<PilotAgentResponse> {
    return this.#execute(rawRequest, now);
  }

  async executeWarehouseRead(
    rawRequest: unknown,
    now = new Date()
  ): Promise<WarehouseReadResponse> {
    const unavailable = () =>
      new PlatformError('VALIDATION_ERROR', 'Warehouse read response is unavailable', 400);
    if (this.profile.agent_id !== 'warehouse' || this.profile.domain !== 'warehouse') {
      throw unavailable();
    }
    // Do not accept a caller-supplied response or dispatch through overridable execute.
    const response = await this.#execute(rawRequest, now);
    const informational =
      response.intent === 'WAREHOUSE_KNOWLEDGE_QUERY' && response.response_type === 'knowledge';
    const analysis =
      (response.intent === 'INVENTORY_QUERY' && response.response_type === 'operational') ||
      (response.intent === 'WORK_ORDER_MATERIAL_QUERY' && response.response_type === 'analysis');
    if (
      response.agent_id !== 'warehouse' ||
      (!informational && !analysis) ||
      response.evidence_status !== 'sufficient' ||
      response.approval_required
    ) {
      throw unavailable();
    }
    const projected = warehouseReadResponseSchema.safeParse({
      agent: 'warehouse',
      response_type: informational ? 'informational' : 'analysis',
      risk_level: informational ? 'R0' : 'R1',
      answer: response.answer,
      evidence_status: 'Sufficient',
      sources: response.citations.filter((citation) => citation.source_type === 'rag'),
      tools_used: response.citations.filter((citation) => citation.source_type === 'tool'),
      proposed_action: null,
      approval_required: false,
      warnings: [],
      limitations: response.limitations
    });
    if (!projected.success) throw unavailable();
    return projected.data;
  }

  async #execute(rawRequest: unknown, now: Date): Promise<PilotAgentResponse> {
    const boundary = createBoundaryIdentity(this.options.boundaryIdentityFactory);
    return tracer.startActiveSpan('pilot-agent.execute', async (span) => {
      span.setAttributes({
        'ibex.pilot.boundary_trace_id': boundary.trace_id,
        'ibex.pilot.boundary_request_id': boundary.request_id,
        'ibex.pilot.boundary_correlation_id': boundary.correlation_id,
        'ibex.pilot.agent_id': this.profile.agent_id
      });
      try {
        if (!this.options.featureControls.aiPlatform || !this.options.featureControls.agents) {
          await this.emitAudit(
            undefined,
            boundary.trace_id,
            'rejected',
            'boundary_context',
            'SERVICE_UNAVAILABLE',
            undefined,
            now,
            [],
            'insufficient',
            false,
            boundary
          );
          throw new PlatformError(
            'SERVICE_UNAVAILABLE',
            'AI runtime is unavailable',
            503,
            undefined,
            boundary.trace_id,
            boundary.request_id
          );
        }
        if (!agentFeatureEnabled(this.options.featureControls, this.profile.agent_id)) {
          await this.emitAudit(
            undefined,
            boundary.trace_id,
            'rejected',
            'boundary_context',
            'PERMISSION_DENIED',
            undefined,
            now,
            [],
            'insufficient',
            false,
            boundary
          );
          throw new PlatformError(
            'PERMISSION_DENIED',
            'Access denied',
            403,
            undefined,
            boundary.trace_id,
            boundary.request_id
          );
        }
        const response = await this.executeWithinBoundary(rawRequest, boundary, span, now);
        span.setAttribute('ibex.pilot.outcome', response.response_type);
        span.setStatus({ code: SpanStatusCode.OK });
        return response;
      } catch (error) {
        span.setAttribute('ibex.pilot.outcome', 'rejected');
        span.recordException(new Error('Pilot Agent request rejected'));
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw error;
      } finally {
        span.end();
      }
    });
  }

  private async executeWithinBoundary(
    rawRequest: unknown,
    boundary: PilotBoundaryIdentity,
    span: Span,
    now: Date
  ): Promise<PilotAgentResponse> {
    let parsed: ReturnType<typeof pilotAgentExecutionRequestSchema.parse>;
    try {
      parsed = pilotAgentExecutionRequestSchema.parse(rawRequest);
    } catch {
      await this.emitAudit(
        undefined,
        boundary.trace_id,
        'rejected',
        'boundary_context',
        'VALIDATION_ERROR',
        undefined,
        now,
        [],
        'insufficient',
        false,
        boundary
      );
      throw new PlatformError(
        'VALIDATION_ERROR',
        'Request is invalid',
        400,
        undefined,
        boundary.trace_id,
        boundary.request_id
      );
    }

    const raw = record(rawRequest);
    const rawContext = record(raw.context);
    const suppliedTraceId = validatedCorrelationIdentifier(raw.trace_id);
    const suppliedRequestId = validatedCorrelationIdentifier(rawContext.request_id);
    const suppliedCorrelationId = validatedCorrelationIdentifier(rawContext.correlation_id);
    if (!suppliedTraceId || !suppliedRequestId || !suppliedCorrelationId) {
      await this.emitAudit(
        undefined,
        boundary.trace_id,
        'rejected',
        'boundary_trace',
        'VALIDATION_ERROR',
        undefined,
        now,
        [],
        'insufficient',
        false,
        boundary
      );
      throw new PlatformError(
        'VALIDATION_ERROR',
        'Request is invalid',
        400,
        undefined,
        boundary.trace_id,
        boundary.request_id
      );
    }

    let context: ReturnType<typeof createTrustedRequestContext>;
    try {
      context = createTrustedRequestContext(parsed.context);
    } catch {
      await this.emitAudit(
        undefined,
        boundary.trace_id,
        'rejected',
        'boundary_context',
        'TENANT_CONTEXT_ERROR',
        undefined,
        now,
        [],
        'insufficient',
        false,
        boundary
      );
      throw new PlatformError(
        'TENANT_CONTEXT_ERROR',
        'Request context is invalid',
        403,
        undefined,
        boundary.trace_id,
        boundary.request_id
      );
    }
    span.setAttributes({
      'ibex.request_id': context.request_id,
      'ibex.correlation_id': context.correlation_id,
      'ibex.tenant_id': context.tenant_id,
      'ibex.user_id': context.user_id,
      'ibex.pilot.supplied_trace_id': suppliedTraceId
    });
    const request: PilotAgentExecutionRequest = { ...parsed, trace_id: suppliedTraceId, context };

    if (
      request.agent_id !== this.profile.agent_id ||
      request.agent_version !== this.profile.versions.agent ||
      request.domain !== this.profile.domain
    ) {
      await this.emitAudit(
        context,
        request.trace_id,
        'rejected',
        'authorization',
        'TENANT_CONTEXT_ERROR',
        request.intent,
        now
      );
      throw new PlatformError('TENANT_CONTEXT_ERROR', 'Request context is invalid', 403);
    }

    const policy = this.profile.intents.find((item) => item.intent === request.intent);
    if (!policy)
      return this.abstain(request, context, 'Intent is outside the approved agent scope', now);

    if (policy.authorization_status !== 'approved') {
      await this.emitAudit(
        context,
        request.trace_id,
        'rejected',
        'authorization',
        'PERMISSION_DENIED',
        policy.intent,
        now
      );
      throw new PlatformError('PERMISSION_DENIED', 'Access denied', 403);
    }
    if (
      !hasAll(context.permissions, policy.required_permissions) ||
      !hasAll(context.entitlements, policy.required_entitlements)
    ) {
      await this.emitAudit(
        context,
        request.trace_id,
        'rejected',
        'authorization',
        'PERMISSION_DENIED',
        policy.intent,
        now
      );
      throw new PlatformError('PERMISSION_DENIED', 'Access denied', 403);
    }
    if (
      request.requested_rag_scopes.some((scope) => !policy.rag_scopes.includes(scope)) ||
      request.requested_tool_capabilities.some(
        (capability) => !policy.tool_capability_classes.includes(capability)
      )
    ) {
      await this.emitAudit(
        context,
        request.trace_id,
        'rejected',
        'authorization',
        'PERMISSION_DENIED',
        policy.intent,
        now
      );
      throw new PlatformError('PERMISSION_DENIED', 'Access denied', 403);
    }
    if (
      (request.requested_rag_scopes.length > 0 && !this.options.featureControls.rag) ||
      (request.requested_tool_capabilities.length > 0 && !this.options.featureControls.tools) ||
      (policy.proposal_only && !this.options.featureControls.actionTools)
    ) {
      const denial = new PlatformError('PERMISSION_DENIED', 'Access denied', 403);
      try {
        await awaitFailureReport(() =>
          this.emitAudit(
            context,
            request.trace_id,
            'rejected',
            'authorization',
            denial.code,
            policy.intent,
            now
          )
        );
      } catch {
        span.addEvent('pilot-agent.audit.emission_failed');
      }
      throw denial;
    }

    if (policy.tool_capability_classes.length > 0) {
      const syntheticAllowed =
        this.options.environment === 'test' &&
        this.options.allowDeterministicTestAdapters === true &&
        policy.tool_capability_classes.every((capability) =>
          this.profile.tool_allowlist.some(
            (entry) => entry.capability_class === capability && entry.enabled
          )
        );
      if (!syntheticAllowed)
        return this.abstain(request, context, 'Live Core Tool/API binding is not approved', now);
    }

    if (policy.evidence === 'none') {
      return this.respond(
        request,
        policy,
        'Request routed through the approved orchestrator boundary.',
        [],
        context,
        now
      );
    }

    let evidence;
    try {
      evidence = await this.grounding.resolve({
        context,
        trace_id: request.trace_id,
        agent_id: this.profile.agent_id,
        agent_version: this.profile.versions.agent,
        domain: this.profile.domain,
        intent: policy.intent,
        rag_scopes: request.requested_rag_scopes,
        tool_capabilities: request.requested_tool_capabilities
      });
    } catch {
      return this.abstain(request, context, 'Approved grounding evidence is unavailable', now);
    }

    try {
      const citations = this.verifyEvidence(evidence, request, policy, context);
      if (!evidence.answer.trim()) throw new Error('Answer unavailable');
      return await this.respond(request, policy, evidence.answer, citations, context, now);
    } catch {
      await this.emitAudit(
        context,
        request.trace_id,
        'rejected',
        'output_validation',
        'VALIDATION_ERROR',
        policy.intent,
        now
      );
      return this.abstain(
        request,
        context,
        'Approved grounding evidence failed integrity validation',
        now
      );
    }
  }

  private verifyEvidence(
    evidence: Awaited<ReturnType<PilotAgentGroundingPort['resolve']>>,
    request: PilotAgentExecutionRequest,
    policy: PilotIntentPolicy,
    context: ReturnType<typeof createTrustedRequestContext>
  ): readonly AgentCitation[] {
    const citations: AgentCitation[] = [];
    for (const raw of evidence.tool_responses) {
      const response = toolExecutionResponseSchema.parse(raw);
      const bindings = this.options.toolEvidenceBindings;
      const matches = bindings
        ? request.requested_tool_capabilities.filter((capability) => {
            if (!policy.tool_capability_classes.includes(capability)) return false;
            const binding = bindings.resolve({
              agent_id: request.agent_id,
              agent_version: request.agent_version,
              domain: request.domain,
              intent: request.intent,
              conceptual_capability: capability
            });
            return (
              this.options.environment === 'test' &&
              this.options.allowDeterministicTestAdapters === true &&
              binding?.mode === 'deterministic_test' &&
              binding.concrete_tool.tool_id === response.tool_id &&
              binding.concrete_tool.tool_version === response.tool_version
            );
          }).length === 1
        : policy.tool_capability_classes.includes(response.tool_id) &&
          request.requested_tool_capabilities.includes(response.tool_id);
      if (
        response.request_id !== context.request_id ||
        response.correlation_id !== context.correlation_id ||
        response.trace_id !== request.trace_id ||
        !matches
      )
        throw new Error('Tool evidence binding mismatch');
      if (response.status !== 'success')
        throw new Error('Proposal evidence cannot ground an answer');
      citations.push({
        source_type: 'tool',
        source_id: response.tool_id,
        source_version: response.tool_version,
        source_reference: response.source.reference
      });
    }

    for (const item of evidence.rag) {
      const response = ragRetrievalResponseSchema.parse(item.response);
      if (
        response.request_id !== context.request_id ||
        response.correlation_id !== context.correlation_id ||
        response.trace_id !== request.trace_id
      )
        throw new Error('RAG evidence binding mismatch');
      const chunks = item.chunks.map((chunk) => knowledgeChunkSchema.parse(chunk));
      for (const result of response.results) {
        const chunk = chunks.find((candidate) => candidate.chunk_id === result.citation.chunk_id);
        if (
          !chunk ||
          sha256Evidence(chunk.content) !== chunk.content_hash ||
          stableChunkIdForStoredChunk(chunk) !== chunk.chunk_id ||
          citationEvidenceHashForStoredChunk(chunk) !== chunk.citation_evidence_hash
        )
          throw new Error('RAG evidence integrity mismatch');
        if (
          chunk.content !== result.content ||
          chunk.document_id !== result.citation.document_id ||
          chunk.document_version !== result.citation.document_version ||
          chunk.title !== result.citation.title ||
          chunk.source_uri !== result.citation.source_uri ||
          chunk.content_hash !== result.citation.content_hash ||
          chunk.document_checksum !== result.citation.document_checksum ||
          chunk.citation_evidence_hash !== result.citation.citation_evidence_hash ||
          JSON.stringify(chunk.source_location) !==
            JSON.stringify(result.citation.source_location) ||
          !chunk.allowed_agents.includes(this.profile.agent_id) ||
          !chunk.domains.includes(this.profile.domain) ||
          !chunk.knowledge_scopes.some(
            (scope) =>
              policy.rag_scopes.includes(scope) && request.requested_rag_scopes.includes(scope)
          ) ||
          (chunk.tenant_scope === 'tenant_private' && chunk.tenant_id !== context.tenant_id)
        )
          throw new Error('RAG citation binding mismatch');
        citations.push({
          source_type: 'rag',
          source_id: chunk.document_id,
          source_version: chunk.document_version,
          source_reference: `${chunk.source_uri}#${chunk.source_location.reference}`,
          content_hash: chunk.content_hash,
          citation_evidence_hash: chunk.citation_evidence_hash
        });
      }
    }
    const ragSufficient = citations.some((citation) => citation.source_type === 'rag');
    const toolSufficient = citations.some((citation) => citation.source_type === 'tool');
    if (
      (policy.evidence === 'rag' && !ragSufficient) ||
      (policy.evidence === 'tool' && !toolSufficient) ||
      (policy.evidence === 'tool_and_rag' && (!ragSufficient || !toolSufficient))
    )
      throw new Error('Required evidence unavailable');
    return Object.freeze(citations);
  }

  private async respond(
    request: PilotAgentExecutionRequest,
    policy: PilotIntentPolicy,
    answer: string,
    citations: readonly AgentCitation[],
    context: ReturnType<typeof createTrustedRequestContext>,
    now: Date
  ): Promise<PilotAgentResponse> {
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
        answer,
        citations,
        approval_required: policy.proposal_only,
        limitations:
          policy.response_type === 'recommendation'
            ? ['AI recommendation is not an approved engineering decision']
            : []
      })
    );
    await this.emitAudit(
      context,
      request.trace_id,
      'routed',
      'output_validation',
      undefined,
      policy.intent,
      now,
      citations,
      'sufficient',
      policy.proposal_only
    );
    return response;
  }

  private async abstain(
    request: PilotAgentExecutionRequest,
    context: ReturnType<typeof createTrustedRequestContext>,
    reason: string,
    now: Date
  ): Promise<PilotAgentResponse> {
    const response = freezeResponse(
      pilotAgentResponseSchema.parse({
        contract_version: '1.0',
        request_id: context.request_id,
        correlation_id: context.correlation_id,
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
    await this.emitAudit(
      context,
      request.trace_id,
      'fallback',
      'output_validation',
      undefined,
      request.intent,
      now,
      [],
      'insufficient',
      false
    );
    return response;
  }

  private emitAudit(
    context: ReturnType<typeof createTrustedRequestContext> | undefined,
    traceId: string,
    outcome: 'routed' | 'fallback' | 'rejected' | 'error',
    stage: 'boundary_context' | 'boundary_trace' | 'authorization' | 'output_validation',
    errorCode: string | undefined,
    intent: string | undefined,
    now: Date,
    citations: readonly AgentCitation[] = [],
    evidenceStatus: 'sufficient' | 'insufficient' = 'insufficient',
    approvalRequired = false,
    boundary?: PilotBoundaryIdentity
  ): Promise<void> {
    return this.audit.emit(
      createOrchestratorAuditEvent({
        traceId,
        service: this.options.service,
        environment: this.options.environment,
        ...(context ? { context } : {}),
        outcome,
        stage,
        timestamp: now,
        ...(intent ? { intent } : {}),
        domain: this.profile.domain,
        selectedAgent: this.profile.agent_id,
        agentVersion: this.profile.versions.agent,
        promptHierarchy: this.options.promptHierarchy,
        sourcesUsed: citations
          .filter((item) => item.source_type === 'rag')
          .map((item) => ({
            source_id: item.source_id,
            version: item.source_version,
            reference: item.source_reference
          })),
        toolsUsed: citations
          .filter((item) => item.source_type === 'tool')
          .map((item) => ({
            tool_id: item.source_id,
            version: item.source_version,
            reference: item.source_reference
          })),
        evidenceStatus,
        responseStatus: outcome === 'routed' ? 'success' : 'rejected',
        approvalState: approvalRequired ? 'required_not_executed' : 'not_required',
        ...(boundary
          ? {
              boundaryRequestId: boundary.request_id,
              boundaryCorrelationId: boundary.correlation_id
            }
          : {}),
        ...(errorCode ? { errorCode } : {})
      })
    );
  }
}
