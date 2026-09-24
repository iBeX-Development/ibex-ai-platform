import type { z } from 'zod';
import { auditEventSchema } from '../../contracts/src/index.js';
import type { TrustedRequestContext } from '../../security/src/index.js';

export type AuditEvent = Readonly<z.infer<typeof auditEventSchema>>;

export type GatewayAuditStage =
  | 'payload_size'
  | 'endpoint'
  | 'authentication'
  | 'tenant_context'
  | 'payload_schema'
  | 'entitlement'
  | 'rate_limit'
  | 'authorization'
  | 'audit'
  | 'platform'
  | 'response_schema';

export interface GatewaySecurityAuditEvent {
  readonly schema_version: '1.0';
  readonly event_type: 'gateway.request.outcome';
  readonly timestamp: string;
  readonly trace_id: string;
  readonly service: string;
  readonly environment: string;
  readonly outcome: 'accepted' | 'rejected' | 'error';
  readonly stage: GatewayAuditStage;
  readonly error_code?: string;
  readonly trusted_context?: Readonly<{
    tenant_id: string;
    user_id: string;
    session_id: string;
    request_id: string;
    correlation_id: string;
  }>;
}

export type OrchestratorAuditStage =
  | 'boundary_context'
  | 'boundary_trace'
  | 'input_budget'
  | 'intent_classification'
  | 'agent_selection'
  | 'authorization'
  | 'prompt_hierarchy'
  | 'rag_planning'
  | 'tool_planning'
  | 'model_policy'
  | 'output_validation'
  | 'audit';

export interface PromptAuditReference {
  readonly prompt_id: string;
  readonly prompt_version: string;
  readonly content_hash: string;
}

export interface PromptHierarchyAuditEvidence {
  readonly master_policy: PromptAuditReference;
  readonly orchestrator_prompt: PromptAuditReference;
  readonly domain_prompt: PromptAuditReference;
}

interface OrchestratorAuditEventBase {
  readonly schema_version: '1.0';
  readonly event_type: 'orchestrator.routing.outcome';
  readonly timestamp: string;
  readonly trace_id: string;
  readonly service: string;
  readonly environment: string;
  readonly outcome: 'routed' | 'fallback' | 'rejected' | 'error';
  readonly stage: OrchestratorAuditStage;
  readonly intent?: string;
  readonly domain?: string;
  readonly selected_agent?: string;
  readonly agent_version?: string;
  readonly prompt_hierarchy?: PromptHierarchyAuditEvidence;
  readonly error_code?: string;
}

export interface TrustedOrchestratorAuditEvent extends OrchestratorAuditEventBase {
  readonly context_status: 'trusted';
  readonly request_id: string;
  readonly correlation_id: string;
  readonly tenant_id: string;
  readonly user_id: string;
  readonly role: string;
  readonly session_id: string;
  readonly permission_refs: readonly string[];
  readonly entitlement_refs: readonly string[];
}

export interface UntrustedOrchestratorBoundaryAuditEvent extends OrchestratorAuditEventBase {
  readonly context_status: 'unavailable';
  readonly outcome: 'rejected' | 'error';
  readonly stage: 'boundary_context' | 'boundary_trace';
}

export type OrchestratorAuditEvent =
  TrustedOrchestratorAuditEvent | UntrustedOrchestratorBoundaryAuditEvent;

export type ModelGatewayAuditStage =
  | 'boundary_context'
  | 'boundary_trace'
  | 'request_validation'
  | 'policy'
  | 'provider_invocation'
  | 'response_validation'
  | 'metrics';

