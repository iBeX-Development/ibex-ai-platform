import { describe, expect, it } from 'vitest';
import {
  InMemoryToolRateLimiter,
  ToolRateLimitCatalog,
  ToolRegistry,
  type ToolRateLimitAdmission,
  type ToolRateLimitPolicy
} from '../../packages/tool-runtime/src/index.js';
import { readToolRegistration } from '../testing/tool-runtime-fixtures.js';

const policy = { reference: { policy_id: 'synthetic', version: '1' }, limit: 2, window_ms: 10 };
const admission = (overrides: Partial<ToolRateLimitAdmission> = {}): ToolRateLimitAdmission => ({
  tenant_id: 'tenant-a',
  tool_id: 'tool-a',
  tool_version: '1',
  environment: 'test',
  policy,
  signal: new AbortController().signal,
  ...overrides
});

describe('Tool admission policy and deterministic fixed windows', () => {
  it.each([
    undefined,
    null,
    {},
    { policy_id: 'synthetic' },
    { policy_id: ' synthetic', version: '1' },
    { policy_id: 'synthetic', version: '1 ' },
    { policy_id: 'synthetic\n', version: '1' },
    { policy_id: 'synthetic', version: '1\r\n' },
    { policy_id: 'synthetic', version: '1', limit: 1 }
  ])('rejects missing/inexact metadata %j', (rate_limit) => {
    expect(
      () =>
        new ToolRegistry([
          {
            ...readToolRegistration,
            metadata: { ...readToolRegistration.metadata, rate_limit }
          } as unknown as typeof readToolRegistration
        ])
    ).toThrow(expect.objectContaining({ code: 'CONFIGURATION_ERROR' }));
  });

  it('sanitizes throwing registration policy metadata', () => {
    const metadata = {
      ...readToolRegistration.metadata,
      get rate_limit(): typeof policy.reference {
        throw new Error('private-policy');
      }
    };
    expect(() => new ToolRegistry([{ ...readToolRegistration, metadata }])).toThrow(
      'Tool registry configuration is invalid'
    );
  });

  it('captures frozen metadata references and immutable policy copies', () => {
    const source = { ...policy, reference: { ...policy.reference } };
    const catalog = new ToolRateLimitCatalog([source]);
    source.limit = 100;
    source.reference.version = 'changed';
    const resolved = catalog.resolve(policy.reference);
    expect(resolved).toEqual(policy);
    expect(Object.isFrozen(resolved)).toBe(true);
    expect(Object.isFrozen(resolved.reference)).toBe(true);
    expect(Object.isFrozen(catalog)).toBe(true);
    const rate_limit = { ...policy.reference };
    const registry = new ToolRegistry([
      { ...readToolRegistration, metadata: { ...readToolRegistration.metadata, rate_limit } }
    ]);
    rate_limit.version = 'changed';
    expect(registry.list()[0]?.rate_limit).toEqual(policy.reference);
    expect(Object.isFrozen(registry.list()[0]?.rate_limit)).toBe(true);
  });

  it.each([0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '2'])(
    'rejects invalid limit %j',
    (limit) => {
      expect(() => new ToolRateLimitCatalog([{ ...policy, limit } as ToolRateLimitPolicy])).toThrow(
        expect.objectContaining({ code: 'CONFIGURATION_ERROR' })
      );
    }
  );
  it.each([0, -1, 0.5, NaN, Infinity, 2_147_483_648, '10'])(
    'rejects invalid window %j',
    (window_ms) => {
      expect(
        () => new ToolRateLimitCatalog([{ ...policy, window_ms } as ToolRateLimitPolicy])
      ).toThrow(expect.objectContaining({ code: 'CONFIGURATION_ERROR' }));
    }
  );
  it('rejects duplicate, throwing and unknown policy configuration without raw details', () => {
    expect(() => new ToolRateLimitCatalog([policy, policy])).toThrow(
      'Tool rate policy is not configured'
    );
    expect(
      () =>
        new ToolRateLimitCatalog([
          {
            get reference() {
              throw new Error('private');
            }
          } as unknown as ToolRateLimitPolicy
        ])
    ).toThrow('Tool rate policy is not configured');
    expect(() =>
      new ToolRateLimitCatalog([policy]).resolve({ ...policy.reference, version: 'unknown' })
    ).toThrow('Tool rate policy is not configured');
  });

  it('starts at first admission, exhausts, and resets at elapsed equality', async () => {
    let now = 99;
    const limiter = new InMemoryToolRateLimiter(() => now);
    expect(await limiter.consume(admission())).toEqual({ allowed: true });
    now = 108;
    expect(await limiter.consume(admission())).toEqual({ allowed: true });
    expect(await limiter.consume(admission())).toEqual({ allowed: false });
    now = 109;
    expect(await limiter.consume(admission())).toEqual({ allowed: true });
    expect(await limiter.consume(admission())).toEqual({ allowed: true });
    expect(await limiter.consume(admission())).toEqual({ allowed: false });
  });
  it('atomically admits exactly the limit under concurrent calls', async () => {
    const limiter = new InMemoryToolRateLimiter(() => 100);
    const results = await Promise.all(
      Array.from({ length: 20 }, () => limiter.consume(admission()))
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(2);
  });
  it.each(['tenant_id', 'tool_id', 'tool_version', 'environment'] as const)(
    'isolates %s',
    async (field) => {
      const limiter = new InMemoryToolRateLimiter(() => 100);
      const one = { ...policy, limit: 1 };
      expect(await limiter.consume(admission({ policy: one }))).toEqual({ allowed: true });
      expect(await limiter.consume(admission({ policy: one }))).toEqual({ allowed: false });
      expect(await limiter.consume(admission({ policy: one, [field]: 'different' }))).toEqual({
        allowed: true
      });
    }
  );
  it('isolates policy identities/versions and delimiter collisions', async () => {
    const limiter = new InMemoryToolRateLimiter(() => 100);
    for (const reference of [
      policy.reference,
      { policy_id: 'synthetic', version: '2' },
      { policy_id: 'other', version: '1' }
    ]) {
      const one = { ...policy, reference, limit: 1 };
      for (const scope of [
        { tenant_id: 'a:b', tool_id: 'c' },
        { tenant_id: 'a', tool_id: 'b:c' }
      ]) {
        expect(await limiter.consume(admission({ ...scope, policy: one }))).toEqual({
          allowed: true
        });
        expect(await limiter.consume(admission({ ...scope, policy: one }))).toEqual({
          allowed: false
        });
      }
    }
  });
  it.each([99, NaN, Infinity, -1, Number.MAX_SAFE_INTEGER + 1])(
    'fails closed for rollback/invalid clock %j without consuming',
    async (badTime) => {
      let now = 100;
      const limiter = new InMemoryToolRateLimiter(() => now);
      await limiter.consume(admission());
      now = badTime;
      await expect(limiter.consume(admission())).rejects.toMatchObject({
        code: 'SERVICE_UNAVAILABLE'
      });
      now = 100;
      expect(await limiter.consume(admission())).toEqual({ allowed: true });
      expect(await limiter.consume(admission())).toEqual({ allowed: false });
    }
  );
  it('does not consume before cancellation, and never refunds admitted cancellation', async () => {
    const controller = new AbortController();
    const limiter = new InMemoryToolRateLimiter(() => 100);
    const one = { ...policy, limit: 1 };
    controller.abort();
    await expect(
      limiter.consume(admission({ policy: one, signal: controller.signal }))
    ).rejects.toThrow();
    const admitted = new AbortController();
    expect(await limiter.consume(admission({ policy: one, signal: admitted.signal }))).toEqual({
      allowed: true
    });
    admitted.abort();
    expect(await limiter.consume(admission({ policy: one }))).toEqual({ allowed: false });
  });
});
