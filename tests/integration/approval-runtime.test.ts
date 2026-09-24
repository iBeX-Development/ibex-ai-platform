import { describe, expect, it } from 'vitest';
import {
  approvalContext,
  approvalProposalRequest,
  approvalValidationTime,
  blockedLiveAction,
  createApprovalHarness,
  storedApproval,
  testApprovalAction
} from '../testing/approval-runtime-fixtures.js';

async function pendingApproval(harness = createApprovalHarness()) {
  const proposal = await harness.runtime.propose(approvalProposalRequest(), approvalValidationTime);
  return { harness, proposal };
}

function reference(approvalId: string, context = approvalContext()) {
  return { context, trace_id: 'trace-p9-1', approval_id: approvalId };
}

describe('Gate P9 Human Approval Runtime', () => {
  it('creates an immutable pending proposal without executing an action', async () => {
    const { harness, proposal } = await pendingApproval();
    expect(proposal).toMatchObject({
      status: 'pending',
      action_type: testApprovalAction.action_type,
      approval_policy: 'workflow_approval'
    });
    expect(harness.adapter.calls).toBe(0);
    expect(storedApproval(harness.store, proposal.approval_id)).toMatchObject({
      status: 'pending',
      revision: 0,
      tenant_id: 'tenant-a'
    });
    expect(harness.audits[0]).toMatchObject({
      event_type: 'approval_runtime.lifecycle.outcome',
      outcome: 'pending',
      context: { status: 'trusted', tenant_id: 'tenant-a' }
    });
    expect(JSON.stringify(harness.audits)).not.toContain('Synthetic work order proposal');
  });

  it('uses an authoritative decision source and executes exactly once after revalidation', async () => {
    const { harness, proposal } = await pendingApproval();
    const decision = await harness.runtime.synchronizeDecision(
      reference(proposal.approval_id),
      approvalValidationTime
    );
    expect(decision.status).toBe('approved');
    const executed = await harness.runtime.execute(
      reference(proposal.approval_id),
      approvalValidationTime
    );
    const duplicate = await harness.runtime.execute(
      reference(proposal.approval_id),
      approvalValidationTime
    );
    expect(executed).toMatchObject({ status: 'executed', duplicate: false });
    expect(duplicate).toMatchObject({ status: 'executed', duplicate: true });
    expect(duplicate.idempotency_key).toBe(executed.idempotency_key);
    expect(harness.adapter.calls).toBe(1);
    expect(storedApproval(harness.store, proposal.approval_id).status).toBe('executed');
    expect(harness.audits.find((event) => event.outcome === 'approved')?.evidence).toMatchObject({
      approval_id: proposal.approval_id,
      proposal_id: proposal.proposal_id,
      action_id: proposal.action_id,
      decision: 'approve',
      approver_user_id: 'user-a',
      proposed_change_hash: proposal.proposed_change_hash,
      execution_status: 'not_started',
      executed: false
    });
    expect(
      JSON.stringify(harness.audits.find((event) => event.outcome === 'approved')?.evidence)
    ).toMatch(/"target_object":\{"type":"asset","reference_hash":"sha256:[a-f0-9]{64}"\}/);
    expect(harness.audits.find((event) => event.outcome === 'executed')?.evidence).toMatchObject({
      execution_status: 'succeeded',
      executed: true
    });
    expect(harness.metrics.flat().every((metric) => metric.labels.event_type !== 'other')).toBe(
      true
    );
    expect(harness.metrics.flat()).toContainEqual(
      expect.objectContaining({ name: 'ibex.approval.requests', value: 1 })
    );
  });

  it('turns a rejected Core decision into a terminal non-executable state', async () => {
    const { harness, proposal } = await pendingApproval();
    harness.decisionSource.decision = 'reject';
    const decision = await harness.runtime.synchronizeDecision(
      reference(proposal.approval_id),
      approvalValidationTime
    );
    expect(decision.status).toBe('rejected');
    await expect(
      harness.runtime.execute(reference(proposal.approval_id), approvalValidationTime)
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    expect(harness.adapter.calls).toBe(0);
  });

  it('never executes a pending or expired approval', async () => {
    const { harness, proposal } = await pendingApproval();
    await expect(
      harness.runtime.execute(reference(proposal.approval_id), approvalValidationTime)
    ).rejects.toMatchObject({ code: 'APPROVAL_REQUIRED' });
    const afterExpiry = new Date(approvalValidationTime.getTime() + 31 * 60 * 1000);
    const decision = await harness.runtime.synchronizeDecision(
      reference(proposal.approval_id),
      afterExpiry
    );
    expect(decision.status).toBe('expired');
    await expect(
      harness.runtime.execute(reference(proposal.approval_id), afterExpiry)
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    expect(harness.adapter.calls).toBe(0);
  });

  it('fails closed when proposed changes or integrity evidence are tampered', async () => {
    for (const tamper of [
      (record: ReturnType<typeof storedApproval>) => ({
        ...record,
        proposed_changes: { summary: 'tampered' }
      }),
      (record: ReturnType<typeof storedApproval>) => ({
        ...record,
        proposal_integrity_hash: `sha256:${'0'.repeat(64)}`
      })
    ]) {
      const { harness, proposal } = await pendingApproval();
      harness.store.tamper(proposal.approval_id, tamper);
      await expect(
        harness.runtime.synchronizeDecision(reference(proposal.approval_id), approvalValidationTime)
      ).rejects.toMatchObject({ code: 'POLICY_DENIED' });
      expect(harness.adapter.calls).toBe(0);
    }
  });

  it('revalidates target state immediately before execution', async () => {
    const { harness, proposal } = await pendingApproval();
    await harness.runtime.synchronizeDecision(
      reference(proposal.approval_id),
      approvalValidationTime
    );
    harness.targetState.evidence = {
      tenant_id: 'tenant-a',
      state_hash: `sha256:${'b'.repeat(64)}`,
      executable: true
    };
    await expect(
      harness.runtime.execute(reference(proposal.approval_id), approvalValidationTime)
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(harness.adapter.calls).toBe(0);
  });

  it('integrity-binds authoritative decision evidence through execution', async () => {
    const { harness, proposal } = await pendingApproval();
    await harness.runtime.synchronizeDecision(
      reference(proposal.approval_id),
      approvalValidationTime
    );
    harness.store.tamper(proposal.approval_id, (approval) => ({
      ...approval,
      approver_role: 'tampered-approver-role'
    }));
    await expect(
      harness.runtime.execute(reference(proposal.approval_id), approvalValidationTime)
    ).rejects.toMatchObject({ code: 'POLICY_DENIED' });
    expect(harness.adapter.calls).toBe(0);
  });

  it('does not retry an Action execution failure', async () => {
    const { harness, proposal } = await pendingApproval();
    await harness.runtime.synchronizeDecision(
      reference(proposal.approval_id),
      approvalValidationTime
    );
    harness.adapter.fail = true;
    await expect(
      harness.runtime.execute(reference(proposal.approval_id), approvalValidationTime)
    ).rejects.toMatchObject({ code: 'DEPENDENCY_ERROR' });
    expect(harness.adapter.calls).toBe(1);
    expect(storedApproval(harness.store, proposal.approval_id).status).toBe('execution_failed');
    await expect(
      harness.runtime.execute(reference(proposal.approval_id), approvalValidationTime)
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    expect(harness.adapter.calls).toBe(1);
  });

  it('fails closed before execution when required audit delivery fails', async () => {
    const { harness, proposal } = await pendingApproval();
    await harness.runtime.synchronizeDecision(
      reference(proposal.approval_id),
      approvalValidationTime
    );
    harness.auditControl.fail = true;
    await expect(
      harness.runtime.execute(reference(proposal.approval_id), approvalValidationTime)
    ).rejects.toMatchObject({ code: 'DEPENDENCY_ERROR' });
    expect(harness.adapter.calls).toBe(0);
    expect(storedApproval(harness.store, proposal.approval_id).status).toBe('executing');
  });

  it('keeps live Core proposal and execution paths disabled', async () => {
    const harness = createApprovalHarness({
      actions: [blockedLiveAction],
      environment: 'production',
      allowDeterministic: false
    });
    await expect(
      harness.runtime.propose(
        approvalProposalRequest({
          action_type: blockedLiveAction.action_type,
          action_version: blockedLiveAction.action_version
        }),
        approvalValidationTime
      )
    ).rejects.toMatchObject({ code: 'TOOL_DISABLED' });
    expect(harness.adapter.calls).toBe(0);
  });
});
