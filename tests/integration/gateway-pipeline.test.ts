import { describe, expect, it, vi } from 'vitest';
import type { AuditRecord } from '../../packages/audit/src/index.js';
import {
  AiGatewayService,
  FixedWindowGatewayRateLimiter,
  type GatewayPlatformRequest,
  type GatewayServiceDependencies
} from '../../packages/gateway/src/index.js';
import { PlatformError } from '../../packages/errors/src/index.js';
import { featureControls } from '../../packages/configuration/src/index.js';
import { enabledTestFeatureControls } from '../../packages/testing/src/index.js';
import {
  authenticatorReturning,
  gatewayEnvelope,
  gatewayIdentity,
  validationTime
} from '../testing/security-fixtures.js';

function createDependencies(overrides: Partial<GatewayServiceDependencies> = {}) {
  const auditEvents: AuditRecord[] = [];
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
    featureControls: enabledTestFeatureControls,
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
    traceIdFactory: () => 'gateway-trace-1',
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
  it('fails closed at the Gateway boundary when the platform rollback control is disabled', async () => {
    const fixture = createDependencies({
      featureControls: featureControls({ ...enabledTestFeatureControls, aiPlatform: false })
    });
    const service = new AiGatewayService(fixture.dependencies);

    await expect(service.execute(request('chat'), validationTime)).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE'
    });
    expect(fixture.forward).not.toHaveBeenCalled();
    expect(fixture.authorize).not.toHaveBeenCalled();
    expect(fixture.auditEvents).toEqual([
      expect.objectContaining({ outcome: 'error', error_code: 'SERVICE_UNAVAILABLE' })
    ]);
  });

  it('propagates trusted context and one trace identity end to end', async () => {
    const fixture = createDependencies();
    const service = new AiGatewayService(fixture.dependencies);
    const response = await service.execute(request('chat'), validationTime);

    expect(response).toMatchObject({ request_id: 'request-1', trace_id: 'gateway-trace-1' });
    const forwarded = fixture.forward.mock.calls[0]?.[0];
    expect(forwarded?.endpoint).toBe('chat');
    expect(forwarded?.trace_id).toBe('gateway-trace-1');
    expect(forwarded?.context).toMatchObject({ tenant_id: 'tenant-a', request_id: 'request-1' });
    expect(fixture.auditEvents).toEqual([
      expect.objectContaining({
        event_type: 'gateway.request.outcome',
        trace_id: 'gateway-trace-1',
        outcome: 'accepted',
        stage: 'authorization',
        trusted_context: {
          tenant_id: 'tenant-a',
          user_id: 'user-1',
          session_id: 'session-1',
          request_id: 'request-1',
          correlation_id: 'correlation-1'
        }
      }),
      expect.objectContaining({
        event_type: 'gateway.request.outcome',
        trace_id: 'gateway-trace-1',
        outcome: 'accepted',
        stage: 'response',
        request_id: 'request-1',
        correlation_id: 'correlation-1',
        tenant_id: 'tenant-a'
      })
    ]);
  });

  it('preserves trusted request correlation when the platform returns a conflicting request ID', async () => {
    const fixture = createDependencies();
    fixture.forward.mockImplementation(() =>
      Promise.resolve({
        status: 'success' as const,
        response: { accepted: true },
        action_type: 'informational' as const,
        approval_required: false,
        request_id: 'conflicting-platform-request'
      })
    );
    const response = await new AiGatewayService(fixture.dependencies).execute(
      request('chat'),
      validationTime
    );

    expect(response).toMatchObject({
      status: 'success',
      response: { accepted: true },
      request_id: 'request-1',
      trace_id: 'gateway-trace-1'
    });
    expect(fixture.forward).toHaveBeenCalledTimes(1);
    expect(fixture.forward.mock.calls[0]?.[0].context).toMatchObject({
      request_id: 'request-1',
      correlation_id: 'correlation-1'
    });
    expect(fixture.auditEvents).toHaveLength(2);
    for (const event of fixture.auditEvents) {
      expect(event).toMatchObject({
        request_id: response.request_id,
        correlation_id: 'correlation-1',
        trace_id: response.trace_id,
        outcome: 'accepted'
      });
    }
    expect(JSON.stringify(fixture.auditEvents)).not.toContain('conflicting-platform-request');
    expect(Object.isFrozen(response)).toBe(true);
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
    expect(fixture.auditEvents).toContainEqual(
      expect.objectContaining({
        trace_id: 'gateway-trace-1',
        outcome: 'rejected',
        stage: 'payload_schema',
        error_code: 'VALIDATION_ERROR',
        trusted_context: {
          tenant_id: 'tenant-a',
          user_id: 'user-1',
          session_id: 'session-1',
          request_id: 'request-1',
          correlation_id: 'correlation-1'
        }
      })
    );
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
    expect(fixture.auditEvents).toEqual([
      expect.objectContaining({
        trace_id: 'gateway-trace-1',
        outcome: 'rejected',
        stage: 'tenant_context',
        error_code: 'TENANT_CONTEXT_ERROR'
      })
    ]);
    expect(fixture.auditEvents[0]).not.toHaveProperty('trusted_context');
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
    expect(fixture.auditEvents).toContainEqual(
      expect.objectContaining({
        trace_id: 'gateway-trace-1',
        outcome: 'rejected',
        stage: 'authorization',
        error_code: 'PERMISSION_DENIED',
        trusted_context: {
          tenant_id: 'tenant-a',
          user_id: 'user-1',
          session_id: 'session-1',
          request_id: 'request-1',
          correlation_id: 'correlation-1'
        }
      })
    );
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
    expect(fixture.auditEvents).toContainEqual(
      expect.objectContaining({
        trace_id: 'gateway-trace-1',
        outcome: 'rejected',
        stage: 'entitlement',
        error_code: 'PERMISSION_DENIED',
        trusted_context: {
          tenant_id: 'tenant-a',
          user_id: 'user-1',
          session_id: 'session-1',
          request_id: 'request-1',
          correlation_id: 'correlation-1'
        }
      })
    );
  });

  it('correlates and audits a rate-limit rejection with trusted context only', async () => {
    const fixture = createDependencies({
      rateLimiter: {
        consume: () =>
          Promise.reject(new PlatformError('RATE_LIMIT_ERROR', 'Rate limit exceeded', 429))
      }
    });
    const service = new AiGatewayService(fixture.dependencies);

    await expect(service.execute(request('chat'), validationTime)).rejects.toMatchObject({
      code: 'RATE_LIMIT_ERROR',
      publicMessage: 'Rate limit exceeded',
      traceId: 'gateway-trace-1',
      trustedRequestId: 'request-1'
    });
    expect(fixture.auditEvents).toEqual([
      expect.objectContaining({
        trace_id: 'gateway-trace-1',
        outcome: 'rejected',
        stage: 'rate_limit',
        error_code: 'RATE_LIMIT_ERROR',
        trusted_context: {
          tenant_id: 'tenant-a',
          user_id: 'user-1',
          session_id: 'session-1',
          request_id: 'request-1',
          correlation_id: 'correlation-1'
        }
      })
    ]);
    expect(fixture.authorize).not.toHaveBeenCalled();
    expect(fixture.forward).not.toHaveBeenCalled();
  });

  it('correlates and audits authentication rejection without trusting request context', async () => {
    const fixture = createDependencies({
      authenticator: {
        authenticate: () =>
          Promise.reject(
            new PlatformError('AUTHENTICATION_ERROR', 'Authentication failed', 401, {
              credential: 'credential detail must remain private'
            })
          )
      }
    });
    const service = new AiGatewayService(fixture.dependencies);

    await expect(service.execute(request('chat'), validationTime)).rejects.toMatchObject({
      code: 'AUTHENTICATION_ERROR',
      publicMessage: 'Authentication failed',
      traceId: 'gateway-trace-1'
    });
    expect(fixture.auditEvents).toEqual([
      expect.objectContaining({
        event_type: 'gateway.request.outcome',
        trace_id: 'gateway-trace-1',
        outcome: 'rejected',
        stage: 'authentication',
        error_code: 'AUTHENTICATION_ERROR'
      })
    ]);
    expect(fixture.auditEvents[0]).not.toHaveProperty('trusted_context');
    expect(JSON.stringify(fixture.auditEvents)).not.toContain('credential detail');
    expect(fixture.forward).not.toHaveBeenCalled();
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
