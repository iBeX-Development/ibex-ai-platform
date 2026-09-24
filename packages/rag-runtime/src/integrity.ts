import { createHash } from 'node:crypto';
import type { KnowledgeChunk, KnowledgeDocument } from './contracts.js';

export function sha256Evidence(value: string): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

export function canonicalDocumentContent(document: KnowledgeDocument): string {
  return document.sections
    .map((section) =>
      JSON.stringify([
        section.location.ordinal,
        section.location.section,
        section.location.reference,
        section.location.page ?? null,
        section.content
      ])
    )
    .join('\n');
}

export function calculateDocumentChecksum(document: KnowledgeDocument): `sha256:${string}` {
  return sha256Evidence(canonicalDocumentContent(document));
}

export function stableChunkId(input: {
  readonly document_id: string;
  readonly document_version: string;
  readonly tenant_scope: string;
  readonly tenant_id?: string;
  readonly section: string;
  readonly reference: string;
  readonly page?: number;
  readonly ordinal: number;
  readonly content_hash: string;
}): `sha256:${string}` {
  return sha256Evidence(
    JSON.stringify([
      input.document_id,
      input.document_version,
      input.tenant_scope,
      input.tenant_id ?? null,
      input.section,
      input.reference,
      input.page ?? null,
      input.ordinal,
      input.content_hash
    ])
  );
}

export function stableChunkIdForStoredChunk(chunk: KnowledgeChunk): `sha256:${string}` {
  return stableChunkId({
    document_id: chunk.document_id,
    document_version: chunk.document_version,
    tenant_scope: chunk.tenant_scope,
    ...(chunk.tenant_id ? { tenant_id: chunk.tenant_id } : {}),
    section: chunk.source_location.section,
    reference: chunk.source_location.reference,
    ...(chunk.source_location.page !== undefined ? { page: chunk.source_location.page } : {}),
    ordinal: chunk.source_location.ordinal,
    content_hash: chunk.content_hash
  });
}
