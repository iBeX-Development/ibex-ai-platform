import { describe, expect, it } from 'vitest';
import {
  modelGatewayRequestSchema,
  modelGatewayResponseSchema,
  providerDefinitionSchema
} from '../../packages/model-gateway/src/index.js';
import { modelGatewayRequest } from '../testing/model-gateway-fixtures.js';

describe('Model Gateway contracts', () => {
  it('accepts the provider-neutral canonical request and rejects provider parameters', () => {
    expect(modelGatewayRequestSchema.parse(modelGatewayRequest()).capability).toBe('MG-GENERAL');
    expect(() =>
      modelGatewayRequestSchema.parse({
        ...modelGatewayRequest(),
        provider: 'provider-primary',
        temperature: 0.5
      })
    ).toThrow();
  });

  it('requires a versioned schema identifier for structured output', () => {
    expect(() =>
      modelGatewayRequestSchema.parse(modelGatewayRequest({ requires_structured_output: true }))
    ).toThrow();
  });

  it('requires live provider endpoint and credential reference together', () => {
    expect(() =>
      providerDefinitionSchema.parse({
        provider_id: 'live-provider',
        adapter_id: 'live-adapter',
        mode: 'live',
        capabilities: ['MG-GENERAL'],
        maximum_confidentiality: 'INTERNAL',
        required_entitlements: [],
        approved_environments: ['production'],
        fallback_priority: 0,
        health: 'healthy',
        status: 'enabled'
      })
    ).toThrow();
  });

  it('preserves one canonical response shape across providers', () => {
    const response = {
      request_id: 'request-1',
      correlation_id: 'correlation-1',
      trace_id: 'trace-1',
      result: { answer: 'ok' },
      provider_id: 'provider-a',
      model_id: 'model-a',
      model_version: '1',
      usage: {
        input_tokens: 4,
        output_tokens: 2,
        total_tokens: 6,
        estimated_cost: 0.001
      },
      latency_ms: 12,
      finish_reason: 'stop',
      fallback_used: false,
      policy_flags: []
    };
    expect(modelGatewayResponseSchema.parse(response)).toEqual(response);
  });
});
