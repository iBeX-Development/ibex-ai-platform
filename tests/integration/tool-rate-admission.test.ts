import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuditRecord } from '../../packages/audit/src/index.js';
import {
  InMemoryToolRateLimiter,
  ToolRateLimitCatalog,
  ToolAdapterError,
  ToolRegistry,
  type ToolRateLimiter,
  type ToolRuntimeDependencies
} from '../../packages/tool-runtime/src/index.js';
import {
  createToolRuntime,
  toolRequest,
  readToolRegistration,
  proposalToolRegistration,
  successfulToolAdapter,
  toolContext
} from '../testing/tool-runtime-fixtures.js';

const reference = readToolRegistration.metadata.rate_limit;
function harness(limit = 1, overrides: Partial<ToolRuntimeDependencies> = {}) {
  const audit: AuditRecord[] = [];
  const adapter = successfulToolAdapter();
  const invoke = vi.fn(adapter.invoke.bind(adapter));
  const limiter = new InMemoryToolRateLimiter(() => 100);
  const consume = vi.fn(limiter.consume.bind(limiter));
  const runtime = createToolRuntime(audit, {
    rateLimitPolicies: new ToolRateLimitCatalog([{ reference, limit, window_ms: 1000 }]),
    rateLimiter: { consume },
    adapters: [{ ...adapter, invoke }],
    ...overrides
  });
  return { runtime, invoke, consume, audit };
}
afterEach(() => {
  vi.useRealTimers();
});

