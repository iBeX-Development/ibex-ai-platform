import {
  TrustedGatewayBoundary,
  type GatewayAuthenticator,
  type InboundAuthenticationRequest
} from '../../../packages/security/src/index.js';

/** Security guard for future authenticated API routes. It exposes no Phase 2 endpoint. */
export function createApiSecurityGuard(authenticator: GatewayAuthenticator) {
  const boundary = new TrustedGatewayBoundary(authenticator);
  return (request: InboundAuthenticationRequest, now?: Date) => boundary.bind(request, now);
}
