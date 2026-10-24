import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SpanStatusCode, type Span } from '@opentelemetry/api';
import type { AuditRecord } from '../../packages/audit/src/index.js';
import { toErrorEnvelope } from '../../packages/errors/src/index.js';
import { tracer } from '../../packages/observability/src/index.js';
import {
  InMemoryToolRateLimiter,
  ToolAdapterError,
  ToolRateLimitCatalog,
  type ToolRateLimiter
} from '../../packages/tool-runtime/src/index.js';
import {
  createToolRuntime,
  readToolMetadata,
  successfulToolAdapter,
  toolRequest
} from '../testing/tool-runtime-fixtures.js';

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function recordSpan() {
  const events: string[] = [];
  const end = vi.fn();
  const setStatus = vi.fn();
  const span: Span = {
    spanContext: () => ({ traceId: '1'.repeat(32), spanId: '2'.repeat(16), traceFlags: 1 }),
    setAttribute: () => span,
    setAttributes: () => span,
    addEvent: (name) => {
      events.push(name);
      return span;
    },
    addLink: () => span,
    addLinks: () => span,
    updateName: () => span,
    isRecording: () => true,
    recordException: () => undefined,
    setStatus: (status) => {
      setStatus(status);
      return span;
    },
    end
  };
  vi.spyOn(tracer, 'startActiveSpan').mockImplementation((...args) => {
    const callback = args.at(-1) as (activeSpan: Span) => unknown;
    return callback(span);
  });
  return { events, end, setStatus };
}

function harness(
  options: {
    errorAudit?: () => Promise<void>;
    terminalAudit?: () => Promise<void>;
    consume?: ToolRateLimiter['consume'];
    onAdapterFailure?: () => void;
  } = {}
) {
  const span = recordSpan();
  const auditWait = deferred();
  const records: AuditRecord[] = [];
  const adapter = successfulToolAdapter();
  const invoke = vi.fn(adapter.invoke.bind(adapter)).mockImplementationOnce(() => {
    options.onAdapterFailure?.();
    return Promise.reject(new ToolAdapterError('transient'));
  });
  const limiter = new InMemoryToolRateLimiter(() => 100);
  const consume = vi.fn<ToolRateLimiter['consume']>(
    options.consume ?? limiter.consume.bind(limiter)
  );
  const emit = vi.fn((event: AuditRecord): Promise<void> => {
    records.push(event);
    if (records.length === 2) return options.errorAudit?.() ?? auditWait.promise;
    if (records.length === 3 && options.terminalAudit) return options.terminalAudit();
    return Promise.resolve();
  });
  const runtime = createToolRuntime(records, {
    rateLimitPolicies: new ToolRateLimitCatalog([
      { reference: readToolMetadata.rate_limit, limit: 1, window_ms: 1000 }
    ]),
    rateLimiter: { consume },
    adapters: [{ ...adapter, invoke }],
    audit: { emit }
  });
  return { runtime, invoke, consume, emit, records, auditWait, limiter, span };
}

let monotonic = 0;
beforeEach(() => {
  vi.useFakeTimers();
  monotonic = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => monotonic);
});
afterEach(() => {
  expect(vi.getTimerCount()).toBe(0);
  vi.restoreAllMocks();
  vi.useRealTimers();
});
async function advance(milliseconds: number) {
  monotonic += milliseconds;
  await vi.advanceTimersByTimeAsync(milliseconds);
}
function observe(promise: Promise<unknown>) {
  const state: { done: boolean; error?: unknown; value?: unknown } = { done: false };
  const finished = promise.then(
    (value) => {
      state.done = true;
      state.value = value;
    },
    (error: unknown) => {
      state.done = true;
      state.error = error;
    }
  );
  return { state, finished };
}
function expectOriginal(
  error: unknown,
  code = 'SERVICE_UNAVAILABLE',
  message = 'Tool dependency is unavailable'
) {
  expect(toErrorEnvelope(error)).toEqual({
    error: {
      code,
      message,
      trace_id: 'tool-trace-1',
      request_id: 'request-tool-1'
    }
  });
}

