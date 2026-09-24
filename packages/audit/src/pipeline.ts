import { randomUUID } from 'node:crypto';
import { PlatformError } from '../../errors/src/index.js';
import type { AuditEventSink, AuditRecord } from './index.js';

export type AuditCategory = 'application' | 'security' | 'audit';
export type SecuritySeverity = 'info' | 'warning' | 'high' | 'critical';

export interface CanonicalAuditContext {
  readonly status: 'trusted' | 'unavailable';
  readonly tenant_id?: string;
  readonly user_id?: string;
  readonly role?: string;
  readonly session_id?: string;
  readonly permission_refs: readonly string[];
  readonly entitlement_refs: readonly string[];
}

export interface CanonicalAuditEvent {
  readonly schema_version: '1.0';
  readonly event_version: '1.0';
  readonly event_id: string;
  readonly event_type: string;
  readonly category: AuditCategory;
  readonly timestamp: string;
  readonly service: string;
  readonly environment: string;
  readonly request_id?: string;
  readonly correlation_id?: string;
  readonly trace_id: string;
  readonly parent_event_id?: string;
  readonly context: CanonicalAuditContext;
  readonly outcome?: string;
  readonly stage?: string;
  readonly error_code?: string;
  readonly evidence: Readonly<Record<string, unknown>>;
}

export interface SecurityObservation {
  readonly event_id: string;
  readonly timestamp: string;
  readonly event_type: string;
  readonly severity: SecuritySeverity;
  readonly service: string;
  readonly environment: string;
  readonly trace_id: string;
  readonly request_id?: string;
  readonly correlation_id?: string;
  readonly tenant_id?: string;
  readonly reason_code: string;
}

export type AuditMetricName =
  | 'ibex.audit.events'
  | 'ibex.security.rejections'
  | 'ibex.requests'
  | 'ibex.errors'
  | 'ibex.latency_ms'
  | 'ibex.tokens'
  | 'ibex.estimated_cost'
  | 'ibex.tool.calls'
  | 'ibex.rag.results'
  | 'ibex.rag.hits'
  | 'ibex.model.fallbacks'
  | 'ibex.agent.routes'
  | 'ibex.approval.requests'
  | 'ibex.feedback.events'
  | 'ibex.evaluation.failures';

export interface AuditMetric {
  readonly name: AuditMetricName;
  readonly value: number;
  readonly labels: Readonly<{
    service: string;
    environment: string;
    event_type: string;
    outcome: string;
  }>;
}

export interface AuditHealthEvidence {
  readonly event_type: 'audit.pipeline.delivery_failure' | 'audit.pipeline.validation_failure';
  readonly timestamp: string;
  readonly severity: 'critical';
  readonly event_id?: string;
  readonly trace_id: string;
  readonly service: string;
  readonly environment: string;
  readonly failed_component:
    | 'normalization'
    | 'evidence_store'
    | 'audit_exporter'
    | 'security_exporter'
    | 'metrics_exporter';
  readonly reason_code:
    'AUDIT_DELIVERY_FAILURE' | 'AUDIT_VALIDATION_FAILURE' | 'PROHIBITED_AUDIT_DATA';
}

/** Production implementations must provide durable, append-only persistence. */
export interface AuditEvidenceStore {
  persistAudit(event: CanonicalAuditEvent): Promise<void>;
  persistHealth(evidence: AuditHealthEvidence): Promise<void>;
}

export interface AuditExporter {
  readonly export: (event: CanonicalAuditEvent) => Promise<void>;
}

export interface SecurityEventExporter {
  readonly export: (event: SecurityObservation) => Promise<void>;
}

export interface AuditMetricsExporter {
  readonly export: (metrics: readonly AuditMetric[]) => Promise<void>;
}

export interface AuditHealthExporter {
  readonly export: (evidence: AuditHealthEvidence) => Promise<void>;
}

