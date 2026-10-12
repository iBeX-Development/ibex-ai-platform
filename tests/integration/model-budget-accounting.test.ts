import { getEventListeners } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createModelGateway, modelGatewayRequest } from '../testing/model-gateway-fixtures.js';
import {
  fallbackModel,
  fallbackProvider,
  modelContext,
  primaryModel,
  primaryProvider
} from '../testing/model-gateway-fixtures.js';
import {
  SyntheticAccountingPort,
  syntheticBudgetPolicy
} from '../testing/model-accounting-fixtures.js';
import {
  accountingHash,
  ModelRegistry,
  parseBudgetPolicy,
  ProviderAdapterError,
  UnconfiguredModelAccountingPort,
  type AccountingSettlementCommand,
  type ModelAccountingPort,
  type ModelBudgetPolicy,
  type ModelGatewayDependencies,
  type ModelProviderAdapter,
  type ProviderInvocationRequest,
  type ProviderResult
} from '../../packages/model-gateway/src/index.js';
import type { AuditRecord } from '../../packages/audit/src/index.js';

const result: ProviderResult = {
  result: 'synthetic private output',
  input_tokens: 10,
  output_tokens: 5,
  finish_reason: 'stop',
  policy_flags: []
};
const gatewayPolicy = {
  version: 'model-policy-1.0',
  required_permission: 'ai:model:invoke',
  agent_capabilities: { general: ['MG-GENERAL'] as const },
  timeout_ms: 5,
  max_retries: 2,
  fallback_enabled: true,
  maximum_input_bytes: 16_384
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function fixture(
  policy = syntheticBudgetPolicy,
  port?: ModelAccountingPort,
  overrides: Partial<ModelGatewayDependencies> = {}
) {
  const ledger = new SyntheticAccountingPort(policy);
  const invoke = vi.fn(() => Promise.resolve(result));
  const audits: AuditRecord[] = [];
  const gateway = createModelGateway(audits, [], {
    registry: new ModelRegistry([primaryProvider], [primaryModel]),
    adapters: [{ adapter_id: 'adapter-primary', invoke }],
    policy: gatewayPolicy,
    accounting: { policy, port: port ?? ledger },
    ...overrides
  });
  return { gateway, ledger, invoke, audits };
}
function policyWith(overrides: Partial<ModelBudgetPolicy>) {
  return parseBudgetPolicy({ ...syntheticBudgetPolicy, ...overrides });
}
function observe<T>(promise: Promise<T>) {
  return promise.then(
    (value) => ({ value, error: undefined }),
    (error: unknown) => ({ value: undefined, error })
  );
}
function checkFailure(error: unknown, code: string) {
  expect(error).toMatchObject({
    code,
    traceId: 'model-trace-1',
    trustedRequestId: 'request-model-1'
  });
  expect(JSON.stringify(error)).not.toMatch(/private|credential|synthetic private output/);
}
function firstCommand(ledger: SyntheticAccountingPort) {
  const command = [...ledger.rows.values()][0]?.command;
  if (!command) throw new Error('Synthetic reservation missing');
  return command;
}

describe('Model accounting admission regressions', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  it('denies a missing accounting boundary before provider dispatch', async () => {
    const invoke = vi.fn(() =>
      Promise.resolve({
        result: 'synthetic',
        input_tokens: 10,
        output_tokens: 5,
        finish_reason: 'stop',
        policy_flags: []
      })
    );
    const gateway = createModelGateway([], [], {
      accounting: undefined,
      adapters: [{ adapter_id: 'adapter-primary', invoke }]
    });
    await expect(gateway.invoke(modelGatewayRequest())).rejects.toMatchObject({
      code: 'CONFIGURATION_ERROR',
      traceId: 'model-trace-1',
      trustedRequestId: 'request-model-1'
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it.each(['invalid-policy', 'unconfigured-port', 'reject', 'bad-receipt'])(
    'fails closed with %s accounting and sanitized correlation',
    async (mode) => {
      const ledger = new SyntheticAccountingPort();
      const port: ModelAccountingPort =
        mode === 'unconfigured-port'
          ? new UnconfiguredModelAccountingPort()
          : {
              reserve: async (command) => {
                if (mode === 'reject') throw new Error('private credential failure');
                return { ...(await ledger.reserve(command)), command_hash: 'wrong-hash' };
              },
              settle: (c) => ledger.settle(c)
            };
      const h = fixture(
        syntheticBudgetPolicy,
        port,
        mode === 'invalid-policy'
          ? { accounting: { policy: { ...syntheticBudgetPolicy, limits: {} }, port } }
          : {}
      );
      checkFailure(
        (await observe(h.gateway.invoke(modelGatewayRequest()))).error,
        mode === 'invalid-policy' ? 'CONFIGURATION_ERROR' : 'DEPENDENCY_ERROR'
      );
      expect(h.invoke).not.toHaveBeenCalled();
      expect(JSON.stringify(h.audits)).not.toMatch(/private|credential/);
    }
  );

  it.each([
    'unsupported',
    'input-guarantee',
    'output-guarantee',
    'bad-count',
    'input',
    'context',
    'price',
    'global'
  ])('denies %s before zero provider calls', async (mode) => {
    let policy = syntheticBudgetPolicy;
    if (mode === 'input') policy = policyWith({ request: { ...policy.request, input_tokens: 31 } });
    if (mode === 'price') policy = policyWith({ pricing: policy.pricing.slice(1) });
    if (mode === 'global')
      policy = policyWith({
        limits: { global: { ...policy.limits.global, cost_units: 159, warning_cost_units: 100 } }
      });
    const invoke = vi.fn(() => Promise.resolve(result));
    const adapter: ModelProviderAdapter = {
      adapter_id: 'adapter-primary',
      invoke,
      tokenBounds:
        mode === 'unsupported'
          ? undefined
          : {
              version: 'synthetic-bounds',
              enforces_input_bound: mode !== 'input-guarantee',
              enforces_output_limit: mode !== 'output-guarantee',
              countInputTokens: () => Promise.resolve(mode === 'bad-count' ? NaN : 32)
            }
    };
    const h = fixture(policy, undefined, {
      adapters: [adapter],
      ...(mode === 'context'
        ? {
            registry: new ModelRegistry([primaryProvider], [{ ...primaryModel, context_limit: 80 }])
          }
        : {})
    });
    expect((await observe(h.gateway.invoke(modelGatewayRequest()))).error).toBeDefined();
    expect(invoke).not.toHaveBeenCalled();
    expect(h.ledger.rows.size).toBe(0);
  });

  it('atomically admits only one concurrent request against remaining capacity', async () => {
    const policy = policyWith({
      limits: {
        global: { ...syntheticBudgetPolicy.limits.global, cost_units: 160, warning_cost_units: 160 }
      }
    });
    const pending = deferred<ProviderResult>();
    const invoke = vi.fn(() => pending.promise);
    const h = fixture(policy, undefined, { adapters: [{ adapter_id: 'adapter-primary', invoke }] });
    const first = observe(h.gateway.invoke(modelGatewayRequest()));
    await vi.advanceTimersByTimeAsync(0);
    const competing = fixture(policy, h.ledger, {
      adapters: [{ adapter_id: 'adapter-primary', invoke }]
    });
    checkFailure(
      (await observe(competing.gateway.invoke(modelGatewayRequest()))).error,
      'BUDGET_EXCEEDED'
    );
    expect(invoke).toHaveBeenCalledOnce();
    expect(h.ledger.rows.size).toBe(1);
    pending.resolve(result);
    expect((await first).value).toBeDefined();
  });

  it('isolates tenant quotas while sharing the global cap', async () => {
    const policy = policyWith({
      limits: {
        ...syntheticBudgetPolicy.limits,
        tenant: { ...syntheticBudgetPolicy.limits.global, attempts: 1 }
      }
    });
    const h = fixture(policy);
    await h.gateway.invoke(modelGatewayRequest());
    checkFailure((await observe(h.gateway.invoke(modelGatewayRequest()))).error, 'BUDGET_EXCEEDED');
    await h.gateway.invoke(
      modelGatewayRequest({ context: { ...modelContext, tenant_id: 'tenant-b' } })
    );
    expect(h.invoke).toHaveBeenCalledTimes(2);
    expect([...h.ledger.rows.values()].map((r) => r.command.attempt.tenant_id)).toEqual([
      'tenant-a',
      'tenant-b'
    ]);
  });

  it('settles idempotently, rejects changed duplicate commands and retains threshold warnings', async () => {
    const policy = policyWith({
      limits: { global: { ...syntheticBudgetPolicy.limits.global, warning_cost_units: 150 } }
    });
    const ledger = new SyntheticAccountingPort(policy);
    let settlement: AccountingSettlementCommand | undefined;
    const port: ModelAccountingPort = {
      reserve: async (command) => {
        const receipt = await ledger.reserve(command);
        expect(await ledger.reserve(command)).toEqual(receipt);
        return receipt;
      },
      settle: async (command) => {
        settlement = command;
        const receipt = await ledger.settle(command);
        expect(await ledger.settle(command)).toEqual(receipt);
        return receipt;
      }
    };
    const h = fixture(policy, port);
    const response = await h.gateway.invoke(modelGatewayRequest());
    expect(response.usage.estimated_cost).toBe(0.0002);
    expect(ledger.rows.size).toBe(1);
    expect(ledger.warningOutbox).toHaveLength(1);
    expect(h.audits.at(-1)).toMatchObject({
      accounting: {
        state: 'settled',
        warnings: ['global'],
        policy_version: policy.version,
        period_id: policy.period.id
      }
    });
    if (!settlement) throw new Error('Missing synthetic settlement');
    const changedBody = {
      reservation: settlement.reservation,
      usage: { ...settlement.usage, cost_units: 0 }
    };
    await expect(
      ledger.settle({ ...changedBody, command_hash: accountingHash(changedBody) })
    ).rejects.toBeDefined();
    const reservation = firstCommand(ledger);
    const changed = { policy, attempt: { ...reservation.attempt, tenant_id: 'tenant-b' } };
    await expect(
      ledger.reserve({ ...changed, command_hash: accountingHash(changed) })
    ).rejects.toBeDefined();
  });

  it.each(['reserve', 'settle'] as const)(
    'lost %s acknowledgement cannot replay provider work',
    async (phase) => {
      const ledger = new SyntheticAccountingPort();
      const port: ModelAccountingPort = {
        reserve: async (command) => {
          const receipt = await ledger.reserve(command);
          return phase === 'reserve' ? new Promise(() => undefined) : receipt;
        },
        settle: async (command) => {
          await ledger.settle(command);
          return new Promise(() => undefined);
        }
      };
      const h = fixture(syntheticBudgetPolicy, port);
      const done = observe(h.gateway.invoke(modelGatewayRequest()));
      await vi.advanceTimersByTimeAsync(100);
      checkFailure((await done).error, 'DEPENDENCY_ERROR');
      expect(h.invoke).toHaveBeenCalledTimes(phase === 'reserve' ? 0 : 1);
      expect(ledger.rows.size).toBe(1);
      expect([...ledger.rows.values()][0]?.receipt.state).toBe(
        phase === 'reserve' ? 'unresolved' : 'settled'
      );
      expect(h.audits.at(-1)).toMatchObject({
        accounting: { state: 'unresolved', attempt_id: firstCommand(ledger).attempt.attempt_id }
      });
    }
  );

  it.each([0, 1])(
    'reserves distinct attempts for genuine retry/fallback (retries %i)',
    async (retries) => {
      const invoke = vi
        .fn()
        .mockRejectedValueOnce(new ProviderAdapterError('unavailable'))
        .mockResolvedValue(result);
      const fallback = vi.fn(() => Promise.resolve(result));
      const h = fixture(syntheticBudgetPolicy, undefined, {
        registry: new ModelRegistry(
          [primaryProvider, fallbackProvider],
          [primaryModel, fallbackModel]
        ),
        adapters: [
          { adapter_id: 'adapter-primary', invoke },
          { adapter_id: 'adapter-fallback', invoke: fallback }
        ],
        policy: { ...gatewayPolicy, max_retries: retries }
      });
      await h.gateway.invoke(modelGatewayRequest());
      const rows = [...h.ledger.rows.values()];
      expect(rows).toHaveLength(2);
      expect(new Set(rows.map((r) => r.command.attempt.attempt_id)).size).toBe(2);
      expect(new Set(rows.map((r) => r.command.attempt.invocation_id)).size).toBe(1);
      expect(rows.map((r) => r.receipt.state)).toEqual(['unresolved', 'settled']);
      expect(fallback).toHaveBeenCalledTimes(retries === 0 ? 1 : 0);
    }
  );

  it('denies retry when the unresolved attempt consumed request capacity', async () => {
    const policy = policyWith({ request: { ...syntheticBudgetPolicy.request, attempts: 1 } });
    const invoke = vi.fn(() => Promise.reject(new ProviderAdapterError('unavailable')));
    const h = fixture(policy, undefined, { adapters: [{ adapter_id: 'adapter-primary', invoke }] });
    checkFailure((await observe(h.gateway.invoke(modelGatewayRequest()))).error, 'BUDGET_EXCEEDED');
    expect(invoke).toHaveBeenCalledOnce();
    expect([...h.ledger.rows.values()][0]?.receipt.state).toBe('unresolved');
  });

  it.each(['count', 'reserve', 'provider', 'settle'] as const)(
    'cancels during %s without continuation, release or leaked listeners',
    async (phase) => {
      const controller = new AbortController();
      const ledger = new SyntheticAccountingPort();
      const held = deferred<never>();
      const invoke = vi.fn(() => (phase === 'provider' ? held.promise : Promise.resolve(result)));
      const port: ModelAccountingPort = {
        reserve: async (command) => {
          const receipt = await ledger.reserve(command);
          return phase === 'reserve' ? held.promise : receipt;
        },
        settle: () => held.promise
      };
      const adapter: ModelProviderAdapter = {
        adapter_id: 'adapter-primary',
        invoke,
        tokenBounds: {
          version: 'synthetic-bound',
          enforces_input_bound: true,
          enforces_output_limit: true,
          countInputTokens: () => (phase === 'count' ? held.promise : Promise.resolve(32))
        }
      };
      const h = fixture(syntheticBudgetPolicy, port, { adapters: [adapter] });
      const done = observe(h.gateway.invoke(modelGatewayRequest(), { signal: controller.signal }));
      await vi.advanceTimersByTimeAsync(0);
      controller.abort();
      checkFailure((await done).error, 'TIMEOUT_ERROR');
      expect(invoke).toHaveBeenCalledTimes(phase === 'settle' || phase === 'provider' ? 1 : 0);
      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
      held.reject(new Error('private late accounting rejection'));
      await vi.advanceTimersByTimeAsync(0);
      expect([...ledger.rows.values()].every((r) => r.receipt.state === 'unresolved')).toBe(true);
    }
  );

  it('already-aborted requests make zero accounting and provider calls', async () => {
    const h = fixture();
    const reserve = vi.spyOn(h.ledger, 'reserve');
    const controller = new AbortController();
    controller.abort();
    checkFailure(
      (await observe(h.gateway.invoke(modelGatewayRequest(), { signal: controller.signal }))).error,
      'TIMEOUT_ERROR'
    );
    expect(reserve).not.toHaveBeenCalled();
    expect(h.invoke).not.toHaveBeenCalled();
  });

  it.each(['fulfill', 'reject'] as const)(
    'timeout retains liability and consumes late %s without replay/fallback',
    async (outcome) => {
      const pending = deferred<ProviderResult>();
      const invoke = vi.fn(() => pending.promise);
      const fallback = vi.fn(() => Promise.resolve(result));
      const h = fixture(syntheticBudgetPolicy, undefined, {
        registry: new ModelRegistry(
          [primaryProvider, fallbackProvider],
          [primaryModel, fallbackModel]
        ),
        adapters: [
          { adapter_id: 'adapter-primary', invoke },
          { adapter_id: 'adapter-fallback', invoke: fallback }
        ]
      });
      const done = observe(h.gateway.invoke(modelGatewayRequest()));
      await vi.advanceTimersByTimeAsync(5);
      checkFailure((await done).error, 'PROVIDER_TIMEOUT');
      if (outcome === 'fulfill') pending.resolve(result);
      else pending.reject(new Error('private late provider failure'));
      await vi.advanceTimersByTimeAsync(0);
      expect(invoke).toHaveBeenCalledOnce();
      expect(fallback).not.toHaveBeenCalled();
      expect([...h.ledger.rows.values()][0]?.receipt.state).toBe('unresolved');
    }
  );

  it('rejects output beyond the certified bound without settling', async () => {
    const h = fixture(syntheticBudgetPolicy, undefined, {
      adapters: [
        {
          adapter_id: 'adapter-primary',
          invoke: () => Promise.resolve({ ...result, output_tokens: 65 })
        }
      ]
    });
    checkFailure(
      (await observe(h.gateway.invoke(modelGatewayRequest()))).error,
      'INVALID_RESPONSE'
    );
    expect([...h.ledger.rows.values()][0]?.receipt.state).toBe('unresolved');
  });

  it('month rollover denies late admission without clearing the prior-period hold', async () => {
    let now = 100;
    const policy = policyWith({ period: { ...syntheticBudgetPolicy.period, ends_at_ms: 200 } });
    const ledger = new SyntheticAccountingPort(policy, () => now);
    const port: ModelAccountingPort = {
      reserve: async (command) => {
        const receipt = await ledger.reserve(command);
        now = 200;
        return receipt;
      },
      settle: (command) => ledger.settle(command)
    };
    const h = fixture(policy, port, { clock: () => now });
    checkFailure(
      (await observe(h.gateway.invoke(modelGatewayRequest()))).error,
      'DEPENDENCY_ERROR'
    );
    expect(h.invoke).not.toHaveBeenCalled();
    expect([...ledger.rows.values()][0]?.receipt.state).toBe('unresolved');
    const next = policyWith({
      period: { ...policy.period, id: 'synthetic-month-2', starts_at_ms: 200, ends_at_ms: 300 }
    });
    ledger.authority = next; // Test-owned authority rotates the policy, never clears old holds.
    const h2 = fixture(next, ledger, { clock: () => now });
    await h2.gateway.invoke(modelGatewayRequest());
    expect([...ledger.rows.values()].map((r) => r.command.policy.period.id)).toEqual([
      'synthetic-month-1',
      'synthetic-month-2'
    ]);
    expect(firstCommand(ledger).policy.period.id).toBe('synthetic-month-1');
  });

  it('snapshots input and pricing before awaited work and rejects caller budget overrides', async () => {
    const input = { message: 'synthetic original' };
    const mutablePolicy = structuredClone(syntheticBudgetPolicy);
    const invoke = vi.fn((request: ProviderInvocationRequest) => {
      expect(request.input).toEqual({ message: 'synthetic original' });
      expect(request.max_output_tokens).toBe(64);
      return Promise.resolve(result);
    });
    const h = fixture(syntheticBudgetPolicy, undefined, {
      accounting: { policy: mutablePolicy, port: new SyntheticAccountingPort() },
      adapters: [
        {
          adapter_id: 'adapter-primary',
          invoke,
          tokenBounds: {
            version: 'synthetic-bound',
            enforces_input_bound: true,
            enforces_output_limit: true,
            countInputTokens: () => {
              input.message = 'mutated';
              mutablePolicy.request.output_tokens = 1;
              return Promise.resolve(32);
            }
          }
        }
      ]
    });
    await h.gateway.invoke(modelGatewayRequest({ input }));
    expect(invoke).toHaveBeenCalledOnce();
    checkFailure(
      (await observe(h.gateway.invoke(modelGatewayRequest({ accounting: { unlimited: true } }))))
        .error,
      'VALIDATION_ERROR'
    );
  });

  it('rechecks cancellation at actual dispatch even after a valid reserve acknowledgement', async () => {
    const controller = new AbortController();
    const ledger = new SyntheticAccountingPort();
    const port: ModelAccountingPort = {
      reserve: async (command) => {
        const receipt = await ledger.reserve(command);
        // Admission metadata is checked after the bounded wait. Simulate cancellation there.
        return {
          ...receipt,
          get warnings() {
            controller.abort();
            return [];
          }
        };
      },
      settle: (command) => ledger.settle(command)
    };
    const h = fixture(syntheticBudgetPolicy, port);
    checkFailure(
      (await observe(h.gateway.invoke(modelGatewayRequest(), { signal: controller.signal }))).error,
      'TIMEOUT_ERROR'
    );
    expect(h.invoke).not.toHaveBeenCalled();
    expect([...ledger.rows.values()][0]?.receipt.state).toBe('unresolved');
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
  });

  it('rechecks policy expiry at actual dispatch, not just at reserve acknowledgement', async () => {
    let now = 100;
    const policy = policyWith({ valid_until_ms: 200 });
    const ledger = new SyntheticAccountingPort(policy, () => now);
    const port: ModelAccountingPort = {
      reserve: async (command) => {
        const receipt = await ledger.reserve(command);
        return {
          ...receipt,
          get warnings() {
            now = 200;
            return [];
          }
        };
      },
      settle: (command) => ledger.settle(command)
    };
    const h = fixture(policy, port, { clock: () => now });
    checkFailure(
      (await observe(h.gateway.invoke(modelGatewayRequest()))).error,
      'DEPENDENCY_ERROR'
    );
    expect(h.invoke).not.toHaveBeenCalled();
    expect([...ledger.rows.values()][0]?.receipt.state).toBe('unresolved');
  });

  it.each(['count', 'reserve', 'settle'] as const)(
    'bounds a hanging %s and observes its late rejection',
    async (phase) => {
      const held = deferred<never>();
      const ledger = new SyntheticAccountingPort();
      const port: ModelAccountingPort = {
        reserve: (c) => (phase === 'reserve' ? held.promise : ledger.reserve(c)),
        settle: (c) => (phase === 'settle' ? held.promise : ledger.settle(c))
      };
      const invoke = vi.fn(() => Promise.resolve(result));
      const h = fixture(syntheticBudgetPolicy, port, {
        adapters: [
          {
            adapter_id: 'adapter-primary',
            invoke,
            tokenBounds: {
              version: 'synthetic-bound',
              enforces_input_bound: true,
              enforces_output_limit: true,
              countInputTokens: () => (phase === 'count' ? held.promise : Promise.resolve(32))
            }
          }
        ]
      });
      const done = observe(h.gateway.invoke(modelGatewayRequest()));
      await vi.advanceTimersByTimeAsync(100);
      checkFailure((await done).error, 'DEPENDENCY_ERROR');
      expect(invoke).toHaveBeenCalledTimes(phase === 'settle' ? 1 : 0);
      held.reject(new Error('private late failure'));
      await vi.advanceTimersByTimeAsync(0);
    }
  );

  it('late acknowledgement after cancellation cannot continue dispatch or clear an unresolved hold', async () => {
    const controller = new AbortController();
    const ledger = new SyntheticAccountingPort();
    const held = deferred<Awaited<ReturnType<ModelAccountingPort['reserve']>>>();
    let command: Parameters<ModelAccountingPort['reserve']>[0] | undefined;
    const port: ModelAccountingPort = {
      reserve: (c) => {
        command = c;
        return held.promise;
      },
      settle: (c) => ledger.settle(c)
    };
    const h = fixture(syntheticBudgetPolicy, port);
    const done = observe(h.gateway.invoke(modelGatewayRequest(), { signal: controller.signal }));
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    checkFailure((await done).error, 'TIMEOUT_ERROR');
    if (!command) throw new Error('Missing synthetic command');
    held.resolve(await ledger.reserve(command));
    await vi.advanceTimersByTimeAsync(0);
    expect(h.invoke).not.toHaveBeenCalled();
    expect([...ledger.rows.values()][0]?.receipt.state).toBe('unresolved');
  });
});