interface ModelGatewayAuditEventBase {
  readonly schema_version: '1.0';
  readonly event_type: 'model_gateway.invocation.outcome';
  readonly timestamp: string;
  readonly trace_id: string;
  readonly service: string;
  readonly environment: string;
  readonly outcome: 'succeeded' | 'rejected' | 'error';
  readonly stage: ModelGatewayAuditStage;
  readonly agent_id?: string;
  readonly capability?: string;
  readonly confidentiality_class?: string;
  readonly prompt_version?: string;
  readonly policy_version?: string;
  readonly provider_id?: string;
  readonly model_id?: string;
  readonly model_version?: string;
  readonly attempt?: number;
  readonly fallback_used?: boolean;
  readonly input_tokens?: number;
  readonly output_tokens?: number;
  readonly estimated_cost?: number;
  readonly latency_ms?: number;
  readonly error_code?: string;
}

export interface TrustedModelGatewayAuditEvent extends ModelGatewayAuditEventBase {
  readonly context_status: 'trusted';
  readonly request_id: string;
  readonly correlation_id: string;
  readonly tenant_id: string;
  readonly user_id: string;
  readonly role: string;
  readonly session_id: string;
  readonly permission_refs: readonly string[];
  readonly entitlement_refs: readonly string[];
}

export interface UntrustedModelGatewayBoundaryAuditEvent extends ModelGatewayAuditEventBase {
  readonly context_status: 'unavailable';
  readonly outcome: 'rejected' | 'error';
  readonly stage: 'boundary_context' | 'boundary_trace';
}

export type ModelGatewayAuditEvent =
  TrustedModelGatewayAuditEvent | UntrustedModelGatewayBoundaryAuditEvent;

export type ToolRuntimeAuditStage =
  | 'boundary_context'
  | 'boundary_trace'
  | 'request_validation'
  | 'registry'
  | 'input_schema'
  | 'authorization'
  | 'tenant_ownership'
  | 'execution'
  | 'response_schema'
  | 'audit';

interface ToolRuntimeAuditEventBase {
  readonly schema_version: '1.0';
  readonly event_type: 'tool_runtime.execution.outcome';
  readonly timestamp: string;
  readonly trace_id: string;
  readonly service: string;
  readonly environment: string;
  readonly outcome: 'started' | 'succeeded' | 'proposed' | 'rejected' | 'error';
  readonly stage: ToolRuntimeAuditStage;
  readonly tool_id?: string;
  readonly tool_version?: string;
  readonly agent_id?: string;
  readonly prompt_version?: string;
  readonly action_class?: 'read' | 'proposal';
  readonly requested_operation?: 'read' | 'propose';
  readonly permission_decision?: 'allowed' | 'denied';
  readonly approval_policy?: string;
  readonly approval_state?: 'not_required' | 'required_not_executed';
  readonly attempt?: number;
  readonly latency_ms?: number;
  readonly error_code?: string;
}

export interface TrustedToolRuntimeAuditEvent extends ToolRuntimeAuditEventBase {
  readonly context_status: 'trusted';
  readonly request_id: string;
  readonly correlation_id: string;
  readonly tenant_id: string;
  readonly user_id: string;
  readonly role: string;
  readonly session_id: string;
  readonly permission_refs: readonly string[];
  readonly entitlement_refs: readonly string[];
}

export interface UntrustedToolRuntimeBoundaryAuditEvent extends ToolRuntimeAuditEventBase {
  readonly context_status: 'unavailable';
  readonly outcome: 'rejected' | 'error';
  readonly stage: 'boundary_context' | 'boundary_trace';
}

export type ToolRuntimeAuditEvent =
  TrustedToolRuntimeAuditEvent | UntrustedToolRuntimeBoundaryAuditEvent;

export type RagRuntimeAuditStage =
  | 'boundary_context'
  | 'boundary_trace'
  | 'request_validation'
  | 'authorization'
  | 'governance'
  | 'integrity'
  | 'audit'
  | 'embedding'
  | 'security_filter'
  | 'semantic_search'
  | 'result_validation'
  | 'indexing';

