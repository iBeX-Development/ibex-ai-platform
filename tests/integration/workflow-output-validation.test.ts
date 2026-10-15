import type { Span } from '@opentelemetry/api';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { AuditRecord } from '../../packages/audit/src/index.js';
import {
  LocalModelSchemaCatalog,
  ModelRegistry,
  ProviderAdapterError,
  WorkflowOutputCatalog,
  type AccountingSettlementCommand,
  type ModelGatewayDependencies,
  type ModelUsageMetric,
  type ProviderResult
} from '../../packages/model-gateway/src/index.js';
import { tracer } from '../../packages/observability/src/index.js';
import {
  createModelGateway,
  primaryProvider,
  fallbackProvider,
  primaryModel,
  fallbackModel,
  modelSchemaCatalog,
  modelGatewayRequest,
  modelContext
} from '../testing/model-gateway-fixtures.js';
import {
  SyntheticAccountingPort,
  syntheticBudgetPolicy
} from '../testing/model-accounting-fixtures.js';

const wire = 'synthetic.workflow.opaque.v17';
const reference = { schema_id: 'synthetic.workflow.output', schema_version: '2' };
const schema = z.object({ values: z.array(z.string()) }).strict();
const request = (overrides: Record<string, unknown> = {}) =>
  modelGatewayRequest({ requires_structured_output: true, output_schema_id: wire, ...overrides });
