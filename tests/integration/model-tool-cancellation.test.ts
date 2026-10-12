import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SpanStatusCode, type Span, type SpanStatus } from '@opentelemetry/api';
import type { AuditRecord } from '../../packages/audit/src/index.js';
import { toErrorEnvelope } from '../../packages/errors/src/index.js';
import { ModelRegistry, ProviderAdapterError } from '../../packages/model-gateway/src/index.js';
import { tracer } from '../../packages/observability/src/index.js';
import { ToolAdapterError, ToolRegistry } from '../../packages/tool-runtime/src/index.js';
import {
  createModelGateway,
  fallbackModel,
  fallbackProvider,
  modelGatewayRequest,
  primaryModel,
  primaryProvider
} from '../testing/model-gateway-fixtures.js';
import {
  createToolRuntime,
  proposalToolMetadata,
  proposalToolRegistration,
  readToolMetadata,
  readToolRegistration,
  toolRequest,
  toolValidationTime
} from '../testing/tool-runtime-fixtures.js';

type Mode = 'model' | 'tool' | 'proposal';
const observedSignals = new Set<AbortSignal>();
type Step = 'preparation' | 'ownership' | 'start_audit' | 'metrics' | 'final_audit' | 'error_audit';
const waits: Record<Mode, readonly Step[]> = {
  model: ['preparation', 'metrics', 'final_audit', 'error_audit'],
  tool: ['preparation', 'ownership', 'start_audit', 'final_audit', 'error_audit'],
  proposal: ['preparation', 'ownership', 'start_audit', 'final_audit']
};
const cases = (Object.keys(waits) as Mode[]).flatMap((mode) =>
  waits[mode].flatMap((step) =>
    (['fulfill', 'reject'] as const).map((late) => ({ mode, step, late }))
  )
);

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
  const state: { status: SpanStatus; endCount: number } = {
    status: { code: SpanStatusCode.UNSET },
    endCount: 0
  };
  const span: Span = {
    spanContext: () => ({ traceId: '1'.repeat(32), spanId: '2'.repeat(16), traceFlags: 1 }),
    setAttribute: () => span,
    setAttributes: () => span,
    addEvent: () => span,
    addLink: () => span,
    addLinks: () => span,
    updateName: () => span,
    isRecording: () => state.endCount === 0,
    recordException: () => undefined,
    setStatus: (status) => {
      // OpenTelemetry's OK > ERROR > UNSET precedence makes premature OK visible.
      if (state.status.code !== SpanStatusCode.OK && status.code !== SpanStatusCode.UNSET) {
        state.status = { ...status };
      }
      return span;
    },
    end: () => {
      state.endCount += 1;
    }
  };
  vi.spyOn(tracer, 'startActiveSpan').mockImplementation((...args) => {
    const callback = args.at(-1) as (activeSpan: Span) => unknown;
    return callback(span);
  });
  return state;
}

