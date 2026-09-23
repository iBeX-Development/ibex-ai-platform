import { PlatformError } from '../../errors/src/index.js';
import type { TrustedRequestContext } from './context.js';
import { z } from 'zod';

export interface AuthorizationRequest {
  readonly capability: string;
  readonly action: string;
  readonly required_permissions: readonly string[];
  readonly required_entitlements: readonly string[];
  readonly resource?: Readonly<{ type: string; id: string }>;
}

export type AuthorizationDecision =
  | Readonly<{ allowed: true; decision_id: string }>
  | Readonly<{ allowed: false; decision_id?: string; reason: string }>;

const authorizationDecisionSchema = z.discriminatedUnion('allowed', [
  z.object({ allowed: z.literal(true), decision_id: z.string().trim().min(1) }).strict(),
  z
    .object({
      allowed: z.literal(false),
      decision_id: z.string().trim().min(1).optional(),
      reason: z.string().trim().min(1)
    })
    .strict()
]);

/** The adapter must delegate final authority to the approved Core/Gateway policy source. */
export interface ServerAuthorizationPolicy {
  authorize(
    context: TrustedRequestContext,
    request: AuthorizationRequest
  ): Promise<AuthorizationDecision>;
}

function hasRequiredValues(granted: readonly string[], required: readonly string[]): boolean {
  return required.every((value) => granted.includes(value));
}

export async function enforceAuthorization(
  policy: ServerAuthorizationPolicy,
  context: TrustedRequestContext,
  request: AuthorizationRequest
): Promise<Extract<AuthorizationDecision, { allowed: true }>> {
  if (
    !request.capability.trim() ||
    !request.action.trim() ||
    !hasRequiredValues(context.permissions, request.required_permissions) ||
    !hasRequiredValues(context.entitlements, request.required_entitlements)
  ) {
    throw new PlatformError('PERMISSION_DENIED', 'Access denied', 403);
  }

  let rawDecision: unknown;
  try {
    rawDecision = await policy.authorize(context, request);
  } catch {
    throw new PlatformError('AUTHORIZATION_ERROR', 'Authorization could not be verified', 403);
  }

  const parsedDecision = authorizationDecisionSchema.safeParse(rawDecision);
  if (!parsedDecision.success) {
    throw new PlatformError('AUTHORIZATION_ERROR', 'Authorization could not be verified', 403);
  }
  if (!parsedDecision.data.allowed) {
    throw new PlatformError('PERMISSION_DENIED', 'Access denied', 403);
  }
  return Object.freeze(parsedDecision.data);
}
