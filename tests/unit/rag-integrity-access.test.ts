import { describe, expect, it } from 'vitest';
import {
  calculateDocumentChecksum,
  matchesRagSecurityFilter,
  sha256Evidence,
  stableChunkId,
  type RagSecurityFilter
} from '../../packages/rag-runtime/src/index.js';
import {
  indexedChunk,
  makeDocument,
  ragContext,
  ragValidationTime
} from '../testing/rag-runtime-fixtures.js';

const filter = (): RagSecurityFilter => ({
  tenant_id: ragContext.tenant_id,
  user_id: ragContext.user_id,
  role: ragContext.role,
  permissions: ragContext.permissions,
  entitlements: ragContext.entitlements,
  agent_id: 'maintenance',
  domain: 'maintenance',
  knowledge_scopes: ['maintenance-manuals'],
  approval_status: 'approved',
  effective_at: ragValidationTime.toISOString(),
  latest_approved_only: true
});

describe('Phase 6 chunk integrity and access filtering', () => {
  it('produces a stable document checksum and changes it with content', () => {
    expect(calculateDocumentChecksum(makeDocument())).toBe(
      calculateDocumentChecksum(makeDocument())
    );
    expect(calculateDocumentChecksum(makeDocument({}, 'changed content'))).not.toBe(
      calculateDocumentChecksum(makeDocument())
    );
  });

  it('binds stable chunk identity to document, location, and content evidence', () => {
    const base = {
      document_id: 'doc',
      document_version: '1',
      tenant_scope: 'tenant_private',
      tenant_id: 'tenant-a',
      section: 's',
      reference: 'r',
      ordinal: 0,
      content_hash: sha256Evidence('content')
    };
    expect(stableChunkId(base)).toBe(stableChunkId(base));
    expect(stableChunkId({ ...base, ordinal: 1 })).not.toBe(stableChunkId(base));
    expect(stableChunkId({ ...base, tenant_id: 'tenant-b' })).not.toBe(stableChunkId(base));
    expect(stableChunkId({ ...base, content_hash: sha256Evidence('changed') })).not.toBe(
      stableChunkId(base)
    );
  });

  it('accepts a fully authorized tenant chunk', async () => {
    expect(matchesRagSecurityFilter(await indexedChunk(), filter())).toBe(true);
  });

  it('rejects tenant, permission, entitlement, role, domain, and agent mismatches', async () => {
    const chunk = await indexedChunk();
    expect(matchesRagSecurityFilter(chunk, { ...filter(), tenant_id: 'tenant-b' })).toBe(false);
    expect(matchesRagSecurityFilter(chunk, { ...filter(), permissions: [] })).toBe(false);
    expect(matchesRagSecurityFilter(chunk, { ...filter(), entitlements: [] })).toBe(false);
    expect(matchesRagSecurityFilter(chunk, { ...filter(), role: 'viewer' })).toBe(false);
    expect(matchesRagSecurityFilter(chunk, { ...filter(), domain: 'warehouse' })).toBe(false);
    expect(matchesRagSecurityFilter(chunk, { ...filter(), agent_id: 'general' })).toBe(false);
  });

  it('rejects revoked, future, and expired chunks', async () => {
    const chunk = await indexedChunk();
    expect(matchesRagSecurityFilter({ ...chunk, approval_status: 'revoked' }, filter())).toBe(
      false
    );
    expect(
      matchesRagSecurityFilter({ ...chunk, effective_date: '2027-01-01T00:00:00.000Z' }, filter())
    ).toBe(false);
    expect(
      matchesRagSecurityFilter({ ...chunk, expiry_date: '2026-01-01T00:00:00.000Z' }, filter())
    ).toBe(false);
  });
});
