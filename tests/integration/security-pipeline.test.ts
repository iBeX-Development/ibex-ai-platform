import { describe, expect, it } from 'vitest';
import { createSecurityAuditEvent } from '../../packages/audit/src/index.js';
import {
  enforceAuthorization,
  enforceResourceOwnership,
  TrustedGatewayBoundary
} from '../../packages/security/src/index.js';
import {
  authenticatorReturning,
  gatewayEnvelope,
  gatewayIdentity,
  validationTime
} from '../testing/security-fixtures.js';

describe('Phase 1 security pipeline', () => {
  it('preserves tenant and correlation binding through authorization and ownership checks', async () => {
    const boundary = new TrustedGatewayBoundary(authenticatorReturning(gatewayIdentity));
    const bound = await boundary.bind({ headers: {}, envelope: gatewayEnvelope }, validationTime);
    await enforceAuthorization(
      { authorize: () => Promise.resolve({ allowed: true, decision_id: 'core-decision-1' }) },
      bound.context,
      {
        capability: 'asset',
        action: 'read',
        required_permissions: ['asset:read'],
        required_entitlements: ['ai:general'],
        resource: { type: 'asset', id: 'asset-123' }
      }
    );
    await enforceResourceOwnership(
      { resolveTenantId: () => Promise.resolve('tenant-a') },
      bound.context,
      {
        type: 'asset',
        id: 'asset-123'
      }
    );

    const audit = createSecurityAuditEvent(
      bound.context,
      'ai-runtime-test',
      'test',
      'security.authorization.allowed',
      'trace-security-1',
      validationTime
    );
    expect(audit).toMatchObject({
      tenant_id: 'tenant-a',
      user_id: 'user-1',
      request_id: 'request-1',
      correlation_id: 'correlation-1'
    });
    expect(audit).toMatchObject({
      trace_id: 'trace-security-1',
      role: 'operator',
      session_id: 'session-1',
      permission_refs: ['asset:read'],
      entitlement_refs: ['ai:general']
    });
  });
});
