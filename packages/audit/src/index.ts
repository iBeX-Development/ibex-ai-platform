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

export interface OrchestratorAuditEvent {
  readonly schema_version: '1.0';
  readonly event_type: 'orchestrator.routing.outcome';
  readonly timestamp: string;
  readonly trace_id: string;
  readonly service: string;
  readonly environment: string;
  readonly request_id: string;
  readonly correlation_id: string;
  readonly tenant_id: string;
  readonly user_id: string;
  readonly outcome: 'routed' | 'fallback' | 'rejected' | 'error';
  readonly stage: OrchestratorAuditStage;
  readonly intent?: string;
  readonly domain?: string;
  readonly selected_agent?: string;
  readonly agent_version?: string;
  readonly prompt_versions?: readonly string[];
  readonly error_code?: string;
}

export type AuditRecord = AuditEvent | GatewaySecurityAuditEvent | OrchestratorAuditEvent;

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
  readonly context: TrustedRequestContext;
  readonly outcome: OrchestratorAuditEvent['outcome'];
  readonly stage: OrchestratorAuditStage;
  readonly timestamp: Date;
  readonly intent?: string;
  readonly domain?: string;
  readonly selectedAgent?: string;
  readonly agentVersion?: string;
  readonly promptVersions?: readonly string[];
  readonly errorCode?: string;
}): OrchestratorAuditEvent {
  return Object.freeze({
    schema_version: '1.0',
    event_type: 'orchestrator.routing.outcome',
    timestamp: input.timestamp.toISOString(),
    trace_id: input.traceId,
    service: input.service,
    environment: input.environment,
    request_id: input.context.request_id,
    correlation_id: input.context.correlation_id,
    tenant_id: input.context.tenant_id,
    user_id: input.context.user_id,
    outcome: input.outcome,
    stage: input.stage,
    ...(input.intent ? { intent: input.intent } : {}),
    ...(input.domain ? { domain: input.domain } : {}),
    ...(input.selectedAgent ? { selected_agent: input.selectedAgent } : {}),
    ...(input.agentVersion ? { agent_version: input.agentVersion } : {}),
    ...(input.promptVersions ? { prompt_versions: Object.freeze([...input.promptVersions]) } : {}),
    ...(input.errorCode ? { error_code: input.errorCode } : {})
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
