import { expect, it } from 'vitest';
import { authenticateGatewayRequest } from '../../packages/security/src/authentication.js';
import { gatewayIdentity, validationTime } from '../testing/security-fixtures.js';
const request = { headers: {}, envelope: {} };
it.each(['tenant_id', 'permissions', 'expires_at'] as const)(
  'sanitizes throwing identity %s',
  async (field) => {
    const identity = { ...gatewayIdentity };
    Object.defineProperty(identity, field, {
      enumerable: true,
      get() {
        throw new Error('PRIVATE_IDENTITY');
      }
    });
    await expect(
      authenticateGatewayRequest(
        { authenticate: () => Promise.resolve(identity) },
        request,
        validationTime
      )
    ).rejects.toMatchObject({
      code: 'AUTHENTICATION_ERROR',
      statusCode: 401,
      message: 'Authentication failed'
    });
  }
);
it('retains valid identity and exact expiry rejection', async () => {
  await expect(
    authenticateGatewayRequest(
      { authenticate: () => Promise.resolve(gatewayIdentity) },
      request,
      validationTime
    )
  ).resolves.toMatchObject({ tenant_id: gatewayIdentity.tenant_id });
  await expect(
    authenticateGatewayRequest(
      { authenticate: () => Promise.resolve(gatewayIdentity) },
      request,
      new Date(gatewayIdentity.expires_at)
    )
  ).rejects.toMatchObject({ code: 'AUTHENTICATION_ERROR', statusCode: 401 });
});
it.each([null, {}, { ...gatewayIdentity, tenant_id: '' }])(
  'retains malformed identity rejection',
  async (identity) => {
    await expect(
      authenticateGatewayRequest(
        { authenticate: () => Promise.resolve(identity) },
        request,
        validationTime
      )
    ).rejects.toMatchObject({ code: 'AUTHENTICATION_ERROR', statusCode: 401 });
  }
);
