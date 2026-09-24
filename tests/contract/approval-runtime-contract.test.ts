import { describe, expect, it } from 'vitest';
import {
  ApprovalActionRegistry,
  approvalActionDefinitionSchema,
  approvalDecisionEvidenceSchema,
  approvalProposalRequestSchema,
  approvalReferenceRequestSchema,
  proposedChangeHash
} from '../../packages/approval-runtime/src/index.js';
import {
  approvalContext,
  approvalProposalRequest,
  blockedLiveAction,
  testApprovalAction
} from '../testing/approval-runtime-fixtures.js';

describe('Phase 9 approval contracts', () => {
  it('accepts deterministic test actions and keeps live Core actions disabled', () => {
    expect(approvalActionDefinitionSchema.safeParse(testApprovalAction).success).toBe(true);
    expect(approvalActionDefinitionSchema.safeParse(blockedLiveAction).success).toBe(true);
    expect(
      approvalActionDefinitionSchema.safeParse({ ...blockedLiveAction, enabled: true }).success
    ).toBe(false);
  });

  it('prohibits retryable or implicitly idempotent Action execution definitions', () => {
    expect(
      approvalActionDefinitionSchema.safeParse({
        ...testApprovalAction,
        retry_policy: { max_attempts: 2 },
        safe_idempotent_execution: true
      }).success
    ).toBe(false);
  });

  it('rejects caller-supplied approval decisions and approver identity', () => {
    expect(
      approvalReferenceRequestSchema.safeParse({
        context: approvalContext(),
        trace_id: 'trace-p9-1',
        approval_id: 'approval-1',
        decision: 'approve',
        approver_user_id: 'forged-approver'
      }).success
    ).toBe(false);
  });

  it('requires strict proposal fields and JSON object changes', () => {
    expect(approvalProposalRequestSchema.safeParse(approvalProposalRequest()).success).toBe(true);
    expect(
      approvalProposalRequestSchema.safeParse({
        ...approvalProposalRequest(),
        candidate_approval: true
      }).success
    ).toBe(false);
  });

  it('requires complete authoritative decision evidence', () => {
    expect(
      approvalDecisionEvidenceSchema.safeParse({
        approval_id: 'approval-1',
        decision: 'approve'
      }).success
    ).toBe(false);
  });

  it('rejects duplicate registry identities', () => {
    expect(() => new ApprovalActionRegistry([testApprovalAction, testApprovalAction])).toThrow(
      'Duplicate approval action definition'
    );
  });

  it('uses deterministic canonical proposal hashing independent of object key order', () => {
    expect(proposedChangeHash({ a: 1, b: { c: true } })).toBe(
      proposedChangeHash({ b: { c: true }, a: 1 })
    );
    expect(proposedChangeHash({ a: 1 })).not.toBe(proposedChangeHash({ a: 2 }));
  });
});
