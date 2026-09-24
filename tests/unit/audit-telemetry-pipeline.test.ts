import { describe, expect, it, vi } from 'vitest';
import {
  AuditTelemetryPipeline,
  InMemoryAuditEvidenceStore,
  createGatewaySecurityAuditEvent,
  metricsFor,
  normalizeAuditEvent,
  securityObservationFor,
  type AuditRecord,
  type AuditTelemetryPipelineDependencies
} from '../../packages/audit/src/index.js';
import { createTrustedRequestContext } from '../../packages/security/src/index.js';

const now = new Date('2026-09-24T00:00:00.000Z');
const context = createTrustedRequestContext({
  tenant_id: 'tenant-a',
  user_id: 'user-a',
  role: 'operator',
  permissions: ['asset:read'],
  entitlements: ['ai:general'],
  session_id: 'session-a',
  request_id: 'request-a',
  correlation_id: 'correlation-a',
  channel: 'web',
  locale: 'mn'
});

function gatewayEvent(outcome: 'accepted' | 'rejected' = 'accepted'): AuditRecord {
  return createGatewaySecurityAuditEvent({
    traceId: 'trace-a',
    service: 'ai-gateway',
    environment: 'test',
    outcome,
    stage: outcome === 'accepted' ? 'response' : 'authorization',
    timestamp: now,
    ...(outcome === 'rejected' ? { errorCode: 'PERMISSION_DENIED' } : {}),
    context
  });
}

function dependencies(
  overrides: Partial<AuditTelemetryPipelineDependencies> = {}
): AuditTelemetryPipelineDependencies {
  return {
    evidenceStore: new InMemoryAuditEvidenceStore(),
    auditExporter: { export: vi.fn(() => Promise.resolve()) },
    securityExporter: { export: vi.fn(() => Promise.resolve()) },
    metricsExporter: { export: vi.fn(() => Promise.resolve()) },
    healthExporter: { export: vi.fn(() => Promise.resolve()) },
    metricLabelPolicy: { services: ['ai-gateway'], environments: ['test'] },
    environment: 'test',
    eventIdFactory: () => 'event-a',
    ...overrides
  };
}

