import { describe, expect, it } from 'vitest';
import {
  createTrustedRequestContext,
  enforceAuthorization,
  type AuthorizationRequest
} from '../../packages/security/src/index.js';
import { gatewayIdentity } from '../testing/security-fixtures.js';

const context = createTrustedRequestContext({
  tenant_id: gatewayIdentity.tenant_id,
  user_id: gatewayIdentity.user_id,
  role: gatewayIdentity.role,
  permissions: gatewayIdentity.permissions,
  entitlements: gatewayIdentity.entitlements,
  session_id: gatewayIdentity.session_id,
  request_id: gatewayIdentity.request_id,
  correlation_id: gatewayIdentity.correlation_id,
  locale: gatewayIdentity.locale
});
const request: AuthorizationRequest = {
  capability: 'asset',
  action: 'read',
  required_permissions: ['asset:read'],
  required_entitlements: ['ai:general']
};

describe('server-side authorization', () => {
  it('accepts only an explicit authoritative allow decision', async () => {
    const decision = await enforceAuthorization(
      { authorize: () => Promise.resolve({ allowed: true, decision_id: 'decision-1' }) },
      context,
      request
    );
    expect(decision.decision_id).toBe('decision-1');
  });

  it('denies permission escalation before calling the policy source', async () => {
    let called = false;
    await expect(
      enforceAuthorization(
        {
          authorize: () => {
            called = true;
            return Promise.resolve({ allowed: true as const, decision_id: 'unsafe' });
          }
        },
        context,
        { ...request, required_permissions: ['asset:write'] }
      )
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    expect(called).toBe(false);
  });

  it('denies an explicit policy denial', async () => {
    await expect(
      enforceAuthorization(
        { authorize: () => Promise.resolve({ allowed: false, reason: 'core_denied' }) },
        context,
        request
      )
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  });

  it('fails closed when authorization cannot be verified', async () => {
    await expect(
      enforceAuthorization(
        { authorize: () => Promise.reject(new Error('unavailable')) },
        context,
        request
      )
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_ERROR' });
  });

  it('fails closed for a malformed authorization decision', async () => {
    await expect(
      enforceAuthorization(
        {
          authorize: () =>
            Promise.resolve({ allowed: true, decision_id: '' } as {
              allowed: true;
              decision_id: string;
            })
        },
        context,
        request
      )
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_ERROR' });
  });
});
