import type { KnowledgeChunk, RagSecurityFilter } from './contracts.js';

function includesEvery(granted: readonly string[], required: readonly string[]): boolean {
  return required.every((value) => granted.includes(value));
}

export function matchesRagSecurityFilter(
  chunk: KnowledgeChunk,
  filter: RagSecurityFilter
): boolean {
  const effectiveAt = Date.parse(filter.effective_at);
  const effectiveDate = Date.parse(chunk.effective_date);
  const expiryDate = chunk.expiry_date ? Date.parse(chunk.expiry_date) : undefined;
  const tenantAllowed =
    chunk.tenant_scope !== 'tenant_private' || chunk.tenant_id === filter.tenant_id;

  return (
    tenantAllowed &&
    chunk.approval_status === 'approved' &&
    effectiveDate <= effectiveAt &&
    (expiryDate === undefined || expiryDate > effectiveAt) &&
    chunk.domains.includes(filter.domain) &&
    chunk.allowed_agents.includes(filter.agent_id) &&
    chunk.knowledge_scopes.some((scope) => filter.knowledge_scopes.includes(scope)) &&
    includesEvery(filter.permissions, chunk.access_scope.required_permissions) &&
    includesEvery(filter.entitlements, chunk.access_scope.required_entitlements) &&
    (chunk.access_scope.allowed_roles.length === 0 ||
      chunk.access_scope.allowed_roles.includes(filter.role))
  );
}