function envelope(includeStructured = true): ProviderResult {
  return {
    result: { message: 'synthetic model result' },
    ...(includeStructured ? { structured_output: { values: ['private-output-marker'] } } : {}),
    input_tokens: 10,
    output_tokens: 5,
    finish_reason: 'stop',
    policy_flags: []
  };
}
function harness(
  options: {
    validate?: (output: unknown) => unknown;
    raw?: ProviderResult;
    dependencies?: Partial<ModelGatewayDependencies>;
  } = {}
) {
  const validate = vi.fn(
    options.validate ?? ((output: unknown) => schema.safeParse(output).success)
  );
  const other = vi.fn(() => false);
  const schemas = new LocalModelSchemaCatalog([
    { reference, validate },
    { reference: { ...reference, schema_version: '17' }, validate: other }
  ]);
  const catalog = new WorkflowOutputCatalog([{ output_schema_id: wire, reference }], schemas);
  const registry = new ModelRegistry(
    [primaryProvider, fallbackProvider].map((provider) => ({
      ...provider,
      mode: 'live',
      endpoint: 'https://synthetic.example.invalid',
      credential_reference: 'SYNTHETIC_KEY'
    })),
    [primaryModel, fallbackModel],
    modelSchemaCatalog
  );
  const modelValidate = vi.spyOn(registry, 'validateOutput');
  const raw = options.raw ?? envelope();
  const invoke = vi.fn(() => Promise.resolve(raw));
  const fallback = vi.fn(() => Promise.resolve(envelope()));
  const count = vi.fn(() => Promise.resolve(32));
  const secret = vi.fn(() => Promise.resolve('synthetic-secret'));
  const ledger = new SyntheticAccountingPort();
  const reserve = vi.spyOn(ledger, 'reserve');
  const settle = vi.spyOn(ledger, 'settle');
  const audits: AuditRecord[] = [],
    metrics: ModelUsageMetric[] = [];
  const gateway = createModelGateway(audits, metrics, {
    registry,
    workflowOutputs: catalog,
    adapters: [primaryProvider, fallbackProvider].map((provider, index) => ({
      adapter_id: provider.adapter_id,
      invoke: index ? fallback : invoke,
      tokenBounds: {
        version: 'synthetic-workflow-1',
        enforces_input_bound: true,
        enforces_output_limit: true,
        countInputTokens: count
      }
    })),
    secretProvider: { getSecret: secret },
    policy: {
      version: 'model-policy-1.0',
      required_permission: 'ai:model:invoke',
      agent_capabilities: { general: ['MG-GENERAL'] },
      timeout_ms: 1000,
      max_retries: 1,
      fallback_enabled: true,
      maximum_input_bytes: 16384
    },
    accounting: { policy: syntheticBudgetPolicy, port: ledger },
    ...options.dependencies
  });
  return {
    gateway,
    validate,
    other,
    modelValidate,
    raw,
    invoke,
    fallback,
    count,
    secret,
    ledger,
    reserve,
    settle,
    audits,
    metrics
  };
}
function terminal(h: ReturnType<typeof harness>, code: string, state: string) {
  expect(h.invoke).toHaveBeenCalledOnce();
  expect(h.fallback).not.toHaveBeenCalled();
  expect(h.other).not.toHaveBeenCalled();
  expect(h.metrics).toEqual([]);
  expect(h.audits.at(-1)).toMatchObject({ error_code: code, accounting: { state } });
  expect(JSON.stringify(h.audits)).not.toMatch(/private-output-marker|private-validator-marker/);
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('AQ07 workflow output enforcement', () => {
  it('resolves once before side effects and returns the owned frozen structured snapshot', async () => {
    const raw = envelope();
    const h = harness({ raw });
    const resolve = vi.spyOn(WorkflowOutputCatalog.prototype, 'resolve');
    const schemaResolve = vi.spyOn(LocalModelSchemaCatalog.prototype, 'resolve');
    const mutate = () => (raw.structured_output as { values: string[] }).values.push('changed');
    h.settle.mockImplementation(async (command: AccountingSettlementCommand) => {
      mutate();
      return SyntheticAccountingPort.prototype.settle.call(h.ledger, command);
    });
    const response = await h.gateway.invoke(request());
    expect(resolve).toHaveBeenCalledExactlyOnceWith(wire);
    expect(schemaResolve).not.toHaveBeenCalled();
    const secretCall = h.secret.mock.invocationCallOrder[0];
    if (secretCall === undefined) throw new Error('Missing synthetic secret lookup');
    expect(resolve.mock.invocationCallOrder[0]).toBeLessThan(secretCall);
    expect(response.structured_output).toBe(h.validate.mock.calls[0]?.[0]);
    expect(response.structured_output).toEqual({ values: ['private-output-marker'] });
    expect(Object.isFrozen(response.structured_output)).toBe(true);
    expect(Object.isFrozen((response.structured_output as { values: string[] }).values)).toBe(true);
    expect(Object.isFrozen(raw.structured_output)).toBe(false);
    expect(h.modelValidate).toHaveBeenCalledOnce();
    expect(h.settle).toHaveBeenCalledOnce();
    expect(h.other).not.toHaveBeenCalled();
  });

  it.each(['unknown.v17', 'synthetic.workflow.opaque.v2', ` ${wire}`, `${wire} `])(
    'rejects exact unknown ID %s before side effects',
    async (id) => {
      const h = harness();
      await expect(h.gateway.invoke(request({ output_schema_id: id }))).rejects.toMatchObject({
        code: 'VALIDATION_ERROR'
      });
      for (const spy of [h.secret, h.count, h.reserve, h.settle, h.invoke, h.fallback, h.validate])
        expect(spy).not.toHaveBeenCalled();
    }
  );

  it('checks policy before exposing workflow resolution and requires a configured catalog', async () => {
    const h = harness();
    const resolve = vi.spyOn(WorkflowOutputCatalog.prototype, 'resolve');
    await expect(
      h.gateway.invoke(
        request({ context: { ...modelContext, permissions: [] }, output_schema_id: 'unknown' })
      )
    ).rejects.toMatchObject({ code: 'POLICY_DENIED' });
    expect(resolve).not.toHaveBeenCalled();
    const absent = harness({ dependencies: { workflowOutputs: undefined } });
    await expect(absent.gateway.invoke(request())).rejects.toMatchObject({
      code: 'CONFIGURATION_ERROR'
    });
    expect(absent.reserve).not.toHaveBeenCalled();
  });

  it.each([undefined, null, 'wrong shape', {}, { values: [1] }, { values: [], extra: true }])(
    'settles once for missing/null/invalid structured output %j',
    async (structured_output) => {
      const raw =
        structured_output === undefined ? envelope(false) : { ...envelope(), structured_output };
      const h = harness({ raw });
      await expect(h.gateway.invoke(request())).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
      expect(h.settle).toHaveBeenCalledOnce();
      expect(h.settle.mock.calls[0]?.[0].usage).toEqual({
        input_tokens: 10,
        output_tokens: 5,
        cost_units: 20
      });
      terminal(h, 'INVALID_RESPONSE', 'settled');
    }
  );

  it('does not let valid workflow output rescue invalid registered model output', async () => {
    const h = harness({ raw: { ...envelope(), result: { wrong: true } } });
    await expect(h.gateway.invoke(request())).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    expect(h.modelValidate).toHaveBeenCalledOnce();
    expect(h.validate).not.toHaveBeenCalled();
    expect(h.settle).toHaveBeenCalledOnce();
    terminal(h, 'INVALID_RESPONSE', 'settled');
  });

  it.each([undefined, null])(
    'requires structured output even when a predicate accepts anything: %j',
    async (structured_output) => {
      const h = harness({ raw: { ...envelope(), structured_output }, validate: () => true });
      await expect(h.gateway.invoke(request())).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
      expect(h.validate).not.toHaveBeenCalled();
      expect(h.settle).toHaveBeenCalledOnce();
      terminal(h, 'INVALID_RESPONSE', 'settled');
    }
  );

  it('rejects predicate mutation of the frozen snapshot without mutating provider data', async () => {
    const raw = envelope();
    const h = harness({
      raw,
      validate: (output) => {
        (output as { values: string[] }).values.push('changed');
        return true;
      }
    });
    await expect(h.gateway.invoke(request())).rejects.toMatchObject({
      code: 'CONFIGURATION_ERROR'
    });
    expect(raw.structured_output).toEqual({ values: ['private-output-marker'] });
    expect(h.settle).toHaveBeenCalledOnce();
    terminal(h, 'CONFIGURATION_ERROR', 'settled');
  });

  it.each([
    ['false', (): unknown => false, 'INVALID_RESPONSE'],
    [
      'throw',
      (): unknown => {
        throw new Error('private-validator-marker');
      },
      'CONFIGURATION_ERROR'
    ],
    ['string', (): unknown => 'private-validator-marker', 'CONFIGURATION_ERROR'],
    ['object', (): unknown => ({}), 'CONFIGURATION_ERROR'],
    ['number', (): unknown => 1, 'CONFIGURATION_ERROR'],
    ['undefined', (): unknown => undefined, 'CONFIGURATION_ERROR'],
    ['promise true', (): unknown => Promise.resolve(true), 'CONFIGURATION_ERROR'],
    ['promise false', (): unknown => Promise.resolve(false), 'CONFIGURATION_ERROR'],
    [
      'promise reject',
      (): unknown => Promise.reject(new Error('private-validator-marker')),
      'CONFIGURATION_ERROR'
    ]
  ] as const)(
    'sanitizes workflow predicate %s and settles known usage without replay',
    async (_name, validate, code) => {
      const span = {
        setAttribute: vi.fn(),
        setAttributes: vi.fn(),
        recordException: vi.fn(),
        setStatus: vi.fn(),
        end: vi.fn()
      };
      vi.spyOn(tracer, 'startActiveSpan').mockImplementation((...args) =>
        (args.at(-1) as (span: Span) => unknown)(span as unknown as Span)
      );
      const h = harness({ validate });
      const error: unknown = await h.gateway.invoke(request()).catch((caught: unknown) => caught);
      expect(error).toMatchObject({ code });
      expect(JSON.stringify(error)).not.toMatch(/private-output-marker|private-validator-marker/);
      expect(
        JSON.stringify([span.setAttributes.mock.calls, span.setAttribute.mock.calls])
      ).not.toMatch(/private-output-marker|private-validator-marker/);
      expect(span.recordException).toHaveBeenCalledExactlyOnceWith(
        new Error('Model Gateway invocation failed')
      );
      expect(h.settle).toHaveBeenCalledOnce();
      terminal(h, code, 'settled');
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  );

  it('observes late predicate rejection without waiting or accepting it', async () => {
    let reject!: (error: Error) => void;
    const pending = new Promise<boolean>((_resolve, no) => {
      reject = no;
    });
    const h = harness({ validate: () => pending });
    await expect(h.gateway.invoke(request())).rejects.toMatchObject({
      code: 'CONFIGURATION_ERROR'
    });
    reject(new Error('private-validator-marker'));
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(h.settle).toHaveBeenCalledOnce();
    terminal(h, 'CONFIGURATION_ERROR', 'settled');
  });

  it.each(['true', 'false', 'throw', 'promise'] as const)(
    'prioritizes cancellation during predicate %s and retains liability',
    async (outcome) => {
      const controller = new AbortController();
      const h = harness({
        validate: () => {
          controller.abort();
          if (outcome === 'throw') throw new Error('private-validator-marker');
          if (outcome === 'promise') return Promise.reject(new Error('private-validator-marker'));
          return outcome === 'true';
        }
      });
      await expect(
        h.gateway.invoke(request(), { signal: controller.signal })
      ).rejects.toMatchObject({ code: 'TIMEOUT_ERROR' });
      expect(h.settle).not.toHaveBeenCalled();
      terminal(h, 'TIMEOUT_ERROR', 'unresolved');
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  );

  it('retains unresolved liability when invalid output settlement loses acknowledgement', async () => {
    vi.useFakeTimers();
    const h = harness({ validate: () => false });
    h.settle.mockImplementation(() => new Promise(() => undefined));
    const result = h.gateway.invoke(request()).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(101);
    expect(await result).toMatchObject({ code: 'DEPENDENCY_ERROR' });
    expect(h.settle).toHaveBeenCalledOnce();
    terminal(h, 'DEPENDENCY_ERROR', 'unresolved');
  });

  it('keeps cancellation precedence while settling invalid output', async () => {
    const controller = new AbortController();
    const h = harness({ validate: () => false });
    h.settle.mockImplementation(async (command) => {
      const receipt = await SyntheticAccountingPort.prototype.settle.call(h.ledger, command);
      controller.abort();
      return receipt;
    });
    await expect(h.gateway.invoke(request(), { signal: controller.signal })).rejects.toMatchObject({
      code: 'TIMEOUT_ERROR'
    });
    expect(h.settle).toHaveBeenCalledOnce();
    terminal(h, 'TIMEOUT_ERROR', 'unresolved');
  });

  it('selects a binding only once across genuine retry and fallback', async () => {
    const h = harness();
    const resolve = vi.spyOn(WorkflowOutputCatalog.prototype, 'resolve');
    h.invoke.mockRejectedValue(new ProviderAdapterError('unavailable'));
    const response = await h.gateway.invoke(request());
    expect(response.fallback_used).toBe(true);
    expect(resolve).toHaveBeenCalledOnce();
    expect(h.invoke).toHaveBeenCalledTimes(2);
    expect(h.fallback).toHaveBeenCalledOnce();
    expect(h.validate).toHaveBeenCalledOnce();
    expect(h.settle).toHaveBeenCalledOnce();
  });

  it('leaves unstructured advisory IDs and optional structured data unchanged', async () => {
    const h = harness({ raw: { ...envelope(), structured_output: { advisory: true } } });
    const resolve = vi.spyOn(WorkflowOutputCatalog.prototype, 'resolve');
    const response = await h.gateway.invoke(
      request({ requires_structured_output: false, output_schema_id: 'unregistered.advisory' })
    );
    expect(response.structured_output).toEqual({ advisory: true });
    expect(resolve).not.toHaveBeenCalled();
    expect(h.validate).not.toHaveBeenCalled();
    expect(h.modelValidate).toHaveBeenCalledOnce();
  });
});