interface RagRuntimeAuditEventBase {
  readonly schema_version: '1.0';
  readonly event_type: 'rag_runtime.operation.outcome';
  readonly timestamp: string;
  readonly trace_id: string;
  readonly service: string;
  readonly environment: string;
  readonly operation: 'ingest' | 'retrieve';
  readonly outcome: 'started' | 'succeeded' | 'rejected' | 'error';
  readonly stage: RagRuntimeAuditStage;
  readonly agent_id?: string;
  readonly domain?: string;
  readonly knowledge_scopes?: readonly string[];
  readonly query_hash?: string;
  readonly document_ids?: readonly string[];
  readonly document_versions?: readonly string[];
  readonly chunk_ids?: readonly string[];
  readonly embedding_model?: string;
  readonly embedding_model_version?: string;
  readonly retrieval_version?: string;
  readonly result_count?: number;
  readonly latency_ms?: number;
  readonly error_code?: string;
}

export interface TrustedRagRuntimeAuditEvent extends RagRuntimeAuditEventBase {
  readonly context_status: 'trusted';
  readonly request_id: string;
  readonly correlation_id: string;
  readonly tenant_id: string;
  readonly user_id: string;
  readonly role: string;
  readonly session_id: string;
  readonly permission_refs: readonly string[];
  readonly entitlement_refs: readonly string[];
}

export interface UntrustedRagRuntimeBoundaryAuditEvent extends RagRuntimeAuditEventBase {
  readonly context_status: 'unavailable';
  readonly outcome: 'rejected' | 'error';
  readonly stage: 'boundary_context' | 'boundary_trace';
}

export type RagRuntimeAuditEvent =
  TrustedRagRuntimeAuditEvent | UntrustedRagRuntimeBoundaryAuditEvent;

export type AuditRecord =
  | AuditEvent
  | GatewaySecurityAuditEvent
  | OrchestratorAuditEvent
  | ModelGatewayAuditEvent
  | ToolRuntimeAuditEvent
  | RagRuntimeAuditEvent;

export interface AuditEventSink {
  emit(event: AuditRecord): Promise<void>;
}

export class UnconfiguredAuditEventSink implements AuditEventSink {
  emit(event: AuditRecord): Promise<void> {
    return Promise.reject(
      new Error(`Audit event sink is not configured for event type: ${event.event_type}`)
    );
  }
}

export function createGatewaySecurityAuditEvent(input: {
  readonly traceId: string;
  readonly service: string;
  readonly environment: string;
  readonly outcome: GatewaySecurityAuditEvent['outcome'];
  readonly stage: GatewayAuditStage;
  readonly timestamp: Date;
  readonly errorCode?: string;
  readonly context?: TrustedRequestContext;
}): GatewaySecurityAuditEvent {
  const trustedContext = input.context
    ? Object.freeze({
        tenant_id: input.context.tenant_id,
        user_id: input.context.user_id,
        session_id: input.context.session_id,
        request_id: input.context.request_id,
        correlation_id: input.context.correlation_id
      })
    : undefined;

  return Object.freeze({
    schema_version: '1.0',
    event_type: 'gateway.request.outcome',
    timestamp: input.timestamp.toISOString(),
    trace_id: input.traceId,
    service: input.service,
    environment: input.environment,
    outcome: input.outcome,
    stage: input.stage,
    ...(input.errorCode ? { error_code: input.errorCode } : {}),
    ...(trustedContext ? { trusted_context: trustedContext } : {})
  });
}

