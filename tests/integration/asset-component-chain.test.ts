import { describe, expect, it } from 'vitest';
import type { AuditRecord } from '../../packages/audit/src/index.js';
import { assetAgentProfile } from '../../agents/asset/src/index.js';
import { offlineAssetRegistration } from '../testing/core-asset-offline-prototype.js';
import { chainIdentity, createAssetComponentChain } from '../testing/asset-component-chain.js';

function boundEvents(audits: readonly AuditRecord[], requestId: string) {
  return audits.filter((event) => 'request_id' in event && event.request_id === requestId);
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
describe('synthetic structured-tools component chain (not production dispatch)', () => {
  it.each(['a', 'b'] as const)(
    'executes all actual components for tenant %s with unchanged Tool evidence',
    async (tenant) => {
      const h = createAssetComponentChain();
      const identity = chainIdentity(tenant);
      const assetId = `asset-${tenant}`;
      const response = await h.execute(identity, { asset_id: assetId });
      expect(response).toMatchObject({
        status: 'success',
        request_id: identity.request_id,
        trace_id: 'chain-trace-1',
        agent: 'asset',
        response: {
          response_type: 'operational',
          evidence_status: 'sufficient',
          answer: `Synthetic lookup returned Asset ID ${assetId}.`,
          request_id: identity.request_id,
          correlation_id: identity.correlation_id,
          trace_id: 'chain-trace-1',
          approval_required: false,
          citations: [
            {
              source_type: 'tool',
              source_id: offlineAssetRegistration.metadata.tool_id,
              source_version: offlineAssetRegistration.metadata.version,
              source_reference: `synthetic:${assetId}`
            }
          ]
        },
        tools_used: [
          {
            tool_id: offlineAssetRegistration.metadata.tool_id,
            version: offlineAssetRegistration.metadata.version
          }
        ]
      });
      for (const call of [
        h.forward,
        h.route,
        h.pilotExecute,
        h.ground,
        h.toolExecute,
        h.invoke,
        h.transport
      ])
        expect(call).toHaveBeenCalledOnce();
      expect(h.order).toEqual([
        `route:${identity.request_id}`,
        `pilot:${identity.request_id}`,
        `ground:${identity.request_id}`,
        `ownership:${assetId}`,
        `adapter:${identity.request_id}`,
        `core:${identity.request_id}`
      ]);
      expect(h.actualToolResponses).toHaveLength(1);
      expect(h.evidences).toHaveLength(1);
      expect(h.evidences[0]?.tool_responses[0]).toBe(h.actualToolResponses[0]);
      expect(h.actualToolResponses[0]).toMatchObject({
        output: { asset_id: assetId },
        request_id: identity.request_id,
        correlation_id: identity.correlation_id,
        trace_id: 'chain-trace-1'
      });
      const events = boundEvents(h.audits, identity.request_id);
      expect(events).toHaveLength(6);
      expect(events.map((e) => e.service)).toEqual([
        'chain-gateway',
        'chain-routing',
        'chain-tool',
        'chain-tool',
        'chain-pilot',
        'chain-gateway'
      ]);
      expect(events.map((e) => ('outcome' in e ? e.outcome : undefined))).toEqual([
        'accepted',
        'routed',
        'started',
        'succeeded',
        'routed',
        'accepted'
      ]);
      for (const event of events)
        expect(event).toMatchObject({
          tenant_id: identity.tenant_id,
          user_id: identity.user_id,
          session_id: identity.session_id,
          request_id: identity.request_id,
          correlation_id: identity.correlation_id,
          trace_id: 'chain-trace-1'
        });
      expect(h.core.completedReads()).toEqual([
        { tenant_id: identity.tenant_id, user_id: identity.user_id, asset_id: assetId }
      ]);
      expect(JSON.stringify({ response, audits: h.audits })).not.toMatch(
        /private-tenant|available|healthy|active/
      );
    }
  );
  it('Gateway denial prevents all downstream execution', async () => {
    const h = createAssetComponentChain({ denyGateway: true });
    await expect(h.execute(chainIdentity('a'), { asset_id: 'asset-a' })).rejects.toMatchObject({
      code: 'PERMISSION_DENIED'
    });
    for (const call of [
      h.forward,
      h.route,
      h.pilotExecute,
      h.ground,
      h.toolExecute,
      h.invoke,
      h.transport
    ])
      expect(call).not.toHaveBeenCalled();
    expect(h.audits).toEqual([
      expect.objectContaining({
        service: 'chain-gateway',
        outcome: 'rejected',
        stage: 'authorization'
      })
    ]);
    expect(h.core.completedReads()).toEqual([]);
  });
  it('rejects forged envelope identity before downstream execution', async () => {
    const h = createAssetComponentChain();
    await expect(
      h.execute(chainIdentity('a'), { asset_id: 'asset-a' }, {}, { tenant_id: 'tenant-b' })
    ).rejects.toMatchObject({ code: 'TENANT_CONTEXT_ERROR' });
    expect(h.forward).not.toHaveBeenCalled();
    expect(h.audits).toEqual([
      expect.objectContaining({
        service: 'chain-gateway',
        outcome: 'rejected',
        stage: 'tenant_context'
      })
    ]);
    expect(h.core.completedReads()).toEqual([]);
  });
  it('Platform ownership denial produces safe pilot abstention without adapter/Core', async () => {
    const h = createAssetComponentChain();
    const identity = chainIdentity('a');
    const response = await h.execute(identity, { asset_id: 'asset-b' });
    expect(response).toMatchObject({
      status: 'partial',
      response: {
        response_type: 'abstain',
        evidence_status: 'insufficient',
        citations: [],
        approval_required: false
      },
      tools_used: []
    });
    expect(h.toolExecute).toHaveBeenCalledOnce();
    expect(h.ownership).toHaveBeenCalledExactlyOnceWith({ type: 'asset', id: 'asset-b' });
    expect(h.invoke).not.toHaveBeenCalled();
    expect(h.transport).not.toHaveBeenCalled();
    expect(h.core.completedReads()).toEqual([]);
    const events = boundEvents(h.audits, identity.request_id);
    expect(events.map((e) => ('outcome' in e ? e.outcome : undefined))).toEqual([
      'accepted',
      'routed',
      'rejected',
      'fallback',
      'accepted'
    ]);
    expect(events[2]).toMatchObject({
      service: 'chain-tool',
      stage: 'tenant_ownership',
      error_code: 'PERMISSION_DENIED'
    });
    expect(JSON.stringify({ response, audits: events })).not.toContain('tenant-b');
  });
  it('current Core revocation cannot become a successful operational answer', async () => {
    const h = createAssetComponentChain();
    h.core.revokeSession(chainIdentity('a').session_id);
    const response = await h.execute(chainIdentity('a'), { asset_id: 'asset-a' });
    expect(response).toMatchObject({
      status: 'partial',
      response: { response_type: 'abstain', evidence_status: 'insufficient', citations: [] },
      tools_used: []
    });
    expect(h.transport).toHaveBeenCalledOnce();
    expect(h.actualToolResponses).toEqual([]);
    expect(h.core.completedReads()).toEqual([]);
    expect(h.audits.map((e) => ('outcome' in e ? e.outcome : undefined))).toEqual([
      'accepted',
      'routed',
      'started',
      'error',
      'error',
      'fallback',
      'accepted'
    ]);
    expect(h.audits.slice(3, 5)).toEqual([
      expect.objectContaining({
        service: 'chain-tool',
        stage: 'execution',
        outcome: 'error',
        error_code: 'DEPENDENCY_ERROR',
        attempt: 1
      }),
      expect.objectContaining({
        service: 'chain-tool',
        stage: 'execution',
        outcome: 'error',
        error_code: 'DEPENDENCY_ERROR',
        attempt: 1
      })
    ]);
    for (const event of h.audits)
      expect(event).toMatchObject({
        tenant_id: 'tenant-a',
        request_id: chainIdentity('a').request_id,
        correlation_id: chainIdentity('a').correlation_id,
        trace_id: response.trace_id
      });
    expect(JSON.stringify(response)).not.toMatch(/asset-a|private-|revoked/);
  });
  it.each([
    [{ asset_id: 'asset-a\n' }, {}, 'INVALID_INPUT'],
    [{ asset_id: 'asset-a', tenant_id: 'tenant-b' }, {}, 'INVALID_INPUT'],
    [{ asset_id: 'asset-a' }, { tool_id: 'asset.search' }, 'INVALID_INPUT'],
    [{ asset_id: 'asset-a' }, { extra: true }, 'VALIDATION_ERROR']
  ])(
    'blocks malformed or broadened structured request %# before routing',
    async (input, payload, code) => {
      const h = createAssetComponentChain();
      await expect(h.execute(chainIdentity('a'), input, payload)).rejects.toMatchObject({
        code
      });
      expect(h.route).not.toHaveBeenCalled();
      expect(h.ground).not.toHaveBeenCalled();
      expect(h.invoke).not.toHaveBeenCalled();
      expect(h.core.completedReads()).toEqual([]);
    }
  );
  it('keeps the unmodified production Asset profile blocked', async () => {
    const before = JSON.stringify(assetAgentProfile);
    const h = createAssetComponentChain({ productionProfile: true });
    await expect(h.execute(chainIdentity('a'), { asset_id: 'asset-a' })).rejects.toMatchObject({
      code: 'PERMISSION_DENIED'
    });
    expect(h.pilotExecute).toHaveBeenCalledOnce();
    expect(h.ground).not.toHaveBeenCalled();
    expect(h.toolExecute).not.toHaveBeenCalled();
    expect(JSON.stringify(assetAgentProfile)).toBe(before);
    expect(offlineAssetRegistration.metadata.enabled).toBe(false);
    expect(h.audits.map((e) => ('outcome' in e ? e.outcome : undefined))).toEqual([
      'accepted',
      'routed',
      'rejected',
      'rejected'
    ]);
  });
  it('retains separate immutable arguments and correlation under overlapping reverse completion', async () => {
    const enteredA = deferred(),
      enteredB = deferred(),
      releaseA = deferred(),
      releaseB = deferred();
    const h = createAssetComponentChain({
      beforeCore: async ({ context }) => {
        const isA = context.tenant_id === 'tenant-a';
        (isA ? enteredA : enteredB).resolve();
        await (isA ? releaseA : releaseB).promise;
      }
    });
    const completions: string[] = [];
    const a = chainIdentity('a'),
      b = chainIdentity('b');
    const pendingA = h.execute(a, { asset_id: 'asset-a' }).then((r) => {
      completions.push('a');
      return r;
    });
    const pendingB = h.execute(b, { asset_id: 'asset-b' }).then((r) => {
      completions.push('b');
      return r;
    });
    const settled = Promise.allSettled([pendingA, pendingB]);
    try {
      await Promise.all([enteredA.promise, enteredB.promise]);
      expect(completions).toEqual([]);
      expect(h.transport).toHaveBeenCalledTimes(2);
      releaseB.resolve();
      const responseB = await pendingB;
      expect(completions).toEqual(['b']);
      releaseA.resolve();
      const responseA = await pendingA;
      expect(completions).toEqual(['b', 'a']);
      expect(responseA.trace_id).not.toBe(responseB.trace_id);
      for (const [identity, assetId, response] of [
        [a, 'asset-a', responseA],
        [b, 'asset-b', responseB]
      ] as const) {
        expect(response).toMatchObject({
          status: 'success',
          request_id: identity.request_id,
          response: {
            answer: `Synthetic lookup returned Asset ID ${assetId}.`,
            correlation_id: identity.correlation_id,
            trace_id: response.trace_id
          }
        });
        const calls = h.toolExecute.mock.calls.filter(
          ([r]) => r.context.request_id === identity.request_id
        );
        expect(calls).toHaveLength(1);
        expect(calls[0]?.[0].input).toEqual({ asset_id: assetId });
        expect(Object.isFrozen(calls[0]?.[0].input)).toBe(true);
        expect(calls[0]?.[0].context).toMatchObject({
          tenant_id: identity.tenant_id,
          user_id: identity.user_id,
          session_id: identity.session_id
        });
        const events = boundEvents(h.audits, identity.request_id);
        expect(events).toHaveLength(6);
        for (const event of events)
          expect(event).toMatchObject({
            tenant_id: identity.tenant_id,
            correlation_id: identity.correlation_id,
            trace_id: response.trace_id
          });
      }
      expect(h.core.completedReads()).toEqual([
        { tenant_id: 'tenant-b', user_id: b.user_id, asset_id: 'asset-b' },
        { tenant_id: 'tenant-a', user_id: a.user_id, asset_id: 'asset-a' }
      ]);
    } finally {
      releaseA.resolve();
      releaseB.resolve();
      await settled;
    }
  });
});
