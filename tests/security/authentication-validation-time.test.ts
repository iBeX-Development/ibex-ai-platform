import { expect, it } from 'vitest';
import { authenticateGatewayRequest } from '../../packages/security/src/authentication.js';
import { gatewayIdentity, validationTime } from '../testing/security-fixtures.js';

const request = { headers: {}, envelope: {} };
const failure = {
  code: 'AUTHENTICATION_ERROR',
  statusCode: 401,
  publicMessage: 'Authentication failed',
  message: 'Authentication failed'
};
const expiredIdentity = { ...gatewayIdentity, expires_at: '2026-09-23T00:29:59.000Z' };
const futureIdentity = { ...gatewayIdentity, authenticated_at: '2026-09-23T00:31:00.000Z' };

it.each([
  ['valid', gatewayIdentity],
  ['expired', expiredIdentity],
  ['future', futureIdentity]
] as const)('rejects invalid validation time for an otherwise valid %s identity', async (_, identity) => {
  let calls = 0;
  await expect(
    authenticateGatewayRequest(
      {
        authenticate: () => {
          calls += 1;
          return Promise.resolve(identity);
        }
      },
      request,
      new Date(NaN)
    )
  ).rejects.toMatchObject(failure);
  expect(calls).toBe(1);
});

it('rejects a validation Date made invalid while authentication is pending', async () => {
  const now = new Date(validationTime);
  await expect(
    authenticateGatewayRequest(
      {
        authenticate: async () => {
          await Promise.resolve();
          now.setTime(NaN);
          return expiredIdentity;
        }
      },
      request,
      now
    )
  ).rejects.toMatchObject(failure);
});

it.each([
  ['authentication instant', gatewayIdentity, gatewayIdentity.authenticated_at, true],
  ['valid interval', gatewayIdentity, validationTime.toISOString(), true],
  ['exact expiry', gatewayIdentity, gatewayIdentity.expires_at, false],
  ['expired identity', expiredIdentity, validationTime.toISOString(), false],
  ['future identity', futureIdentity, validationTime.toISOString(), false]
] as const)('preserves finite-Date behavior at %s', async (_, identity, instant, accepted) => {
  const result = authenticateGatewayRequest(
    { authenticate: () => Promise.resolve(identity) },
    request,
    new Date(instant)
  );
  if (accepted) await expect(result).resolves.toMatchObject({ tenant_id: identity.tenant_id });
  else await expect(result).rejects.toMatchObject(failure);
});

it.each([
  ['becomes expired', validationTime.getTime(), Date.parse(gatewayIdentity.expires_at), false],
  ['becomes valid', Date.parse(gatewayIdentity.expires_at), validationTime.getTime(), true],
  ['invalid Date becomes valid', NaN, validationTime.getTime(), true]
] as const)('uses the post-authentication Date when it %s', async (_, initial, final, accepted) => {
  const now = new Date(initial);
  const result = authenticateGatewayRequest(
    {
      authenticate: async () => {
        await Promise.resolve();
        now.setTime(final);
        return gatewayIdentity;
      }
    },
    request,
    now
  );
  if (accepted) await expect(result).resolves.toMatchObject({ tenant_id: gatewayIdentity.tenant_id });
  else await expect(result).rejects.toMatchObject(failure);
});
