import { z } from 'zod';
import { PlatformError } from '../../errors/src/index.js';

const nonEmpty = z.string().trim().min(1);
const tenantContextShape = { tenant_id: nonEmpty };
const identityContextShape = {
  user_id: nonEmpty,
  roles: z.array(nonEmpty).min(1).readonly()
};
const authorizationContextShape = {
  permissions: z.array(nonEmpty).readonly(),
  entitlements: z.array(nonEmpty).readonly()
};
export const tenantContextSchema = z.object(tenantContextShape).strict().readonly();
export const identityContextSchema = z.object(identityContextShape).strict().readonly();
export const authorizationContextSchema = z.object(authorizationContextShape).strict().readonly();

export const trustedRequestContextSchema = z
  .object({
    ...tenantContextShape,
    ...identityContextShape,
    ...authorizationContextShape,
    session_id: nonEmpty,
    request_id: nonEmpty,
    correlation_id: nonEmpty,
    locale: nonEmpty
  })
  .strict()
  .readonly();

export type TrustedRequestContext = Readonly<z.infer<typeof trustedRequestContextSchema>>;
export type RequestContext = TrustedRequestContext;
export type TenantContext = Readonly<z.infer<typeof tenantContextSchema>>;
export type IdentityContext = Readonly<z.infer<typeof identityContextSchema>>;
export type AuthorizationContext = Readonly<z.infer<typeof authorizationContextSchema>>;

export function createTrustedRequestContext(serverSupplied: unknown): TrustedRequestContext {
  const result = trustedRequestContextSchema.safeParse(serverSupplied);
  if (!result.success)
    throw new PlatformError(
      'TENANT_CONTEXT_ERROR',
      'Trusted request context is invalid',
      401,
      result.error.flatten()
    );
  return Object.freeze({
    ...result.data,
    roles: Object.freeze([...result.data.roles]),
    permissions: Object.freeze([...result.data.permissions]),
    entitlements: Object.freeze([...result.data.entitlements])
  });
}

export function assertTenantAccess(context: TrustedRequestContext, resourceTenantId: string): void {
  if (!resourceTenantId || context.tenant_id !== resourceTenantId) {
    throw new PlatformError('PERMISSION_DENIED', 'Access denied', 403);
  }
}
