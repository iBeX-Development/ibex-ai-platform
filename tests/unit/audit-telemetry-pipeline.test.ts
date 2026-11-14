import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
import { PlatformError } from '../../packages/errors/src/index.js';

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

describe('Bounded secondary audit failure reporting', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    try {
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
      vi.restoreAllMocks();
    }
  });

  function failing(
    failure:
      | 'normalization'
      | 'evidence_store'
      | 'audit_exporter'
      | 'security_exporter'
      | 'metrics_exporter',
    overrides: Partial<AuditTelemetryPipelineDependencies> = {}
  ) {
    const original = new PlatformError(
      'VALIDATION_ERROR',
      'Audit validation failed',
      500,
      undefined,
      'trace-a',
      'request-a'
    );
    const deps = dependencies(overrides);
    // Use an actual normalization-entry failure with an exact error object to check preservation.
    const configured =
      failure === 'normalization'
        ? {
            ...deps,
            parentEventId: () => {
              throw original;
            }
          }
        : deps;
    if (failure === 'evidence_store')
      vi.spyOn(deps.evidenceStore, 'persistAudit').mockRejectedValue(
        new Error('private store error')
      );
    else if (failure !== 'normalization') {
      const exporter =
        failure === 'audit_exporter'
          ? deps.auditExporter
          : failure === 'security_exporter'
            ? deps.securityExporter
            : deps.metricsExporter;
      vi.spyOn(exporter, 'export').mockImplementation(() =>
        Promise.reject(new Error('private exporter error'))
      );
    }
    const pipeline = new AuditTelemetryPipeline(configured);
    let outcome: unknown;
    const observed = pipeline.emit(gatewayEvent('rejected')).then(
      () => {
        outcome = 'unexpected success';
      },
      (error: unknown) => {
        outcome = error;
      }
    );
    const check = () => {
      if (failure === 'normalization') expect(outcome).toBe(original);
      expect(outcome).toMatchObject({
        code: failure === 'normalization' ? 'VALIDATION_ERROR' : 'DEPENDENCY_ERROR',
        traceId: 'trace-a',
        trustedRequestId: 'request-a'
      });
      expect(String(outcome)).not.toMatch(/private|secret/);
      expect(pipeline.healthStatus()).toMatchObject({
        status: 'degraded',
        last_failure: { failed_component: failure }
      });
    };
    return { deps, pipeline, observed, check };
  }

  it.each(['normalization', 'evidence_store', 'audit_exporter'] as const)(
    'settles the original %s failure despite never-settling secondary reporting',
    async (failure) => {
      vi.useFakeTimers();
      let release!: () => void;
      const stalled = new Promise<void>((resolve) => {
        release = resolve;
      });
      const deps = dependencies({
        evidenceStore: {
          persistAudit: () =>
            failure === 'evidence_store'
              ? Promise.reject(new Error('private primary store failure'))
              : Promise.resolve(),
          persistHealth: () => stalled
        },
        auditExporter: {
          export: () =>
            failure === 'audit_exporter'
              ? Promise.reject(new Error('private primary exporter failure'))
              : Promise.resolve()
        },
        healthExporter: { export: () => stalled },
        securityExporter: { export: () => stalled }
      });
      const pipeline = new AuditTelemetryPipeline(deps);
      const source =
        failure === 'normalization'
          ? ({
              ...gatewayEvent(),
              raw_prompt: 'private prohibited prompt'
            } as unknown as AuditRecord)
          : gatewayEvent();
      let outcome: unknown;
      const observed = pipeline.emit(source).then(
        () => {
          outcome = 'unexpected success';
        },
        (error: unknown) => {
          outcome = error;
        }
      );
      await vi.advanceTimersByTimeAsync(1_000);
      try {
        expect(outcome).toMatchObject({
          code: failure === 'normalization' ? 'VALIDATION_ERROR' : 'DEPENDENCY_ERROR',
          ...(failure === 'normalization'
            ? {}
            : { traceId: 'trace-a', trustedRequestId: 'request-a' })
        });
        expect(pipeline.healthStatus()).toMatchObject({ status: 'degraded' });
      } finally {
        release();
        await observed;
      }
    }
  );

  it.each(['security_exporter', 'metrics_exporter'] as const)(
    'bounds reporting after a primary %s failure',
    async (failure) => {
      const h = failing(failure, { healthExporter: { export: () => new Promise(() => {}) } });
      await vi.advanceTimersByTimeAsync(1_000);
      await h.observed;
      h.check();
    }
  );

  it.each(['securityExporter', 'healthExporter'] as const)(
    'bounds normalization reporting when only %s hangs',
    async (exporter) => {
      const h = failing('normalization', { [exporter]: { export: () => new Promise(() => {}) } });
      await vi.advanceTimersByTimeAsync(1_000);
      await h.observed;
      h.check();
    }
  );

  it.each(['normalization', 'evidence_store', 'audit_exporter'] as const)(
    'gives healthy secondary paths the %s record despite a stalled peer',
    async (failure) => {
      const health = vi.fn(() => Promise.resolve());
      const security = vi.fn(() => Promise.resolve());
      const h = failing(failure, {
        evidenceStore: {
          persistAudit: () => Promise.resolve(),
          persistHealth: () => new Promise(() => {})
        },
        healthExporter: { export: health },
        securityExporter: { export: security }
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(health).toHaveBeenCalledOnce();
      expect(health).toHaveBeenCalledWith(
        expect.objectContaining({ trace_id: 'trace-a', failed_component: failure })
      );
      if (failure === 'normalization') expect(security).toHaveBeenCalledOnce();
      expect(JSON.stringify(health.mock.calls)).not.toMatch(/private|secret/);
      await vi.advanceTimersByTimeAsync(1_000);
      await h.observed;
      h.check();
    }
  );

  it.each(
    (['normalization', 'evidence_store', 'audit_exporter'] as const).flatMap((failure) =>
      (['reject', 'throw'] as const).map((outcome) => ({ failure, outcome }))
    )
  )('preserves $failure when secondary paths $outcome', async ({ failure, outcome }) => {
    const fail = vi.fn((): Promise<void> => {
      if (outcome === 'throw') throw new Error('private secondary secret');
      return Promise.reject(new Error('private secondary secret'));
    });
    const h = failing(failure, {
      evidenceStore: { persistAudit: () => Promise.resolve(), persistHealth: fail },
      healthExporter: { export: fail },
      securityExporter: { export: fail }
    });
    await h.observed;
    h.check();
    expect(fail).toHaveBeenCalledTimes(
      failure === 'normalization' ? 3 : failure === 'evidence_store' ? 1 : 2
    );
    expect(h.deps.metricsExporter.export).not.toHaveBeenCalled();
  });

  it.each(
    (['normalization', 'evidence_store', 'audit_exporter'] as const).flatMap((failure) =>
      (['fulfill', 'reject'] as const).map((outcome) => ({ failure, outcome }))
    )
  )(
    'observes late $outcome after $failure without retry or continuation',
    async ({ failure, outcome }) => {
      let resolve!: () => void;
      let reject!: (error: Error) => void;
      const late = new Promise<void>((done, fail) => {
        resolve = done;
        reject = fail;
      });
      const secondary = vi.fn(() => late);
      const h = failing(failure, {
        evidenceStore: { persistAudit: () => Promise.resolve(), persistHealth: secondary },
        healthExporter: { export: secondary },
        securityExporter: { export: secondary }
      });
      await vi.advanceTimersByTimeAsync(1_000);
      await h.observed;
      h.check();
      const status = h.pipeline.healthStatus();
      const calls = secondary.mock.calls.length;
      if (outcome === 'reject') reject(new Error('private late secondary secret'));
      else resolve();
      await vi.advanceTimersByTimeAsync(0);
      h.check();
      expect(h.pipeline.healthStatus()).toBe(status);
      expect(secondary).toHaveBeenCalledTimes(calls);
      expect(h.deps.metricsExporter.export).not.toHaveBeenCalled();
      // Vitest also fails the run if the late rejection is unhandled.
    }
  );

  it.each(
    (['normalization', 'audit_exporter'] as const).flatMap((failure) =>
      (['fulfill', 'reject', 'synchronous-fulfill', 'synchronous-throw'] as const).map(
        (outcome) => ({ failure, outcome })
      )
    )
  )(
    'checks the absolute deadline for $failure $outcome without timer delivery',
    async ({ failure, outcome }) => {
      let monotonic = 100;
      const clock = vi.fn(() => monotonic);
      const expire = vi.fn(() => {
        if (outcome.startsWith('synchronous')) {
          monotonic += 1_000;
          if (outcome === 'synchronous-throw') throw new Error('private blocked failure');
          return Promise.resolve();
        }
        return Promise.resolve().then(() => {
          monotonic += 1_000;
          if (outcome === 'reject') throw new Error('private late failure');
        });
      });
      const health = vi.fn(() => new Promise<void>(() => {}));
      const security = vi.fn(() => new Promise<void>(() => {}));
      const h = failing(failure, {
        monotonicClock: clock,
        evidenceStore: { persistAudit: () => Promise.resolve(), persistHealth: expire },
        healthExporter: { export: health },
        securityExporter: { export: security }
      });
      // No timer is advanced: fulfillment/rejection must independently close expired reporting.
      await h.observed;
      h.check();
      expect(
        clock.mock.results.some((read) => read.type === 'return' && read.value === 1_100)
      ).toBe(true);
      expect(expire).toHaveBeenCalledOnce();
      if (outcome.startsWith('synchronous')) {
        expect(health).not.toHaveBeenCalled();
        expect(security).not.toHaveBeenCalled();
      }
      expect(h.deps.metricsExporter.export).not.toHaveBeenCalled();
    }
  );

  it('uses one reporting ceiling shared across independent secondary attempts', async () => {
    const health = vi.fn(() => new Promise<void>(() => {}));
    const security = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          setTimeout(resolve, 800);
        })
    );
    const h = failing('normalization', {
      evidenceStore: {
        persistAudit: () => Promise.resolve(),
        persistHealth: () =>
          new Promise((resolve) => {
            setTimeout(resolve, 600);
          })
      },
      securityExporter: { export: security },
      healthExporter: { export: health }
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(health).toHaveBeenCalledOnce();
    expect(security).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(999);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await h.observed;
    h.check();
  });

  it('skips every secondary invocation when its absolute budget expires before entry', async () => {
    const clock = vi.fn().mockReturnValueOnce(100).mockReturnValue(1_100);
    const secondary = vi.fn(() => Promise.resolve());
    const h = failing('normalization', {
      monotonicClock: clock,
      evidenceStore: { persistAudit: () => Promise.resolve(), persistHealth: secondary },
      healthExporter: { export: secondary },
      securityExporter: { export: secondary }
    });
    await h.observed;
    h.check();
    expect(secondary).not.toHaveBeenCalled();
  });

  it('does not replace the original failure when the reporting clock throws', async () => {
    const h = failing('audit_exporter', {
      monotonicClock: () => {
        throw new Error('private clock failure');
      }
    });
    await h.observed;
    h.check();
    expect(h.deps.healthExporter.export).not.toHaveBeenCalled();
  });

  it('preserves the exact normalization-entry error if the reporting ID factory also fails', async () => {
    const original = new PlatformError('VALIDATION_ERROR', 'Audit identifier unavailable', 500);
    const deps = dependencies({
      eventIdFactory: () => {
        throw original;
      }
    });
    const pipeline = new AuditTelemetryPipeline(deps);
    await expect(pipeline.emit(gatewayEvent())).rejects.toBe(original);
    expect(pipeline.healthStatus().status).toBe('degraded');
    expect(deps.healthExporter.export).toHaveBeenCalledWith(
      expect.objectContaining({ trace_id: 'trace-a' })
    );
  });

  it.each(['normalization', 'evidence_store', 'audit_exporter'] as const)(
    'finishes healthy secondary reporting promptly for %s',
    async (failure) => {
      const h = failing(failure);
      await h.observed;
      h.check();
      expect(h.deps.healthExporter.export).toHaveBeenCalledOnce();
    }
  );

  it('keeps ordinary successful delivery healthy without reporting timers', async () => {
    const deps = dependencies();
    const pipeline = new AuditTelemetryPipeline(deps);
    await pipeline.emit(gatewayEvent());
    expect(pipeline.healthStatus()).toEqual({ status: 'healthy' });
    expect(deps.auditExporter.export).toHaveBeenCalledOnce();
    expect(deps.metricsExporter.export).toHaveBeenCalledOnce();
    expect(deps.healthExporter.export).not.toHaveBeenCalled();
  });
});

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

  it.each([
    'api_key',
    'API-KEY',
    'apikey',
    'token',
    'Authorization',
    'cookie',
    'rawPrompt',
    'raw-prompt',
    'toolInput',
    'tool.input'
  ])('recursively rejects sensitive alias %s before any telemetry delivery', async (key) => {
    const deps = dependencies();
    const pipeline = new AuditTelemetryPipeline(deps);
    const sensitiveValue = `never-export-${key}`;
    const unsafe = {
      ...gatewayEvent(),
      nested: [{ safe: { [key]: sensitiveValue } }]
    } as unknown as AuditRecord;

    await expect(pipeline.emit(unsafe)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    const store = deps.evidenceStore as InMemoryAuditEvidenceStore;
    expect(store.audits).toHaveLength(0);
    expect(deps.auditExporter.export).not.toHaveBeenCalled();
    expect(deps.metricsExporter.export).not.toHaveBeenCalled();
    expect(JSON.stringify(store.health)).not.toContain(sensitiveValue);
    expect(JSON.stringify(vi.mocked(deps.securityExporter.export).mock.calls)).not.toContain(
      sensitiveValue
    );
    expect(JSON.stringify(vi.mocked(deps.healthExporter.export).mock.calls)).not.toContain(
      sensitiveValue
    );
  });

  it.each([
    ['trusted', 'root'],
    ['trusted', 'nested'],
    ['unavailable', 'root'],
    ['unavailable', 'nested']
  ] as const)(
    'rejects prohibited evidence introduced during copying for %s context at %s',
    async (contextStatus, placement) => {
      const deps = dependencies();
      const pipeline = new AuditTelemetryPipeline(deps);
      const source = {
        ...createGatewaySecurityAuditEvent({
          traceId: 'trace-a',
          service: 'ai-gateway',
          environment: 'test',
          outcome: 'accepted',
          stage: 'response',
          timestamp: now,
          ...(contextStatus === 'trusted' ? { context } : {})
        })
      };
      expect(source.context_status).toBe(contextStatus);
      let reads = 0;
      const changed = {
        get value() {
          reads += 1;
          return reads === 1 ? { count: 1 } : { raw_prompt: 'copy-private-canary' };
        }
      };
      const unsafe = Object.defineProperty(
        source,
        'copy_evidence',
        placement === 'root'
          ? { enumerable: true, get: () => changed.value }
          : { enumerable: true, value: changed }
      );

      await expect(pipeline.emit(unsafe)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      expect(reads).toBeGreaterThan(1);
      const store = deps.evidenceStore as InMemoryAuditEvidenceStore;
      expect(store.audits).toHaveLength(0);
      expect(deps.auditExporter.export).not.toHaveBeenCalled();
      expect(deps.metricsExporter.export).not.toHaveBeenCalled();
      expect(store.health).toContainEqual(
        expect.objectContaining({ reason_code: 'PROHIBITED_AUDIT_DATA' })
      );
      expect(JSON.stringify(store.health)).not.toContain('copy-private-canary');
      expect(JSON.stringify(vi.mocked(deps.securityExporter.export).mock.calls)).not.toContain(
        'copy-private-canary'
      );
      expect(JSON.stringify(vi.mocked(deps.healthExporter.export).mock.calls)).not.toContain(
        'copy-private-canary'
      );
    }
  );

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

  it.each([
    ['tool_runtime.execution.outcome', 'input_schema', 'INVALID_INPUT'],
    ['tool_runtime.execution.outcome', 'request_validation', 'VALIDATION_ERROR'],
    ['model_gateway.invocation.outcome', 'provider_invocation', 'PROVIDER_TIMEOUT'],
    ['model_gateway.invocation.outcome', 'provider_invocation', 'PROVIDER_ERROR'],
    ['model_gateway.invocation.outcome', 'response_validation', 'INVALID_RESPONSE']
  ])(
    'classifies contextual %s %s %s failures as security events with bounded metrics',
    async (eventType, stage, errorCode) => {
      const deps = dependencies();
      const event = {
        ...gatewayEvent('rejected'),
        event_type: eventType,
        service: `${eventType}-unregistered`,
        stage,
        error_code: errorCode
      } as unknown as AuditRecord;

      await new AuditTelemetryPipeline(deps).emit(event);

      expect(deps.securityExporter.export).toHaveBeenCalledWith(
        expect.objectContaining({ reason_code: errorCode })
      );
      expect(deps.metricsExporter.export).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'ibex.security.rejections',
            labels: {
              service: 'other',
              environment: 'test',
              event_type: eventType,
              outcome: 'rejected'
            }
          })
        ])
      );
    }
  );

  it('keeps INVALID_INPUT outside the security category when it is not a tool event', () => {
    const event = normalizeAuditEvent({
      ...gatewayEvent('rejected'),
      stage: 'payload_schema',
      error_code: 'INVALID_INPUT'
    } as unknown as AuditRecord);
    expect(event.category).not.toBe('security');
    expect(securityObservationFor(event)).toBeUndefined();
  });

  it('requires the matching Tool Runtime stage before classifying INVALID_INPUT as security', () => {
    const event = normalizeAuditEvent({
      ...gatewayEvent('rejected'),
      event_type: 'tool_runtime.execution.outcome',
      stage: 'audit',
      error_code: 'INVALID_INPUT'
    } as unknown as AuditRecord);
    expect(event.category).not.toBe('security');
    expect(securityObservationFor(event)).toBeUndefined();
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