describe('Phase 7 canonical audit pipeline', () => {
  it('normalizes mandatory trusted and correlation evidence without weakening the source event', () => {
    const event = normalizeAuditEvent(gatewayEvent(), 'event-a');
    expect(event).toMatchObject({
      schema_version: '1.0',
      event_version: '1.0',
      event_id: 'event-a',
      request_id: 'request-a',
      correlation_id: 'correlation-a',
      trace_id: 'trace-a',
      context: {
        status: 'trusted',
        tenant_id: 'tenant-a',
        user_id: 'user-a',
        role: 'operator',
        session_id: 'session-a',
        permission_refs: ['asset:read'],
        entitlement_refs: ['ai:general']
      }
    });
    expect(event.evidence).toMatchObject({ stage: 'response', outcome: 'accepted' });
    expect(Object.isFrozen(event.evidence)).toBe(true);
  });

  it('rejects prohibited raw content before persistence or export', async () => {
    const deps = dependencies();
    const pipeline = new AuditTelemetryPipeline(deps);
    const unsafe = {
      ...gatewayEvent(),
      raw_prompt: 'confidential prompt'
    } as unknown as AuditRecord;
    await expect(pipeline.emit(unsafe)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect((deps.evidenceStore as InMemoryAuditEvidenceStore).audits).toHaveLength(0);
    expect((deps.evidenceStore as InMemoryAuditEvidenceStore).health).toContainEqual(
      expect.objectContaining({
        failed_component: 'normalization',
        reason_code: 'PROHIBITED_AUDIT_DATA'
      })
    );
    expect(deps.securityExporter.export).toHaveBeenCalledWith(
      expect.objectContaining({ reason_code: 'PROHIBITED_AUDIT_DATA', severity: 'critical' })
    );
    expect(deps.auditExporter.export).not.toHaveBeenCalled();
  });

  it('classifies security events with a sanitized severity and reason code', () => {
    const observation = securityObservationFor(normalizeAuditEvent(gatewayEvent('rejected')));
    expect(observation).toMatchObject({
      severity: 'high',
      reason_code: 'PERMISSION_DENIED',
      tenant_id: 'tenant-a',
      trace_id: 'trace-a'
    });
    expect(JSON.stringify(observation)).not.toContain('asset:read');
  });

  it('keeps ordinary application failures separate from security observations', () => {
    const applicationFailure = normalizeAuditEvent(
      createGatewaySecurityAuditEvent({
        traceId: 'trace-a',
        service: 'ai-gateway',
        environment: 'test',
        outcome: 'error',
        stage: 'platform',
        timestamp: now,
        errorCode: 'INTERNAL_ERROR',
        context
      })
    );
    expect(applicationFailure.category).toBe('application');
    expect(securityObservationFor(applicationFailure)).toBeUndefined();
  });

  it('never promotes identifiers attached to an unavailable context', () => {
    const untrusted = {
      ...gatewayEvent('rejected'),
      context_status: 'unavailable',
      tenant_id: 'attacker-selected-tenant',
      user_id: 'attacker-selected-user',
      role: 'admin',
      session_id: 'attacker-session',
      permission_refs: ['*'],
      entitlement_refs: ['*'],
      trusted_context: undefined
    } as unknown as AuditRecord;
    const canonical = normalizeAuditEvent(untrusted);
    expect(canonical.context).toEqual({
      status: 'unavailable',
      permission_refs: [],
      entitlement_refs: []
    });
    expect(securityObservationFor(canonical)).not.toHaveProperty('tenant_id');
    expect(JSON.stringify(canonical)).not.toMatch(
      /attacker-selected-tenant|attacker-selected-user|attacker-session/
    );
  });

  it('rejects conflicting duplicate trusted context evidence', () => {
    const conflict = {
      ...gatewayEvent(),
      trusted_context: {
        tenant_id: 'tenant-b',
        user_id: 'user-a',
        session_id: 'session-a',
        request_id: 'request-a',
        correlation_id: 'correlation-a'
      }
    } as AuditRecord;
    expect(() => normalizeAuditEvent(conflict)).toThrow('Audit tenant context binding is invalid');
  });

  it('uses bounded labels and excludes tenant, user, request, correlation, session, and trace identifiers', () => {
    const canonical = normalizeAuditEvent(
      createGatewaySecurityAuditEvent({
        traceId: 'trace-high-cardinality',
        service: 'unregistered-service-tenant-a',
        environment: 'tenant-a-preview',
        outcome: 'accepted',
        stage: 'response',
        timestamp: now,
        context
      })
    );
    const metrics = metricsFor(canonical, {
      services: ['ai-gateway'],
      environments: ['test', 'production']
    });
    expect(metrics[0]?.labels).toEqual({
      service: 'other',
      environment: 'other',
      event_type: 'gateway.request.outcome',
      outcome: 'accepted'
    });
    expect(JSON.stringify(metrics)).not.toMatch(
      /tenant-a|user-a|request-a|correlation-a|session-a|trace-high-cardinality/
    );
  });

  it.each([
    ['audit_exporter', 'auditExporter'],
    ['security_exporter', 'securityExporter'],
    ['metrics_exporter', 'metricsExporter']
  ] as const)(
    'fails closed and records health evidence when the %s fails',
    async (component, dependencyName) => {
      const store = new InMemoryAuditEvidenceStore();
      const deps = dependencies({ evidenceStore: store });
      Object.assign(deps[dependencyName], {
        export: vi.fn(() => Promise.reject(new Error('vendor unavailable')))
      });
      const pipeline = new AuditTelemetryPipeline(deps);
      const event =
        dependencyName === 'securityExporter' ? gatewayEvent('rejected') : gatewayEvent();
      await expect(pipeline.emit(event)).rejects.toMatchObject({
        code: 'DEPENDENCY_ERROR',
        traceId: 'trace-a',
        trustedRequestId: 'request-a'
      });
      expect(store.audits).toHaveLength(1);
      expect(store.health).toContainEqual(
        expect.objectContaining({
          event_type: 'audit.pipeline.delivery_failure',
          failed_component: component,
          reason_code: 'AUDIT_DELIVERY_FAILURE'
        })
      );
      expect(deps.healthExporter.export).toHaveBeenCalledOnce();
      expect(pipeline.healthStatus()).toMatchObject({
        status: 'degraded',
        last_failure: { failed_component: component }
      });
    }
  );

  it('surfaces evidence-store failure through the independent health path', async () => {
    const deps = dependencies({
      evidenceStore: {
        persistAudit: () => Promise.reject(new Error('store unavailable')),
        persistHealth: () => Promise.reject(new Error('store unavailable'))
      }
    });
    await expect(new AuditTelemetryPipeline(deps).emit(gatewayEvent())).rejects.toMatchObject({
      code: 'DEPENDENCY_ERROR'
    });
    expect(deps.healthExporter.export).toHaveBeenCalledWith(
      expect.objectContaining({ failed_component: 'evidence_store', severity: 'critical' })
    );
  });

  it('rejects cross-environment telemetry before audit persistence', async () => {
    const deps = dependencies({ environment: 'production' });
    await expect(new AuditTelemetryPipeline(deps).emit(gatewayEvent())).rejects.toMatchObject({
      code: 'VALIDATION_ERROR'
    });
    expect((deps.evidenceStore as InMemoryAuditEvidenceStore).audits).toHaveLength(0);
    expect(deps.securityExporter.export).toHaveBeenCalledWith(
      expect.objectContaining({ reason_code: 'AUDIT_VALIDATION_FAILURE' })
    );
  });
});
