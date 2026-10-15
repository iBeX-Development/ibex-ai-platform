import type { Span } from '@opentelemetry/api';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { AuditRecord } from '../../packages/audit/src/index.js';
import { PlatformError } from '../../packages/errors/src/index.js';
import {
  LocalModelSchemaCatalog,
  ModelRegistry,
  ProviderAdapterError,
  type AccountingReceipt,
  type AccountingReservationCommand,
  type AccountingSettlementCommand,
  type ModelGatewayDependencies,
  type ModelUsageMetric,
  type ProviderResult
} from '../../packages/model-gateway/src/index.js';
import { tracer } from '../../packages/observability/src/index.js';
import {
  createModelGateway,
  fallbackModel,
  fallbackProvider,
  modelGatewayRequest,
  modelGatewayValidationTime,
  primaryModel,
  primaryProvider
} from '../testing/model-gateway-fixtures.js';
import {
  SyntheticAccountingPort,
  syntheticBudgetPolicy
} from '../testing/model-accounting-fixtures.js';

const message = z.object({ message: z.string() }).strict();
const reference = (schema_id: string, schema_version = '1') => ({ schema_id, schema_version });
function envelope(result: unknown = { message: 'private-output-marker' }): ProviderResult {
  return { result, input_tokens: 10, output_tokens: 5, finish_reason: 'stop', policy_flags: [] };
}
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
    envelope?: unknown;
    validate?: (output: unknown) => unknown;
    dependencies?: Partial<ModelGatewayDependencies>;
  } = {}
) {
  const input = vi.fn((payload: unknown) => message.safeParse(payload).success);
  const validate = vi.fn(
    options.validate ?? ((payload: unknown) => message.safeParse(payload).success)
  );
  const otherVersion = vi.fn(() => false);
  const fallbackValidate = vi.fn((payload: unknown) => message.safeParse(payload).success);
  const catalog = new LocalModelSchemaCatalog([
    { reference: reference('input'), validate: input },
    { reference: reference('output'), validate },
    { reference: reference('output', '2'), validate: otherVersion },
    { reference: reference('fallback'), validate: fallbackValidate }
  ]);
  const registry = new ModelRegistry(
    [primaryProvider, fallbackProvider],
    [primaryModel, fallbackModel].map((model, index) => ({
      ...model,
      input_type: { modalities: ['text'], schema: reference('input') },
      output_type: { modalities: ['text'], schema: reference(index ? 'fallback' : 'output') }
    })),
    catalog
  );
  const raw: unknown = Object.hasOwn(options, 'envelope') ? options.envelope : envelope();
  const invoke = vi.fn(() => Promise.resolve(raw as ProviderResult));
  const fallbackInvoke = vi.fn(() => Promise.resolve(envelope()));
  const ledger = new SyntheticAccountingPort();
  const reserve = vi.fn((command: AccountingReservationCommand) => ledger.reserve(command));
  const settle = vi.fn((command: AccountingSettlementCommand) => ledger.settle(command));
  const audits: AuditRecord[] = [];
  const metrics: ModelUsageMetric[] = [];
  const emit = vi.fn((record: AuditRecord) => {
    audits.push(record);
    return Promise.resolve();
  });
  const gateway = createModelGateway(audits, metrics, {
    registry,
    policy,
    accounting: { policy: syntheticBudgetPolicy, port: { reserve, settle } },
    audit: { emit },
    adapters: [
      { adapter_id: primaryProvider.adapter_id, invoke },
      { adapter_id: fallbackProvider.adapter_id, invoke: fallbackInvoke }
    ],
    ...options.dependencies
  });
  return {
    gateway,
    registry,
    input,
    validate,
    otherVersion,
    fallbackValidate,
    invoke,
    fallbackInvoke,
    ledger,
    reserve,
    settle,
    audits,
    metrics,
    emit
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function row(h: ReturnType<typeof fixture>) {
  const first = [...h.ledger.rows.values()][0];
  if (!first) throw new Error('Missing synthetic reservation');
  return first;
}
function terminal(
  h: ReturnType<typeof fixture>,
  code: string,
  state: 'settled' | 'unresolved',
  stage = 'response_validation'
) {
  expect(h.invoke).toHaveBeenCalledOnce();
  expect(h.fallbackInvoke).not.toHaveBeenCalled();
  expect(h.otherVersion).not.toHaveBeenCalled();
  expect(h.fallbackValidate).not.toHaveBeenCalled();
  expect(h.metrics).toEqual([]);
  expect(h.audits.at(-1)).toMatchObject({
    error_code: code,
    stage,
    accounting: {
      state,
      attempt_id: row(h).receipt.attempt_id,
      command_hash:
        state === 'settled' ? row(h).settlement?.command_hash : row(h).command.command_hash
    }
  });
  expect(h.audits.every((record) => !('outcome' in record) || record.outcome !== 'succeeded')).toBe(
    true
  );
  expect(JSON.stringify(h.audits)).not.toMatch(
    /private-output-marker|private-validator-marker|private-diagnostic-marker/
  );
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

describe('Model output validation and accounting', () => {
  it('uses the exact owned output binding and returns its frozen snapshot across settlement and telemetry awaits', async () => {
    const raw = {
      ...envelope({ message: 'private-output-marker', nested: ['original'] }),
      policy_flags: [] as string[],
      structured_output: { tool: { args: ['original'] } }
    };
    const schema = z.object({ message: z.string(), nested: z.array(z.string()) }).strict();
    const mutate = () => {
      (raw.result as { message: string; nested: string[] }).nested.push('changed');
      raw.structured_output.tool.args.push('changed');
      raw.input_tokens = 31;
      raw.policy_flags.push('changed');
    };
    const h = fixture({
      envelope: raw,
      validate: (value) => schema.safeParse(value).success,
      dependencies: {
        metrics: {
          emit: () => {
            mutate();
            return Promise.resolve();
          }
        }
      }
    });
    const resolve = vi
      .spyOn(LocalModelSchemaCatalog.prototype, 'resolve')
      .mockImplementation(() => {
        throw new Error('Unexpected schema lookup');
      });
    h.settle.mockImplementation(async (command) => {
      mutate();
      return h.ledger.settle(command);
    });
    const response = await h.gateway.invoke(
      modelGatewayRequest({
        requires_structured_output: true,
        output_schema_id: 'workflow.unregistered.v17'
      }),
      {},
      modelGatewayValidationTime
    );
    const snapshot = h.validate.mock.calls[0]?.[0];
    expect(response.result).toBe(snapshot);
    expect(response.result).toEqual({ message: 'private-output-marker', nested: ['original'] });
    expect(response.structured_output).toEqual({ tool: { args: ['original'] } });
    expect(response.result).not.toBe(raw.result);
    expect(response.structured_output).not.toBe(raw.structured_output);
    expect(Object.isFrozen(response.result)).toBe(true);
    expect(Object.isFrozen((response.result as { nested: string[] }).nested)).toBe(true);
    expect(
      Object.isFrozen((response.structured_output as typeof raw.structured_output).tool.args)
    ).toBe(true);
    expect(Object.isFrozen(raw.result)).toBe(false);
    expect(Object.isFrozen(raw.structured_output.tool.args)).toBe(false);
    expect(response.policy_flags).toEqual([]);
    expect(response.usage).toMatchObject({ input_tokens: 10, output_tokens: 5 });
    expect(h.settle).toHaveBeenCalledOnce();
    expect(row(h).settlement?.usage).toEqual({
      input_tokens: 10,
      output_tokens: 5,
      cost_units: 20
    });
    expect(h.input).toHaveBeenCalledOnce();
    expect(h.validate).toHaveBeenCalledOnce();
    expect(h.otherVersion).not.toHaveBeenCalled();
    expect(h.fallbackValidate).not.toHaveBeenCalled();
    expect(resolve).not.toHaveBeenCalled();
  });

  it.each([null, true, 0, -0, 'text', [], { a: null, list: [false, 2, 'text'] }])(
    'preserves valid JSON values %j without coercion',
    async (value) => {
      const h = fixture({ envelope: envelope(value), validate: () => true });
      const response = await h.gateway.invoke(modelGatewayRequest());
      expect(response.result).toEqual(value);
      expect(response.result).toBe(h.validate.mock.calls[0]?.[0]);
      expect(h.settle).toHaveBeenCalledOnce();
    }
  );

  it('preserves own __proto__ data without changing the snapshot prototype', async () => {
    const value: unknown = JSON.parse('{"__proto__":{"message":"safe"}}');
    const h = fixture({ envelope: envelope(value), validate: () => true });
    const response = await h.gateway.invoke(modelGatewayRequest());
    expect(response.result).toEqual(value);
    expect(Object.getPrototypeOf(response.result)).toBe(Object.prototype);
    expect(Object.hasOwn(response.result as object, '__proto__')).toBe(true);
  });

  it.each([
    ['false', (): unknown => false, 'INVALID_RESPONSE', 502],
    [
      'throw',
      (): unknown => {
        throw new Error('private-validator-marker');
      },
      'CONFIGURATION_ERROR',
      500
    ],
    [
      'non-Error throw',
      (): unknown => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- Faulty server predicate regression.
        throw 'private-validator-marker';
      },
      'CONFIGURATION_ERROR',
      500
    ],
    ['undefined', (): unknown => undefined, 'CONFIGURATION_ERROR', 500],
    ['truthy string', (): unknown => 'private-validator-marker', 'CONFIGURATION_ERROR', 500],
    ['truthy number', (): unknown => 1, 'CONFIGURATION_ERROR', 500],
    ['object', (): unknown => ({}), 'CONFIGURATION_ERROR', 500],
    ['Promise true', (): unknown => Promise.resolve(true), 'CONFIGURATION_ERROR', 500],
    ['Promise false', (): unknown => Promise.resolve(false), 'CONFIGURATION_ERROR', 500],
    [
      'Promise reject',
      (): unknown => Promise.reject(new Error('private-validator-marker')),
      'CONFIGURATION_ERROR',
      500
    ]
  ] as const)(
    'settles trustworthy usage exactly once for %s and reports sanitized failure',
    async (_label, validate, code, statusCode) => {
      const span = captureSpan();
      const h = fixture({ validate });
      const error: unknown = await h.gateway
        .invoke(modelGatewayRequest())
        .catch((failure: unknown) => failure);
      expect(error).toMatchObject({ code, statusCode });
      expect(JSON.stringify(error)).not.toContain('private-validator-marker');
      expect(h.settle).toHaveBeenCalledOnce();
      expect(row(h).settlement?.usage).toEqual({
        input_tokens: 10,
        output_tokens: 5,
        cost_units: 20
      });
      expect(row(h).receipt.state).toBe('settled');
      terminal(h, code, 'settled');
      expect(
        JSON.stringify([
          span.setAttribute.mock.calls,
          span.setAttributes.mock.calls,
          span.addEvent.mock.calls
        ])
      ).not.toMatch(/private-output-marker|private-validator-marker/);
      expect(span.recordException).toHaveBeenCalledExactlyOnceWith(
        new Error('Model Gateway invocation failed')
      );
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  );

  it.each(['fulfill', 'reject'] as const)(
    'observes late async predicate %s without acceptance or replay',
    async (outcome) => {
      const pending = deferred<boolean>();
      const h = fixture({ validate: () => pending.promise });
      await expect(h.gateway.invoke(modelGatewayRequest())).rejects.toMatchObject({
        code: 'CONFIGURATION_ERROR'
      });
      if (outcome === 'fulfill') pending.resolve(true);
      else pending.reject(new Error('private-validator-marker'));
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(h.settle).toHaveBeenCalledOnce();
      terminal(h, 'CONFIGURATION_ERROR', 'settled');
    }
  );

  it('charges known usage after a validator attempts to mutate the owned snapshot', async () => {
    const raw = envelope();
    const h = fixture({
      envelope: raw,
      validate: (value) => {
        (value as { message: string }).message = 'mutated';
        return true;
      }
    });
    await expect(h.gateway.invoke(modelGatewayRequest())).rejects.toMatchObject({
      code: 'CONFIGURATION_ERROR'
    });
    expect(raw.result).toEqual({ message: 'private-output-marker' });
    expect(Object.isFrozen(raw.result)).toBe(false);
    expect(h.settle).toHaveBeenCalledOnce();
    terminal(h, 'CONFIGURATION_ERROR', 'settled');
  });

  const invalidData: readonly (readonly [string, () => unknown])[] = [
    ['undefined', () => undefined],
    ['NaN', () => NaN],
    ['Infinity', () => Infinity],
    ['bigint', () => 1n],
    ['function', () => () => true],
    ['symbol', () => Symbol('private-output-marker')],
    ['date', () => new Date(0)],
    ['map', () => new Map()],
    [
      'cycle',
      () => {
        const value: Record<string, unknown> = {};
        value.self = value;
        return value;
      }
    ],
    ['sparse array', () => new Array<unknown>(2)],
    ['extra array field', () => Object.assign(['a'], { extra: 'private-output-marker' })],
    ['symbol field', () => ({ [Symbol('private-output-marker')]: true })],
    ['hidden field', () => Object.defineProperty({}, 'hidden', { value: 'private-output-marker' })],
    ['undefined child', () => ({ message: undefined })],
    ['unsupported prototype', () => Object.create({ inherited: true }) as unknown],
    [
      'throwing proxy',
      () =>
        new Proxy(
          {},
          {
            ownKeys: () => {
              throw new Error('private-diagnostic-marker');
            }
          }
        )
    ]
  ];
  it.each(
    invalidData.flatMap(([label, create]) =>
      (['result', 'structured_output'] as const)
        // Optional undefined structured_output is the existing absent-value convention.
        .filter((field) => field !== 'structured_output' || label !== 'undefined')
        .map((field) => ({ label, create, field }))
    )
  )('rejects non-JSON $field: $label without losing known usage', async ({ create, field }) => {
    const raw = { ...envelope(), [field]: create() };
    const h = fixture({ envelope: raw, validate: () => true });
    await expect(h.gateway.invoke(modelGatewayRequest())).rejects.toMatchObject({
      code: 'INVALID_RESPONSE'
    });
    expect(h.validate).not.toHaveBeenCalled();
    expect(h.settle).toHaveBeenCalledOnce();
    terminal(h, 'INVALID_RESPONSE', 'settled');
  });

  it.each(['accessor', 'toJSON'] as const)(
    'does not execute or coerce provider %s during snapshotting',
    async (kind) => {
      const read = vi.fn(() => 'private-output-marker');
      const value =
        kind === 'accessor'
          ? Object.defineProperty({}, 'message', { enumerable: true, get: read })
          : { toJSON: read };
      const h = fixture({ envelope: envelope(value), validate: () => true });
      await expect(h.gateway.invoke(modelGatewayRequest())).rejects.toMatchObject({
        code: 'INVALID_RESPONSE'
      });
      expect(read).not.toHaveBeenCalled();
      expect(h.settle).toHaveBeenCalledOnce();
      terminal(h, 'INVALID_RESPONSE', 'settled');
    }
  );

  it.each([
    ['negative', { input_tokens: -1 }],
    ['fraction', { output_tokens: 1.5 }],
    ['NaN', { input_tokens: NaN }],
    ['Infinity', { output_tokens: Infinity }],
    ['unsafe integer', { input_tokens: Number.MAX_SAFE_INTEGER + 1 }],
    ['string count', { input_tokens: '10' }],
    ['input over bound', { input_tokens: 33 }],
    ['output over bound', { output_tokens: 65 }],
    ['missing usage', { output_tokens: undefined }],
    ['invalid finish reason', { finish_reason: '' }],
    ['invalid flags', { policy_flags: [3] }],
    ['extra envelope field', { private_diagnostics: 'private-diagnostic-marker' }]
  ] as const)(
    'retains reservation for %s without partially salvaging usage',
    async (_label, fields) => {
      const h = fixture({ envelope: { ...envelope(), ...fields } });
      await expect(h.gateway.invoke(modelGatewayRequest())).rejects.toMatchObject({
        code: 'INVALID_RESPONSE'
      });
      expect(h.validate).not.toHaveBeenCalled();
      expect(h.settle).not.toHaveBeenCalled();
      expect(row(h).receipt.state).toBe('unresolved');
      terminal(h, 'INVALID_RESPONSE', 'unresolved');
    }
  );

  it.each([null, undefined, [], {}])('holds liability for a malformed envelope %j', async (raw) => {
    const h = fixture({ envelope: raw });
    await expect(h.gateway.invoke(modelGatewayRequest())).rejects.toMatchObject({
      code: 'INVALID_RESPONSE'
    });
    expect(h.settle).not.toHaveBeenCalled();
    terminal(h, 'INVALID_RESPONSE', 'unresolved');
  });

  it('holds liability when envelope access throws instead of trusting partial usage', async () => {
    const h = fixture({
      envelope: {
        ...envelope(),
        get finish_reason(): string {
          throw new Error('private-diagnostic-marker');
        }
      }
    });
    await expect(h.gateway.invoke(modelGatewayRequest())).rejects.toMatchObject({
      code: 'INVALID_RESPONSE'
    });
    expect(h.settle).not.toHaveBeenCalled();
    terminal(h, 'INVALID_RESPONSE', 'unresolved');
  });

  it('terminates an adapter-declared invalid response without fallback', async () => {
    const h = fixture();
    h.invoke.mockRejectedValue(new ProviderAdapterError('invalid_response'));
    await expect(h.gateway.invoke(modelGatewayRequest())).rejects.toMatchObject({
      code: 'INVALID_RESPONSE'
    });
    expect(h.settle).not.toHaveBeenCalled();
    terminal(h, 'INVALID_RESPONSE', 'unresolved', 'provider_invocation');
  });

  it('preserves genuine retries/fallback and validates only the successful model output', async () => {
    const h = fixture();
    h.invoke.mockRejectedValue(new ProviderAdapterError('unavailable'));
    const response = await h.gateway.invoke(modelGatewayRequest());
    expect(response.fallback_used).toBe(true);
    expect(h.invoke).toHaveBeenCalledTimes(2);
    expect(h.fallbackInvoke).toHaveBeenCalledOnce();
    expect(h.validate).not.toHaveBeenCalled();
    expect(h.fallbackValidate).toHaveBeenCalledOnce();
    expect(h.settle).toHaveBeenCalledOnce();
    expect([...h.ledger.rows.values()].map((entry) => entry.receipt.state)).toEqual([
      'unresolved',
      'unresolved',
      'settled'
    ]);
  });

  it.each(['true', 'false', 'throw', 'promise'] as const)(
    'cancellation during validator %s prevents settlement under cancelled authority',
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
      ).rejects.toMatchObject({ code: 'TIMEOUT_ERROR' });
      expect(h.settle).not.toHaveBeenCalled();
      terminal(h, 'TIMEOUT_ERROR', 'unresolved');
    }
  );

  it('does not validate or settle when cancelled at provider completion', async () => {
    const controller = new AbortController();
    const h = fixture();
    h.invoke.mockImplementation(() => {
      controller.abort();
      return Promise.resolve(envelope());
    });
    await expect(
      h.gateway.invoke(modelGatewayRequest(), { signal: controller.signal })
    ).rejects.toMatchObject({ code: 'TIMEOUT_ERROR' });
    expect(h.validate).not.toHaveBeenCalled();
    expect(h.settle).not.toHaveBeenCalled();
    terminal(h, 'TIMEOUT_ERROR', 'unresolved', 'provider_invocation');
  });

  it.each(['reject', 'malformed', 'wrong hash', 'lost', 'late fulfill', 'late reject'] as const)(
    'retains unresolved local liability after %s settlement acknowledgement, even for invalid output',
    async (outcome) => {
      vi.useFakeTimers();
      const delayed = deferred<AccountingReceipt>();
      const h = fixture({ validate: () => false });
      let committed: AccountingReceipt | undefined;
      h.settle.mockImplementation(async (command) => {
        if (outcome === 'reject') throw new Error('private-diagnostic-marker');
        committed = await h.ledger.settle(command);
        if (outcome === 'malformed') return { ...committed, extra: 'private-diagnostic-marker' };
        if (outcome === 'wrong hash') return { ...committed, command_hash: 'wrong' };
        return delayed.promise;
      });
      const pending = h.gateway.invoke(modelGatewayRequest()).catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(101);
      expect(await pending).toMatchObject({ code: 'DEPENDENCY_ERROR' });
      expect(h.settle).toHaveBeenCalledOnce();
      expect(row(h).receipt.state).toBe(outcome === 'reject' ? 'unresolved' : 'settled');
      terminal(h, 'DEPENDENCY_ERROR', 'unresolved', 'accounting');
      if (outcome === 'late fulfill') {
        if (!committed) throw new Error('Missing test receipt');
        delayed.resolve(committed);
      }
      if (outcome === 'late reject') delayed.reject(new Error('private-diagnostic-marker'));
      await vi.advanceTimersByTimeAsync(0);
      expect(h.settle).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it('waits for timely verified settlement before reporting the saved output failure', async () => {
    vi.useFakeTimers();
    const ack = deferred<AccountingReceipt>();
    const h = fixture({ validate: () => false });
    let receipt: AccountingReceipt | undefined;
    h.settle.mockImplementation(async (command) => {
      receipt = await h.ledger.settle(command);
      return ack.promise;
    });
    const pending = h.gateway.invoke(modelGatewayRequest()).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(50);
    expect(h.audits).toEqual([]);
    if (!receipt) throw new Error('Missing test receipt');
    ack.resolve(receipt);
    expect(await pending).toMatchObject({ code: 'INVALID_RESPONSE' });
    expect(h.settle).toHaveBeenCalledOnce();
    terminal(h, 'INVALID_RESPONSE', 'settled');
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['before acknowledgement', 'during verified receipt'] as const)(
    'preserves cancellation priority and liability %s',
    async (phase) => {
      const controller = new AbortController();
      const h = fixture({ validate: () => false });
      h.settle.mockImplementation(async (command) => {
        const receipt = await h.ledger.settle(command);
        if (phase === 'before acknowledgement') {
          controller.abort();
          return receipt;
        }
        return {
          ...receipt,
          get warnings() {
            controller.abort();
            return receipt.warnings;
          }
        };
      });
      await expect(
        h.gateway.invoke(modelGatewayRequest(), { signal: controller.signal })
      ).rejects.toMatchObject({ code: 'TIMEOUT_ERROR' });
      expect(h.settle).toHaveBeenCalledOnce();
      expect(row(h).receipt.state).toBe('settled');
      terminal(
        h,
        'TIMEOUT_ERROR',
        phase === 'before acknowledgement' ? 'unresolved' : 'settled',
        phase === 'before acknowledgement' ? 'accounting' : 'response_validation'
      );
    }
  );

  it('keeps settled failure reporting bounded without emitting success evidence', async () => {
    vi.useFakeTimers();
    const h = fixture({ validate: () => false });
    h.emit.mockImplementation(() => new Promise<void>(() => undefined));
    const pending = h.gateway.invoke(modelGatewayRequest()).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(1001);
    expect(await pending).toMatchObject({ code: 'INVALID_RESPONSE' });
    expect(h.settle).toHaveBeenCalledOnce();
    expect(h.emit).toHaveBeenCalledOnce();
    expect(h.emit.mock.calls[0]?.[0]).toMatchObject({
      error_code: 'INVALID_RESPONSE',
      accounting: { state: 'settled' }
    });
    expect(h.metrics).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects copied model identities instead of resolving output schemas from caller metadata', () => {
    const h = fixture();
    expect(() => {
      h.registry.validateOutput({ ...primaryModel }, {});
    }).toThrow('Model output validator failed');
    expect(h.validate).not.toHaveBeenCalled();
  });

  it.each(['envelope', 'snapshot', 'predicate'] as const)(
    'sanitizes forged PlatformError diagnostics from %s',
    async (source) => {
      const fail = (): never => {
        throw new PlatformError('CONFIGURATION_ERROR', 'private-diagnostic-marker', 500);
      };
      const raw =
        source === 'envelope'
          ? {
              ...envelope(),
              get finish_reason(): string {
                return fail();
              }
            }
          : source === 'snapshot'
            ? envelope(new Proxy({}, { ownKeys: fail }))
            : envelope();
      const h = fixture({ envelope: raw, ...(source === 'predicate' ? { validate: fail } : {}) });
      const error: unknown = await h.gateway
        .invoke(modelGatewayRequest())
        .catch((failure: unknown) => failure);
      const code = source === 'predicate' ? 'CONFIGURATION_ERROR' : 'INVALID_RESPONSE';
      expect(error).toMatchObject({ code });
      expect(JSON.stringify(error)).not.toContain('private-diagnostic-marker');
      expect(h.settle).toHaveBeenCalledTimes(source === 'envelope' ? 0 : 1);
      terminal(h, code, source === 'envelope' ? 'unresolved' : 'settled');
    }
  );

  it('bounds failure reporting for an adapter-declared invalid response', async () => {
    vi.useFakeTimers();
    const h = fixture();
    h.invoke.mockRejectedValue(new ProviderAdapterError('invalid_response'));
    h.emit.mockImplementation(() => new Promise<void>(() => undefined));
    const pending = h.gateway.invoke(modelGatewayRequest()).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(1001);
    expect(await pending).toMatchObject({ code: 'INVALID_RESPONSE' });
    expect(h.emit).toHaveBeenCalledOnce();
    expect(h.emit.mock.calls[0]?.[0]).toMatchObject({
      stage: 'provider_invocation',
      accounting: { state: 'unresolved' }
    });
    expect(h.settle).not.toHaveBeenCalled();
    expect(h.fallbackInvoke).not.toHaveBeenCalled();
    expect(h.metrics).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not invoke the validator or settle if cancellation occurs during snapshot inspection', async () => {
    const controller = new AbortController();
    const value = new Proxy(
      { message: 'private-output-marker' },
      {
        ownKeys: (target) => {
          controller.abort();
          return Reflect.ownKeys(target);
        }
      }
    );
    const h = fixture({ envelope: envelope(value) });
    await expect(
      h.gateway.invoke(modelGatewayRequest(), { signal: controller.signal })
    ).rejects.toMatchObject({ code: 'TIMEOUT_ERROR' });
    expect(h.validate).not.toHaveBeenCalled();
    expect(h.settle).not.toHaveBeenCalled();
    terminal(h, 'TIMEOUT_ERROR', 'unresolved');
  });
});