export interface AuditTelemetryPipelineDependencies {
  readonly evidenceStore: AuditEvidenceStore;
  readonly auditExporter: AuditExporter;
  readonly securityExporter: SecurityEventExporter;
  readonly metricsExporter: AuditMetricsExporter;
  readonly healthExporter: AuditHealthExporter;
  readonly metricLabelPolicy: MetricLabelPolicy;
  readonly environment: string;
  readonly eventIdFactory?: () => string;
  readonly parentEventId?: (event: AuditRecord) => string | undefined;
}

export interface MetricLabelPolicy {
  readonly services: readonly string[];
  readonly environments: readonly string[];
}

export interface AuditPipelineHealthStatus {
  readonly status: 'healthy' | 'degraded';
  readonly last_failure?: Readonly<{
    timestamp: string;
    failed_component: AuditHealthEvidence['failed_component'];
    reason_code: AuditHealthEvidence['reason_code'];
  }>;
}

export interface AuditInteractionView {
  readonly request_id: string;
  readonly correlation_id: string;
  readonly trace_id: string;
  readonly tenant_id: string;
  readonly user_id: string;
  readonly session_id: string;
  readonly agent: string;
  readonly agent_version: string;
  readonly prompt_references: readonly Readonly<{
    prompt_id: string;
    prompt_version: string;
    content_hash: string;
  }>[];
  readonly model_provider: string;
  readonly model: string;
  readonly model_version: string;
  readonly tools_used: readonly Readonly<{ tool_id: string; version: string }>[];
  readonly sources_used: readonly Readonly<{ source_id: string; version: string }>[];
  readonly approval_state: 'not_required' | 'required_not_executed';
  readonly response_status: 'success' | 'partial' | 'rejected' | 'error';
  readonly latency_ms: number;
  readonly token_usage: Readonly<{ input: number; output: number; total: number }>;
  readonly estimated_cost: number;
  readonly errors: readonly string[];
  readonly timestamp: string;
}

export class AuditDeliveryError extends PlatformError {
  constructor(traceId: string, requestId?: string) {
    super(
      'DEPENDENCY_ERROR',
      'Required audit evidence could not be delivered',
      503,
      undefined,
      traceId,
      requestId
    );
  }
}

const forbiddenEvidenceKeys = new Set([
  'prompt',
  'raw_prompt',
  'response',
  'retrieved_content',
  'content',
  'tool_payload',
  'payload',
  'secret',
  'credential',
  'credentials',
  'authorization_header',
  'access_token',
  'password',
  'private_key',
  'chain_of_thought',
  'reasoning'
]);

function assertMinimized(value: unknown, path = 'event'): void {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      assertMinimized(item, `${path}[${String(index)}]`);
    }
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenEvidenceKeys.has(key.toLowerCase())) {
      throw new PlatformError('VALIDATION_ERROR', 'Audit evidence contains prohibited data', 500);
    }
    assertMinimized(child, `${path}.${key}`);
  }
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((item: unknown) => typeof item === 'string' && item.trim().length > 0)
  );
}

