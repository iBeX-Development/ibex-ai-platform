import { describe, expect, it, vi } from 'vitest';
import { toErrorEnvelope } from '../../packages/errors/src/index.js';
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

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

describe('Gate P9 Human Approval Runtime', () => {
  it.each([
    'authority',
    'target_state',
    'approved_audit',
    'executing_audit',
    'execution_claim'
  ] as const)('denies execution when approval expires while awaiting %s', async (operation) => {
    let clockMs = approvalValidationTime.getTime();
    const { harness, proposal } = await pendingApproval(
      createApprovalHarness({ clock: () => new Date(clockMs) })
    );
    await harness.runtime.synchronizeDecision(
      reference(proposal.approval_id),
      approvalValidationTime
    );
    const entered = deferred();
    const resume = deferred();
    const wait = async () => {
      entered.release();
      await resume.promise;
    };
    if (operation === 'authority') {
      const original = harness.decisionSource.getDecision.bind(harness.decisionSource);
      vi.spyOn(harness.decisionSource, 'getDecision').mockImplementation(async (input) => {
        await wait();
        return original(input);
      });
    } else if (operation === 'target_state') {
      vi.spyOn(harness.targetState, 'resolve').mockImplementation(async () => {
        await wait();
        return harness.targetState.evidence;
      });
    } else if (operation === 'execution_claim') {
      const original = harness.store.save.bind(harness.store);
      vi.spyOn(harness.store, 'save').mockImplementation(async (record, revision) => {
        if (record.status === 'executing') await wait();
        return original(record, revision);
      });
    } else {
      harness.auditControl.beforeExport = async (event) => {
        if (
          event.evidence.operation === 'execute' &&
          event.outcome === (operation === 'approved_audit' ? 'approved' : 'executing')
        )
          await wait();
      };
    }
    // Attach the rejection handler before releasing the awaited operation.
    const result = harness.runtime
      .execute(reference(proposal.approval_id), approvalValidationTime)
      .then(
        (value) => value,
        (error: unknown) => error
      );
    await entered.promise;
    expect(harness.adapter.calls).toBe(0);
    clockMs = new Date(proposal.expires_at).getTime();
    resume.release();
    const error = await result;
    expect(harness.adapter.calls).toBe(0);
    expect(toErrorEnvelope(error)).toEqual({
      error: {
        code: 'CONFLICT',
        message: 'Approval has expired',
        request_id: 'request-p9-1',
        trace_id: 'trace-p9-1'
      }
    });
    expect(storedApproval(harness.store, proposal.approval_id)).toMatchObject({
      status: 'expired'
    });
    const failure = harness.audits.find(
      (event) => event.evidence.operation === 'execute' && event.outcome === 'error'
    );
    expect(failure).toMatchObject({
      request_id: 'request-p9-1',
      correlation_id: 'correlation-p9-1',
      trace_id: 'trace-p9-1',
      evidence: {
        approval_state: 'expired',
        execution_status: 'not_started',
        executed: false,
        error_code: 'CONFLICT'
      }
    });
    for (const sensitive of ['asset-a', 'Synthetic work order proposal', 'priority']) {
      expect(JSON.stringify({ publicError: toErrorEnvelope(error), failure })).not.toContain(
        sensitive
      );
    }
    await expect(
      harness.runtime.execute(reference(proposal.approval_id), approvalValidationTime)
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    expect(harness.adapter.calls).toBe(0);
  });
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
    expect(
      harness.audits.find(
        (event) => event.outcome === 'error' && event.stage === 'execution_revalidation'
      )?.evidence
    ).toMatchObject({
      approval_id: proposal.approval_id,
      approval_state: 'rejected',
      decision: 'reject',
      executed: false,
      error_code: 'PERMISSION_DENIED'
    });
  });

  it.each([
    ['revoke', 'cancelled'],
    ['reject', 'rejected'],
    ['expire', 'expired']
  ] as const)(
    'revalidates an approved decision and denies execution after authoritative %s',
    async (authoritativeDecision, expectedStatus) => {
      const { harness, proposal } = await pendingApproval();
      await harness.runtime.synchronizeDecision(
        reference(proposal.approval_id),
        approvalValidationTime
      );
      harness.decisionSource.decision = authoritativeDecision;
      await expect(
        harness.runtime.execute(reference(proposal.approval_id), approvalValidationTime)
      ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
      expect(harness.adapter.calls).toBe(0);
      expect(harness.decisionSource.calls).toBe(2);
      expect(storedApproval(harness.store, proposal.approval_id).status).toBe(expectedStatus);
      expect(
        harness.audits.find(
          (event) =>
            event.outcome === expectedStatus && event.stage === 'authoritative_revalidation'
        )?.evidence
      ).toMatchObject({
        approval_id: proposal.approval_id,
        approval_state: expectedStatus,
        decision: authoritativeDecision,
        executed: false
      });
    }
  );

  it('does not trust a stale local approved decision during synchronization or execution', async () => {
    const { harness, proposal } = await pendingApproval();
    await harness.runtime.synchronizeDecision(
      reference(proposal.approval_id),
      approvalValidationTime
    );
    harness.decisionSource.decision = 'cancel';
    const cancelled = await harness.runtime.synchronizeDecision(
      reference(proposal.approval_id),
      approvalValidationTime
    );
    expect(cancelled.status).toBe('cancelled');
    const authorityCalls = harness.decisionSource.calls;
    expect(
      await harness.runtime.synchronizeDecision(
        reference(proposal.approval_id),
        approvalValidationTime
      )
    ).toMatchObject({ status: 'cancelled' });
    expect(harness.decisionSource.calls).toBe(authorityCalls);
    await expect(
      harness.runtime.execute(reference(proposal.approval_id), approvalValidationTime)
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    expect(harness.adapter.calls).toBe(0);
    expect(
      harness.audits.find(
        (event) => event.outcome === 'error' && event.stage === 'execution_revalidation'
      )?.evidence
    ).toMatchObject({
      approval_id: proposal.approval_id,
      approval_state: 'cancelled',
      decision: 'cancel',
      executed: false,
      error_code: 'PERMISSION_DENIED'
    });
  });

  it('fails closed when authoritative approval revalidation is unavailable', async () => {
    const { harness, proposal } = await pendingApproval();
    await harness.runtime.synchronizeDecision(
      reference(proposal.approval_id),
      approvalValidationTime
    );
    harness.decisionSource.unavailable = true;
    await expect(
      harness.runtime.execute(reference(proposal.approval_id), approvalValidationTime)
    ).rejects.toMatchObject({ code: 'DEPENDENCY_ERROR' });
    expect(harness.adapter.calls).toBe(0);
    expect(storedApproval(harness.store, proposal.approval_id).status).toBe('approved');
  });

  it('fails closed on conflicting authoritative approval evidence', async () => {
    const { harness, proposal } = await pendingApproval();
    await harness.runtime.synchronizeDecision(
      reference(proposal.approval_id),
      approvalValidationTime
    );
    harness.decisionSource.overrides = { correlation_id: 'conflicting-correlation' };
    await expect(
      harness.runtime.execute(reference(proposal.approval_id), approvalValidationTime)
    ).rejects.toMatchObject({ code: 'POLICY_DENIED' });
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
    expect(storedApproval(harness.store, proposal.approval_id).status).toBe('approved');
  });

  it('closes a non-dispatched execution claim when its audit delivery fails', async () => {
    const { harness, proposal } = await pendingApproval();
    await harness.runtime.synchronizeDecision(
      reference(proposal.approval_id),
      approvalValidationTime
    );
    harness.auditControl.beforeExport = (event) => {
      if (event.evidence.operation === 'execute' && event.outcome === 'executing') {
        return Promise.reject(new Error('private audit destination unavailable'));
      }
      return Promise.resolve();
    };
    const error = await harness.runtime
      .execute(reference(proposal.approval_id), approvalValidationTime)
      .catch((failure: unknown) => failure);
    expect(harness.adapter.calls).toBe(0);
    expect(toErrorEnvelope(error)).toEqual({
      error: {
        code: 'DEPENDENCY_ERROR',
        message: 'Required audit evidence could not be delivered',
        request_id: 'request-p9-1',
        trace_id: 'trace-p9-1'
      }
    });
    const stored = storedApproval(harness.store, proposal.approval_id);
    expect(stored).toMatchObject({ status: 'execution_failed', revision: 3, decision: 'approve' });
    expect(stored.idempotency_key).toBeDefined();
    expect(stored.execution_receipt).toBeUndefined();
    expect(JSON.stringify(toErrorEnvelope(error))).not.toContain('private audit destination');
    await expect(
      harness.runtime.execute(reference(proposal.approval_id), approvalValidationTime)
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    expect(harness.adapter.calls).toBe(0);
  });

  it('does not overwrite a concurrent revision when closing an expired execution claim', async () => {
    let clockMs = approvalValidationTime.getTime();
    const { harness, proposal } = await pendingApproval(
      createApprovalHarness({ clock: () => new Date(clockMs) })
    );
    await harness.runtime.synchronizeDecision(
      reference(proposal.approval_id),
      approvalValidationTime
    );
    harness.auditControl.beforeExport = (event) => {
      if (event.evidence.operation === 'execute' && event.outcome === 'executing') {
        clockMs = new Date(proposal.expires_at).getTime();
        harness.store.tamper(proposal.approval_id, (record) => ({
          ...record,
          revision: record.revision + 1
        }));
      }
      return Promise.resolve();
    };
    const error = await harness.runtime
      .execute(reference(proposal.approval_id), approvalValidationTime)
      .catch((failure: unknown) => failure);
    expect(harness.adapter.calls).toBe(0);
    expect(toErrorEnvelope(error)).toEqual({
      error: {
        code: 'CONFLICT',
        message: 'Approval state changed concurrently',
        request_id: 'request-p9-1',
        trace_id: 'trace-p9-1'
      }
    });
    // A conflicting claim stays blocked for reconciliation; no forced overwrite/reopen.
    expect(storedApproval(harness.store, proposal.approval_id)).toMatchObject({
      status: 'executing',
      revision: 3
    });
    expect(harness.audits.find((event) => event.outcome === 'error')?.evidence).toMatchObject({
      execution_status: 'not_started',
      executed: false,
      error_code: 'CONFLICT'
    });
    await expect(
      harness.runtime.execute(reference(proposal.approval_id), approvalValidationTime)
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    expect(harness.adapter.calls).toBe(0);
    expect(storedApproval(harness.store, proposal.approval_id)).toMatchObject({
      status: 'executing',
      revision: 3
    });
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
