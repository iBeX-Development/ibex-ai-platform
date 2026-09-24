import { createHash } from 'node:crypto';

export interface VersionedDomainPrompt {
  readonly prompt_id: string;
  readonly prompt_version: string;
  readonly hierarchy_level: 3;
  readonly content: string;
  readonly content_hash: `sha256:${string}`;
}

export function createVersionedDomainPrompt(
  promptId: string,
  promptVersion: string,
  content: string
): VersionedDomainPrompt {
  const normalized = content.replaceAll('\r\n', '\n').trim();
  return Object.freeze({
    prompt_id: promptId,
    prompt_version: promptVersion,
    hierarchy_level: 3,
    content: normalized,
    content_hash: `sha256:${createHash('sha256').update(normalized, 'utf8').digest('hex')}`
  });
}
