import { describe, expect, it, vi } from 'vitest';
import type { AuditRecord } from '../../packages/audit/src/index.js';
import type {
  LiveProviderAccess,
  ModelUsageMetric,
  ProviderInvocationRequest
} from '../../packages/model-gateway/src/index.js';
import { createTrustedRequestContext } from '../../packages/security/src/index.js';
import {
  createModelGateway,
  modelContext,
  modelGatewayRequest,
  modelGatewayValidationTime,
  successfulAdapter
} from '../testing/model-gateway-fixtures.js';

describe('Model Gateway tenant isolation', () => {
  it('keeps invocation audit and metrics bound to each trusted tenant', async () => {
    const audits: AuditRecord[] = [];
    const metrics: ModelUsageMetric[] = [];
    const tenantB = createTrustedRequestContext({
      ...modelContext,
      tenant_id: 'tenant-b',
      user_id: 'user-2',
      session_id: 'session-2',
      request_id: 'request-model-2',
      correlation_id: 'correlation-model-2'
    });
    const gateway = createModelGateway(audits, metrics);

    await gateway.invoke(modelGatewayRequest(), {}, modelGatewayValidationTime);
    await gateway.invoke(
      modelGatewayRequest({
        context: tenantB,
        trace_id: 'model-trace-2',
        input: { message: 'tenant-b input' }
      }),
      {},
      modelGatewayValidationTime
    );

    expect(metrics.map((metric) => [metric.tenant_id, metric.request_id])).toEqual([
      ['tenant-a', 'request-model-1'],
      ['tenant-b', 'request-model-2']
    ]);
    expect(audits.map((event) => ('tenant_id' in event ? event.tenant_id : undefined))).toEqual([
      'tenant-a',
      'tenant-b'
    ]);
    expect(JSON.stringify(audits)).not.toContain('tenant-b input');
  });

  it('never forwards trusted identity context to provider adapters', async () => {
    const adapter = successfulAdapter('adapter-primary');
    const invoke = vi.fn((request: ProviderInvocationRequest, access?: LiveProviderAccess) =>
      adapter.invoke(request, access)
    );
    const gateway = createModelGateway([], [], {
      adapters: [{ adapter_id: 'adapter-primary', invoke }, successfulAdapter('adapter-fallback')]
    });

    await gateway.invoke(modelGatewayRequest(), {}, modelGatewayValidationTime);

    const providerRequest = invoke.mock.calls[0]?.[0];
    expect(providerRequest).toBeDefined();
    expect(providerRequest).not.toHaveProperty('context');
    expect(providerRequest).not.toHaveProperty('tenant_id');
    expect(providerRequest).not.toHaveProperty('user_id');
    expect(providerRequest).not.toHaveProperty('permissions');
    expect(providerRequest).not.toHaveProperty('entitlements');
  });
});
