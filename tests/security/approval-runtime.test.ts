import { describe, expect, it } from 'vitest';
import {
  approvalBoundaryIdentity,
  approvalContext,
  approvalProposalRequest,
  approvalValidationTime,
  createApprovalHarness
} from '../testing/approval-runtime-fixtures.js';

function reference(approvalId: string, context = approvalContext()) {
  return { context, trace_id: 'trace-p9-1', approval_id: approvalId };
}

describe('Phase 9 critical approval enforcement', () => {
  it('does not expose any caller-controlled approve or approver fields', async () => {
    const { runtime } = createApprovalHarness();
    expect(runtime).not.toHaveProperty('approve');
    await expect(
      runtime.synchronizeDecision(
        {
          ...reference('approval-1'),
          decision: 'approve',
          approver_user_id: 'impersonated-user'
        },
        approvalValidationTime
      )
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('rejects an agent identity outside the server-side action mapping', async () => {
    const harness = createApprovalHarness();
    await expect(
      harness.runtime.propose(
        approvalProposalRequest({ agent_id: 'warehouse', agent_version: '1.0.0' }),
        approvalValidationTime
      )
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    expect(harness.store.records.size).toBe(0);
  });

  it('requires proposal, approval, and execution authorization independently', async () => {
    const missingProposal = createApprovalHarness();
    await expect(
      missingProposal.runtime.propose(
        approvalProposalRequest({
          context: approvalContext({ permissions: ['maintenance:approve', 'maintenance:execute'] })
        }),
        approvalValidationTime
      )
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });

    const harness = createApprovalHarness();
    const proposal = await harness.runtime.propose(
      approvalProposalRequest(),
      approvalValidationTime
    );
    await expect(
      harness.runtime.synchronizeDecision(
        reference(
          proposal.approval_id,
          approvalContext({ permissions: ['maintenance:proposal', 'maintenance:execute'] })
        ),
        approvalValidationTime
      )
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });

    await harness.runtime.synchronizeDecision(
      reference(proposal.approval_id),
      approvalValidationTime
    );
    await expect(
      harness.runtime.execute(
        reference(
          proposal.approval_id,
          approvalContext({ permissions: ['maintenance:proposal', 'maintenance:approve'] })
        ),
        approvalValidationTime
      )
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    expect(harness.adapter.calls).toBe(0);
  });

  it('requires entitlements at every authorization boundary', async () => {
    const harness = createApprovalHarness();
    await expect(
      harness.runtime.propose(
        approvalProposalRequest({ context: approvalContext({ entitlements: [] }) }),
        approvalValidationTime
      )
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  });

  it.each([
    ['tenant_id', 'tenant-b'],
    ['approver_user_id', 'impersonated-user'],
    ['approver_role', 'impersonated-role'],
    ['proposed_change_hash', `sha256:${'f'.repeat(64)}`],
    ['proposal_integrity_hash', `sha256:${'e'.repeat(64)}`]
  ])('rejects spoofed authoritative decision field %s', async (field, value) => {
    const harness = createApprovalHarness();
    const proposal = await harness.runtime.propose(
      approvalProposalRequest(),
      approvalValidationTime
    );
    harness.decisionSource.overrides = { [field]: value };
    await expect(
      harness.runtime.synchronizeDecision(reference(proposal.approval_id), approvalValidationTime)
    ).rejects.toMatchObject({ code: 'POLICY_DENIED' });
    expect(harness.adapter.calls).toBe(0);
  });

  it.each([
    new Date(approvalValidationTime.getTime() - 1).toISOString(),
    new Date(approvalValidationTime.getTime() + 1).toISOString()
  ])('rejects an invalid authoritative decision timestamp %s', async (decisionAt) => {
    const harness = createApprovalHarness();
    const proposal = await harness.runtime.propose(
      approvalProposalRequest(),
      approvalValidationTime
    );
    harness.decisionSource.overrides = { decision_at: decisionAt };
    await expect(
      harness.runtime.synchronizeDecision(reference(proposal.approval_id), approvalValidationTime)
    ).rejects.toMatchObject({ code: 'POLICY_DENIED' });
    expect(harness.adapter.calls).toBe(0);
  });

  it('rechecks approval permission before disclosing a terminal decision', async () => {
    const harness = createApprovalHarness();
    const proposal = await harness.runtime.propose(
      approvalProposalRequest(),
      approvalValidationTime
    );
    await harness.runtime.synchronizeDecision(
      reference(proposal.approval_id),
      approvalValidationTime
    );
    await expect(
      harness.runtime.synchronizeDecision(
        reference(
          proposal.approval_id,
          approvalContext({ permissions: ['maintenance:proposal', 'maintenance:execute'] })
        ),
        approvalValidationTime
      )
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  });

  it('uses server-generated correlation for malformed early rejections without reflection', async () => {
    for (const request of [
      { trace_id: '', approval_id: 'approval-secret' },
      { ...reference('approval-secret'), trace_id: 'trace\nspoof' },
      {
        ...reference('approval-secret'),
        context: { ...approvalContext(), request_id: 'request\u0000spoof' }
      },
      {
        ...reference('approval-secret'),
        context: { ...approvalContext(), tenant_id: '' }
      }
    ]) {
      const harness = createApprovalHarness();
      await expect(
        harness.runtime.synchronizeDecision(request, approvalValidationTime)
      ).rejects.toMatchObject({
        traceId: approvalBoundaryIdentity.trace_id,
        trustedRequestId: approvalBoundaryIdentity.request_id
      });
      expect(harness.audits).toHaveLength(1);
      expect(harness.audits[0]).toMatchObject({
        event_type: 'approval_runtime.lifecycle.outcome',
        trace_id: approvalBoundaryIdentity.trace_id,
        request_id: approvalBoundaryIdentity.request_id,
        correlation_id: approvalBoundaryIdentity.correlation_id,
        context: { status: 'unavailable' }
      });
      const serialized = JSON.stringify(harness.audits);
      expect(serialized).not.toContain('spoof');
      expect(serialized).not.toContain('approval-secret');
      expect(
        harness.security.some((event) => /VALIDATION|TENANT_CONTEXT/.test(event.reason_code))
      ).toBe(true);
    }
  });

  it('keeps raw proposed changes, reasons, and credentials out of normalized audit evidence', async () => {
    const harness = createApprovalHarness();
    await harness.runtime.propose(
      approvalProposalRequest({
        proposed_changes: {
          summary: 'confidential-change-value',
          nested: { api_key: 'never-export-this-key' }
        },
        reason: 'confidential-reason-value'
      }),
      approvalValidationTime
    );
    const serialized = JSON.stringify(harness.audits);
    expect(serialized).not.toContain('confidential-change-value');
    expect(serialized).not.toContain('confidential-reason-value');
    expect(serialized).not.toContain('never-export-this-key');
    expect(serialized).toContain('proposed_change_hash');
  });
});