function requiredStrings(value: unknown, field: string): readonly string[] {
  if (!isNonEmptyStringArray(value)) {
    throw new PlatformError('VALIDATION_ERROR', `Audit ${field} is invalid`, 500);
  }
  return Object.freeze([...value]);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function record(event: AuditRecord): Record<string, unknown> {
  return event as unknown as Record<string, unknown>;
}

function immutableCopy<T>(value: T): T {
  const copy = structuredClone(value);
  const freeze = (item: unknown): void => {
    if (!item || typeof item !== 'object' || Object.isFrozen(item)) return;
    for (const child of Object.values(item)) freeze(child);
    Object.freeze(item);
  };
  freeze(copy);
  return copy;
}

function contextFor(event: AuditRecord): CanonicalAuditContext {
  const source = record(event);
  const nested =
    source.trusted_context && typeof source.trusted_context === 'object'
      ? (source.trusted_context as Record<string, unknown>)
      : undefined;
  if (
    source.context_status !== undefined &&
    source.context_status !== 'trusted' &&
    source.context_status !== 'unavailable'
  ) {
    throw new PlatformError('VALIDATION_ERROR', 'Audit context status is invalid', 500);
  }
  const contextStatus = source.context_status === 'unavailable' ? 'unavailable' : 'trusted';
  if (contextStatus === 'unavailable') {
    return Object.freeze({
      status: 'unavailable',
      permission_refs: Object.freeze([]),
      entitlement_refs: Object.freeze([])
    });
  }
  const topTenantId = optionalString(source.tenant_id);
  const topUserId = optionalString(source.user_id);
  const nestedTenantId = optionalString(nested?.tenant_id);
  const nestedUserId = optionalString(nested?.user_id);
  if (
    (topTenantId && nestedTenantId && topTenantId !== nestedTenantId) ||
    (topUserId && nestedUserId && topUserId !== nestedUserId)
  ) {
    throw new PlatformError('TENANT_CONTEXT_ERROR', 'Audit tenant context binding is invalid', 500);
  }
  const tenantId = topTenantId ?? nestedTenantId;
  const userId = topUserId ?? nestedUserId;
  const role = optionalString(source.role);
  const topSessionId = optionalString(source.session_id);
  const nestedSessionId = optionalString(nested?.session_id);
  if (topSessionId && nestedSessionId && topSessionId !== nestedSessionId) {
    throw new PlatformError('TENANT_CONTEXT_ERROR', 'Audit session binding is invalid', 500);
  }
  const sessionId = topSessionId ?? nestedSessionId;
  if (!tenantId || !userId || !role || !sessionId) {
    throw new PlatformError('VALIDATION_ERROR', 'Audit trusted context is incomplete', 500);
  }
  return Object.freeze({
    status: 'trusted',
    ...(tenantId ? { tenant_id: tenantId } : {}),
    ...(userId ? { user_id: userId } : {}),
    ...(role ? { role } : {}),
    ...(sessionId ? { session_id: sessionId } : {}),
    permission_refs: requiredStrings(source.permission_refs, 'permission references'),
    entitlement_refs: requiredStrings(source.entitlement_refs, 'entitlement references')
  });
}

function categoryFor(event: AuditRecord): AuditCategory {
  const source = record(event);
  const securityCodes = new Set([
    'AUTHENTICATION_ERROR',
    'AUTHORIZATION_ERROR',
    'TENANT_CONTEXT_ERROR',
    'TENANT_SCOPE_VIOLATION',
    'PERMISSION_DENIED',
    'RATE_LIMIT_ERROR',
    'RATE_LIMITED',
    'POLICY_DENIED',
    'MODEL_NOT_ALLOWED',
    'TOOL_NOT_ALLOWED',
    'TOOL_DISABLED',
    'PROVIDER_ERROR',
    'MODEL_UNAVAILABLE'
  ]);
  if (
    event.event_type.includes('security') ||
    (typeof source.error_code === 'string' && securityCodes.has(source.error_code))
  ) {
    return 'security';
  }
  return source.outcome === 'error' ? 'application' : 'audit';
}

export function normalizeAuditEvent(
  event: AuditRecord,
  eventId: string = randomUUID(),
  parentEventId?: string
): CanonicalAuditEvent {
  assertMinimized(event);
  const source = record(event);
  const eventType = optionalString(source.event_type);
  const timestamp = optionalString(source.timestamp);
  const service = optionalString(source.service);
  const environment = optionalString(source.environment);
  if (
    source.schema_version !== '1.0' ||
    !optionalString(eventId) ||
    !eventType ||
    !timestamp ||
    !service ||
    !environment ||
    Number.isNaN(Date.parse(timestamp)) ||
    new Date(timestamp).toISOString() !== timestamp
  ) {
    throw new PlatformError('VALIDATION_ERROR', 'Audit event envelope is invalid', 500);
  }
  const traceId = optionalString(source.trace_id);
  if (!traceId) throw new PlatformError('VALIDATION_ERROR', 'Audit trace context is invalid', 500);
  const nested =
    source.trusted_context && typeof source.trusted_context === 'object'
      ? (source.trusted_context as Record<string, unknown>)
      : undefined;
  const requestId = optionalString(source.request_id) ?? optionalString(nested?.request_id);
  const correlationId =
    optionalString(source.correlation_id) ?? optionalString(nested?.correlation_id);
  if (
    (optionalString(source.request_id) &&
      optionalString(nested?.request_id) &&
      source.request_id !== nested?.request_id) ||
    (optionalString(source.correlation_id) &&
      optionalString(nested?.correlation_id) &&
      source.correlation_id !== nested?.correlation_id)
  ) {
    throw new PlatformError('TENANT_CONTEXT_ERROR', 'Audit correlation binding is invalid', 500);
  }
  const context = contextFor(event);
  if (context.status === 'trusted' && (!requestId || !correlationId)) {
    throw new PlatformError('VALIDATION_ERROR', 'Audit correlation context is incomplete', 500);
  }
  const untrustedContextKeys = new Set([
    'tenant_id',
    'user_id',
    'role',
    'session_id',
    'request_id',
    'correlation_id',
    'permission_refs',
    'entitlement_refs',
    'trusted_context'
  ]);
  const evidenceSource =
    context.status === 'unavailable'
      ? Object.fromEntries(Object.entries(source).filter(([key]) => !untrustedContextKeys.has(key)))
      : { ...source };
  const evidence = immutableCopy(evidenceSource);
  const boundRequestId = context.status === 'trusted' ? requestId : undefined;
  const boundCorrelationId = context.status === 'trusted' ? correlationId : undefined;
  return Object.freeze({
    schema_version: '1.0',
    event_version: '1.0',
    event_id: eventId,
    event_type: eventType,
    category: categoryFor(event),
    timestamp,
    service,
    environment,
    ...(boundRequestId ? { request_id: boundRequestId } : {}),
    ...(boundCorrelationId ? { correlation_id: boundCorrelationId } : {}),
    trace_id: traceId,
    ...(parentEventId ? { parent_event_id: parentEventId } : {}),
    context,
    ...(optionalString(source.outcome) ? { outcome: String(source.outcome) } : {}),
    ...(optionalString(source.stage) ? { stage: String(source.stage) } : {}),
    ...(optionalString(source.error_code) ? { error_code: String(source.error_code) } : {}),
    evidence
  });
}

function severityFor(event: CanonicalAuditEvent): SecuritySeverity {
  if (event.error_code === 'TENANT_CONTEXT_ERROR' || event.error_code === 'AUTHORIZATION_ERROR') {
    return 'critical';
  }
  if (event.error_code === 'PERMISSION_DENIED' || event.error_code === 'AUTHENTICATION_ERROR') {
    return 'high';
  }
  if (
    event.error_code === 'TENANT_SCOPE_VIOLATION' ||
    event.error_code === 'POLICY_DENIED' ||
    event.error_code === 'TOOL_NOT_ALLOWED' ||
    event.error_code === 'TOOL_DISABLED' ||
    event.error_code === 'MODEL_NOT_ALLOWED' ||
    event.error_code === 'PROVIDER_ERROR' ||
    event.error_code === 'MODEL_UNAVAILABLE'
  ) {
    return 'high';
  }
  return event.outcome === 'error' ? 'high' : 'warning';
}

export function securityObservationFor(
  event: CanonicalAuditEvent
): SecurityObservation | undefined {
  if (event.category !== 'security') return undefined;
  return Object.freeze({
    event_id: event.event_id,
    timestamp: event.timestamp,
    event_type: event.event_type,
    severity: severityFor(event),
    service: event.service,
    environment: event.environment,
    trace_id: event.trace_id,
    ...(event.request_id ? { request_id: event.request_id } : {}),
    ...(event.correlation_id ? { correlation_id: event.correlation_id } : {}),
    ...(event.context.tenant_id ? { tenant_id: event.context.tenant_id } : {}),
    reason_code: event.error_code ?? 'SECURITY_REJECTION'
  });
}

const boundedEventTypes = new Set([
  'gateway.request.outcome',
  'orchestrator.routing.outcome',
  'model_gateway.invocation.outcome',
  'tool_runtime.execution.outcome',
  'rag_runtime.operation.outcome',
  'gateway.feedback.outcome',
  'evaluation.outcome'
]);

function allowed(value: string, allowedValues: readonly string[]): string {
  return allowedValues.includes(value) ? value : 'other';
}

function metric(
  name: AuditMetricName,
  value: number,
  event: CanonicalAuditEvent,
  policy: MetricLabelPolicy
): AuditMetric {
  return Object.freeze({
    name,
    value,
    labels: Object.freeze({
      service: allowed(event.service, policy.services),
      environment: allowed(event.environment, policy.environments),
      event_type: boundedEventTypes.has(event.event_type) ? event.event_type : 'other',
      outcome: [
        'accepted',
        'routed',
        'fallback',
        'started',
        'succeeded',
        'proposed',
        'rejected',
        'error'
      ].includes(event.outcome ?? '')
        ? (event.outcome ?? 'unknown')
        : 'unknown'
    })
  });
}

export function metricsFor(
  event: CanonicalAuditEvent,
  policy: MetricLabelPolicy
): readonly AuditMetric[] {
  const source = event.evidence;
  const metrics: AuditMetric[] = [metric('ibex.audit.events', 1, event, policy)];
  if (event.event_type === 'gateway.request.outcome' && event.stage === 'response') {
    metrics.push(metric('ibex.requests', 1, event, policy));
  }
  if (event.category === 'security')
    metrics.push(metric('ibex.security.rejections', 1, event, policy));
  if (event.outcome === 'error') metrics.push(metric('ibex.errors', 1, event, policy));
  if (typeof source.latency_ms === 'number')
    metrics.push(metric('ibex.latency_ms', source.latency_ms, event, policy));
  if (typeof source.input_tokens === 'number' && typeof source.output_tokens === 'number') {
    metrics.push(metric('ibex.tokens', source.input_tokens + source.output_tokens, event, policy));
  }
  if (typeof source.estimated_cost === 'number') {
    metrics.push(metric('ibex.estimated_cost', source.estimated_cost, event, policy));
  }
  if (event.event_type === 'tool_runtime.execution.outcome' && event.outcome === 'succeeded') {
    metrics.push(metric('ibex.tool.calls', 1, event, policy));
  }
  if (
    event.event_type === 'rag_runtime.operation.outcome' &&
    typeof source.result_count === 'number'
  ) {
    metrics.push(metric('ibex.rag.results', source.result_count, event, policy));
    if (source.operation === 'retrieve' && event.outcome === 'succeeded') {
      metrics.push(metric('ibex.rag.hits', source.result_count > 0 ? 1 : 0, event, policy));
    }
  }
  if (source.fallback_used === true) metrics.push(metric('ibex.model.fallbacks', 1, event, policy));
  if (event.event_type === 'orchestrator.routing.outcome' && event.outcome === 'routed') {
    metrics.push(metric('ibex.agent.routes', 1, event, policy));
  }
  if (source.approval_state === 'required_not_executed') {
    metrics.push(metric('ibex.approval.requests', 1, event, policy));
  }
  if (event.event_type === 'gateway.feedback.outcome') {
    metrics.push(metric('ibex.feedback.events', 1, event, policy));
  }
  if (event.event_type === 'evaluation.outcome' && event.outcome === 'error') {
    metrics.push(metric('ibex.evaluation.failures', 1, event, policy));
  }
  return Object.freeze(metrics);
}

export class AuditTelemetryPipeline implements AuditEventSink {
  private health: AuditPipelineHealthStatus = Object.freeze({ status: 'healthy' });

  constructor(private readonly dependencies: AuditTelemetryPipelineDependencies) {}

  healthStatus(): AuditPipelineHealthStatus {
    return this.health;
  }

  async emit(source: AuditRecord): Promise<void> {
    let event: CanonicalAuditEvent;
    try {
      event = normalizeAuditEvent(
        source,
        (this.dependencies.eventIdFactory ?? randomUUID)(),
        this.dependencies.parentEventId?.(source)
      );
      if (event.environment !== this.dependencies.environment) {
        throw new PlatformError('VALIDATION_ERROR', 'Audit environment binding is invalid', 500);
      }
    } catch (error) {
      await this.reportNormalizationFailure(source, error);
      throw error;
    }
    try {
      await this.dependencies.evidenceStore.persistAudit(event);
    } catch {
      await this.reportFailure(event, 'evidence_store', false);
      throw new AuditDeliveryError(event.trace_id, event.request_id);
    }
    await this.deliver(event, 'audit_exporter', () =>
      this.dependencies.auditExporter.export(event)
    );
    const security = securityObservationFor(event);
    if (security) {
      await this.deliver(event, 'security_exporter', () =>
        this.dependencies.securityExporter.export(security)
      );
    }
    await this.deliver(event, 'metrics_exporter', () =>
      this.dependencies.metricsExporter.export(
        metricsFor(event, this.dependencies.metricLabelPolicy)
      )
    );
  }

  private async reportNormalizationFailure(source: AuditRecord, error: unknown): Promise<void> {
    const unsafe = record(source);
    const timestamp = new Date().toISOString();
    const traceId = optionalString(unsafe.trace_id) ?? 'unavailable';
    const service = optionalString(unsafe.service) ?? 'unknown';
    const environment = optionalString(unsafe.environment) ?? this.dependencies.environment;
    const eventId = (this.dependencies.eventIdFactory ?? randomUUID)();
    const reasonCode =
      error instanceof PlatformError &&
      error.publicMessage === 'Audit evidence contains prohibited data'
        ? 'PROHIBITED_AUDIT_DATA'
        : 'AUDIT_VALIDATION_FAILURE';
    const health: AuditHealthEvidence = Object.freeze({
      event_type: 'audit.pipeline.validation_failure',
      timestamp,
      severity: 'critical',
      event_id: eventId,
      trace_id: traceId,
      service,
      environment,
      failed_component: 'normalization',
      reason_code: reasonCode
    });
    const security: SecurityObservation = Object.freeze({
      event_id: eventId,
      timestamp,
      event_type: 'audit.pipeline.rejected',
      severity: 'critical',
      service,
      environment,
      trace_id: traceId,
      reason_code: reasonCode
    });
    this.markDegraded(health);
    try {
      await this.dependencies.evidenceStore.persistHealth(health);
    } catch {
      // Continue to independent exporters and preserve fail-closed caller behavior.
    }
    await Promise.allSettled([
      this.dependencies.securityExporter.export(security),
      this.dependencies.healthExporter.export(health)
    ]);
  }

  private async deliver(
    event: CanonicalAuditEvent,
    component: AuditHealthEvidence['failed_component'],
    operation: () => Promise<void>
  ): Promise<void> {
    try {
      await operation();
    } catch {
      await this.reportFailure(event, component, true);
      throw new AuditDeliveryError(event.trace_id, event.request_id);
    }
  }

  private async reportFailure(
    event: CanonicalAuditEvent,
    component: AuditHealthEvidence['failed_component'],
    persist: boolean
  ): Promise<void> {
    const evidence: AuditHealthEvidence = Object.freeze({
      event_type: 'audit.pipeline.delivery_failure',
      timestamp: new Date().toISOString(),
      severity: 'critical',
      event_id: event.event_id,
      trace_id: event.trace_id,
      service: event.service,
      environment: event.environment,
      failed_component: component,
      reason_code: 'AUDIT_DELIVERY_FAILURE'
    });
    this.markDegraded(evidence);
    if (persist) {
      try {
        await this.dependencies.evidenceStore.persistHealth(evidence);
      } catch {
        // The independent health exporter remains the final observable fail-safe path.
      }
    }
    try {
      await this.dependencies.healthExporter.export(evidence);
    } catch {
      // The caller still receives AuditDeliveryError; failure is never reported as success.
    }
  }

  private markDegraded(evidence: AuditHealthEvidence): void {
    this.health = Object.freeze({
      status: 'degraded',
      last_failure: Object.freeze({
        timestamp: evidence.timestamp,
        failed_component: evidence.failed_component,
        reason_code: evidence.reason_code
      })
    });
  }
}

export function assertEndToEndAuditTrace(events: readonly CanonicalAuditEvent[]): void {
  const [first] = events;
  if (!first) throw new Error('Audit trace is empty');
  const trusted = events.filter((event) => event.context.status === 'trusted');
  for (const event of trusted) {
    if (
      event.trace_id !== first.trace_id ||
      event.request_id !== first.request_id ||
      event.correlation_id !== first.correlation_id ||
      event.context.tenant_id !== first.context.tenant_id ||
      event.context.user_id !== first.context.user_id ||
      event.context.session_id !== first.context.session_id
    ) {
      throw new Error('Audit trace context binding mismatch');
    }
  }
  const has = (type: string, stage?: string) =>
    events.some((event) => event.event_type === type && (!stage || event.stage === stage));
  if (
    !has('gateway.request.outcome', 'authorization') ||
    !has('orchestrator.routing.outcome') ||
    (!has('tool_runtime.execution.outcome') && !has('rag_runtime.operation.outcome')) ||
    !has('model_gateway.invocation.outcome') ||
    !has('gateway.request.outcome', 'response')
  ) {
    throw new Error('Audit trace is missing a required Phase 7 boundary');
  }
}

function stringEvidence(event: CanonicalAuditEvent, field: string): string | undefined {
  return optionalString(event.evidence[field]);
}

function numberEvidence(event: CanonicalAuditEvent, field: string): number | undefined {
  const value = event.evidence[field];
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

export function reconstructAuditInteraction(
  events: readonly CanonicalAuditEvent[]
): AuditInteractionView {
  assertEndToEndAuditTrace(events);
  const [first] = events;
  if (!first) throw new Error('Audit trace is empty');
  const route = events.find(
    (event) => event.event_type === 'orchestrator.routing.outcome' && event.outcome === 'routed'
  );
  const model = events.find(
    (event) =>
      event.event_type === 'model_gateway.invocation.outcome' && event.outcome === 'succeeded'
  );
  const response = events.find(
    (event) => event.event_type === 'gateway.request.outcome' && event.stage === 'response'
  );
  const agent = route && stringEvidence(route, 'selected_agent');
  const agentVersion = route && stringEvidence(route, 'agent_version');
  const provider = model && stringEvidence(model, 'provider_id');
  const modelId = model && stringEvidence(model, 'model_id');
  const modelVersion = model && stringEvidence(model, 'model_version');
  const responseStatus = response && stringEvidence(response, 'response_status');
  const approvalState = response && stringEvidence(response, 'approval_state');
  const latencyMs = response && numberEvidence(response, 'latency_ms');
  const inputTokens = model && numberEvidence(model, 'input_tokens');
  const outputTokens = model && numberEvidence(model, 'output_tokens');
  const estimatedCost = model && numberEvidence(model, 'estimated_cost');
  if (
    !first.request_id ||
    !first.correlation_id ||
    !first.context.tenant_id ||
    !first.context.user_id ||
    !first.context.session_id ||
    !agent ||
    !agentVersion ||
    !provider ||
    !modelId ||
    !modelVersion ||
    !response ||
    !['success', 'partial', 'rejected', 'error'].includes(responseStatus ?? '') ||
    !['not_required', 'required_not_executed'].includes(approvalState ?? '') ||
    latencyMs === undefined ||
    inputTokens === undefined ||
    outputTokens === undefined ||
    estimatedCost === undefined
  ) {
    throw new Error('Audit interaction is missing mandatory evidence');
  }
  const hierarchy = route.evidence.prompt_hierarchy;
  if (!hierarchy || typeof hierarchy !== 'object') {
    throw new Error('Audit interaction is missing prompt evidence');
  }
  const promptReferences = Object.values(hierarchy).map((reference) => {
    if (!reference || typeof reference !== 'object') {
      throw new Error('Audit interaction prompt evidence is invalid');
    }
    const prompt = reference as Record<string, unknown>;
    const promptId = optionalString(prompt.prompt_id);
    const promptVersion = optionalString(prompt.prompt_version);
    const contentHash = optionalString(prompt.content_hash);
    if (!promptId || !promptVersion || !contentHash) {
      throw new Error('Audit interaction prompt evidence is invalid');
    }
    return Object.freeze({
      prompt_id: promptId,
      prompt_version: promptVersion,
      content_hash: contentHash
    });
  });
  if (promptReferences.length !== 3) {
    throw new Error('Audit interaction prompt hierarchy is incomplete');
  }
  const toolsUsed = events
    .filter(
      (event) =>
        event.event_type === 'tool_runtime.execution.outcome' &&
        (event.outcome === 'succeeded' || event.outcome === 'proposed')
    )
    .map((event) => {
      const toolId = stringEvidence(event, 'tool_id');
      const version = stringEvidence(event, 'tool_version');
      if (!toolId || !version) throw new Error('Audit interaction tool evidence is invalid');
      return Object.freeze({ tool_id: toolId, version });
    });
  const sourcesUsed = events
    .filter(
      (event) =>
        event.event_type === 'rag_runtime.operation.outcome' && event.outcome === 'succeeded'
    )
    .flatMap((event) => {
      const rawIds: unknown = event.evidence.document_ids;
      const rawVersions: unknown = event.evidence.document_versions;
      if (
        !Array.isArray(rawIds) ||
        !Array.isArray(rawVersions) ||
        rawIds.length !== rawVersions.length
      )
        return [];
      const ids: unknown[] = rawIds;
      const versions: unknown[] = rawVersions;
      return ids.map((sourceId, index) => {
        const version = versions[index];
        if (typeof sourceId !== 'string' || typeof version !== 'string') {
          throw new Error('Audit interaction source evidence is invalid');
        }
        return Object.freeze({ source_id: sourceId, version });
      });
    });
  return Object.freeze({
    request_id: first.request_id,
    correlation_id: first.correlation_id,
    trace_id: first.trace_id,
    tenant_id: first.context.tenant_id,
    user_id: first.context.user_id,
    session_id: first.context.session_id,
    agent,
    agent_version: agentVersion,
    prompt_references: Object.freeze(promptReferences),
    model_provider: provider,
    model: modelId,
    model_version: modelVersion,
    tools_used: Object.freeze(toolsUsed),
    sources_used: Object.freeze(sourcesUsed),
    approval_state: approvalState as AuditInteractionView['approval_state'],
    response_status: responseStatus as AuditInteractionView['response_status'],
    latency_ms: latencyMs,
    token_usage: Object.freeze({
      input: inputTokens,
      output: outputTokens,
      total: inputTokens + outputTokens
    }),
    estimated_cost: estimatedCost,
    errors: Object.freeze(events.flatMap((event) => (event.error_code ? [event.error_code] : []))),
    timestamp: response.timestamp
  });
}

/** Deterministic test adapter; not a production persistence implementation. */
export class InMemoryAuditEvidenceStore implements AuditEvidenceStore {
  readonly audits: CanonicalAuditEvent[] = [];
  readonly health: AuditHealthEvidence[] = [];
  persistAudit(event: CanonicalAuditEvent): Promise<void> {
    this.audits.push(event);
    return Promise.resolve();
  }
  persistHealth(evidence: AuditHealthEvidence): Promise<void> {
    this.health.push(evidence);
    return Promise.resolve();
  }
}