export function createOrchestratorAuditEvent(input: {
  readonly traceId: string;
  readonly service: string;
  readonly environment: string;
  readonly context?: TrustedRequestContext;
  readonly outcome: OrchestratorAuditEvent['outcome'];
  readonly stage: OrchestratorAuditStage;
  readonly timestamp: Date;
  readonly intent?: string;
  readonly domain?: string;
  readonly selectedAgent?: string;
  readonly agentVersion?: string;
  readonly promptHierarchy?: PromptHierarchyAuditEvidence;
  readonly errorCode?: string;
}): OrchestratorAuditEvent {
  const base = {
    schema_version: '1.0',
    event_type: 'orchestrator.routing.outcome',
    timestamp: input.timestamp.toISOString(),
    trace_id: input.traceId,
    service: input.service,
    environment: input.environment,
    outcome: input.outcome,
    stage: input.stage,
    ...(input.intent ? { intent: input.intent } : {}),
    ...(input.domain ? { domain: input.domain } : {}),
    ...(input.selectedAgent ? { selected_agent: input.selectedAgent } : {}),
    ...(input.agentVersion ? { agent_version: input.agentVersion } : {}),
    ...(input.promptHierarchy
      ? {
          prompt_hierarchy: Object.freeze({
            master_policy: Object.freeze({ ...input.promptHierarchy.master_policy }),
            orchestrator_prompt: Object.freeze({ ...input.promptHierarchy.orchestrator_prompt }),
            domain_prompt: Object.freeze({ ...input.promptHierarchy.domain_prompt })
          })
        }
      : {}),
    ...(input.errorCode ? { error_code: input.errorCode } : {})
  } as const;

  if (!input.context) {
    if (input.outcome !== 'rejected' && input.outcome !== 'error') {
      throw new Error('Trusted context is required for orchestrator audit events');
    }
    if (input.stage !== 'boundary_context' && input.stage !== 'boundary_trace') {
      throw new Error('Trusted context is required for orchestrator audit events');
    }
    return Object.freeze({
      ...base,
      outcome: input.outcome,
      stage: input.stage,
      context_status: 'unavailable'
    });
  }

  return Object.freeze({
    ...base,
    context_status: 'trusted',
    request_id: input.context.request_id,
    correlation_id: input.context.correlation_id,
    tenant_id: input.context.tenant_id,
    user_id: input.context.user_id,
    role: input.context.role,
    session_id: input.context.session_id,
    permission_refs: Object.freeze([...input.context.permissions]),
    entitlement_refs: Object.freeze([...input.context.entitlements])
  });
}

export function createModelGatewayAuditEvent(input: {
  readonly traceId: string;
  readonly service: string;
  readonly environment: string;
  readonly context?: TrustedRequestContext;
  readonly outcome: ModelGatewayAuditEvent['outcome'];
  readonly stage: ModelGatewayAuditStage;
  readonly timestamp: Date;
  readonly agentId?: string;
  readonly capability?: string;
  readonly confidentialityClass?: string;
  readonly promptVersion?: string;
  readonly policyVersion?: string;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly modelVersion?: string;
  readonly attempt?: number;
  readonly fallbackUsed?: boolean;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly estimatedCost?: number;
  readonly latencyMs?: number;
  readonly errorCode?: string;
}): ModelGatewayAuditEvent {
  const base = {
    schema_version: '1.0',
    event_type: 'model_gateway.invocation.outcome',
    timestamp: input.timestamp.toISOString(),
    trace_id: input.traceId,
    service: input.service,
    environment: input.environment,
    outcome: input.outcome,
    stage: input.stage,
    ...(input.agentId ? { agent_id: input.agentId } : {}),
    ...(input.capability ? { capability: input.capability } : {}),
    ...(input.confidentialityClass ? { confidentiality_class: input.confidentialityClass } : {}),
    ...(input.promptVersion ? { prompt_version: input.promptVersion } : {}),
    ...(input.policyVersion ? { policy_version: input.policyVersion } : {}),
    ...(input.providerId ? { provider_id: input.providerId } : {}),
    ...(input.modelId ? { model_id: input.modelId } : {}),
    ...(input.modelVersion ? { model_version: input.modelVersion } : {}),
    ...(input.attempt !== undefined ? { attempt: input.attempt } : {}),
    ...(input.fallbackUsed !== undefined ? { fallback_used: input.fallbackUsed } : {}),
    ...(input.inputTokens !== undefined ? { input_tokens: input.inputTokens } : {}),
    ...(input.outputTokens !== undefined ? { output_tokens: input.outputTokens } : {}),
    ...(input.estimatedCost !== undefined ? { estimated_cost: input.estimatedCost } : {}),
    ...(input.latencyMs !== undefined ? { latency_ms: input.latencyMs } : {}),
    ...(input.errorCode ? { error_code: input.errorCode } : {})
  } as const;

  if (!input.context) {
    if (input.outcome !== 'rejected' && input.outcome !== 'error') {
      throw new Error('Trusted context is required for Model Gateway audit events');
    }
    if (input.stage !== 'boundary_context' && input.stage !== 'boundary_trace') {
      throw new Error('Trusted context is required for Model Gateway audit events');
    }
    return Object.freeze({
      ...base,
      outcome: input.outcome,
      stage: input.stage,
      context_status: 'unavailable'
    });
  }

  return Object.freeze({
    ...base,
    context_status: 'trusted',
    request_id: input.context.request_id,
    correlation_id: input.context.correlation_id,
    tenant_id: input.context.tenant_id,
    user_id: input.context.user_id,
    role: input.context.role,
    session_id: input.context.session_id,
    permission_refs: Object.freeze([...input.context.permissions]),
    entitlement_refs: Object.freeze([...input.context.entitlements])
  });
}

