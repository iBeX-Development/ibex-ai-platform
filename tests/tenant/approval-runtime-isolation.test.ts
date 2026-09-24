import { describe, expect, it } from 'vitest';
import {
  approvalContext,
  approvalProposalRequest,
  approvalValidationTime,
  createApprovalHarness
} from '../testing/approval-runtime-fixtures.js';

function reference(approvalId: string, context = approvalContext()) {
  return { context, trace_id: 'trace-p9-1', approval_id: approvalId };
}

describe('Phase 9 tenant and ownership isolation', () => {
  it('denies cross-tenant decision synchronization and execution without disclosing state', async () => {
    const harness = createApprovalHarness();
    const proposal = await harness.runtime.propose(
      approvalProposalRequest(),
      approvalValidationTime
    );
    const tenantB = approvalContext({
      tenant_id: 'tenant-b',
      user_id: 'user-b',
      request_id: 'request-p9-b',
      correlation_id: 'correlation-p9-b'
    });
    await expect(
      harness.runtime.synchronizeDecision(
        reference(proposal.approval_id, tenantB),
        approvalValidationTime
      )
    ).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
      publicMessage: 'Approval is unavailable'
    });
    await expect(
      harness.runtime.execute(reference(proposal.approval_id, tenantB), approvalValidationTime)
    ).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
      publicMessage: 'Approval is unavailable'
    });
    expect(harness.adapter.calls).toBe(0);
  });

  it('fails closed when proposal ownership cannot be verified', async () => {
    for (const ownershipTenant of ['tenant-b', null]) {
      const harness = createApprovalHarness({ ownershipTenant });
      await expect(
        harness.runtime.propose(approvalProposalRequest(), approvalValidationTime)
      ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
      expect(harness.store.records.size).toBe(0);
    }
  });

  it('revalidates ownership at execution time even after approval', async () => {
    const harness = createApprovalHarness();
    const proposal = await harness.runtime.propose(
      approvalProposalRequest(),
      approvalValidationTime
    );
    await harness.runtime.synchronizeDecision(
      reference(proposal.approval_id),
      approvalValidationTime
    );
    harness.ownership.tenantId = 'tenant-b';
    await expect(
      harness.runtime.execute(reference(proposal.approval_id), approvalValidationTime)
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    expect(harness.adapter.calls).toBe(0);
  });
});
