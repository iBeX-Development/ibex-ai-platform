import { describe, expect, it, vi } from 'vitest';
import type { AuditEvent } from '../../packages/audit/src/index.js';
import {
  AiGatewayService,
  FixedWindowGatewayRateLimiter,
  type GatewayPlatformRequest,
  type GatewayServiceDependencies
} from '../../packages/gateway/src/index.js';
import {
  authenticatorReturning,
  gatewayEnvelope,
  gatewayIdentity,
  validationTime
} from '../testing/security-fixtures.js';

function createDependencies(overrides: Partial<GatewayServiceDependencies> = {}) {
  const auditEvents: AuditEvent[] = [];
  const forward = vi.fn((request: GatewayPlatformRequest) => {
    return Promise.resolve({
      status: 'success' as const,
      response: { accepted: request.endpoint.length > 0 },
      action_type: 'informational' as const,
      approval_required: false
    });
  });
  const authorize = vi.fn(() =>
    Promise.resolve({ allowed: true as const, decision_id: 'decision-1' })
  );
  const dependencies: GatewayServiceDependencies = {
    authenticator: authenticatorReturning(gatewayIdentity),
    authorizationPolicy: { authorize },
    accessRequirements: {
      resolve: (endpoint, payload) => ({
        capability: endpoint,
        action: 'invoke',
        required_permissions: [],
        required_entitlements: ['ai:general'],
        ...(endpoint === 'agents' &&
        typeof payload === 'object' &&
        payload !== null &&
        'requested_agent' in payload &&
        typeof payload.requested_agent === 'string'
          ? { resource: { type: 'agent', id: payload.requested_agent } }
          : {})
      })
    },
    rateLimiter: new FixedWindowGatewayRateLimiter(10),
    platform: { forward },
    audit: {
      emit: (event) => {
        auditEvents.push(event);
        return Promise.resolve();
      }
    },
    service: 'ai-gateway-test',
    environment: 'test',
    maximumPayloadBytes: 4_096,
    ...overrides
  };
  return { dependencies, auditEvents, forward, authorize };
}

function request(
  endpoint: string,
  envelope: unknown = { ...gatewayEnvelope, requested_capability: 'ai:general' }
) {
  return { endpoint, headers: {}, envelope, payload_bytes: 512 };
}

describe('Gate P2 AI Gateway pipeline', () => {
  it('propagates trusted context and one trace identity end to end', async () => {
    const fixture = createDependencies();
    const service = new AiGatewayService(fixture.dependencies);
    const response = await service.execute(request('chat'), validationTime);

    expect(response).toMatchObject({ request_id: 'request-1', trace_id: 'correlation-1' });
    const forwarded = fixture.forward.mock.calls[0]?.[0];
    expect(forwarded?.endpoint).toBe('chat');
    expect(forwarded?.trace_id).toBe('correlation-1');
    expect(forwarded?.context).toMatchObject({ tenant_id: 'tenant-a', request_id: 'request-1' });
    expect(fixture.auditEvents).toEqual([
      expect.objectContaining({
        event_type: 'gateway.request.accepted',
        tenant_id: 'tenant-a',
        request_id: 'request-1',
        correlation_id: 'correlation-1'
      })
    ]);
  });

  it('rejects an invalid endpoint payload before authorization or forwarding', async () => {
    const fixture = createDependencies();
    const service = new AiGatewayService(fixture.dependencies);
    await expect(
      service.execute(
        request('chat', { ...gatewayEnvelope, payload: { text: 'wrong field' } }),
        validationTime
      )
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', statusCode: 400 });
    expect(fixture.authorize).not.toHaveBeenCalled();
    expect(fixture.forward).not.toHaveBeenCalled();
  });

  it('rejects a tenant mismatch before forwarding', async () => {
    const fixture = createDependencies();
    const service = new AiGatewayService(fixture.dependencies);
    await expect(
      service.execute(
        request('chat', { ...gatewayEnvelope, tenant_id: 'tenant-b' }),
        validationTime
      )
    ).rejects.toMatchObject({ code: 'TENANT_CONTEXT_ERROR' });
    expect(fixture.forward).not.toHaveBeenCalled();
  });

  it('rejects an unauthorized requested agent without leaking policy details', async () => {
    const fixture = createDependencies({
      authorizationPolicy: {
        authorize: () => Promise.resolve({ allowed: false, reason: 'agent unavailable for tenant' })
      }
    });
    const service = new AiGatewayService(fixture.dependencies);
    await expect(
      service.execute(
        request('agents', {
          ...gatewayEnvelope,
          requested_capability: 'ai:general',
          payload: { message: 'use warehouse', requested_agent: 'warehouse' }
        }),
        validationTime
      )
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED', publicMessage: 'Access denied' });
    expect(fixture.forward).not.toHaveBeenCalled();
  });

  it('rejects a capability outside authenticated entitlements', async () => {
    const fixture = createDependencies();
    const service = new AiGatewayService(fixture.dependencies);
    await expect(
      service.execute(
        request('chat', { ...gatewayEnvelope, requested_capability: 'ai:admin' }),
        validationTime
      )
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    expect(fixture.authorize).not.toHaveBeenCalled();
  });

  it('rejects an oversized body before authentication', async () => {
    const fixture = createDependencies();
    const service = new AiGatewayService(fixture.dependencies);
    await expect(
      service.execute({ ...request('chat'), payload_bytes: 4_097 }, validationTime)
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', statusCode: 413 });
    expect(fixture.authorize).not.toHaveBeenCalled();
  });

  it.each([
    ['tools', { tool_id: 'asset.lookup', tool_version: '1.0', input: { asset_id: 'a-1' } }],
    ['approvals', { approval_id: 'approval-1', payload: { operation: 'status' } }]
  ])(
    'keeps %s at contract validation and platform-boundary forwarding',
    async (endpoint, payload) => {
      const fixture = createDependencies();
      const service = new AiGatewayService(fixture.dependencies);
      await service.execute(
        request(endpoint, { ...gatewayEnvelope, requested_capability: 'ai:general', payload }),
        validationTime
      );
      expect(fixture.forward).toHaveBeenCalledWith(expect.objectContaining({ endpoint, payload }));
    }
  );
});
