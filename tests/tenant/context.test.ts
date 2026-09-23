import { describe, expect, it } from 'vitest';
import {
  assertTenantAccess,
  createTrustedRequestContext
} from '../../packages/security/src/index.js';

const input = {
  tenant_id: 'tenant-a',
  user_id: 'user-1',
  role: 'operator',
  permissions: [],
  entitlements: [],
  session_id: 's-1',
  request_id: 'r-1',
  correlation_id: 'c-1',
  locale: 'mn'
};
describe('trusted tenant context', () => {
  it('validates and freezes canonical context', () => {
    const context = createTrustedRequestContext(input);
    expect(Object.isFrozen(context)).toBe(true);
    expect(context.tenant_id).toBe('tenant-a');
  });
  it('requires tenant identity', () => {
    expect(() => createTrustedRequestContext({ ...input, tenant_id: '' })).toThrow();
  });
  it('denies cross-tenant access', () => {
    expect(() => {
      assertTenantAccess(createTrustedRequestContext(input), 'tenant-b');
    }).toThrow('Access denied');
  });
  it('denies missing resource tenant', () => {
    expect(() => {
      assertTenantAccess(createTrustedRequestContext(input), '');
    }).toThrow('Access denied');
  });
});
