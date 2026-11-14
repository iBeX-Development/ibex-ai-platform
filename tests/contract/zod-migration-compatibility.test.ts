import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../packages/configuration/src/index.js';
import { apiRequestEnvelopeSchema } from '../../packages/contracts/src/index.js';
import {
  modelGatewayPolicySchema,
  providerResultSchema
} from '../../packages/model-gateway/src/contracts.js';
import {
  createTrustedRequestContext,
  assertTenantAccess
} from '../../packages/security/src/index.js';
import { toErrorEnvelope, PlatformError } from '../../packages/errors/src/index.js';
import { validTestEnvironment } from '../../packages/testing/src/index.js';
import { modelContext } from '../testing/model-gateway-fixtures.js';
import { modelBudgetPolicySchema } from '../../packages/model-gateway/src/accounting.js';
import { syntheticBudgetPolicy } from '../testing/model-accounting-fixtures.js';
import { measurementEvidenceSchema } from '../evaluation/support/release-gate.js';

const minimalEnvironment = {
  IBEX_CONFIG_VERSION: '1',
  IBEX_ENVIRONMENT: 'test',
  IBEX_SERVICE_NAME: ' test ',
  IBEX_PORT: '3001',
  IBEX_SECRET_SOURCE: 'environment'
};
const policy = {
  version: '1',
  required_permission: 'ai:model:invoke',
  agent_capabilities: { example: ['MG-GENERAL'] },
  timeout_ms: 1000,
  max_retries: 0,
  fallback_enabled: false,
  maximum_input_bytes: 1000
};

describe('Zod migration preserves existing application contracts', () => {
  it('does not silently redefine the existing measurement parser domain', () => {
    const measurement = {
      source: 'deterministic_simulation',
      latency_ms: { p50: Infinity, p95: Infinity, p99: Infinity },
      cost: { unit: 'synthetic_cost_unit', total: Infinity }
    };
    expect(measurementEvidenceSchema.safeParse(measurement).success).toBe(true);
    expect(
      measurementEvidenceSchema.safeParse({
        ...measurement,
        cost: { ...measurement.cost, total: -1 }
      }).success
    ).toBe(false);
    expect(
      measurementEvidenceSchema.safeParse({
        ...measurement,
        cost: { ...measurement.cost, total: NaN }
      }).success
    ).toBe(false);
  });
  it('applies transformed false defaults and numeric defaults', () => {
    const config = loadConfig(minimalEnvironment);
    expect(Object.values(config.features)).toEqual(Array(11).fill(false));
    expect(config.runtime).toEqual({ serviceName: 'test', host: '0.0.0.0', port: 3001 });
    expect(config.resilience).toEqual({ requestTimeoutMs: 30000, maxRetries: 2 });
    expect(Object.isFrozen(config.features)).toBe(true);
  });
  it.each(['true', 'false'])('parses explicit boolean %s without truthiness coercion', (flag) => {
    expect(loadConfig({ ...minimalEnvironment, IBEX_FEATURE_RAG_ENABLED: flag }).features.rag).toBe(
      flag === 'true'
    );
  });
  it.each(['', 'TRUE', '0'])('rejects malformed boolean %s', (flag) => {
    expect(() => loadConfig({ ...minimalEnvironment, IBEX_FEATURE_RAG_ENABLED: flag })).toThrow(
      'Invalid application configuration'
    );
  });
  it.each(['0', '65536', '1.5', '', 'NaN', 'Infinity'])('rejects invalid port %s', (port) => {
    expect(() => loadConfig({ ...minimalEnvironment, IBEX_PORT: port })).toThrow();
  });
  it('keeps numeric coercion and production secret refinements', () => {
    expect(loadConfig({ ...minimalEnvironment, IBEX_PORT: ' 65535 ' }).runtime.port).toBe(65535);
    expect(() => loadConfig({ ...validTestEnvironment, IBEX_ENVIRONMENT: 'production' })).toThrow();
    expect(() => loadConfig({ ...minimalEnvironment, IBEX_SECRET_SOURCE: 'external' })).toThrow();
  });
  it.each([{}, { payload: undefined }, { payload: null }, { payload: { value: 1 } }])(
    'preserves unknown-valued payload presence: %j',
    (payload) => {
      const input = { contract_version: '1.0', request_id: 'request-1', ...payload };
      expect(apiRequestEnvelopeSchema.parse(input)).toEqual(input);
      expect(apiRequestEnvelopeSchema.safeParse({ ...input, tenant_id: 'foreign' }).success).toBe(
        false
      );
    }
  );
  it('preserves arbitrary string agent keys and nonempty capability values', () => {
    const parsed = modelGatewayPolicySchema.parse(policy);
    expect(parsed.agent_capabilities).toEqual(policy.agent_capabilities);
    expect(Object.isFrozen(parsed.agent_capabilities)).toBe(true);
    expect(Object.isFrozen(parsed.agent_capabilities.example)).toBe(true);
    expect(
      modelGatewayPolicySchema.safeParse({ ...policy, agent_capabilities: { example: [] } }).success
    ).toBe(false);
    expect(
      modelGatewayPolicySchema.safeParse({
        ...policy,
        agent_capabilities: { example: ['FOREIGN'] }
      }).success
    ).toBe(false);
  });
  it('preserves existing unbounded integer acceptance without changing accounting safe bounds', () => {
    const input = {
      result: null,
      input_tokens: Number.MAX_SAFE_INTEGER + 1,
      output_tokens: 0,
      finish_reason: 'stop',
      policy_flags: []
    };
    expect(providerResultSchema.safeParse(input).success).toBe(true);
    for (const value of [-1, 1.5, NaN, Infinity]) {
      expect(providerResultSchema.safeParse({ ...input, input_tokens: value }).success).toBe(false);
    }
  });
  it('keeps strict trusted context, frozen projections and cross-tenant denial', () => {
    const context = createTrustedRequestContext(modelContext);
    expect(Object.isFrozen(context.permissions)).toBe(true);
    expect(Object.isFrozen(context.entitlements)).toBe(true);
    expect(() => {
      assertTenantAccess(context, 'other-tenant');
    }).toThrow('Access denied');
    expect(() => createTrustedRequestContext({ ...modelContext, extra: true })).toThrow();
  });
  it('retains explicit safe-integer accounting bounds', () => {
    expect(modelBudgetPolicySchema.safeParse(syntheticBudgetPolicy).success).toBe(true);
    expect(
      modelBudgetPolicySchema.safeParse({
        ...syntheticBudgetPolicy,
        units_per_cost: Number.MAX_SAFE_INTEGER + 1
      }).success
    ).toBe(false);
  });
  it('preserves public error code and message while hiding validation diagnostics', () => {
    let error: unknown;
    try {
      createTrustedRequestContext({ ...modelContext, tenant_id: '' });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(PlatformError);
    expect((error as PlatformError).statusCode).toBe(401);
    expect(toErrorEnvelope(error)).toEqual({
      error: { code: 'TENANT_CONTEXT_ERROR', message: 'Trusted request context is invalid' }
    });
    const diagnostics = (error as PlatformError).diagnostics as {
      formErrors: unknown[];
      fieldErrors: { tenant_id: unknown };
    };
    expect(diagnostics.formErrors).toEqual([]);
    expect(Array.isArray(diagnostics.fieldErrors.tenant_id)).toBe(true);
  });
});