function harness(
  mode: Mode,
  options: {
    block?: Step;
    synchronousAbort?: 'fulfill' | 'reject' | 'throw' | 'pending';
    firstFailure?: boolean;
    firstPending?: boolean;
    backoff?: number;
    retries?: number;
    afterErrorAudit?: () => void;
    beforeTerminal?: () => void;
  } = {}
) {
  const controller = new AbortController();
  observedSignals.add(controller.signal);
  const release = deferred();
  const entered = deferred();
  const calls: string[] = [];
  const audits: AuditRecord[] = [];
  const adapterSignals: AbortSignal[] = [];
  const span = recordSpan();
  let primaryCalls = 0;
  const step = <T>(name: string, value: T): Promise<T> => {
    calls.push(name);
    if (name === options.block) {
      entered.resolve();
      return release.promise.then(() => value);
    }
    return Promise.resolve(value);
  };
  const invoke = <T>(signal: AbortSignal, value: T, fallback = false): Promise<T> => {
    calls.push(fallback ? 'fallback' : 'adapter');
    adapterSignals.push(signal);
    observedSignals.add(signal);
    if (!fallback) primaryCalls += 1;
    if (options.synchronousAbort) {
      controller.abort();
      if (options.synchronousAbort === 'throw') throw new Error('private adapter failure');
      if (options.synchronousAbort === 'reject') {
        return Promise.reject(new Error('private adapter failure'));
      }
      if (options.synchronousAbort === 'fulfill') return Promise.resolve(value);
    }
    if (
      options.synchronousAbort === 'pending' ||
      (options.firstPending && primaryCalls === 1 && !fallback)
    ) {
      entered.resolve();
      return release.promise.then(() => value);
    }
    if (options.firstFailure && primaryCalls === 1 && !fallback) {
      return Promise.reject(
        mode === 'model'
          ? new ProviderAdapterError('unavailable')
          : new ToolAdapterError('transient')
      );
    }
    return Promise.resolve(value);
  };
  const audit = {
    emit: async (event: AuditRecord) => {
      const outcome = 'outcome' in event ? event.outcome : undefined;
      const name =
        outcome === 'started'
          ? 'start_audit'
          : outcome === 'succeeded' || outcome === 'proposed'
            ? 'final_audit'
            : outcome === 'error'
              ? 'error_audit'
              : 'failure_audit';
      await step(name, undefined);
      audits.push(event);
      if (name === 'error_audit') options.afterErrorAudit?.();
      if (name === 'final_audit') options.beforeTerminal?.();
    }
  };
  const clock = () => 100;
  const modelResult = {
    result: { message: 'safe synthetic result' },
    input_tokens: 10,
    output_tokens: 5,
    finish_reason: 'stop',
    policy_flags: []
  };
  const model =
    mode === 'model'
      ? createModelGateway(audits, [], {
          registry: new ModelRegistry(
            [
              {
                ...primaryProvider,
                mode: 'live',
                endpoint: 'https://synthetic.example.invalid',
                credential_reference: 'SYNTHETIC_FIXTURE_ONLY'
              },
              fallbackProvider
            ],
            [primaryModel, fallbackModel]
          ),
          secretProvider: { getSecret: () => step('preparation', 'synthetic-unused-credential') },
          adapters: [
            {
              adapter_id: primaryProvider.adapter_id,
              invoke: ({ signal }) => invoke(signal, modelResult)
            },
            {
              adapter_id: fallbackProvider.adapter_id,
              invoke: ({ signal }) => invoke(signal, modelResult, true)
            }
          ],
          metrics: { emit: () => step('metrics', undefined) },
          audit,
          clock,
          policy: {
            version: 'model-policy-1.0',
            required_permission: 'ai:model:invoke',
            agent_capabilities: { general: ['MG-GENERAL'] },
            timeout_ms: 100,
            max_retries: options.retries ?? 0,
            fallback_enabled: true,
            maximum_input_bytes: 16_384
          }
        })
      : undefined;
  const tool =
    mode !== 'model'
      ? createToolRuntime(audits, {
          registry: new ToolRegistry([
            {
              ...readToolRegistration,
              metadata: {
                ...readToolMetadata,
                timeout_policy: { timeout_ms: 100 },
                retry_policy: { max_attempts: 2, backoff_ms: options.backoff ?? 0 }
              }
            },
            proposalToolRegistration
          ]),
          authorization: {
            authorize: () =>
              step('preparation', { allowed: true, decision_id: 'synthetic-authority' })
          },
          ownership: { resolveTenantId: () => step('ownership', 'tenant-a') },
          adapters: [
            {
              tool_id: readToolMetadata.tool_id,
              tool_version: readToolMetadata.version,
              execution_mode: 'deterministic_test',
              invoke: ({ signal }) =>
                invoke(signal, {
                  output: { asset_id: 'asset-1', name: 'Pump A', status: 'active' },
                  source: { system: 'deterministic-test', reference: 'asset:asset-1' },
                  observed_at: toolValidationTime.toISOString()
                })
            }
          ],
          audit,
          clock
        })
      : undefined;
  const start = () => {
    if (!tool && !model) throw new Error('Synthetic runtime missing');
    const promise = model
      ? model.invoke(modelGatewayRequest(), { signal: controller.signal })
      : tool?.execute(
          toolRequest(
            mode === 'proposal'
              ? {
                  tool_id: proposalToolMetadata.tool_id,
                  tool_version: proposalToolMetadata.version,
                  input: { asset_id: 'asset-1', summary: 'Synthetic proposal' }
                }
              : {}
          ),
          { signal: controller.signal }
        );
    if (!promise) throw new Error('Synthetic runtime missing');
    const observed: {
      state: 'pending' | 'success' | 'failure';
      error?: unknown;
      response?: unknown;
    } = { state: 'pending' };
    const finished = promise.then(
      (response) => {
        observed.state = 'success';
        observed.response = response;
      },
      (error: unknown) => {
        observed.state = 'failure';
        observed.error = error;
      }
    );
    return { observed, finished };
  };
  return { start, controller, release, entered, calls, audits, adapterSignals, span };
}

