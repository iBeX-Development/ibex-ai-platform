import { describe, expect, it } from 'vitest';
import { ModelRegistry } from '../../packages/model-gateway/src/index.js';
import {
  fallbackModel,
  fallbackProvider,
  modelGatewayRequest,
  primaryModel,
  primaryProvider
} from '../testing/model-gateway-fixtures.js';
import { modelGatewayRequestSchema } from '../../packages/model-gateway/src/contracts.js';

function request(overrides: Record<string, unknown> = {}) {
  return modelGatewayRequestSchema.parse(modelGatewayRequest(overrides));
}

describe('Model Registry deterministic policy', () => {
  it('orders approved candidates deterministically by provider priority', () => {
    const registry = new ModelRegistry(
      [fallbackProvider, primaryProvider],
      [fallbackModel, primaryModel]
    );
    expect(registry.candidates(request(), 'test', 20).map((item) => item.model.model_id)).toEqual([
      'general-primary',
      'general-fallback'
    ]);
  });

  it('excludes disabled and unapproved providers or models', () => {
    const registry = new ModelRegistry(
      [{ ...primaryProvider, status: 'disabled' }],
      [{ ...primaryModel, status: 'evaluation' }]
    );
    expect(registry.candidates(request(), 'test', 20)).toEqual([]);
  });

  it('does not route new requests to an unavailable provider', () => {
    const registry = new ModelRegistry(
      [{ ...primaryProvider, health: 'unavailable' }],
      [primaryModel]
    );
    expect(registry.candidates(request(), 'test', 20)).toEqual([]);
  });

  it('fails closed for confidentiality, entitlement, context, and capability mismatches', () => {
    const restrictedRegistry = new ModelRegistry(
      [{ ...primaryProvider, maximum_confidentiality: 'INTERNAL' }],
      [primaryModel]
    );
    expect(restrictedRegistry.candidates(request(), 'test', 20)).toEqual([]);

    const registry = new ModelRegistry([primaryProvider], [primaryModel]);
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
    expect(() => new ModelRegistry([primaryProvider], [primaryModel, primaryModel])).toThrow(
      'Model registry configuration is invalid'
    );
    expect(
      () => new ModelRegistry([primaryProvider], [{ ...primaryModel, provider_id: 'missing' }])
    ).toThrow('Model registry configuration is invalid');
  });
});
