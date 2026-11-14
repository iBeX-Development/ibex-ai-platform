import { utcDateTimeSchema } from '../../contracts/src/validation.js';
import { z } from 'zod';
import { PlatformError } from '../../errors/src/index.js';

const nonEmpty = z.string().trim().min(1);

export const authenticatedGatewayIdentitySchema = z
  .object({
    gateway_id: nonEmpty,
    tenant_id: nonEmpty,
    user_id: nonEmpty,
    role: nonEmpty,
    permissions: z.array(nonEmpty).readonly(),
    entitlements: z.array(nonEmpty).readonly(),
    session_id: nonEmpty,
    request_id: nonEmpty,
    correlation_id: nonEmpty,
    channel: z.enum(['web', 'mobile', 'system']),
    locale: nonEmpty,
    authenticated_at: utcDateTimeSchema,
    expires_at: utcDateTimeSchema
  })
  .strict()
  .readonly();

export type AuthenticatedGatewayIdentity = Readonly<
  z.infer<typeof authenticatedGatewayIdentitySchema>
>;

export interface InboundAuthenticationRequest {
  readonly headers: Readonly<Record<string, string | readonly string[] | undefined>>;
  readonly envelope: unknown;
}

/** Implemented by the approved Core/AI Gateway authentication adapter. */
export interface GatewayAuthenticator {
  authenticate(request: InboundAuthenticationRequest): Promise<unknown>;
}

export async function authenticateGatewayRequest(
  authenticator: GatewayAuthenticator,
  request: InboundAuthenticationRequest,
  now: Date = new Date()
): Promise<AuthenticatedGatewayIdentity> {
  let result: ReturnType<typeof authenticatedGatewayIdentitySchema.safeParse>;
  try {
    const rawIdentity: unknown = await authenticator.authenticate(request);
    result = authenticatedGatewayIdentitySchema.safeParse(rawIdentity);
  } catch {
    throw new PlatformError('AUTHENTICATION_ERROR', 'Authentication failed', 401);
  }

  if (
    !result.success ||
    Date.parse(result.data.authenticated_at) > now.getTime() ||
    Date.parse(result.data.expires_at) <= now.getTime() ||
    Date.parse(result.data.authenticated_at) >= Date.parse(result.data.expires_at)
  ) {
    throw new PlatformError('AUTHENTICATION_ERROR', 'Authentication failed', 401);
  }

  return Object.freeze({
    ...result.data,
    permissions: Object.freeze([...result.data.permissions]),
    entitlements: Object.freeze([...result.data.entitlements])
  });
}
