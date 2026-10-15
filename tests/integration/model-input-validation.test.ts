import type { Span } from '@opentelemetry/api';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { AuditRecord } from '../../packages/audit/src/index.js';
import {
  LocalModelSchemaCatalog,
  ModelRegistry,
  ProviderAdapterError,
  type ModelDefinition,
  type ModelGatewayDependencies,
  type ModelUsageMetric,
  type ProviderDefinition,
  type ProviderInvocationRequest,
  type ProviderResult,
  type ProviderTokenCountRequest
} from '../../packages/model-gateway/src/index.js';
import { tracer } from '../../packages/observability/src/index.js';
import { enabledTestFeatureControls } from '../../packages/testing/src/index.js';
import {
  createModelGateway,
  fallbackModel,
  fallbackProvider,
  modelContext,
  modelGatewayRequest,
  modelGatewayValidationTime,
  primaryModel,
  primaryProvider
} from '../testing/model-gateway-fixtures.js';
import {
  SyntheticAccountingPort,
  syntheticBudgetPolicy
} from '../testing/model-accounting-fixtures.js';

const reference = (schema_id: string, schema_version = '1') => ({ schema_id, schema_version });
const strictMessage = z.object({ message: z.string() }).strict();
const valid = (input: unknown) => strictMessage.safeParse(input).success;
const result = {
  result: 'unchanged synthetic result',
  input_tokens: 10,
  output_tokens: 5,
  finish_reason: 'stop',
  policy_flags: []
};
const policy = {
  version: 'model-policy-1.0',
  required_permission: 'ai:model:invoke',
  agent_capabilities: { general: ['MG-GENERAL'] as const },
  timeout_ms: 1000,
  max_retries: 1,
  fallback_enabled: true,
  maximum_input_bytes: 16384
};

function fixture(
  options: {
    validate?: (input: unknown) => unknown;
    fallbackValidate?: (input: unknown) => unknown;
    provider?: Partial<ProviderDefinition>;
    model?: Partial<ModelDefinition>;
    dependencies?: Partial<ModelGatewayDependencies>;
  } = {}
) {
  const order: string[] = [];
  const validate = vi.fn((input: unknown) => {
    order.push('validate');
    return (options.validate ?? valid)(input);
  });
  const fallbackValidate = vi.fn((input: unknown) => {
    order.push('fallback-validate');
    return (options.fallbackValidate ?? valid)(input);
  });
  const output = vi.fn((payload: unknown) => typeof payload === 'string');
  const otherVersion = vi.fn(() => false);
  const catalog = new LocalModelSchemaCatalog([
    { reference: reference('input'), validate },
    { reference: reference('input', '2'), validate: otherVersion },
    { reference: reference('fallback'), validate: fallbackValidate },
    { reference: reference('output'), validate: output }
  ]);
  // Synthetic adapters only; live mode exercises first-use secret ordering without network.
  const providers = [primaryProvider, fallbackProvider].map((provider) => ({
    ...provider,
    mode: 'live' as const,
    endpoint: 'https://models.example.invalid/v1',
    credential_reference: 'SYNTHETIC_TEST_KEY',
    ...options.provider
  }));
  const models = [primaryModel, fallbackModel].map((model, index) => ({
    ...model,
    input_type: { modalities: ['text'] as const, schema: reference(index ? 'fallback' : 'input') },
    output_type: { modalities: ['text'] as const, schema: reference('output') },
    ...options.model
  }));
  const registry = new ModelRegistry(providers, models, catalog);
  const ledger = new SyntheticAccountingPort();
  const reserve = vi.spyOn(ledger, 'reserve');
  const settle = vi.spyOn(ledger, 'settle');
  const count = vi.fn<(request: ProviderTokenCountRequest) => Promise<number>>(() => {
    order.push('count');
    return Promise.resolve(32);
  });
  const fallbackCount = vi.fn<(request: ProviderTokenCountRequest) => Promise<number>>(() => {
    order.push('fallback-count');
    return Promise.resolve(32);
  });
  const invoke = vi.fn<(request: ProviderInvocationRequest) => Promise<ProviderResult>>(() => {
    order.push('invoke');
    return Promise.resolve(result);
  });
  const fallbackInvoke = vi.fn<(request: ProviderInvocationRequest) => Promise<ProviderResult>>(
    () => {
      order.push('fallback-invoke');
      return Promise.resolve(result);
    }
  );
  const getSecret = vi.fn(() => {
    order.push('secret');
    return Promise.resolve('synthetic-secret');
  });
  const audits: AuditRecord[] = [];
  const metrics: ModelUsageMetric[] = [];
  const gateway = createModelGateway(audits, metrics, {
    registry,
    policy,
    accounting: { policy: syntheticBudgetPolicy, port: ledger },
    secretProvider: { getSecret },
    adapters: [primaryProvider, fallbackProvider].map((provider, index) => ({
      adapter_id: provider.adapter_id,
      invoke: index ? fallbackInvoke : invoke,
      tokenBounds: {
        version: 'synthetic-input-test-1',
        enforces_input_bound: true,
        enforces_output_limit: true,
        countInputTokens: index ? fallbackCount : count
      }
    })),
    ...options.dependencies
  });
  return {
    gateway,
    registry,
    validate,
    fallbackValidate,
    output,
    otherVersion,
    ledger,
    reserve,
    settle,
    count,
    fallbackCount,
    invoke,
    fallbackInvoke,
    getSecret,
    audits,
    metrics,
    order
  };
}

