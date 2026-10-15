import { SpanStatusCode, type Span } from '@opentelemetry/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuditRecord } from '../../packages/audit/src/index.js';
import { PlatformError } from '../../packages/errors/src/index.js';
import { AiGatewayService } from '../../packages/gateway/src/index.js';
import { tracer } from '../../packages/observability/src/index.js';
import { enabledTestFeatureControls } from '../../packages/testing/src/index.js';
import {
  authenticatorReturning,
  gatewayEnvelope,
  gatewayIdentity,
  validationTime
} from '../testing/security-fixtures.js';

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function fixture(
  emit: (event: AuditRecord) => Promise<void>,
  failure: 'trusted' | 'untrusted' | 'internal' | 'none' = 'trusted'
) {
  const span = {
    setAttribute: vi.fn(),
    setAttributes: vi.fn(),
    recordException: vi.fn(),
    setStatus: vi.fn(),
    addEvent: vi.fn(),
    end: vi.fn()
  };
  vi.spyOn(tracer, 'startActiveSpan').mockImplementation((...args) => {
    const callback = args.at(-1) as (active: Span) => unknown;
    return callback(span as unknown as Span);
  });
  const forward = vi.fn(() =>
    Promise.resolve({
      status: 'success' as const,
      action_type: 'informational' as const,
      approval_required: false
    })
  );
  const authorize = vi.fn(() =>
    Promise.resolve({ allowed: true as const, decision_id: 'decision-1' })
  );
  const consume = vi.fn(() => {
    if (failure === 'trusted')
      throw new PlatformError('RATE_LIMIT_ERROR', 'Rate limit exceeded', 429, {
        private: 'private-original-detail'
      });
    if (failure === 'internal') throw new Error('private-original-detail');
    return Promise.resolve();
  });
  const service = new AiGatewayService({
    featureControls: enabledTestFeatureControls,
    authenticator:
      failure === 'untrusted'
        ? {
            authenticate: () => {
              throw new PlatformError('AUTHENTICATION_ERROR', 'Authentication failed', 401, {
                private: 'private-original-detail'
              });
            }
          }
        : authenticatorReturning(gatewayIdentity),
    authorizationPolicy: { authorize },
    accessRequirements: {
      resolve: () => ({
        capability: 'ai:general',
        action: 'invoke',
        required_permissions: [],
        required_entitlements: ['ai:general']
      })
    },
    rateLimiter: { consume },
    platform: { forward },
    audit: { emit },
    service: 'gateway-test',
    environment: 'test',
    maximumPayloadBytes: 4096,
    traceIdFactory: () => 'gateway-trace-1'
  });
  const execute = () =>
    service.execute(
      {
        endpoint: 'chat',
        headers: {},
        payload_bytes: 512,
        envelope: {
          ...gatewayEnvelope,
          requested_capability: 'ai:general',
          payload: { message: 'private-payload' }
        }
      },
      validationTime
    );
  return { execute, span, forward, authorize, consume };
}

function assertFailure(error: unknown, failure: 'trusted' | 'untrusted' | 'internal') {
  expect(error).toBeInstanceOf(PlatformError);
  expect(error).toMatchObject({
    code:
      failure === 'trusted'
        ? 'RATE_LIMIT_ERROR'
        : failure === 'untrusted'
          ? 'AUTHENTICATION_ERROR'
          : 'INTERNAL_ERROR',
    publicMessage:
      failure === 'trusted'
        ? 'Rate limit exceeded'
        : failure === 'untrusted'
          ? 'Authentication failed'
          : 'An internal error occurred',
    statusCode: failure === 'trusted' ? 429 : failure === 'untrusted' ? 401 : 500,
    traceId: 'gateway-trace-1',
    trustedRequestId: failure === 'untrusted' ? undefined : 'request-1'
  });
  expect(JSON.stringify(error)).not.toContain('private-');
}

