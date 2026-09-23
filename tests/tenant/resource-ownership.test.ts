import { describe, expect, it } from 'vitest';
import {
  createTrustedRequestContext,
  enforceResourceOwnership
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
  channel: gatewayIdentity.channel,
  locale: gatewayIdentity.locale
});
const resource = { type: 'asset', id: 'asset-123' };

describe('resource ownership validation', () => {
  it('allows a resource owned by the trusted tenant', async () => {
    await expect(
      enforceResourceOwnership(
        { resolveTenantId: () => Promise.resolve('tenant-a') },
        context,
        resource
      )
    ).resolves.toBeUndefined();
  });

  it('denies a cross-tenant resource without disclosing its owner', async () => {
    const result = enforceResourceOwnership(
      { resolveTenantId: () => Promise.resolve('tenant-b') },
      context,
      resource
    );
    await expect(result).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
      publicMessage: 'Requested resource is unavailable within the current authorized scope'
    });
    await expect(result).rejects.not.toHaveProperty(
      'publicMessage',
      expect.stringContaining('tenant-b')
    );
  });

  it('fails closed when ownership is unknown', async () => {
    await expect(
      enforceResourceOwnership({ resolveTenantId: () => Promise.resolve(null) }, context, resource)
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  });

  it('fails closed when the ownership source fails', async () => {
    await expect(
      enforceResourceOwnership(
        { resolveTenantId: () => Promise.reject(new Error('unavailable')) },
        context,
        resource
      )
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_ERROR' });
  });

  it('fails closed before lookup when the resource reference is incomplete', async () => {
    let called = false;
    await expect(
      enforceResourceOwnership(
        {
          resolveTenantId: () => {
            called = true;
            return Promise.resolve('tenant-a');
          }
        },
        context,
        { type: 'asset', id: '' }
      )
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_ERROR' });
    expect(called).toBe(false);
  });
});
