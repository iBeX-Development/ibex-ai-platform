import type { Span } from '@opentelemetry/api';
import { getEventListeners } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuditRecord } from '../../packages/audit/src/index.js';
import { PlatformError, toErrorEnvelope } from '../../packages/errors/src/index.js';
import { tracer } from '../../packages/observability/src/index.js';
import {
  ToolAdapterError,
  ToolRegistry,
  type ToolAdapter,
  type ToolRegistration
} from '../../packages/tool-runtime/src/index.js';
import {
  createToolRuntime,
  proposalToolMetadata,
  readToolMetadata,
  readToolRegistration,
  successfulToolAdapter,
  toolRequest,
  toolValidationTime
} from '../testing/tool-runtime-fixtures.js';

describe('Gate P5 Tool Runtime', () => {
  it('executes an authorized tenant-bound read with validated response and audit', async () => {
    const audits: AuditRecord[] = [];
    const adapter = successfulToolAdapter();
    const invoke = vi.fn<ToolAdapter['invoke']>((request) => adapter.invoke(request));
    const runtime = createToolRuntime(audits, {
      adapters: [{ ...successfulToolAdapter(), invoke }]
    });

    const response = await runtime.execute(toolRequest(), {}, toolValidationTime);

    expect(invoke).toHaveBeenCalledOnce();
    const invocation = invoke.mock.calls[0]?.[0];
    expect(invocation?.tool).toMatchObject({
      registration_version: '3.0',
      error_model: 'ibex.tool-error.v1',
      version: '1.0'
    });
    expect(Object.isFrozen(invocation?.tool)).toBe(true);

    expect(response).toMatchObject({
      status: 'success',
      request_id: 'request-tool-1',
      correlation_id: 'correlation-tool-1',
      trace_id: 'tool-trace-1',
      tool_id: 'asset.asset.get.v1',
      tool_version: '1.0',
      output: { asset_id: 'asset-1', name: 'Pump A', status: 'active' },
      attempts: 1
    });
    expect(audits).toEqual([
      expect.objectContaining({ outcome: 'started', stage: 'execution' }),
      expect.objectContaining({
        event_type: 'tool_runtime.execution.outcome',
        outcome: 'succeeded',
        context_status: 'trusted',
        tenant_id: 'tenant-a',
        user_id: 'user-1',
        role: 'operator',
        session_id: 'session-tool-1',
        permission_refs: ['asset:read', 'maintenance:proposal'],
        entitlement_refs: ['asset-tools', 'maintenance-tools'],
        agent_id: 'asset',
        prompt_version: 'asset-1.0',
        tool_id: 'asset.asset.get.v1',
        requested_operation: 'read',
        permission_decision: 'allowed',
        approval_state: 'not_required',
        attempt: 1
      })
    ]);
    expect(JSON.stringify(audits)).not.toContain('Pump A');
    expect(JSON.stringify(audits)).not.toContain('"asset_id":"asset-1"');
    expect(JSON.stringify(audits)).not.toContain('asset:asset-1');
  });

  it('fails closed before invocation when server authorization denies', async () => {
    const audits: AuditRecord[] = [];
    const invoke = vi.fn();
    const runtime = createToolRuntime(audits, {
      adapters: [{ ...successfulToolAdapter(), invoke }],
      authorization: {
        authorize: () => Promise.resolve({ allowed: false, reason: 'denied' })
      }
    });

    await expect(runtime.execute(toolRequest(), {}, toolValidationTime)).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
      publicMessage: 'Access denied'
    });
    expect(invoke).not.toHaveBeenCalled();
    expect(audits.at(-1)).toEqual(
      expect.objectContaining({
        stage: 'authorization',
        outcome: 'rejected',
        permission_decision: 'denied'
      })
    );
  });

  it('fails closed before server authorization when trusted permissions are missing', async () => {
    const audits: AuditRecord[] = [];
    const authorize = vi.fn();
    const invoke = vi.fn();
    const request = toolRequest({
      context: { ...toolRequest().context, permissions: [] }
    });
    const runtime = createToolRuntime(audits, {
      adapters: [{ ...successfulToolAdapter(), invoke }],
      authorization: { authorize }
    });

    await expect(runtime.execute(request, {}, toolValidationTime)).rejects.toMatchObject({
      code: 'PERMISSION_DENIED'
    });
    expect(authorize).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('fails closed before invocation when a required entitlement is missing', async () => {
    const audits: AuditRecord[] = [];
    const authorize = vi.fn();
    const invoke = vi.fn();
    const runtime = createToolRuntime(audits, {
      adapters: [{ ...successfulToolAdapter(), invoke }],
      authorization: { authorize }
    });

    await expect(
      runtime.execute(
        toolRequest({ context: { ...toolRequest().context, entitlements: [] } }),
        {},
        toolValidationTime
      )
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    expect(authorize).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('applies a per-attempt timeout and returns a standardized error', async () => {
    const audits: AuditRecord[] = [];
    const never = vi.fn(() => new Promise<never>(() => undefined));
    const registration: ToolRegistration = {
      ...readToolRegistration,
      metadata: {
        ...readToolMetadata,
        timeout_policy: { timeout_ms: 5 },
        retry_policy: { max_attempts: 1, backoff_ms: 0 }
      }
    };
    const runtime = createToolRuntime(audits, {
      registry: new ToolRegistry([registration]),
      adapters: [{ ...successfulToolAdapter(), invoke: never }]
    });

    await expect(runtime.execute(toolRequest(), {}, toolValidationTime)).rejects.toMatchObject({
      code: 'UPSTREAM_TIMEOUT',
      publicMessage: 'Tool dependency timed out'
    });
    expect(never).toHaveBeenCalledOnce();
    expect(audits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stage: 'execution', error_code: 'UPSTREAM_TIMEOUT' })
      ])
    );
  });

  it('retries only a bounded transient failure for an approved idempotent read', async () => {
    const audits: AuditRecord[] = [];
    const invoke = vi
      .fn<ToolAdapter['invoke']>()
      .mockRejectedValueOnce(new ToolAdapterError('transient'))
      .mockResolvedValueOnce(
        await successfulToolAdapter().invoke({
          context: toolRequest().context,
          tool: readToolMetadata,
          input: { asset_id: 'asset-1' },
          signal: new AbortController().signal
        })
      );
    const runtime = createToolRuntime(audits, {
      adapters: [{ ...successfulToolAdapter(), invoke }]
    });

    const response = await runtime.execute(toolRequest(), {}, toolValidationTime);

    expect(response).toMatchObject({ status: 'success', attempts: 2 });
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(audits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ attempt: 1, error_code: 'SERVICE_UNAVAILABLE' }),
        expect.objectContaining({ attempt: 2, outcome: 'succeeded' })
      ])
    );
  });

  it('does not retry permanent adapter failures', async () => {
    const audits: AuditRecord[] = [];
    const invoke = vi.fn(() => Promise.reject(new ToolAdapterError('permanent')));
    const runtime = createToolRuntime(audits, {
      adapters: [{ ...successfulToolAdapter(), invoke }]
    });

    await expect(runtime.execute(toolRequest(), {}, toolValidationTime)).rejects.toMatchObject({
      code: 'DEPENDENCY_ERROR'
    });
    expect(invoke).toHaveBeenCalledOnce();
  });

  it('rejects malformed upstream output without leaking it or retrying', async () => {
    const audits: AuditRecord[] = [];
    const invoke = vi.fn(() =>
      Promise.resolve({
        output: { secret: 'malformed-secret' },
        source: { system: 'deterministic-test', reference: 'invalid' },
        observed_at: toolValidationTime.toISOString()
      })
    );
    const runtime = createToolRuntime(audits, {
      adapters: [{ ...successfulToolAdapter(), invoke }]
    });

    await expect(runtime.execute(toolRequest(), {}, toolValidationTime)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
      publicMessage: 'Tool dependency response is invalid'
    });
    expect(invoke).toHaveBeenCalledOnce();
    expect(JSON.stringify(audits)).not.toContain('malformed-secret');
  });

  it('returns an approval-required action proposal without invoking an adapter', async () => {
    const audits: AuditRecord[] = [];
    const invoke = vi.fn();
    const runtime = createToolRuntime(audits, {
      adapters: [
        successfulToolAdapter(),
        {
          tool_id: proposalToolMetadata.tool_id,
          tool_version: proposalToolMetadata.version,
          execution_mode: 'deterministic_test',
          invoke
        }
      ]
    });

    const response = await runtime.execute(
      toolRequest({
        tool_id: proposalToolMetadata.tool_id,
        tool_version: proposalToolMetadata.version,
        input: { asset_id: 'asset-1', summary: 'Inspect pump vibration' }
      }),
      {},
      toolValidationTime
    );

    expect(response).toMatchObject({
      status: 'proposed',
      approval_required: true,
      approval_policy: 'workflow_approval'
    });
    expect(invoke).not.toHaveBeenCalled();
    expect(audits.at(-1)).toEqual(
      expect.objectContaining({
        outcome: 'proposed',
        requested_operation: 'propose',
        permission_decision: 'allowed',
        approval_state: 'required_not_executed'
      })
    );
  });

  it('keeps live Core registrations disabled without explicit approved activation', async () => {
    const audits: AuditRecord[] = [];
    const liveRegistration: ToolRegistration = {
      ...readToolRegistration,
      metadata: { ...readToolMetadata, execution_mode: 'live_core' }
    };
    const invoke = vi.fn();
    const runtime = createToolRuntime(audits, {
      registry: new ToolRegistry([liveRegistration]),
      adapters: [
        {
          tool_id: readToolMetadata.tool_id,
          tool_version: readToolMetadata.version,
          execution_mode: 'live_core',
          invoke
        }
      ]
    });

    await expect(runtime.execute(toolRequest(), {}, toolValidationTime)).rejects.toMatchObject({
      code: 'TOOL_DISABLED',
      publicMessage: 'Tool is not available'
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('keeps tools disabled outside their approved environment', async () => {
    const audits: AuditRecord[] = [];
    const invoke = vi.fn();
    const runtime = createToolRuntime(audits, {
      adapters: [{ ...successfulToolAdapter(), invoke }],
      environment: 'production'
    });

    await expect(runtime.execute(toolRequest(), {}, toolValidationTime)).rejects.toMatchObject({
      code: 'TOOL_DISABLED'
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('rejects unregistered tools and arbitrary endpoint-shaped identifiers', async () => {
    const audits: AuditRecord[] = [];
    const runtime = createToolRuntime(audits);

    await expect(
      runtime.execute(
        toolRequest({ tool_id: 'https://core.invalid/admin', tool_version: '1.0' }),
        {},
        toolValidationTime
      )
    ).rejects.toMatchObject({ code: 'TOOL_NOT_ALLOWED' });
  });

  it('fails before execution when mandatory audit evidence cannot be recorded', async () => {
    const invoke = vi.fn();
    const runtime = createToolRuntime([], {
      adapters: [{ ...successfulToolAdapter(), invoke }],
      audit: { emit: () => Promise.reject(new Error('sink unavailable')) }
    });

    await expect(runtime.execute(toolRequest(), {}, toolValidationTime)).rejects.toMatchObject({
      code: 'INTERNAL_ERROR'
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('records sanitized boundary evidence for malformed context and trace rejections', async () => {
    const contextAudits: AuditRecord[] = [];
    const contextRuntime = createToolRuntime(contextAudits);
    await expect(
      contextRuntime.execute(
        toolRequest({ context: { tenant_id: 'tenant-a' } }),
        {},
        toolValidationTime
      )
    ).rejects.toMatchObject({ code: 'TENANT_CONTEXT_ERROR' });
    expect(contextAudits).toEqual([
      expect.objectContaining({
        context_status: 'unavailable',
        stage: 'boundary_context',
        outcome: 'rejected'
      })
    ]);

    const traceAudits: AuditRecord[] = [];
    const traceRuntime = createToolRuntime(traceAudits);
    await expect(
      traceRuntime.execute(toolRequest({ trace_id: '' }), {}, toolValidationTime)
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(traceAudits.at(-1)).toEqual(
      expect.objectContaining({
        context_status: 'trusted',
        stage: 'boundary_trace',
        tenant_id: 'tenant-a'
      })
    );
  });

  it('validates input before authorization or adapter invocation', async () => {
    const authorize = vi.fn();
    const invoke = vi.fn();
    const runtime = createToolRuntime([], {
      authorization: { authorize },
      adapters: [{ ...successfulToolAdapter(), invoke }]
    });

    await expect(
      runtime.execute(toolRequest({ input: { asset_id: 10 } }), {}, toolValidationTime)
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(authorize).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('Tool adapter error boundary', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function spanRecorder() {
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

  const forged = (code: PlatformError['code']) => {
    const error = new PlatformError(
      code,
      'private-message-marker',
      418,
      { credential: 'private-diagnostic-marker' },
      'private-trace-marker',
      'private-request-marker'
    );
    error.stack = 'private-stack-marker';
    return error;
  };
  const malformed = (kind: unknown) => {
    const error = new ToolAdapterError('permanent');
    Object.defineProperty(error, 'kind', { value: kind });
    return error;
  };
  const failures: readonly (readonly [string, () => unknown])[] = [
    ...(
      ['SERVICE_UNAVAILABLE', 'UPSTREAM_TIMEOUT', 'TIMEOUT_ERROR', 'PERMISSION_DENIED'] as const
    ).map((code): readonly [string, () => unknown] => [code, () => forged(code)]),
    [
      'ordinary Error',
      () => Object.assign(new Error('private-message-marker'), { stack: 'private-stack-marker' })
    ],
    ['non-Error string', () => 'private-message-marker'],
    [
      'non-Error object',
      () => ({
        code: 'SERVICE_UNAVAILABLE',
        message: 'private-message-marker',
        diagnostics: 'private-diagnostic-marker'
      })
    ],
    ...[
      'unknown',
      '__proto__',
      'constructor',
      'toString',
      'hasOwnProperty',
      undefined,
      null,
      7,
      {}
    ].map((kind, index): readonly [string, () => unknown] => [
      `malformed kind case ${String(index)}`,
      () => malformed(kind)
    ]),
    [
      'throwing kind getter',
      () =>
        Object.defineProperty(new ToolAdapterError('permanent'), 'kind', {
          get: () => {
            throw forged('SERVICE_UNAVAILABLE');
          }
        })
    ]
  ];

  it.each(
    failures.flatMap(([label, create]) =>
      (['sync', 'async'] as const).map((delivery) => ({ label, create, delivery }))
    )
  )(
    'normalizes $delivery $label without leaking diagnostics or retry authority',
    async ({ create, delivery }) => {
      const span = spanRecorder();
      const audits: AuditRecord[] = [];
      const failure = create();
      const invoke = vi.fn<ToolAdapter['invoke']>(() => {
        if (delivery === 'sync') {
          throw failure;
        }
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- Exercise untrusted adapter rejections.
        return Promise.reject(failure);
      });
      const runtime = createToolRuntime(audits, {
        adapters: [{ ...successfulToolAdapter(), invoke }]
      });
      const pending = runtime
        .execute(toolRequest(), {}, toolValidationTime)
        .catch((error: unknown) => error);
      await vi.runAllTimersAsync();
      const error: unknown = await pending;
      expect(error).toMatchObject({
        code: 'DEPENDENCY_ERROR',
        publicMessage: 'Tool dependency request failed',
        statusCode: 502,
        diagnostics: undefined,
        traceId: 'tool-trace-1',
        trustedRequestId: 'request-tool-1'
      });
      expect(toErrorEnvelope(error)).toEqual({
        error: {
          code: 'DEPENDENCY_ERROR',
          message: 'Tool dependency request failed',
          trace_id: 'tool-trace-1',
          request_id: 'request-tool-1'
        }
      });
      expect(invoke).toHaveBeenCalledOnce();
      expect(audits.at(-1)).toMatchObject({
        stage: 'execution',
        outcome: 'error',
        error_code: 'DEPENDENCY_ERROR',
        tenant_id: 'tenant-a',
        request_id: 'request-tool-1',
        trace_id: 'tool-trace-1',
        attempt: 1
      });
      expect(
        JSON.stringify({
          error,
          envelope: toErrorEnvelope(error),
          audits,
          attributes: span.setAttributes.mock.calls,
          attribute: span.setAttribute.mock.calls,
          events: span.addEvent.mock.calls,
          stack: error instanceof Error ? error.stack : undefined
        })
      ).not.toMatch(/private-(message|diagnostic|stack|trace|request)-marker/);
      expect(span.recordException).toHaveBeenCalledExactlyOnceWith(
        new Error('Tool runtime request failed')
      );
      expect(span.end).toHaveBeenCalledOnce();
    }
  );

  const approved = [
    ['timeout', 'UPSTREAM_TIMEOUT', 'Tool dependency timed out', 504, 2],
    ['transient', 'SERVICE_UNAVAILABLE', 'Tool dependency is unavailable', 503, 2],
    ['unavailable', 'SERVICE_UNAVAILABLE', 'Tool dependency is unavailable', 503, 2],
    ['invalid_response', 'INVALID_RESPONSE', 'Tool dependency response is invalid', 502, 1],
    ['permanent', 'DEPENDENCY_ERROR', 'Tool dependency request failed', 502, 1]
  ] as const;
  it.each(
    approved.flatMap(([kind, code, message, status, attempts]) =>
      (['sync', 'async'] as const).map((delivery) => ({
        kind,
        code,
        message,
        status,
        attempts,
        delivery
      }))
    )
  )(
    'preserves genuine $delivery $kind mapping and bounded retry count',
    async ({ kind, code, message, status, attempts, delivery }) => {
      const invoke = vi.fn<ToolAdapter['invoke']>(() => {
        if (delivery === 'sync') throw new ToolAdapterError(kind);
        return Promise.reject(new ToolAdapterError(kind));
      });
      const runtime = createToolRuntime([], { adapters: [{ ...successfulToolAdapter(), invoke }] });
      const pending = runtime
        .execute(toolRequest(), {}, toolValidationTime)
        .catch((error: unknown) => error);
      await vi.runAllTimersAsync();
      expect(await pending).toMatchObject({ code, publicMessage: message, statusCode: status });
      expect(invoke).toHaveBeenCalledTimes(attempts);
    }
  );

  it('does not retry a genuine transient failure for a non-idempotent registration', async () => {
    const invoke = vi.fn(() => Promise.reject(new ToolAdapterError('transient')));
    const runtime = createToolRuntime([], {
      adapters: [{ ...successfulToolAdapter(), invoke }],
      registry: new ToolRegistry([
        {
          ...readToolRegistration,
          metadata: {
            ...readToolMetadata,
            safe_idempotent: false,
            retry_policy: { max_attempts: 1, backoff_ms: 0 }
          }
        }
      ])
    });
    const pending = runtime
      .execute(toolRequest(), {}, toolValidationTime)
      .catch((error: unknown) => error);
    await vi.runAllTimersAsync();
    expect(await pending).toMatchObject({ code: 'SERVICE_UNAVAILABLE', statusCode: 503 });
    expect(invoke).toHaveBeenCalledOnce();
  });

  it.each(['sync', 'async'] as const)(
    'prioritizes real cancellation over a %s forged timeout',
    async (delivery) => {
      const controller = new AbortController();
      const invoke = vi.fn<ToolAdapter['invoke']>(() => {
        controller.abort();
        if (delivery === 'sync') throw forged('UPSTREAM_TIMEOUT');
        return Promise.reject(forged('UPSTREAM_TIMEOUT'));
      });
      const runtime = createToolRuntime([], { adapters: [{ ...successfulToolAdapter(), invoke }] });
      const pending = runtime
        .execute(toolRequest(), { signal: controller.signal }, toolValidationTime)
        .catch((error: unknown) => error);
      await vi.runAllTimersAsync();
      expect(await pending).toMatchObject({
        code: 'TIMEOUT_ERROR',
        statusCode: 408,
        publicMessage: 'Tool request was cancelled'
      });
      expect(invoke).toHaveBeenCalledOnce();
      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
    }
  );

  it.each(['fulfill', 'reject'] as const)(
    'observes late adapter %s after cancellation without retry or extra work',
    async (outcome) => {
      const controller = new AbortController();
      let resolve!: (result: Awaited<ReturnType<ToolAdapter['invoke']>>) => void;
      let reject!: (error: Error) => void;
      const dependency = new Promise<Awaited<ReturnType<ToolAdapter['invoke']>>>((yes, no) => {
        resolve = yes;
        reject = no;
      });
      const invoke = vi.fn(() => {
        controller.abort();
        return dependency;
      });
      const audits: AuditRecord[] = [];
      const runtime = createToolRuntime(audits, {
        adapters: [{ ...successfulToolAdapter(), invoke }]
      });
      const pending = runtime
        .execute(toolRequest(), { signal: controller.signal }, toolValidationTime)
        .catch((error: unknown) => error);
      await vi.runAllTimersAsync();
      expect(await pending).toMatchObject({ code: 'TIMEOUT_ERROR', statusCode: 408 });
      const count = audits.length;
      if (outcome === 'reject') reject(forged('SERVICE_UNAVAILABLE'));
      else
        resolve({
          output: { asset_id: 'asset-1', name: 'unused', status: 'active' },
          source: { system: 'test', reference: 'asset:test' },
          observed_at: toolValidationTime.toISOString()
        });
      await vi.runAllTimersAsync();
      expect(invoke).toHaveBeenCalledOnce();
      expect(audits).toHaveLength(count);
      expect(audits.at(-1)).toMatchObject({ error_code: 'TIMEOUT_ERROR' });
      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
    }
  );
});