describe('Gateway bounded secondary failure audit', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    const timers = vi.getTimerCount();
    vi.clearAllTimers();
    vi.restoreAllMocks();
    vi.useRealTimers();
    expect(timers).toBe(0);
  });

  it.each(['trusted', 'untrusted', 'internal'] as const)(
    'bounds a never-settling report after %s failure',
    async (failure) => {
      const events: AuditRecord[] = [];
      const h = fixture((event) => {
        events.push(event);
        return new Promise<void>(() => undefined);
      }, failure);
      let settled = false;
      const finished = h.execute().catch((error: unknown) => {
        settled = true;
        return error;
      });
      await vi.advanceTimersByTimeAsync(999);
      expect(settled).toBe(false);
      expect(h.span.end).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(settled).toBe(true);
      assertFailure(await finished, failure);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        trace_id: 'gateway-trace-1',
        stage: failure === 'untrusted' ? 'authentication' : 'rate_limit',
        outcome: failure === 'internal' ? 'error' : 'rejected'
      });
      if (failure === 'untrusted') expect(events[0]).not.toHaveProperty('trusted_context');
      else
        expect(events[0]).toMatchObject({
          trusted_context: {
            request_id: 'request-1',
            correlation_id: 'correlation-1',
            tenant_id: 'tenant-a'
          }
        });
      expect(JSON.stringify(events)).not.toContain('private-');
      expect(h.authorize).not.toHaveBeenCalled();
      expect(h.forward).not.toHaveBeenCalled();
      expect(h.span.end).toHaveBeenCalledTimes(1);
      expect(h.span.setStatus).toHaveBeenCalledExactlyOnceWith({ code: SpanStatusCode.ERROR });
      expect(h.span.addEvent).toHaveBeenCalledExactlyOnceWith('gateway.audit.emission_failed');
      expect(h.span.recordException).toHaveBeenCalledExactlyOnceWith(
        new Error('Gateway request rejected')
      );
    }
  );

  it.each(['resolve', 'reject', 'throw'] as const)(
    'preserves the failure and clears the timer on immediate %s',
    async (mode) => {
      const emit = vi.fn(() => {
        if (mode === 'throw') throw new Error('private-sink-detail');
        return mode === 'reject'
          ? Promise.reject(new Error('private-sink-detail'))
          : Promise.resolve();
      });
      const h = fixture(emit);
      assertFailure(await h.execute().catch((error: unknown) => error), 'trusted');
      expect(emit).toHaveBeenCalledTimes(1);
      expect(h.span.end).toHaveBeenCalledTimes(1);
      expect(h.span.addEvent.mock.calls).toEqual(
        mode === 'resolve' ? [] : [['gateway.audit.emission_failed']]
      );
      expect(h.authorize).not.toHaveBeenCalled();
      expect(h.forward).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it.each(['resolve', 'reject'] as const)(
    'observes late %s without continuation or duplicate completion',
    async (mode) => {
      const report = deferred();
      const emit = vi.fn(() => report.promise);
      const h = fixture(emit);
      let settled = false;
      const finished = h.execute().catch((error: unknown) => {
        settled = true;
        return error;
      });
      await vi.advanceTimersByTimeAsync(1000);
      expect(settled).toBe(true);
      const error = await finished;
      assertFailure(error, 'trusted');
      if (mode === 'resolve') report.resolve();
      else report.reject(new Error('private-late-detail'));
      await vi.advanceTimersByTimeAsync(0);
      expect(await finished).toBe(error);
      expect(emit).toHaveBeenCalledTimes(1);
      expect(h.span.end).toHaveBeenCalledTimes(1);
      expect(h.span.addEvent).toHaveBeenCalledExactlyOnceWith('gateway.audit.emission_failed');
      expect(h.authorize).not.toHaveBeenCalled();
      expect(h.forward).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it.each(['authorization', 'response'] as const)(
    'keeps primary %s audit acknowledgement unbounded',
    async (stage) => {
      const report = deferred();
      const events: AuditRecord[] = [];
      const h = fixture((event) => {
        events.push(event);
        return 'stage' in event && event.stage === stage ? report.promise : Promise.resolve();
      }, 'none');
      let settled = false;
      const finished = h.execute().then((result) => {
        settled = true;
        return result;
      });
      await vi.advanceTimersByTimeAsync(2000);
      expect(settled).toBe(false);
      expect(h.span.end).not.toHaveBeenCalled();
      expect(h.forward).toHaveBeenCalledTimes(stage === 'authorization' ? 0 : 1);
      expect(vi.getTimerCount()).toBe(0);
      report.resolve();
      await expect(finished).resolves.toMatchObject({
        status: 'success',
        request_id: 'request-1',
        trace_id: 'gateway-trace-1'
      });
      expect(events).toHaveLength(2);
      expect(h.forward).toHaveBeenCalledTimes(1);
      expect(h.span.end).toHaveBeenCalledTimes(1);
      expect(h.span.setStatus).toHaveBeenCalledExactlyOnceWith({ code: SpanStatusCode.OK });
      expect(h.span.addEvent).not.toHaveBeenCalled();
    }
  );
});