export function createToolRuntimeAuditEvent(input: {
  readonly traceId: string;
  readonly service: string;
  readonly environment: string;
  readonly context?: TrustedRequestContext;
  readonly outcome: ToolRuntimeAuditEvent['outcome'];
  readonly stage: ToolRuntimeAuditStage;
  readonly timestamp: Date;
  readonly toolId?: string;
  readonly toolVersion?: string;
  readonly agentId?: string;
  readonly promptVersion?: string;
  readonly actionClass?: 'read' | 'proposal';
  readonly requestedOperation?: 'read' | 'propose';
  readonly permissionDecision?: 'allowed' | 'denied';
  readonly approvalPolicy?: string;
  readonly approvalState?: 'not_required' | 'required_not_executed';
  readonly attempt?: number;
  readonly latencyMs?: number;
  readonly errorCode?: string;
}): ToolRuntimeAuditEvent {
  const base = {
    schema_version: '1.0',
    event_type: 'tool_runtime.execution.outcome',
    timestamp: input.timestamp.toISOString(),
    trace_id: input.traceId,
    service: input.service,
    environment: input.environment,
    outcome: input.outcome,
    stage: input.stage,
    ...(input.toolId ? { tool_id: input.toolId } : {}),
    ...(input.toolVersion ? { tool_version: input.toolVersion } : {}),
    ...(input.agentId ? { agent_id: input.agentId } : {}),
    ...(input.promptVersion ? { prompt_version: input.promptVersion } : {}),
    ...(input.actionClass ? { action_class: input.actionClass } : {}),
    ...(input.requestedOperation ? { requested_operation: input.requestedOperation } : {}),
    ...(input.permissionDecision ? { permission_decision: input.permissionDecision } : {}),
    ...(input.approvalPolicy ? { approval_policy: input.approvalPolicy } : {}),
    ...(input.approvalState ? { approval_state: input.approvalState } : {}),
    ...(input.attempt !== undefined ? { attempt: input.attempt } : {}),
    ...(input.latencyMs !== undefined ? { latency_ms: input.latencyMs } : {}),
    ...(input.errorCode ? { error_code: input.errorCode } : {})
  } as const;

  if (!input.context) {
    if (input.outcome !== 'rejected' && input.outcome !== 'error') {
      throw new Error('Trusted context is required for Tool Runtime audit events');
    }
    if (input.stage !== 'boundary_context' && input.stage !== 'boundary_trace') {
      throw new Error('Trusted context is required for Tool Runtime audit events');
    }
    return Object.freeze({
      ...base,
      outcome: input.outcome,
      stage: input.stage,
      context_status: 'unavailable'
    });
  }

  return Object.freeze({
    ...base,
    context_status: 'trusted',
    request_id: input.context.request_id,
    correlation_id: input.context.correlation_id,
    tenant_id: input.context.tenant_id,
    user_id: input.context.user_id,
    role: input.context.role,
    session_id: input.context.session_id,
    permission_refs: Object.freeze([...input.context.permissions]),
    entitlement_refs: Object.freeze([...input.context.entitlements])
  });
}

