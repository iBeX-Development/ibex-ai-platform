import { createHash } from 'node:crypto';
import type { ApprovalRecord } from './contracts.js';

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Non-finite values cannot be integrity bound');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0
    );
    return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`).join(',')}}`;
  }
  throw new Error('Only JSON-compatible proposal data can be integrity bound');
}

export function approvalEvidenceHash(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
}

export function proposedChangeHash(changes: Readonly<Record<string, unknown>>): string {
  return approvalEvidenceHash(changes);
}

export function proposalIntegrityHash(
  record: Pick<
    ApprovalRecord,
    | 'proposal_id'
    | 'approval_id'
    | 'action_id'
    | 'tenant_id'
    | 'action_type'
    | 'action_version'
    | 'target'
    | 'target_state_hash'
    | 'proposed_change_hash'
    | 'approval_policy'
    | 'requested_at'
    | 'expires_at'
  >
): string {
  return approvalEvidenceHash({
    proposal_id: record.proposal_id,
    approval_id: record.approval_id,
    action_id: record.action_id,
    tenant_id: record.tenant_id,
    action_type: record.action_type,
    action_version: record.action_version,
    target: record.target,
    target_state_hash: record.target_state_hash,
    proposed_change_hash: record.proposed_change_hash,
    approval_policy: record.approval_policy,
    requested_at: record.requested_at,
    expires_at: record.expires_at
  });
}
