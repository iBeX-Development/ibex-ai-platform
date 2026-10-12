import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SpanStatusCode, type Span, type SpanStatus } from '@opentelemetry/api';
import type { AuditRecord } from '../../packages/audit/src/index.js';
import { toErrorEnvelope } from '../../packages/errors/src/index.js';
import { ModelRegistry, ProviderAdapterError } from '../../packages/model-gateway/src/index.js';
import { tracer } from '../../packages/observability/src/index.js';
import { ToolAdapterError, ToolRegistry } from '../../packages/tool-runtime/src/index.js';
import {
  createModelGateway,
  modelContext,
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
  toolContext,
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
  const state: { status: SpanStatus; endCount: number; events: string[] } = {
    status: { code: SpanStatusCode.UNSET },
    endCount: 0,
    events: []
  };
  const span: Span = {
    spanContext: () => ({ traceId: '1'.repeat(32), spanId: '2'.repeat(16), traceFlags: 1 }),
    setAttribute: () => span,
    setAttributes: () => span,
    addEvent: (name) => {
      state.events.push(name);
      return span;
    },
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
    failureAudit?: 'hang' | 'reject' | 'late_fulfill' | 'late_reject';
    authorization?: 'deny' | 'reject';
  } = {}
) {
  const controller = new AbortController();
  observedSignals.add(controller.signal);
  const release = deferred();
  const entered = deferred();
  const reportingRelease = deferred();
  const calls: string[] = [];
  const audits: AuditRecord[] = [];
  const attemptedAudits: AuditRecord[] = [];
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
      attemptedAudits.push(event);
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
      if ('error_code' in event && event.error_code === 'TIMEOUT_ERROR') {
        if (options.failureAudit === 'reject') throw new Error('private audit sink failure');
        if (options.failureAudit) await reportingRelease.promise;
      }
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
            authorize: () => {
              if (options.authorization === 'reject') {
                return Promise.reject(new Error('private authority failure'));
              }
              return step(
                'preparation',
                options.authorization === 'deny'
                  ? { allowed: false as const, reason: 'private denial reason' }
                  : { allowed: true as const, decision_id: 'synthetic-authority' }
              );
            }
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
      ? model.invoke(modelGatewayRequest({ input: { message: 'private-model-input' } }), {
          signal: controller.signal
        })
      : tool?.execute(
          toolRequest(
            mode === 'proposal'
              ? {
                  tool_id: proposalToolMetadata.tool_id,
                  tool_version: proposalToolMetadata.version,
                  input: { asset_id: 'asset-1', summary: 'private-proposal-payload' }
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
  return {
    start,
    controller,
    release,
    entered,
    calls,
    audits,
    attemptedAudits,
    reportingRelease,
    adapterSignals,
    span
  };
}

function assertCancellationAudit(audits: readonly AuditRecord[], mode: Mode) {
  const records = audits.filter(
    (event) => 'error_code' in event && event.error_code === 'TIMEOUT_ERROR'
  );
  expect(records).toHaveLength(1);
  const record = records[0];
  if (!record) throw new Error('Cancellation record missing');
  expect(Number.isFinite(Date.parse(record.timestamp))).toBe(true);
  const context = mode === 'model' ? modelContext : toolContext;
  expect(records[0]).toMatchObject({
    schema_version: '1.0',
    event_type:
      mode === 'model' ? 'model_gateway.invocation.outcome' : 'tool_runtime.execution.outcome',
    context_status: 'trusted',
    service: mode === 'model' ? 'model-gateway-test' : 'tool-runtime-test',
    environment: 'test',
    request_id: context.request_id,
    correlation_id: context.correlation_id,
    trace_id: mode === 'model' ? 'model-trace-1' : 'tool-trace-1',
    tenant_id: context.tenant_id,
    user_id: context.user_id,
    role: context.role,
    session_id: context.session_id,
    permission_refs: context.permissions,
    entitlement_refs: context.entitlements,
    outcome: 'rejected',
    error_code: 'TIMEOUT_ERROR'
  });
  const keys = new Set([
    'schema_version',
    'event_type',
    'timestamp',
    'trace_id',
    'service',
    'environment',
    'outcome',
    'stage',
    'context_status',
    'request_id',
    'correlation_id',
    'tenant_id',
    'user_id',
    'role',
    'session_id',
    'permission_refs',
    'entitlement_refs',
    'agent_id',
    'prompt_version',
    'policy_version',
    'capability',
    'confidentiality_class',
    'provider_id',
    'model_id',
    'model_version',
    'attempt',
    'fallback_used',
    'latency_ms',
    'error_code',
    'tool_id',
    'tool_version',
    'action_class',
    'requested_operation',
    'permission_decision',
    'approval_policy',
    'approval_state',
    'accounting'
  ]);
  expect(Object.keys(records[0] ?? {}).filter((key) => !keys.has(key))).toEqual([]);
  if ('accounting' in record) {
    expect(Object.keys(record.accounting).sort()).toEqual([
      'attempt_id',
      'command_hash',
      'period_id',
      'policy_version',
      'state',
      'warnings'
    ]);
  }
  expect(JSON.stringify(records[0])).not.toMatch(/private|credential|safe synthetic result|Pump A/);
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
      assertCancellationAudit(h.audits, mode);
      if (mode !== 'model') {
        expect(h.audits.at(-1)).toMatchObject({
          stage:
            step === 'preparation'
              ? 'authorization'
              : step === 'ownership'
                ? 'tenant_ownership'
                : step === 'error_audit'
                  ? 'execution'
                  : 'audit'
        });
        if (step === 'preparation')
          expect(h.audits.at(-1)).not.toHaveProperty('permission_decision');
        else expect(h.audits.at(-1)).toHaveProperty('permission_decision', 'allowed');
      }
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
      assertCancellationAudit(h.audits, mode);
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
      assertCancellationAudit(h.audits, mode);
      if (mode !== 'model') expect(h.audits.at(-1)).not.toHaveProperty('permission_decision');
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
      assertCancellationAudit(h.audits, mode);
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
    assertCancellationAudit(h.audits, mode);
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

  it.each(
    (['model', 'tool', 'proposal'] as const).flatMap((mode) =>
      (['hang', 'reject', 'late_fulfill', 'late_reject'] as const).map((audit) => ({ mode, audit }))
    )
  )('bounds $mode cancellation reporting with $audit sink outcomes', async ({ mode, audit }) => {
    const point =
      audit === 'hang'
        ? 'already'
        : audit === 'reject'
          ? 'preparation'
          : audit === 'late_fulfill' && mode !== 'proposal'
            ? 'adapter'
            : 'telemetry';
    const h = harness(mode, {
      failureAudit: audit,
      firstPending: point === 'adapter',
      ...(point === 'preparation'
        ? { block: 'preparation' as const }
        : point === 'telemetry'
          ? { block: mode === 'model' ? ('metrics' as const) : ('final_audit' as const) }
          : {})
    });
    if (point === 'already') h.controller.abort();
    const { observed, finished } = h.start();
    if (point !== 'already') await h.entered.promise;
    const dispatched = [...h.calls];
    h.controller.abort();
    await vi.advanceTimersByTimeAsync(0);
    assertCancellationAudit(h.attemptedAudits, mode);
    expect(h.calls).toEqual([...dispatched, 'failure_audit']);
    if (audit !== 'reject') {
      expect(observed.state).toBe('pending');
      // A server-owned 1,000 ms budget, independent of the cancelled signal
      // and of the synthetic 100 ms adapter timeout.
      await vi.advanceTimersByTimeAsync(999);
      expect(observed.state).toBe('pending');
      await vi.advanceTimersByTimeAsync(1);
    }
    await finished;
    assertCancelled(observed, mode);
    expect(h.span.status.code).toBe(SpanStatusCode.ERROR);
    expect(h.span.endCount).toBe(1);
    expect(h.span.events).toContain(
      mode === 'model'
        ? 'model_gateway.audit.emission_failed'
        : 'tool_runtime.audit.emission_failed'
    );
    const calls = [...h.calls];
    if (audit === 'late_reject') h.reportingRelease.reject(new Error('private late audit failure'));
    else if (audit === 'late_fulfill') h.reportingRelease.resolve();
    h.release.resolve();
    await vi.advanceTimersByTimeAsync(0);
    assertCancelled(observed, mode);
    expect(h.calls).toEqual(calls);
    expect(h.span.status.code).toBe(SpanStatusCode.ERROR);
    expect(h.span.endCount).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(
    (['tool', 'proposal'] as const).flatMap((mode) =>
      (['deny', 'reject'] as const).map((authorization) => ({ mode, authorization }))
    )
  )(
    'keeps $mode authorization $authorization reporting truthful',
    async ({ mode, authorization }) => {
      const h = harness(mode, { authorization });
      const { observed, finished } = h.start();
      await finished;
      expect(observed.state).toBe('failure');
      const record = h.audits.at(-1);
      expect(record).toMatchObject({
        stage: 'authorization',
        error_code: authorization === 'deny' ? 'PERMISSION_DENIED' : 'AUTHORIZATION_ERROR'
      });
      if (authorization === 'deny') expect(record).toHaveProperty('permission_decision', 'denied');
      else expect(record).not.toHaveProperty('permission_decision');
      expect(h.calls).not.toContain('adapter');
      expect(h.calls).not.toContain('final_audit');
      expect(h.span.status.code).toBe(SpanStatusCode.ERROR);
      expect(h.span.endCount).toBe(1);
    }
  );

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
    'preserves %s timeout policy while Model retains uncertain accounting liability',
    async (mode) => {
      const h = harness(mode, { firstPending: true });
      const { observed, finished } = h.start();
      await h.entered.promise;
      await vi.advanceTimersByTimeAsync(100);
      await finished;
      expect(observed.state).toBe(mode === 'model' ? 'failure' : 'success');
      if (mode === 'model') {
        expect(toErrorEnvelope(observed.error)).toMatchObject({
          error: { code: 'PROVIDER_TIMEOUT' }
        });
        expect(h.calls).not.toContain('fallback');
        expect(h.calls.filter((name) => name === 'adapter')).toHaveLength(1);
      }
      expect(h.adapterSignals[0]?.aborted).toBe(true);
      h.release.reject(new Error('private late timed-out rejection'));
      await vi.advanceTimersByTimeAsync(0);
      expect(observed.state).toBe(mode === 'model' ? 'failure' : 'success');
      expect(vi.getTimerCount()).toBe(0);
    }
  );
});