function assertCancelled(observed: { state: string; error?: unknown }, mode: Mode) {
  expect(observed.state).toBe('failure');
  expect(toErrorEnvelope(observed.error)).toMatchObject({
    error: {
      code: 'TIMEOUT_ERROR',
      request_id: mode === 'model' ? 'request-model-1' : 'request-tool-1',
      trace_id: mode === 'model' ? 'model-trace-1' : 'tool-trace-1'
    }
  });
  expect(JSON.stringify(toErrorEnvelope(observed.error))).not.toMatch(
    /private|credential|safe synthetic result|Pump A/
  );
}

describe('Model/Tool cancellation admission and adapter ordering', () => {
  let checkListenerCleanup: () => void;
  beforeEach(() => {
    vi.useFakeTimers();
    observedSignals.clear();
    const add = vi.spyOn(AbortSignal.prototype, 'addEventListener');
    const remove = vi.spyOn(AbortSignal.prototype, 'removeEventListener');
    checkListenerCleanup = () => {
      add.mock.calls.forEach((args, i) => {
        // Exclude the test runner's own timeout/cancellation signals.
        if (!observedSignals.has(add.mock.contexts[i] as AbortSignal)) return;
        expect(
          remove.mock.calls.some(
            (removed, j) =>
              remove.mock.contexts[j] === add.mock.contexts[i] &&
              removed[0] === args[0] &&
              removed[1] === args[1]
          )
        ).toBe(true);
      });
    };
  });
  afterEach(() => {
    checkListenerCleanup();
    expect(vi.getTimerCount()).toBe(0);
    vi.clearAllTimers();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it.each(cases)(
    'cancels $mode during $step and consumes late $late without downstream admission',
    async ({ mode, step, late }) => {
      const h = harness(mode, { block: step, firstFailure: step === 'error_audit', retries: 1 });
      const { observed, finished } = h.start();
      await h.entered.promise;
      const dispatched = h.calls.filter((name) => name !== 'failure_audit');
      h.controller.abort();
      await vi.advanceTimersByTimeAsync(0);
      assertCancelled(observed, mode);
      expect(h.span.status.code).toBe(SpanStatusCode.ERROR);
      expect(h.span.endCount).toBe(1);
      if (late === 'reject') h.release.reject(new Error('private late preparation failure'));
      else h.release.resolve();
      await vi.advanceTimersByTimeAsync(0);
      await finished;
      assertCancelled(observed, mode);
      expect(h.calls.filter((name) => name !== 'failure_audit')).toEqual(dispatched);
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it.each(['model', 'tool', 'proposal'] as const)(
    'rejects %s cancelled at final audit acknowledgement without committing OK',
    async (mode) => {
      let cancel: () => void = () => undefined;
      const h = harness(mode, {
        beforeTerminal: () => {
          cancel();
        }
      });
      cancel = () => {
        h.controller.abort();
      };
      const { observed, finished } = h.start();
      await finished;
      assertCancelled(observed, mode);
      expect(h.span.status.code).toBe(SpanStatusCode.ERROR);
      expect(h.span.endCount).toBe(1);
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it.each(['model', 'tool', 'proposal'] as const)(
    'rejects already-aborted %s before preparation',
    async (mode) => {
      const h = harness(mode);
      h.controller.abort();
      const { observed, finished } = h.start();
      await finished;
      assertCancelled(observed, mode);
      expect(h.calls.filter((name) => name !== 'failure_audit')).toEqual([]);
      expect(h.span.status.code).toBe(SpanStatusCode.ERROR);
      expect(h.span.endCount).toBe(1);
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it.each(
    (['model', 'tool'] as const).flatMap((mode) =>
      (['fulfill', 'reject', 'throw', 'pending'] as const).map((outcome) => ({ mode, outcome }))
    )
  )(
    'catches synchronous abort inside $mode adapter returning $outcome',
    async ({ mode, outcome }) => {
      const h = harness(mode, { synchronousAbort: outcome, retries: 1 });
      const { observed, finished } = h.start();
      await vi.advanceTimersByTimeAsync(0);
      assertCancelled(observed, mode);
      expect(h.calls.filter((name) => name === 'adapter')).toHaveLength(1);
      expect(h.calls).not.toContain('fallback');
      expect(h.calls).not.toContain('metrics');
      expect(h.calls).not.toContain('final_audit');
      h.release.resolve();
      await vi.advanceTimersByTimeAsync(0);
      await finished;
      assertCancelled(observed, mode);
      expect(h.span.status.code).toBe(SpanStatusCode.ERROR);
      expect(h.span.endCount).toBe(1);
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it.each(
    (['model', 'tool'] as const).flatMap((mode) =>
      (['fulfill', 'reject'] as const).map((late) => ({ mode, late }))
    )
  )('consumes late $late after in-flight $mode cancellation', async ({ mode, late }) => {
    const h = harness(mode, { firstPending: true, retries: 1 });
    const { observed, finished } = h.start();
    await h.entered.promise;
    h.controller.abort();
    await vi.advanceTimersByTimeAsync(0);
    assertCancelled(observed, mode);
    if (late === 'reject') h.release.reject(new Error('private late failure'));
    else h.release.resolve();
    await vi.advanceTimersByTimeAsync(0);
    await finished;
    assertCancelled(observed, mode);
    expect(h.calls.filter((name) => name === 'adapter')).toHaveLength(1);
    expect(h.calls).not.toContain('fallback');
    expect(h.calls).not.toContain('metrics');
    expect(h.calls).not.toContain('final_audit');
    expect(h.span.endCount).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([0, 25])(
    'cannot retry after cancellation at error-audit acknowledgement (backoff %i)',
    async (backoff) => {
      let cancel: () => void = () => undefined;
      const h = harness('tool', {
        firstFailure: true,
        backoff,
        afterErrorAudit: () => {
          cancel();
        }
      });
      cancel = () => {
        h.controller.abort();
      };
      const { observed } = h.start();
      await vi.advanceTimersByTimeAsync(0);
      assertCancelled(observed, 'tool');
      expect(h.calls.filter((name) => name === 'adapter')).toHaveLength(1);
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it('cannot fall back after cancellation at Model error-audit acknowledgement', async () => {
    let cancel: () => void = () => undefined;
    const h = harness('model', {
      firstFailure: true,
      afterErrorAudit: () => {
        cancel();
      }
    });
    cancel = () => {
      h.controller.abort();
    };
    const { observed, finished } = h.start();
    await finished;
    assertCancelled(observed, 'model');
    expect(h.calls.filter((name) => name === 'adapter')).toHaveLength(1);
    expect(h.calls).not.toContain('fallback');
  });

  it('cancels during positive Tool backoff and clears its timer', async () => {
    const h = harness('tool', { firstFailure: true, backoff: 25 });
    const { observed } = h.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.calls).toContain('error_audit');
    expect(vi.getTimerCount()).toBe(1);
    h.controller.abort();
    await vi.advanceTimersByTimeAsync(0);
    assertCancelled(observed, 'tool');
    expect(h.calls.filter((name) => name === 'adapter')).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['model', 'tool', 'proposal'] as const)(
    'records one OK/end for successful %s',
    async (mode) => {
      const h = harness(mode);
      const { observed, finished } = h.start();
      await finished;
      expect(observed.state).toBe('success');
      expect(h.span.status.code).toBe(SpanStatusCode.OK);
      expect(h.span.endCount).toBe(1);
      if (mode === 'proposal') {
        expect(observed.response).toMatchObject({ status: 'proposed', approval_required: true });
        expect(h.adapterSignals).toEqual([]);
      }
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it.each([0, 25])(
    'preserves permitted Tool retry and removes all listeners (backoff %i)',
    async (backoff) => {
      const h = harness('tool', { firstFailure: true, backoff });
      const { observed, finished } = h.start();
      await vi.advanceTimersByTimeAsync(backoff);
      await finished;
      expect(observed.state).toBe('success');
      expect(h.calls.filter((name) => name === 'adapter')).toHaveLength(2);
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it.each([0, 1])('preserves genuine Model retry/fallback with max_retries %i', async (retries) => {
    const h = harness('model', { firstFailure: true, retries });
    const { observed, finished } = h.start();
    await finished;
    expect(observed.state).toBe('success');
    expect(h.calls.filter((name) => name === 'adapter')).toHaveLength(retries === 0 ? 1 : 2);
    expect(h.calls.includes('fallback')).toBe(retries === 0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['model', 'tool'] as const)(
    'preserves genuine %s attempt timeout recovery',
    async (mode) => {
      const h = harness(mode, { firstPending: true });
      const { observed, finished } = h.start();
      await h.entered.promise;
      await vi.advanceTimersByTimeAsync(100);
      await finished;
      expect(observed.state).toBe('success');
      expect(h.adapterSignals[0]?.aborted).toBe(true);
      h.release.reject(new Error('private late timed-out rejection'));
      await vi.advanceTimersByTimeAsync(0);
      expect(observed.state).toBe('success');
      expect(vi.getTimerCount()).toBe(0);
    }
  );
});