export function createRagRuntimeAuditEvent(input: {
  readonly traceId: string;
  readonly service: string;
  readonly environment: string;
  readonly context?: TrustedRequestContext;
  readonly operation: RagRuntimeAuditEvent['operation'];
  readonly outcome: RagRuntimeAuditEvent['outcome'];
  readonly stage: RagRuntimeAuditStage;
  readonly timestamp: Date;
  readonly agentId?: string;
  readonly domain?: string;
  readonly knowledgeScopes?: readonly string[];
  readonly queryHash?: string;
  readonly documentIds?: readonly string[];
  readonly documentVersions?: readonly string[];
  readonly chunkIds?: readonly string[];
  readonly embeddingModel?: string;
  readonly embeddingModelVersion?: string;
  readonly retrievalVersion?: string;
  readonly resultCount?: number;
  readonly latencyMs?: number;
  readonly errorCode?: string;
}): RagRuntimeAuditEvent {
  const base = {
    schema_version: '1.0',
    event_type: 'rag_runtime.operation.outcome',
    timestamp: input.timestamp.toISOString(),
    trace_id: input.traceId,
    service: input.service,
    environment: input.environment,
    operation: input.operation,
    outcome: input.outcome,
    stage: input.stage,
    ...(input.agentId ? { agent_id: input.agentId } : {}),
    ...(input.domain ? { domain: input.domain } : {}),
    ...(input.knowledgeScopes
      ? { knowledge_scopes: Object.freeze([...input.knowledgeScopes]) }
      : {}),
    ...(input.queryHash ? { query_hash: input.queryHash } : {}),
    ...(input.documentIds ? { document_ids: Object.freeze([...input.documentIds]) } : {}),
    ...(input.documentVersions
      ? { document_versions: Object.freeze([...input.documentVersions]) }
      : {}),
    ...(input.chunkIds ? { chunk_ids: Object.freeze([...input.chunkIds]) } : {}),
    ...(input.embeddingModel ? { embedding_model: input.embeddingModel } : {}),
    ...(input.embeddingModelVersion
      ? { embedding_model_version: input.embeddingModelVersion }
      : {}),
    ...(input.retrievalVersion ? { retrieval_version: input.retrievalVersion } : {}),
    ...(input.resultCount !== undefined ? { result_count: input.resultCount } : {}),
    ...(input.latencyMs !== undefined ? { latency_ms: input.latencyMs } : {}),
    ...(input.errorCode ? { error_code: input.errorCode } : {})
  } as const;

  if (!input.context) {
    if (input.outcome !== 'rejected' && input.outcome !== 'error') {
      throw new Error('Trusted context is required for RAG Runtime audit events');
    }
    if (input.stage !== 'boundary_context' && input.stage !== 'boundary_trace') {
      throw new Error('Trusted context is required for RAG Runtime audit events');
    }
    return Object.freeze({
      ...base,
      outcome: input.outcome,
      stage: input.stage,
      context_status: 'unavailable'
    });
  }

  return Object.freeze({
    ...base,
    context_status: 'trusted',
    request_id: input.context.request_id,
    correlation_id: input.context.correlation_id,
    tenant_id: input.context.tenant_id,
    user_id: input.context.user_id,
    role: input.context.role,
    session_id: input.context.session_id,
    permission_refs: Object.freeze([...input.context.permissions]),
    entitlement_refs: Object.freeze([...input.context.entitlements])
  });
}

export function createSecurityAuditEvent(
  context: TrustedRequestContext,
  service: string,
  environment: string,
  eventType: string,
  timestamp: Date = new Date()
): AuditEvent {
  return Object.freeze(
    auditEventSchema.parse({
      schema_version: '1.0',
      event_type: eventType,
      timestamp: timestamp.toISOString(),
      request_id: context.request_id,
      correlation_id: context.correlation_id,
      tenant_id: context.tenant_id,
      user_id: context.user_id,
      service,
      environment
    })
  );
}
