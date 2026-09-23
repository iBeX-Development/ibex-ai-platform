import { describe, expect, it } from 'vitest';
import { FixedWindowGatewayRateLimiter } from '../../packages/gateway/src/index.js';
import { createTrustedRequestContext } from '../../packages/security/src/index.js';

const context = createTrustedRequestContext({
  tenant_id: 'tenant-a',
  user_id: 'user-1',
  role: 'operator',
  permissions: [],
  entitlements: ['ai:general'],
  session_id: 'session-1',
  request_id: 'request-1',
  correlation_id: 'correlation-1',
  channel: 'web',
  locale: 'mn'
});

describe('Gateway rate limiting', () => {
  it('limits by tenant, user, capability, and endpoint and resets after the window', async () => {
    const limiter = new FixedWindowGatewayRateLimiter(1, 1_000);
    const request = { context, endpoint: 'chat' as const, capability: 'ai:general' };
    await limiter.consume(request, new Date(0));
    await expect(limiter.consume(request, new Date(500))).rejects.toMatchObject({
      code: 'RATE_LIMIT_ERROR',
      statusCode: 429
    });
    await expect(limiter.consume(request, new Date(1_000))).resolves.toBeUndefined();
  });
});
