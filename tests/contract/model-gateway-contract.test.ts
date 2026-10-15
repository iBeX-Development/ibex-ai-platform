import { describe, expect, it } from 'vitest';
import {
  modelGatewayRequestSchema,
  modelGatewayResponseSchema,
  modelDefinitionSchema,
  providerDefinitionSchema
} from '../../packages/model-gateway/src/index.js';
import { modelGatewayRequest, primaryModel } from '../testing/model-gateway-fixtures.js';

describe('Model Gateway contracts', () => {
  it.each(['input_type', 'output_type'] as const)(
    'requires explicit valid %s metadata',
    (field) => {
      const invalid = [
        undefined,
        null,
        'text',
        {},
        { schema: primaryModel.input_type.schema },
        { modalities: ['text'] },
        { modalities: [], schema: primaryModel.input_type.schema },
        { modalities: ['text', 'text'], schema: primaryModel.input_type.schema },
        { modalities: ['unsupported'], schema: primaryModel.input_type.schema },
        { modalities: ['*'], schema: primaryModel.input_type.schema },
        { modalities: 'text', schema: primaryModel.input_type.schema },
        { modalities: ['text'], schema: { schema_id: 'test.message' } },
        { modalities: ['text'], schema: { schema_id: '', schema_version: '1.0.0' } },
        { modalities: ['text'], schema: { schema_id: 'test.message', schema_version: '' } },
        { modalities: ['text'], schema: { schema_id: 'test.message', schema_version: '*' } },
        { modalities: ['text'], schema: { schema_id: ' test.message', schema_version: '1.0.0' } },
        {
          modalities: ['text'],
          schema: { schema_id: 'https://example.invalid/schema', schema_version: '1.0.0' }
        },
        {
          modalities: ['text'],
          schema: { ...primaryModel.input_type.schema, url: 'https://example.invalid' }
        },
        { modalities: ['text'], schema: primaryModel.input_type.schema, permissive: true }
      ];
      for (const value of invalid) {
        expect(modelDefinitionSchema.safeParse({ ...primaryModel, [field]: value }).success).toBe(
          false
        );
      }
    }
  );

  it('keeps independent input/output declarations and capability flags', () => {
    const definition = modelDefinitionSchema.parse({
      ...primaryModel,
      input_type: {
        modalities: ['text', 'image', 'audio', 'video'],
        schema: { schema_id: 'input', schema_version: '1' }
      },
      output_type: { modalities: ['text'], schema: { schema_id: 'output', schema_version: '2' } },
      structured_output: false,
      tool_use: true
    });
    expect(definition.input_type).not.toEqual(definition.output_type);
    expect(definition.structured_output).toBe(false);
    expect(definition.tool_use).toBe(true);
  });

  it('preserves the existing output_schema_id wire value without catalog interpretation', () => {
    const output_schema_id = 'existing.workflow.output.v7';
    expect(
      modelGatewayRequestSchema.parse(
        modelGatewayRequest({ requires_structured_output: true, output_schema_id })
      ).output_schema_id
    ).toBe(output_schema_id);
  });

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