describe('Tool Runtime bounded rate admission', () => {
  it('admits one read and sanitizes correlated exhaustion and audit evidence', async () => {
    const h = harness();
    await expect(h.runtime.execute(toolRequest())).resolves.toMatchObject({ status: 'success' });
    await expect(h.runtime.execute(toolRequest())).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      statusCode: 429,
      publicMessage: 'Tool rate limit exceeded',
      traceId: 'tool-trace-1',
      trustedRequestId: 'request-tool-1',
      diagnostics: undefined
    });
    expect(h.invoke).toHaveBeenCalledTimes(1);
    expect(h.consume).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(h.audit)).toContain('RATE_LIMITED');
    expect(JSON.stringify(h.audit)).not.toContain('synthetic-tool-rate');
  });

  it.each([
    ['invalid input', { input: {} }, {}],
    ['caller bucket', { environment: 'other' }, {}],
    ['caller quota', { rate_limit: { limit: 999 } }, {}],
    ['tenant spoof', { input: { asset_id: 'asset-1', tenant_id: 'other' } }, {}],
    [
      'unauthorized',
      {},
      {
        authorization: {
          authorize: () =>
            Promise.resolve({ allowed: false as const, decision_id: 'deny', reason: 'denied' })
        }
      }
    ],
    ['wrong owner', {}, { ownership: { resolveTenantId: () => Promise.resolve('tenant-b') } }]
  ] as const)('does not consume for %s', async (_label, request, overrides) => {
    const h = harness(1, overrides);
    await expect(h.runtime.execute(toolRequest(request))).rejects.toThrow();
    expect(h.consume).not.toHaveBeenCalled();
    expect(h.invoke).not.toHaveBeenCalled();
  });

  it('fails closed on unknown policy without consumption or adapter invocation', async () => {
    const h = harness(1, { rateLimitPolicies: new ToolRateLimitCatalog([]) });
    await expect(h.runtime.execute(toolRequest())).rejects.toMatchObject({
      code: 'CONFIGURATION_ERROR'
    });
    expect(h.consume).not.toHaveBeenCalled();
    expect(h.invoke).not.toHaveBeenCalled();
  });

  it.each([1, 2])('counts every actual read retry with limit %i', async (limit) => {
    const adapter = successfulToolAdapter();
    const invoke = vi
      .fn(adapter.invoke.bind(adapter))
      .mockRejectedValueOnce(new ToolAdapterError('transient'));
    const h = harness(limit, { adapters: [{ ...adapter, invoke }] });
    if (limit === 1)
      await expect(h.runtime.execute(toolRequest())).rejects.toMatchObject({
        code: 'RATE_LIMITED'
      });
    else await expect(h.runtime.execute(toolRequest())).resolves.toMatchObject({ attempts: 2 });
    expect(invoke).toHaveBeenCalledTimes(limit);
    expect(h.consume).toHaveBeenCalledTimes(2);
  });

  it('charges proposal creation once with no adapter or stock mutation', async () => {
    const h = harness();
    const request = toolRequest({
      tool_id: proposalToolRegistration.metadata.tool_id,
      input: { asset_id: 'asset-1', summary: 'Synthetic proposal' }
    });
    await expect(h.runtime.execute(request)).resolves.toMatchObject({
      status: 'proposed',
      approval_required: true
    });
    await expect(h.runtime.execute(request)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    expect(h.consume).toHaveBeenCalledTimes(2);
    expect(h.invoke).not.toHaveBeenCalled();
  });

  it('uses trusted tenant and captured server environment with immutable admission input', async () => {
    const consume = vi.fn(() => Promise.resolve({ allowed: true }));
    const overrides = {
      rateLimiter: { consume },
      environment: 'test',
      ownership: { resolveTenantId: () => Promise.resolve('tenant-b') }
    };
    const h = harness(1, overrides);
    overrides.environment = 'caller-changed';
    await h.runtime.execute(toolRequest({ context: { ...toolContext, tenant_id: 'tenant-b' } }));
    const entry = (consume.mock.calls as unknown as [[Record<string, unknown>]])[0][0];
    expect(entry).toMatchObject({
      tenant_id: 'tenant-b',
      environment: 'test',
      tool_id: readToolRegistration.metadata.tool_id,
      tool_version: '1.0'
    });
    expect(Object.isFrozen(entry)).toBe(true);
    expect(Object.isFrozen(entry.policy)).toBe(true);
  });

  it.each([
    undefined,
    null,
    true,
    {},
    { allowed: 'true' },
    { allowed: 1 },
    { allowed: false, detail: 'private-limiter-data' },
    {
      get allowed() {
        throw new Error('private-limiter-data');
      }
    }
  ])('sanitizes malformed limiter results with no retry/adapter', async (value) => {
    const consume = vi.fn(() => Promise.resolve(value));
    const h = harness(1, { rateLimiter: { consume } as unknown as ToolRateLimiter });
    await expect(h.runtime.execute(toolRequest())).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      publicMessage: 'Tool admission is unavailable',
      diagnostics: undefined
    });
    expect(consume).toHaveBeenCalledTimes(1);
    expect(h.invoke).not.toHaveBeenCalled();
    expect(JSON.stringify(h.audit)).not.toContain('private-limiter-data');
  });

  it.each(['throw', 'reject'] as const)('sanitizes limiter %s without retry', async (mode) => {
    const consume = vi.fn(() => {
      const error = new ToolAdapterError('transient');
      if (mode === 'throw') throw error;
      return Promise.reject(error);
    });
    const h = harness(1, { rateLimiter: { consume } });
    await expect(h.runtime.execute(toolRequest())).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE'
    });
    expect(consume).toHaveBeenCalledTimes(1);
    expect(h.invoke).not.toHaveBeenCalled();
  });

  it.each(['read', 'proposal'] as const)(
    'bounds never-resolving %s admission and ignores late allow',
    async (kind) => {
      vi.useFakeTimers();
      let finish!: (value: { allowed: boolean }) => void;
      let captured: AbortSignal | undefined;
      const consume = vi.fn<ToolRateLimiter['consume']>((entry) => {
        captured = entry.signal;
        return new Promise((resolve) => {
          finish = resolve;
        });
      });
      const h = harness(1, { rateLimiter: { consume } });
      const request =
        kind === 'read'
          ? toolRequest()
          : toolRequest({
              tool_id: proposalToolRegistration.metadata.tool_id,
              input: { asset_id: 'asset-1', summary: 'Synthetic proposal' }
            });
      const result = expect(h.runtime.execute(request)).rejects.toMatchObject({
        code: 'SERVICE_UNAVAILABLE'
      });
      await vi.advanceTimersByTimeAsync(1000);
      await result;
      expect(captured?.aborted).toBe(true);
      finish({ allowed: true });
      await vi.advanceTimersByTimeAsync(0);
      expect(consume).toHaveBeenCalledTimes(1);
      expect(h.invoke).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it.each(['resolve', 'reject'] as const)(
    'cancels pending admission, cleans listeners, observes late %s',
    async (outcome) => {
      let finish!: () => void;
      const consume = vi.fn<ToolRateLimiter['consume']>(
        () =>
          new Promise((resolve, reject) => {
            finish = () => {
              if (outcome === 'resolve') resolve({ allowed: true });
              else reject(new Error('private'));
            };
          })
      );
      const h = harness(1, { rateLimiter: { consume } });
      const controller = new AbortController();
      const add = vi.spyOn(controller.signal, 'addEventListener');
      const remove = vi.spyOn(controller.signal, 'removeEventListener');
      const result = expect(
        h.runtime.execute(toolRequest(), { signal: controller.signal })
      ).rejects.toMatchObject({ code: 'TIMEOUT_ERROR' });
      await vi.waitFor(() => {
        expect(consume).toHaveBeenCalledTimes(1);
      });
      controller.abort();
      await result;
      finish();
      await Promise.resolve();
      expect(h.invoke).not.toHaveBeenCalled();
      expect(remove.mock.calls.map((c) => c[1])).toEqual(add.mock.calls.map((c) => c[1]));
    }
  );

  it('does not refund admitted cancellation before an adapter result', async () => {
    const adapter = successfulToolAdapter();
    const invoke = vi.fn(() => new Promise<never>(() => {}));
    const h = harness(1, { adapters: [{ ...adapter, invoke }] });
    const controller = new AbortController();
    const result = expect(
      h.runtime.execute(toolRequest(), { signal: controller.signal })
    ).rejects.toMatchObject({ code: 'TIMEOUT_ERROR' });
    await vi.waitFor(() => {
      expect(invoke).toHaveBeenCalledTimes(1);
    });
    controller.abort();
    await result;
    await expect(h.runtime.execute(toolRequest())).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('retains live capability blocks before admission', async () => {
    const registry = new ToolRegistry([
      {
        ...readToolRegistration,
        metadata: { ...readToolRegistration.metadata, execution_mode: 'live_core' }
      }
    ]);
    const h = harness(1, { registry });
    await expect(h.runtime.execute(toolRequest())).rejects.toMatchObject({ code: 'TOOL_DISABLED' });
    expect(h.consume).not.toHaveBeenCalled();
    expect(h.invoke).not.toHaveBeenCalled();
  });
});
