import type {
  AuthenticatedGatewayIdentity,
  GatewayAuthenticator
} from '../../packages/security/src/index.js';

export const gatewayIdentity: AuthenticatedGatewayIdentity = {
  gateway_id: 'gateway-1',
  tenant_id: 'tenant-a',
  user_id: 'user-1',
  role: 'operator',
  permissions: ['asset:read'],
  entitlements: ['ai:general'],
  session_id: 'session-1',
  request_id: 'request-1',
  correlation_id: 'correlation-1',
  channel: 'web',
  locale: 'mn',
  authenticated_at: '2026-09-23T00:00:00.000Z',
  expires_at: '2026-09-23T01:00:00.000Z'
};

export const gatewayEnvelope = {
  contract_version: '1.0' as const,
  request_id: gatewayIdentity.request_id,
  correlation_id: gatewayIdentity.correlation_id,
  tenant_id: gatewayIdentity.tenant_id,
  user_id: gatewayIdentity.user_id,
  role: gatewayIdentity.role,
  permissions: gatewayIdentity.permissions,
  entitlements: gatewayIdentity.entitlements,
  session_id: gatewayIdentity.session_id,
  timestamp: '2026-09-23T00:00:00.000Z',
  channel: gatewayIdentity.channel,
  locale: gatewayIdentity.locale,
  payload: { message: 'show my assets' }
};

export function authenticatorReturning(identity: unknown): GatewayAuthenticator {
  return {
    authenticate: () => Promise.resolve(identity)
  };
}

export const validationTime = new Date('2026-09-23T00:30:00.000Z');
