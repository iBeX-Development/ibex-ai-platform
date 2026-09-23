import { PlatformError } from '../../errors/src/index.js';
import type { TrustedRequestContext } from './context.js';

export interface ResourceReference {
  readonly type: string;
  readonly id: string;
}

/** Implemented by a server-side Core/API adapter; never by an agent or model. */
export interface ResourceOwnershipResolver {
  resolveTenantId(resource: ResourceReference): Promise<string | null>;
}

export async function enforceResourceOwnership(
  resolver: ResourceOwnershipResolver,
  context: TrustedRequestContext,
  resource: ResourceReference
): Promise<void> {
  if (!resource.type.trim() || !resource.id.trim()) {
    throw new PlatformError('AUTHORIZATION_ERROR', 'Authorization could not be verified', 403);
  }

  let resourceTenantId: string | null;
  try {
    resourceTenantId = await resolver.resolveTenantId(resource);
  } catch {
    throw new PlatformError('AUTHORIZATION_ERROR', 'Authorization could not be verified', 403);
  }

  if (!resourceTenantId || resourceTenantId !== context.tenant_id) {
    throw new PlatformError(
      'PERMISSION_DENIED',
      'Requested resource is unavailable within the current authorized scope',
      403
    );
  }
}
