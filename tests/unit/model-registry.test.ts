import { describe, expect, it, vi } from 'vitest';
import { LocalModelSchemaCatalog, ModelRegistry } from '../../packages/model-gateway/src/index.js';
import {
  modelSchemaCatalog,
  fallbackModel,
  fallbackProvider,
  modelGatewayRequest,
  primaryModel,
  primaryProvider
} from '../testing/model-gateway-fixtures.js';
import {
  messagePayloadReference,
  stringPayloadReference,
  stringOutputPrimaryModel,
  stringOutputFallbackModel,
  successfulAdapter
} from '../testing/model-gateway-fixtures.js';
import { modelGatewayRequestSchema } from '../../packages/model-gateway/src/contracts.js';

function request(overrides: Record<string, unknown> = {}) {
  return modelGatewayRequestSchema.parse(modelGatewayRequest(overrides));
}

describe('Model Registry deterministic policy', () => {
  it('orders approved candidates deterministically by provider priority', () => {
    const registry = new ModelRegistry(
      [fallbackProvider, primaryProvider],
      [fallbackModel, primaryModel],
      modelSchemaCatalog
    );
    expect(registry.candidates(request(), 'test', 20).map((item) => item.model.model_id)).toEqual([
      'general-primary',
      'general-fallback'
    ]);
  });

  it('excludes disabled and unapproved providers or models', () => {
    const registry = new ModelRegistry(
      [{ ...primaryProvider, status: 'disabled' }],
      [{ ...primaryModel, status: 'evaluation' }],
      modelSchemaCatalog
    );
    expect(registry.candidates(request(), 'test', 20)).toEqual([]);
  });

  it('does not route new requests to an unavailable provider', () => {
    const registry = new ModelRegistry(
      [{ ...primaryProvider, health: 'unavailable' }],
      [primaryModel],
      modelSchemaCatalog
    );
    expect(registry.candidates(request(), 'test', 20)).toEqual([]);
  });

  it('fails closed for confidentiality, entitlement, context, and capability mismatches', () => {
    const restrictedRegistry = new ModelRegistry(
      [{ ...primaryProvider, maximum_confidentiality: 'INTERNAL' }],
      [primaryModel],
      modelSchemaCatalog
    );
    expect(restrictedRegistry.candidates(request(), 'test', 20)).toEqual([]);

    const registry = new ModelRegistry([primaryProvider], [primaryModel], modelSchemaCatalog);
    expect(
      registry.candidates(
        request({ context: { ...request().context, entitlements: [] } }),
        'test',
        20
      )
    ).toEqual([]);
    expect(registry.candidates(request(), 'test', primaryModel.context_limit + 1)).toEqual([]);
    expect(registry.candidates(request({ capability: 'MG-FAST' }), 'test', 20)).toEqual([]);
  });

  it('rejects duplicate model identities and unknown providers', () => {
    expect(
      () => new ModelRegistry([primaryProvider], [primaryModel, primaryModel], modelSchemaCatalog)
    ).toThrow('Model registry configuration is invalid');
    expect(
      () =>
        new ModelRegistry(
          [primaryProvider],
          [{ ...primaryModel, provider_id: 'missing' }],
          modelSchemaCatalog
        )
    ).toThrow('Model registry configuration is invalid');
  });
});