describe('Tool per-attempt error audit deadline', () => {
  it('bounds a hanging error audit without a caller signal and never refunds admission', async () => {
    const h = harness();
    const result = observe(h.runtime.execute(toolRequest()));
    await advance(0);
    expect(h.emit).toHaveBeenCalledTimes(2);
    await advance(999);
    expect(result.state.done).toBe(false);
    await advance(1);
    await result.finished;
    expectOriginal(result.state.error);
    expect(h.invoke).toHaveBeenCalledTimes(1);
    expect(h.consume).toHaveBeenCalledTimes(1);
    const entry = h.consume.mock.calls[0]?.[0];
    if (!entry) throw new Error('Expected admission');
    expect(await h.limiter.consume({ ...entry, signal: new AbortController().signal })).toEqual({
      allowed: false
    });
    expect(h.span.events).toEqual(['tool_runtime.audit.emission_failed']);
    expect(h.span.end).toHaveBeenCalledTimes(1);
    expect(h.span.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.ERROR });
  });

  it.each(['resolve', 'reject'] as const)(
    'observes late audit %s without continuation',
    async (outcome) => {
      const h = harness();
      const result = observe(h.runtime.execute(toolRequest()));
      await advance(0);
      await advance(1000);
      await result.finished;
      if (outcome === 'resolve') h.auditWait.resolve();
      else h.auditWait.reject(new Error('private late failure'));
      await advance(0);
      expectOriginal(result.state.error);
      expect(h.invoke).toHaveBeenCalledTimes(1);
      expect(h.consume).toHaveBeenCalledTimes(1);
      expect(h.emit).toHaveBeenCalledTimes(3);
      expect(h.span.end).toHaveBeenCalledTimes(1);
      expect(
        h.records.some(
          (record) => 'outcome' in record && ['succeeded', 'proposed'].includes(record.outcome)
        )
      ).toBe(false);
    }
  );

  it.each(['throw', 'reject'] as const)(
    'preserves the original normalized error on audit %s',
    async (mode) => {
      const h = harness({
        errorAudit: () => {
          if (mode === 'throw') throw new Error('private sink error');
          return Promise.reject(new Error('private sink error'));
        }
      });
      const result = observe(h.runtime.execute(toolRequest()));
      await advance(0);
      await result.finished;
      expectOriginal(result.state.error);
      expect(h.invoke).toHaveBeenCalledTimes(1);
      expect(h.span.events).toEqual(['tool_runtime.audit.emission_failed']);
      expect(JSON.stringify(h.records)).not.toContain('private');
    }
  );

  it.each(['exhausted', 'uncertain'] as const)(
    'bounds %s admission error audit without another consumption',
    async (mode) => {
      const h = harness({
        consume: () =>
          mode === 'exhausted'
            ? Promise.resolve({ allowed: false })
            : Promise.reject(new Error('private limiter'))
      });
      const result = observe(h.runtime.execute(toolRequest()));
      await advance(0);
      await advance(1000);
      await result.finished;
      expectOriginal(
        result.state.error,
        mode === 'exhausted' ? 'RATE_LIMITED' : 'SERVICE_UNAVAILABLE',
        mode === 'exhausted' ? 'Tool rate limit exceeded' : 'Tool admission is unavailable'
      );
      expect(h.invoke).not.toHaveBeenCalled();
      expect(h.consume).toHaveBeenCalledTimes(1);
    }
  );

  it.each([0, 999, 1000])(
    'gives caller cancellation precedence at %i ms and cleans listeners',
    async (elapsed) => {
      const h = harness();
      const controller = new AbortController();
      const add = vi.spyOn(controller.signal, 'addEventListener');
      const remove = vi.spyOn(controller.signal, 'removeEventListener');
      const result = observe(h.runtime.execute(toolRequest(), { signal: controller.signal }));
      await advance(0);
      // Simulate a delayed timer at equality; cancellation occurs before queued settlement.
      monotonic = elapsed;
      controller.abort();
      h.auditWait.resolve();
      await advance(0);
      await result.finished;
      expectOriginal(result.state.error, 'TIMEOUT_ERROR', 'Tool request was cancelled');
      expect(h.invoke).toHaveBeenCalledTimes(1);
      expect(h.consume).toHaveBeenCalledTimes(1);
      expect(h.span.end).toHaveBeenCalledTimes(1);
      expect(remove.mock.calls.map((call) => call[1])).toEqual(
        add.mock.calls.map((call) => call[1])
      );
    }
  );

  it('does not invoke the per-attempt audit when the caller cancels before reporting', async () => {
    const controller = new AbortController();
    const h = harness({
      onAdapterFailure: () => {
        controller.abort();
      }
    });
    const result = observe(h.runtime.execute(toolRequest(), { signal: controller.signal }));
    await advance(0);
    // The second event is now terminal reporting, whose own bounded wait still applies.
    await advance(1000);
    await result.finished;
    expectOriginal(result.state.error, 'TIMEOUT_ERROR', 'Tool request was cancelled');
    expect(h.emit).toHaveBeenCalledTimes(2);
    expect(h.span.end).toHaveBeenCalledTimes(1);
  });

  it('permits an acknowledged safe retry within the deadline', async () => {
    const h = harness({
      errorAudit: () => {
        monotonic = 999;
        return Promise.resolve();
      },
      consume: () => Promise.resolve({ allowed: true })
    });
    const result = observe(h.runtime.execute(toolRequest()));
    await advance(0);
    await result.finished;
    expect(result.state.value).toMatchObject({ status: 'success', attempts: 2 });
    expect(h.invoke).toHaveBeenCalledTimes(2);
    expect(h.consume).toHaveBeenCalledTimes(2);
    expect(h.span.events).toEqual([]);
    expect(h.span.end).toHaveBeenCalledTimes(1);
  });

  it('rejects an expired async acknowledgement even before its delayed timer runs', async () => {
    const h = harness();
    const result = observe(h.runtime.execute(toolRequest()));
    await advance(0);
    monotonic = 1000;
    h.auditWait.resolve();
    await advance(0);
    await result.finished;
    expectOriginal(result.state.error);
    expect(h.invoke).toHaveBeenCalledTimes(1);
    expect(h.consume).toHaveBeenCalledTimes(1);
    expect(h.span.events).toEqual(['tool_runtime.audit.emission_failed']);
  });

  it.each([1000, 1001, NaN, Infinity, -1])(
    'rejects a late sync acknowledgement or invalid clock %s',
    async (time) => {
      const h = harness({
        errorAudit: () => {
          monotonic = time;
          return Promise.resolve();
        }
      });
      const result = observe(h.runtime.execute(toolRequest()));
      await advance(0);
      await result.finished;
      expectOriginal(result.state.error);
      expect(h.invoke).toHaveBeenCalledTimes(1);
      expect(h.consume).toHaveBeenCalledTimes(1);
      expect(h.span.events).toEqual(['tool_runtime.audit.emission_failed']);
    }
  );

  it.each([NaN, Infinity, -1, Number.MAX_VALUE])(
    'fails closed before audit invocation for invalid deadline %s',
    async (time) => {
      const h = harness({
        onAdapterFailure: () => {
          monotonic = time;
        },
        errorAudit: () => Promise.resolve()
      });
      const result = observe(h.runtime.execute(toolRequest()));
      await advance(0);
      await result.finished;
      expectOriginal(result.state.error);
      expect(h.emit).toHaveBeenCalledTimes(2); // started + terminal only
      expect(h.invoke).toHaveBeenCalledTimes(1);
      expect(h.consume).toHaveBeenCalledTimes(1);
      expect(h.span.events).toEqual(['tool_runtime.audit.emission_failed']);
    }
  );

  it('bounds both reporting waits to the disclosed two-second tail', async () => {
    const terminal = deferred();
    const h = harness({ terminalAudit: () => terminal.promise });
    const result = observe(h.runtime.execute(toolRequest()));
    await advance(0);
    await advance(1000);
    expect(h.emit).toHaveBeenCalledTimes(3);
    expect(result.state.done).toBe(false);
    await advance(999);
    expect(result.state.done).toBe(false);
    await advance(1);
    await result.finished;
    expectOriginal(result.state.error);
    h.auditWait.reject(new Error('private attempt'));
    terminal.reject(new Error('private terminal'));
    await advance(0);
    expect(h.span.events).toEqual([
      'tool_runtime.audit.emission_failed',
      'tool_runtime.audit.emission_failed'
    ]);
    expect(h.invoke).toHaveBeenCalledTimes(1);
    expect(h.consume).toHaveBeenCalledTimes(1);
    expect(h.span.end).toHaveBeenCalledTimes(1);
  });
});
