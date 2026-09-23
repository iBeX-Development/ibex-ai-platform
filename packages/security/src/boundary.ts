import {
  gatewayRequestEnvelopeSchema,
  type GatewayRequestEnvelope
} from '../../contracts/src/index.js';
import { PlatformError } from '../../errors/src/index.js';
import {
  authenticateGatewayRequest,
  type GatewayAuthenticator,
  type InboundAuthenticationRequest
} from './authentication.js';
import { createTrustedRequestContext, type TrustedRequestContext } from './context.js';

export interface BoundGatewayRequest {
  readonly context: TrustedRequestContext;
  readonly payload: unknown;
  readonly received_at: string;
}

function sameValues(left: readonly string[], right: readonly string[]): boolean {
  const leftValues = new Set(left);
  const rightValues = new Set(right);
  return (
    leftValues.size === left.length &&
    rightValues.size === right.length &&
    leftValues.size === rightValues.size &&
    [...leftValues].every((value) => rightValues.has(value))
  );
}

function assertIdentityBinding(
  envelope: GatewayRequestEnvelope,
  identity: Awaited<ReturnType<typeof authenticateGatewayRequest>>
): void {
  const matches =
    envelope.tenant_id === identity.tenant_id &&
    envelope.user_id === identity.user_id &&
    envelope.role === identity.role &&
    envelope.session_id === identity.session_id &&
    envelope.request_id === identity.request_id &&
    envelope.correlation_id === identity.correlation_id &&
    envelope.locale === identity.locale &&
    sameValues(envelope.permissions, identity.permissions) &&
    sameValues(envelope.entitlements, identity.entitlements);

  if (!matches) {
    throw new PlatformError('TENANT_CONTEXT_ERROR', 'Trusted request context is invalid', 401);
  }
}

export class TrustedGatewayBoundary {
  constructor(private readonly authenticator: GatewayAuthenticator) {}

  async bind(
    request: InboundAuthenticationRequest,
    now: Date = new Date()
  ): Promise<BoundGatewayRequest> {
    const identity = await authenticateGatewayRequest(this.authenticator, request, now);
    const envelopeResult = gatewayRequestEnvelopeSchema.safeParse(request.envelope);
    if (!envelopeResult.success) {
      throw new PlatformError('TENANT_CONTEXT_ERROR', 'Trusted request context is invalid', 401);
    }

    assertIdentityBinding(envelopeResult.data, identity);
    const context = createTrustedRequestContext({
      tenant_id: identity.tenant_id,
      user_id: identity.user_id,
      role: identity.role,
      permissions: identity.permissions,
      entitlements: identity.entitlements,
      session_id: identity.session_id,
      request_id: identity.request_id,
      correlation_id: identity.correlation_id,
      locale: identity.locale
    });

    return Object.freeze({
      context,
      payload: envelopeResult.data.payload,
      received_at: now.toISOString()
    });
  }
}