describe('Model registration metadata and local catalog', () => {
  it('requires an explicitly injected local catalog', () => {
    expect(() => {
      Reflect.construct(ModelRegistry, [[primaryProvider], [primaryModel]]);
    }).toThrow('local model schema catalog is required');
    expect(() => {
      Reflect.construct(ModelRegistry, [
        [primaryProvider],
        [primaryModel],
        { resolve: () => true }
      ]);
    }).toThrow('local model schema catalog is required');
  });

  it.each(['input_type', 'output_type'] as const)(
    'rejects absent metadata and unknown exact references in %s',
    (field) => {
      expect(
        () =>
          new ModelRegistry(
            [primaryProvider],
            [{ ...primaryModel, [field]: undefined }],
            modelSchemaCatalog
          )
      ).toThrow();
      for (const schema of [
        { schema_id: 'unknown', schema_version: '1.0.0' },
        { ...messagePayloadReference, schema_version: '2.0.0' }
      ]) {
        expect(
          () =>
            new ModelRegistry(
              [primaryProvider],
              [{ ...primaryModel, [field]: { modalities: ['text'], schema } }],
              modelSchemaCatalog
            )
        ).toThrow('Unknown local model schema version');
      }
    }
  );

  it('rejects malformed catalog records and duplicate exact versions without invoking validators', () => {
    const validate = vi.fn(() => {
      throw new Error('Must not probe validators');
    });
    const entry = { reference: { ...messagePayloadReference }, validate };
    for (const records of [
      undefined,
      null,
      {},
      [],
      [null],
      [{}],
      [{ reference: messagePayloadReference }],
      [{ ...entry, validate: true }],
      [{ ...entry, validate: { parse: validate } }],
      [{ ...entry, extra: true }],
      [{ ...entry, reference: { schema_id: 'x', schema_version: '*' } }]
    ]) {
      expect(() => {
        Reflect.construct(LocalModelSchemaCatalog, [records]);
      }).toThrow();
    }
    expect(() => new LocalModelSchemaCatalog([entry, entry])).toThrow(
      'Duplicate local model schema'
    );
    const catalog = new LocalModelSchemaCatalog([entry]);
    new ModelRegistry([primaryProvider], [primaryModel], catalog);
    expect(validate).not.toHaveBeenCalled();
  });

  it('uses collision-safe ID/version pairs and never falls back to another version', () => {
    const first = { schema_id: 'a:b', schema_version: 'c' };
    const second = { schema_id: 'a', schema_version: 'b:c' };
    const third = { schema_id: 'a:b', schema_version: 'd' };
    const one = () => true;
    const two = () => false;
    const catalog = new LocalModelSchemaCatalog([
      { reference: first, validate: one },
      { reference: second, validate: two },
      { reference: third, validate: two }
    ]);
    expect(catalog.resolve(first).validate).toBe(one);
    expect(catalog.resolve(second).validate).toBe(two);
    expect(catalog.resolve(third).validate).toBe(two);
    expect(() => catalog.resolve({ ...first, schema_version: 'unknown' })).toThrow();
  });

  it('owns frozen nested declarations and copied catalog entries', () => {
    const reference = { ...messagePayloadReference };
    let accepts = true;
    const validate = vi.fn(() => accepts);
    const entry = { reference, validate };
    const entries = [entry];
    const catalog = new LocalModelSchemaCatalog(entries);
    const model = {
      ...primaryModel,
      input_type: { modalities: ['text'], schema: { ...messagePayloadReference } },
      output_type: { modalities: ['text'], schema: { ...messagePayloadReference } }
    };
    const registry = new ModelRegistry([primaryProvider], [model], catalog);
    reference.schema_id = 'changed';
    entry.validate = vi.fn(() => false);
    entries.splice(0);
    model.input_type.modalities.push('image');
    model.input_type.schema.schema_id = 'changed';
    model.output_type.modalities[0] = 'audio';
    model.output_type.schema.schema_version = 'changed';
    const registered = registry.candidates(request(), 'test', 1)[0]?.model;
    expect(registered?.input_type).toEqual(primaryModel.input_type);
    expect(registered?.output_type).toEqual(primaryModel.output_type);
    expect(Object.isFrozen(registered?.input_type)).toBe(true);
    expect(Object.isFrozen(registered?.input_type.modalities)).toBe(true);
    expect(Object.isFrozen(registered?.input_type.schema)).toBe(true);
    expect(Object.isFrozen(registered?.output_type)).toBe(true);
    expect(Object.isFrozen(registered?.output_type.modalities)).toBe(true);
    expect(Object.isFrozen(registered?.output_type.schema)).toBe(true);
    const owned = catalog.resolve(messagePayloadReference);
    expect(Object.isFrozen(owned)).toBe(true);
    expect(Reflect.set(owned, 'schema_version', 'changed')).toBe(false);
    expect(Reflect.set(owned, 'validate', () => false)).toBe(false);
    expect(owned.validate).toBe(validate);
    expect(validate).not.toHaveBeenCalled();
    // Freezing the catalog cannot freeze a validator's captured state.
    accepts = false;
    expect(owned.validate({ message: 'real test payload' })).toBe(false);
  });

  it.each([
    [false, false],
    [false, true],
    [true, false],
    [true, true]
  ])('keeps structured_output=%s and tool_use=%s independent', (structured_output, tool_use) => {
    const registry = new ModelRegistry(
      [primaryProvider],
      [{ ...primaryModel, structured_output, tool_use }],
      modelSchemaCatalog
    );
    expect(registry.candidates(request(), 'test', 1)).toHaveLength(1);
    expect(
      registry.candidates(
        request({ requires_structured_output: true, output_schema_id: 'workflow.v1' }),
        'test',
        1
      )
    ).toHaveLength(structured_output ? 1 : 0);
    expect(registry.candidates(request({ requires_tool_use: true }), 'test', 1)).toHaveLength(
      tool_use ? 1 : 0
    );
  });

  it('declares truthful strict message and string fixtures without changing prices or identities', async () => {
    const message = modelSchemaCatalog.resolve(messagePayloadReference).validate;
    const string = modelSchemaCatalog.resolve(stringPayloadReference).validate;
    for (const value of [null, {}, { message: 7 }, { message: 'ok', extra: true }, 'text', []])
      expect(message(value)).toBe(false);
    expect(message({ message: 'summarize approved information' })).toBe(true);
    expect(string('synthetic private output')).toBe(true);
    for (const value of [null, 7, {}, { message: 'ok' }, []]) expect(string(value)).toBe(false);
    const adapter = successfulAdapter(primaryProvider.adapter_id);
    const result = await adapter.invoke({
      request_id: 'fixture-schema-check',
      capability: 'MG-GENERAL',
      model: primaryModel,
      input: { message: 'summarize approved information' },
      requires_structured_output: false,
      requires_tool_use: false,
      signal: new AbortController().signal,
      accounting_attempt_id: 'fixture-schema-check-1',
      input_token_bound: 32,
      max_output_tokens: 64
    });
    expect(message(result.result)).toBe(true);
    expect(string(result.result)).toBe(false);
    expect(stringOutputPrimaryModel).toEqual({
      ...primaryModel,
      output_type: { modalities: ['text'], schema: stringPayloadReference }
    });
    expect(stringOutputFallbackModel).toEqual({
      ...fallbackModel,
      output_type: { modalities: ['text'], schema: stringPayloadReference }
    });
  });
});
