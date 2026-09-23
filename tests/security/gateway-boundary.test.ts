import { describe, expect, it } from 'vitest';
import { createApiSecurityGuard } from '../../apps/api/src/security.js';
import { PlatformError } from '../../packages/errors/src/index.js';
import { TrustedGatewayBoundary } from '../../packages/security/src/index.js';
import {
  authenticatorReturning,
  gatewayEnvelope,
  gatewayIdentity,
  validationTime
} from '../testing/security-fixtures.js';

const inbound = (envelope: unknown = gatewayEnvelope) => ({ headers: {}, envelope });

describe('trusted AI Gateway boundary', () => {
  it('authenticates and immutably binds canonical context', async () => {
    const guard = createApiSecurityGuard(authenticatorReturning(gatewayIdentity));
    const bound = await guard(inbound(), validationTime);

    expect(bound.context).toEqual({
      tenant_id: 'tenant-a',
      user_id: 'user-1',
      role: 'operator',
      permissions: ['asset:read'],
      entitlements: ['ai:general'],
      session_id: 'session-1',
      request_id: 'request-1',
      correlation_id: 'correlation-1',
      channel: 'web',
      locale: 'mn'
    });
    expect(Object.isFrozen(bound)).toBe(true);
    expect(Object.isFrozen(bound.context)).toBe(true);
    expect(Object.isFrozen(bound.context.permissions)).toBe(true);
  });

  it('fails closed when authentication fails', async () => {
    const boundary = new TrustedGatewayBoundary({
      authenticate: () => Promise.reject(new Error('provider detail'))
    });
    await expect(boundary.bind(inbound(), validationTime)).rejects.toMatchObject({
      code: 'AUTHENTICATION_ERROR',
      publicMessage: 'Authentication failed'
    });
  });

  it('fails closed for expired authentication', async () => {
    const identity = { ...gatewayIdentity, expires_at: '2026-09-23T00:29:59.000Z' };
    const boundary = new TrustedGatewayBoundary(authenticatorReturning(identity));
    await expect(boundary.bind(inbound(), validationTime)).rejects.toBeInstanceOf(PlatformError);
  });

  it('denies missing tenant context', async () => {
    const boundary = new TrustedGatewayBoundary(authenticatorReturning(gatewayIdentity));
    await expect(
      boundary.bind(inbound({ ...gatewayEnvelope, tenant_id: undefined }), validationTime)
    ).rejects.toMatchObject({ code: 'TENANT_CONTEXT_ERROR' });
  });

  it('denies a spoofed tenant binding', async () => {
    const boundary = new TrustedGatewayBoundary(authenticatorReturning(gatewayIdentity));
    await expect(
      boundary.bind(inbound({ ...gatewayEnvelope, tenant_id: 'tenant-b' }), validationTime)
    ).rejects.toMatchObject({ code: 'TENANT_CONTEXT_ERROR' });
  });

  it('denies permission escalation in the envelope', async () => {
    const boundary = new TrustedGatewayBoundary(authenticatorReturning(gatewayIdentity));
    await expect(
      boundary.bind(
        inbound({ ...gatewayEnvelope, permissions: ['asset:read', 'asset:write'] }),
        validationTime
      )
    ).rejects.toMatchObject({ code: 'TENANT_CONTEXT_ERROR' });
  });

  it('denies duplicate claims that could make identity binding ambiguous', async () => {
    const identity = { ...gatewayIdentity, permissions: ['asset:read', 'asset:write'] };
    const boundary = new TrustedGatewayBoundary(authenticatorReturning(identity));
    await expect(
      boundary.bind(
        inbound({ ...gatewayEnvelope, permissions: ['asset:read', 'asset:read'] }),
        validationTime
      )
    ).rejects.toMatchObject({ code: 'TENANT_CONTEXT_ERROR' });
  });

  it('denies a context authenticated in the future', async () => {
    const identity = { ...gatewayIdentity, authenticated_at: '2026-09-23T00:31:00.000Z' };
    const boundary = new TrustedGatewayBoundary(authenticatorReturning(identity));
    await expect(boundary.bind(inbound(), validationTime)).rejects.toMatchObject({
      code: 'AUTHENTICATION_ERROR'
    });
  });

  it('does not treat tenant text inside the payload as trusted context', async () => {
    const boundary = new TrustedGatewayBoundary(authenticatorReturning(gatewayIdentity));
    const bound = await boundary.bind(
      inbound({ ...gatewayEnvelope, payload: { tenant_id: 'tenant-b' } }),
      validationTime
    );
    expect(bound.context.tenant_id).toBe('tenant-a');
  });
});
