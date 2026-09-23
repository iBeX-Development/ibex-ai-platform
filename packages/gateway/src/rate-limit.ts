import { PlatformError } from '../../errors/src/index.js';
import type { TrustedRequestContext } from '../../security/src/index.js';
import type { GatewayEndpoint } from './contracts.js';

export interface GatewayRateLimitRequest {
  readonly context: TrustedRequestContext;
  readonly endpoint: GatewayEndpoint;
  readonly capability: string;
}

export interface GatewayRateLimiter {
  consume(request: GatewayRateLimitRequest, now?: Date): Promise<void>;
}

interface WindowState {
  count: number;
  startedAt: number;
}

/** Pilot local limiter. A distributed adapter is required before multi-instance deployment. */
export class FixedWindowGatewayRateLimiter implements GatewayRateLimiter {
  private readonly windows = new Map<string, WindowState>();

  constructor(
    private readonly limit: number,
    private readonly windowMs = 60_000
  ) {
    if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(windowMs) || windowMs < 1) {
      throw new Error('Rate limiter values must be positive integers');
    }
  }

  consume(request: GatewayRateLimitRequest, now: Date = new Date()): Promise<void> {
    const key = JSON.stringify([
      request.context.tenant_id,
      request.context.user_id,
      request.capability,
      request.endpoint
    ]);
    const currentTime = now.getTime();
    const current = this.windows.get(key);
    const state =
      !current || currentTime - current.startedAt >= this.windowMs
        ? { count: 0, startedAt: currentTime }
        : current;

    if (state.count >= this.limit) {
      return Promise.reject(new PlatformError('RATE_LIMIT_ERROR', 'Rate limit exceeded', 429));
    }
    state.count += 1;
    this.windows.set(key, state);
    return Promise.resolve();
  }
}