function noAttempt(h: ReturnType<typeof fixture>) {
  for (const call of [
    h.getSecret,
    h.count,
    h.fallbackCount,
    h.reserve,
    h.settle,
    h.invoke,
    h.fallbackInvoke
  ])
    expect(call).not.toHaveBeenCalled();
  expect(h.metrics).toEqual([]);
  expect(h.ledger.rows.size).toBe(0);
  expect(h.fallbackValidate).not.toHaveBeenCalled();
  expect(h.output).not.toHaveBeenCalled();
  expect(h.otherVersion).not.toHaveBeenCalled();
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

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('Model exact input gate', () => {
  it('binds once and shares the exact frozen snapshot with count and dispatch, preserving flags and output schema', async () => {
    const schema = z
      .object({ message: z.string(), nested: z.object({ values: z.array(z.string()) }).strict() })
      .strict();
    const h = fixture({
      validate: (input) => schema.safeParse(input).success,
      model: { tool_use: true }
    });
    const resolve = vi
      .spyOn(LocalModelSchemaCatalog.prototype, 'resolve')
      .mockImplementation(() => {
        throw new Error('must not re-resolve');
      });
    const input = { message: 'private-input-marker', nested: { values: ['original'] } };
    h.getSecret.mockImplementation(() => {
      input.message = 'changed';
      input.nested.values.push('changed');
      return Promise.resolve('synthetic-secret');
    });
    const response = await h.gateway.invoke(
      modelGatewayRequest({
        input,
        requires_structured_output: true,
        requires_tool_use: true,
        output_schema_id: 'workflow.unregistered.v17'
      }),
      {},
      modelGatewayValidationTime
    );
    const snapshot = h.validate.mock.calls[0]?.[0];
    expect(snapshot).toEqual({ message: 'private-input-marker', nested: { values: ['original'] } });
    expect(snapshot).not.toBe(input);
    expect(Object.isFrozen(snapshot)).toBe(true);
    const nested = (snapshot as typeof input).nested;
    expect(Object.isFrozen(nested)).toBe(true);
    expect(Object.isFrozen(nested.values)).toBe(true);
    expect(h.count.mock.calls[0]?.[0].input).toBe(snapshot);
    expect(h.invoke.mock.calls[0]?.[0].input).toBe(snapshot);
    for (const request of [h.count.mock.calls[0]?.[0], h.invoke.mock.calls[0]?.[0]])
      expect(request).toMatchObject({
        requires_structured_output: true,
        requires_tool_use: true,
        output_schema_id: 'workflow.unregistered.v17'
      });
    expect(response.result).toBe(result.result);
    expect(h.validate).toHaveBeenCalledOnce();
    expect(resolve).not.toHaveBeenCalled();
    expect(h.output).toHaveBeenCalledExactlyOnceWith(result.result);
    expect(h.otherVersion).not.toHaveBeenCalled();
    expect(h.fallbackValidate).not.toHaveBeenCalled();
  });

  it('orders validation before first-use secrets and every attempt count', async () => {
    const h = fixture();
    await h.gateway.invoke(modelGatewayRequest());
    expect(h.order).toEqual(['validate', 'secret', 'count', 'invoke']);
  });

  it.each([
    null,
    [],
    ['message'],
    {},
    { message: 2 },
    { message: null },
    { message: 'private-input-marker', extra: true },
    'private-input-marker',
    undefined
  ])('rejects strict invalid input %j without attempt effects', async (input) => {
    const h = fixture();
    await expect(h.gateway.invoke(modelGatewayRequest({ input }))).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      publicMessage: 'Model input is invalid'
    });
    expect(h.validate).toHaveBeenCalledOnce();
    noAttempt(h);
    expect(h.audits).toHaveLength(1);
    expect(h.audits[0]).toMatchObject({
      stage: 'request_validation',
      outcome: 'rejected',
      error_code: 'VALIDATION_ERROR'
    });
    expect(JSON.stringify(h.audits)).not.toContain('private-input-marker');
  });

  it.each([
    ['false', (): boolean => false, 'VALIDATION_ERROR', 400],
    [
      'throw Error',
      (): never => {
        throw new Error('private-validator-marker');
      },
      'CONFIGURATION_ERROR',
      500
    ],
    [
      'throw non-Error',
      (): never => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- Exercise a faulty server predicate.
        throw 'private-validator-marker';
      },
      'CONFIGURATION_ERROR',
      500
    ],
    ['undefined', (): undefined => undefined, 'CONFIGURATION_ERROR', 500],
    ['truthy string', (): string => 'private-validator-marker', 'CONFIGURATION_ERROR', 500],
    ['truthy number', (): number => 1, 'CONFIGURATION_ERROR', 500],
    ['object', () => ({ private: 'private-validator-marker' }), 'CONFIGURATION_ERROR', 500],
    ['Promise true', () => Promise.resolve(true), 'CONFIGURATION_ERROR', 500],
    ['Promise false', () => Promise.resolve(false), 'CONFIGURATION_ERROR', 500],
    [
      'Promise rejection',
      () => Promise.reject(new Error('private-validator-marker')),
      'CONFIGURATION_ERROR',
      500
    ]
  ] as const)(
    'sanitizes %s and never shops for another schema',
    async (_label, validate, code, statusCode) => {
      const span = captureSpan();
      const h = fixture({ validate });
      let caught: unknown;
      try {
        await h.gateway.invoke(modelGatewayRequest({ input: { message: 'private-input-marker' } }));
      } catch (error) {
        caught = error;
      }
      expect(caught).toMatchObject({ code, statusCode });
      noAttempt(h);
      expect(h.audits).toHaveLength(1);
      const serialized = JSON.stringify({
        caught,
        audits: h.audits,
        attributes: span.setAttributes.mock.calls,
        exceptions: span.recordException.mock.calls,
        events: span.addEvent.mock.calls
      });
      expect(serialized).not.toMatch(/private-input-marker|private-validator-marker/);
      expect(span.recordException).toHaveBeenCalledExactlyOnceWith(
        new Error('Model Gateway invocation failed')
      );
      // Give faulty rejected promises a full turn: Vitest also fails unhandled rejections.
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  );

  it('observes a late rejected async validator without accepting its fulfillment', async () => {
    let reject!: (reason: Error) => void;
    const pending = new Promise<boolean>((_resolve, no) => {
      reject = no;
    });
    const h = fixture({ validate: () => pending });
    await expect(h.gateway.invoke(modelGatewayRequest())).rejects.toMatchObject({
      code: 'CONFIGURATION_ERROR'
    });
    reject(new Error('private-late-validator-marker'));
    await new Promise<void>((resolve) => setImmediate(resolve));
    noAttempt(h);
  });

  it('rejects attempted mutation and preserves the caller input', async () => {
    const input = { message: 'private-input-marker' };
    const h = fixture({
      validate: (payload) => {
        (payload as typeof input).message = 'mutated';
        return true;
      }
    });
    await expect(h.gateway.invoke(modelGatewayRequest({ input }))).rejects.toMatchObject({
      code: 'CONFIGURATION_ERROR'
    });
    expect(input.message).toBe('private-input-marker');
    noAttempt(h);
  });

  it.each([
    'authorization',
    'tenant',
    'confidentiality',
    'entitlement',
    'disabled',
    'unapproved',
    'environment',
    'capability',
    'structured',
    'tool',
    'gated',
    'already-cancelled'
  ] as const)('does not validate when %s denies admission', async (reason) => {
    const controller = new AbortController();
    const options: Parameters<typeof fixture>[0] = {};
    const request: Record<string, unknown> = {};
    if (reason === 'authorization') request.context = { ...modelContext, permissions: [] };
    if (reason === 'tenant') request.context = { ...modelContext, tenant_id: '' };
    if (reason === 'entitlement') request.context = { ...modelContext, entitlements: [] };
    if (reason === 'confidentiality') options.provider = { maximum_confidentiality: 'PUBLIC' };
    if (reason === 'disabled') options.provider = { status: 'disabled' };
    if (reason === 'unapproved') options.model = { status: 'unapproved' };
    if (reason === 'environment') options.model = { approved_environments: ['production'] };
    if (reason === 'capability') request.capability = 'MG-FAST';
    if (reason === 'structured') {
      options.model = { structured_output: false };
      request.requires_structured_output = true;
      request.output_schema_id = 'workflow.v1';
    }
    if (reason === 'tool') request.requires_tool_use = true;
    if (reason === 'gated')
      options.dependencies = {
        featureControls: { ...enabledTestFeatureControls, modelGateway: false }
      };
    if (reason === 'already-cancelled') controller.abort();
    const h = fixture(options);
    await expect(
      h.gateway.invoke(modelGatewayRequest(request), { signal: controller.signal })
    ).rejects.toBeDefined();
    expect(h.validate).not.toHaveBeenCalled();
    noAttempt(h);
  });

  it.each(['true', 'false', 'throw', 'promise'] as const)(
    'prioritizes cancellation during validator %s',
    async (outcome) => {
      const controller = new AbortController();
      const h = fixture({
        validate: () => {
          controller.abort();
          if (outcome === 'throw') throw new Error('private-validator-marker');
          if (outcome === 'promise') return Promise.reject(new Error('private-validator-marker'));
          return outcome === 'true';
        }
      });
      await expect(
        h.gateway.invoke(modelGatewayRequest(), { signal: controller.signal })
      ).rejects.toMatchObject({ code: 'TIMEOUT_ERROR', statusCode: 408 });
      noAttempt(h);
    }
  );

  it('revalidates a legitimate retry and fallback without repeating first-use secrets', async () => {
    const h = fixture();
    h.invoke.mockRejectedValue(new ProviderAdapterError('unavailable'));
    const response = await h.gateway.invoke(modelGatewayRequest());
    expect(response.fallback_used).toBe(true);
    expect(h.validate).toHaveBeenCalledTimes(2);
    expect(h.fallbackValidate).toHaveBeenCalledOnce();
    expect(h.getSecret).toHaveBeenCalledTimes(2);
    expect(h.count).toHaveBeenCalledTimes(2);
    expect(h.fallbackCount).toHaveBeenCalledOnce();
    expect(h.reserve).toHaveBeenCalledTimes(3);
    expect(h.settle).toHaveBeenCalledOnce();
    expect(h.order).toEqual([
      'validate',
      'secret',
      'count',
      'validate',
      'count',
      'fallback-validate',
      'secret',
      'fallback-count',
      'fallback-invoke'
    ]);
    const snapshot = h.validate.mock.calls[0]?.[0];
    expect(h.validate.mock.calls[1]?.[0]).toBe(snapshot);
    expect(h.fallbackValidate.mock.calls[0]?.[0]).toBe(snapshot);
  });

  it.each(['false', 'throw'] as const)(
    'stops incompatible fallback %s before new effects and retains prior liability',
    async (outcome) => {
      const h = fixture({
        fallbackValidate: () => {
          if (outcome === 'throw') throw new Error('private-validator-marker');
          return false;
        },
        dependencies: { policy: { ...policy, max_retries: 0 } }
      });
      h.invoke.mockRejectedValue(new ProviderAdapterError('unavailable'));
      await expect(h.gateway.invoke(modelGatewayRequest())).rejects.toMatchObject({
        code: outcome === 'false' ? 'VALIDATION_ERROR' : 'CONFIGURATION_ERROR'
      });
      expect(h.getSecret).toHaveBeenCalledOnce();
      expect(h.count).toHaveBeenCalledOnce();
      expect(h.reserve).toHaveBeenCalledOnce();
      expect(h.settle).not.toHaveBeenCalled();
      expect(h.fallbackCount).not.toHaveBeenCalled();
      expect(h.fallbackInvoke).not.toHaveBeenCalled();
      expect(h.metrics).toEqual([]);
      const row = [...h.ledger.rows.values()][0];
      expect(row?.receipt.state).toBe('unresolved');
      expect(row?.settlement).toBeUndefined();
      expect(JSON.stringify(h.audits.at(-1))).toContain(row?.receipt.attempt_id ?? 'missing');
      expect(JSON.stringify(h.audits.at(-1))).toContain('unresolved');
      expect(h.audits.at(-1)).toMatchObject({
        stage: 'request_validation',
        model_id: fallbackModel.model_id
      });
    }
  );

  it('does not clear an earlier liability when a faulty stateful predicate rejects a retry', async () => {
    let calls = 0;
    const h = fixture({ validate: () => ++calls === 1 });
    h.invoke.mockRejectedValue(new ProviderAdapterError('unavailable'));
    await expect(h.gateway.invoke(modelGatewayRequest())).rejects.toMatchObject({
      code: 'VALIDATION_ERROR'
    });
    expect(h.count).toHaveBeenCalledOnce();
    expect(h.reserve).toHaveBeenCalledOnce();
    expect(h.fallbackValidate).not.toHaveBeenCalled();
    expect(h.settle).not.toHaveBeenCalled();
    expect(JSON.stringify(h.audits.at(-1))).toContain('unresolved');
  });

  it('retains bounded failure reporting when audit never acknowledges', async () => {
    vi.useFakeTimers();
    const emit = vi.fn(() => new Promise<void>(() => undefined));
    const h = fixture({ validate: () => false, dependencies: { audit: { emit } } });
    const pending = h.gateway.invoke(modelGatewayRequest()).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(1001);
    expect(await pending).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(emit).toHaveBeenCalledOnce();
    noAttempt(h);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects a copied model identity instead of looking up a caller-selected schema', () => {
    const h = fixture();
    expect(() => {
      h.registry.validateInput({ ...primaryModel }, { message: 'safe' });
    }).toThrow('Model input validator failed');
    expect(h.validate).not.toHaveBeenCalled();
  });
});
