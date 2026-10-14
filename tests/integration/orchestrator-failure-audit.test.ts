import { SpanStatusCode, type Span } from '@opentelemetry/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuditRecord } from '../../packages/audit/src/index.js';
import { PlatformError } from '../../packages/errors/src/index.js';
import { tracer } from '../../packages/observability/src/index.js';
import {
  createRuntime,
  runtimeContext,
  runtimeDependencies,
  runtimeRequest,
  runtimeValidationTime
} from '../testing/runtime-fixtures.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function captureSpan() {
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
  return span;
}

const failures = [
  { kind: 'invalid context', code: 'TENANT_CONTEXT_ERROR', stage: 'boundary_context', status: 401 },
  { kind: 'permission', code: 'PERMISSION_DENIED', stage: 'authorization', status: 403 },
  { kind: 'pre-cancelled', code: 'TIMEOUT_ERROR', stage: 'input_budget', status: 408 },
  {
    kind: 'in-flight cancellation',
    code: 'TIMEOUT_ERROR',
    stage: 'intent_classification',
    status: 408
  },
  { kind: 'timeout', code: 'TIMEOUT_ERROR', stage: 'intent_classification', status: 504 }
] as const;

describe('orchestrator bounded failure audit reporting', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    const timerCount = vi.getTimerCount();
    vi.clearAllTimers();
    vi.restoreAllMocks();
    vi.useRealTimers();
    expect(timerCount).toBe(0);
  });

  it.each(failures)(
    'bounds a hanging sink after $kind and closes the span once',
    async (failure) => {
      const attempted: AuditRecord[] = [];
      const report = deferred<undefined>();
      const classification =
        deferred<
          Awaited<ReturnType<ReturnType<typeof runtimeDependencies>['classifier']['classify']>>
        >();
      const base = runtimeDependencies([]);
      const classify = vi.fn(base.classifier.classify.bind(base.classifier));
      const rag = vi.fn(base.ragPlanning.plan.bind(base.ragPlanning));
      const tool = vi.fn(base.toolPlanning.plan.bind(base.toolPlanning));
      const model = vi.fn(base.modelPolicy.select.bind(base.modelPolicy));
      const span = captureSpan();
      const controller = new AbortController();
      const blocked = failure.kind === 'in-flight cancellation' || failure.kind === 'timeout';
      if (blocked) classify.mockImplementation(() => classification.promise);
      if (failure.kind === 'pre-cancelled') controller.abort();
      const runtime = createRuntime([], {
        classifier: { classify },
        ragPlanning: { plan: rag },
        toolPlanning: { plan: tool },
        modelPolicy: { select: model },
        audit: {
          emit: (event) => {
            attempted.push(event);
            return report.promise;
          }
        }
      });
      let settled = false;
      const finished = runtime
        .route(
          runtimeRequest({
            signal: controller.signal,
            context:
              failure.kind === 'invalid context'
                ? { ...runtimeContext, tenant_id: '', authorization: 'private-invalid-context' }
                : failure.kind === 'permission'
                  ? { ...runtimeContext, permissions: [] }
                  : runtimeContext
          }),
          runtimeValidationTime
        )
        .catch((error: unknown) => {
          settled = true;
          return error;
        });
      await vi.advanceTimersByTimeAsync(0);
      if (failure.kind === 'in-flight cancellation') controller.abort();
      if (failure.kind === 'timeout') await vi.advanceTimersByTimeAsync(1_000);
      await vi.advanceTimersByTimeAsync(0);
      expect(attempted).toHaveLength(1);
      expect(attempted[0]).toMatchObject({
        event_type: 'orchestrator.routing.outcome',
        trace_id: 'trace-1',
        outcome: failure.status >= 500 ? 'error' : 'rejected',
        stage: failure.stage,
        error_code: failure.code,
        context_status: failure.kind === 'invalid context' ? 'unavailable' : 'trusted'
      });
      if (failure.kind === 'invalid context') {
        for (const key of ['tenant_id', 'user_id', 'request_id', 'permission_refs']) {
          expect(attempted[0]).not.toHaveProperty(key);
        }
        expect(JSON.stringify(attempted)).not.toContain('private-invalid-context');
      } else {
        expect(attempted[0]).toMatchObject({
          tenant_id: 'tenant-a',
          request_id: 'request-1',
          correlation_id: 'correlation-1'
        });
      }
      await vi.advanceTimersByTimeAsync(999);
      expect(settled).toBe(false);
      expect(span.end).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      const error = await finished;
      expect(error).toBeInstanceOf(PlatformError);
      expect(error).toMatchObject({
        code: failure.code,
        statusCode: failure.status,
        traceId: 'trace-1',
        trustedRequestId: failure.kind === 'invalid context' ? undefined : 'request-1'
      });
      expect(span.end).toHaveBeenCalledTimes(1);
      expect(span.setStatus).toHaveBeenCalledExactlyOnceWith({ code: SpanStatusCode.ERROR });
      expect(span.addEvent).toHaveBeenCalledExactlyOnceWith('orchestrator.audit.emission_failed');
      expect(vi.getTimerCount()).toBe(0);
      // These are attempted reports, not evidence of persistence. Late work cannot route.
      classification.resolve({
        status: 'classified',
        intent: 'maintenance_lookup',
        domain: 'maintenance',
        required_capabilities: ['maintenance:read']
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(rag).not.toHaveBeenCalled();
      expect(tool).not.toHaveBeenCalled();
      expect(model).not.toHaveBeenCalled();
    }
  );

  it.each(['fulfill', 'reject'] as const)(
    'observes late sink %s without changing the failure',
    async (late) => {
      const span = captureSpan();
      const report = deferred<undefined>();
      const rag = vi.fn();
      const emit = vi.fn(() => report.promise);
      const runtime = createRuntime([], { audit: { emit }, ragPlanning: { plan: rag } });
      const finished = runtime
        .route(runtimeRequest({ context: { ...runtimeContext, permissions: [] } }))
        .catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(1_000);
      const error = await finished;
      expect(error).toMatchObject({ code: 'PERMISSION_DENIED' });
      if (late === 'fulfill') report.resolve(undefined);
      else report.reject(new Error('private late sink rejection'));
      await vi.advanceTimersByTimeAsync(0);
      expect(await finished).toBe(error);
      expect(emit).toHaveBeenCalledTimes(1);
      expect(rag).not.toHaveBeenCalled();
      expect(span.end).toHaveBeenCalledTimes(1);
      expect(span.setStatus).toHaveBeenCalledExactlyOnceWith({ code: SpanStatusCode.ERROR });
      expect(span.addEvent).toHaveBeenCalledExactlyOnceWith('orchestrator.audit.emission_failed');
    }
  );

  it.each(['resolve', 'reject', 'throw'] as const)(
    'preserves original error and clears timers on immediate sink %s',
    async (mode) => {
      const span = captureSpan();
      const original = new PlatformError('PERMISSION_DENIED', 'Original safe denial', 403);
      const emit = vi.fn(() => {
        if (mode === 'throw') throw new Error('private sink failure');
        return mode === 'reject'
          ? Promise.reject(new Error('private sink failure'))
          : Promise.resolve();
      });
      const runtime = createRuntime([], {
        classifier: { classify: () => Promise.reject(original) },
        audit: { emit }
      });
      await expect(runtime.route(runtimeRequest())).rejects.toMatchObject({
        code: original.code,
        publicMessage: original.publicMessage,
        statusCode: original.statusCode,
        traceId: 'trace-1',
        trustedRequestId: 'request-1'
      });
      expect(emit).toHaveBeenCalledTimes(1);
      expect(span.end).toHaveBeenCalledTimes(1);
      expect(span.addEvent).toHaveBeenCalledTimes(mode === 'resolve' ? 0 : 1);
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it('keeps successful immediate audit reporting unchanged', async () => {
    const events: AuditRecord[] = [];
    const span = captureSpan();
    await expect(createRuntime(events).route(runtimeRequest())).resolves.toMatchObject({
      status: 'routed'
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ outcome: 'routed', stage: 'audit', tenant_id: 'tenant-a' });
    expect(span.setStatus).toHaveBeenCalledExactlyOnceWith({ code: SpanStatusCode.OK });
    expect(span.end).toHaveBeenCalledTimes(1);
    expect(span.addEvent).not.toHaveBeenCalled();
  });
});
