import { describe, expect, it } from 'vitest';
import { createTrustedRequestContext } from '../../packages/security/src/index.js';
import { toolExecutionRequestSchema } from '../../packages/tool-runtime/src/index.js';
import type { AuditRecord } from '../../packages/audit/src/index.js';
import { assetAgentProfile } from '../../agents/asset/src/index.js';
import { offlineAssetRegistration } from '../testing/core-asset-offline-prototype.js';
import { chainIdentity, createAssetComponentChain } from '../testing/asset-component-chain.js';

function boundEvents(audits: readonly AuditRecord[], requestId: string) {
  return audits.filter((event) => 'request_id' in event && event.request_id === requestId);
}
function toolRequests(h: ReturnType<typeof createAssetComponentChain>) {
  return h.toolExecute.mock.calls.map(([raw]) => {
    const request = toolExecutionRequestSchema.parse(raw);
    return { ...request, context: createTrustedRequestContext(request.context) };
  });
}
function safeAbstention(response: unknown) {
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
  expect(JSON.stringify(response)).not.toMatch(/asset-[ab]|private-|healthy|revoked/);
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
describe('inactive dispatcher and stateful synthetic Core component chain', () => {
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
      for (const call of [h.forward, h.route, h.toolExecute, h.invoke, h.transport])
        expect(call).toHaveBeenCalledOnce();
      expect(h.order).toEqual([
        `route:${identity.request_id}`,
        `ownership:${assetId}`,
        `adapter:${identity.request_id}`,
        `core:${identity.request_id}`
      ]);
      expect(h.actualToolResponses).toHaveLength(1);
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
        'inactive-tool-dispatch',
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
        /private-tenant|\b(?:available|healthy|active)\b/
      );
    }
  );
  it('Gateway denial prevents all downstream execution', async () => {
    const h = createAssetComponentChain({ denyGateway: true });
    await expect(h.execute(chainIdentity('a'), { asset_id: 'asset-a' })).rejects.toMatchObject({
      code: 'PERMISSION_DENIED'
    });
    for (const call of [h.forward, h.route, h.toolExecute, h.invoke, h.transport])
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
  it.each(['a', 'b'] as const)(
    'Platform ownership denial for tenant %s stops before adapter/Core',
    async (tenant) => {
      const h = createAssetComponentChain();
      const identity = chainIdentity(tenant);
      const other = tenant === 'a' ? 'b' : 'a';
      const response = await h.execute(identity, { asset_id: `asset-${other}` });
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
      expect(h.ownership).toHaveBeenCalledExactlyOnceWith({ type: 'asset', id: `asset-${other}` });
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
      expect(JSON.stringify({ response, audits: events })).not.toContain(`tenant-${other}`);
    }
  );
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
    ['permission', { permissions: [] }],
    ['field', { fields: [] }]
  ] as const)(
    'Core %s revocation overrides unchanged Platform authorization and earlier success',
    async (_reason, changed) => {
      const h = createAssetComponentChain();
      const initial = chainIdentity('a');
      expect((await h.execute(initial, { asset_id: 'asset-a' })).status).toBe('success');
      h.core.replaceUser({
        tenant_id: initial.tenant_id,
        user_id: initial.user_id,
        enabled: true,
        permissions: ['fixture:core:asset:read'],
        entitlements: ['fixture:core:asset-tools'],
        resources: ['asset-a'],
        fields: ['asset_id'],
        ...changed
      });
      const next = chainIdentity('a', 'after-core-change');
      const response = await h.execute(next, { asset_id: 'asset-a' });
      safeAbstention(response);
      expect(h.transport).toHaveBeenCalledTimes(2);
      expect(h.actualToolResponses).toHaveLength(1);
      expect(h.core.completedReads()).toEqual([
        { tenant_id: 'tenant-a', user_id: initial.user_id, asset_id: 'asset-a' }
      ]);
      expect(
        boundEvents(h.audits, next.request_id).map((e) => ('outcome' in e ? e.outcome : undefined))
      ).toEqual(['accepted', 'routed', 'started', 'error', 'error', 'fallback', 'accepted']);
      expect(toolRequests(h)[1]?.context.permissions).toEqual(initial.permissions);
    }
  );
  it.each(['unavailable', 'malformed', 'oversized', 'mismatched', 'extra-field'] as const)(
    'discards %s Core output through the real dispatcher without operational evidence',
    async (fault) => {
      const h = createAssetComponentChain();
      if (fault === 'unavailable') h.core.setAvailable(false);
      else h.core.setResponseFault(fault);
      const response = await h.execute(chainIdentity('a'), { asset_id: 'asset-a' });
      safeAbstention(response);
      expect(h.transport).toHaveBeenCalledOnce();
      expect(h.actualToolResponses).toEqual([]);
      expect(h.core.completedReads()).toHaveLength(fault === 'unavailable' ? 0 : 1);
      expect(
        h.audits.filter(
          (e) =>
            'error_code' in e &&
            e.error_code === (fault === 'unavailable' ? 'SERVICE_UNAVAILABLE' : 'INVALID_RESPONSE')
        )
      ).toHaveLength(2);
    }
  );
  it.each([
    { bindingMode: 'empty' as const },
    { bindingMode: 'inactive' as const },
    { disabledRegistration: true }
  ])('mapping/registration %j never reaches Tool execution or Core', async (options) => {
    const h = createAssetComponentChain(options);
    await expect(h.execute(chainIdentity('a'), { asset_id: 'asset-a' })).rejects.toMatchObject({
      code: 'PERMISSION_DENIED'
    });
    expect(h.route).toHaveBeenCalledOnce();
    expect(h.toolExecute).not.toHaveBeenCalled();
    expect(h.invoke).not.toHaveBeenCalled();
    expect(h.transport).not.toHaveBeenCalled();
    expect(h.core.completedReads()).toEqual([]);
  });
  it.each([{ tool_id: 'asset.search' }, { tool_version: '9.0.0' }])(
    'concrete selection %j cannot expand the trusted conceptual route',
    async (selection) => {
      const h = createAssetComponentChain();
      await expect(
        h.execute(chainIdentity('a'), { asset_id: 'asset-a' }, selection)
      ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
      expect(h.route).toHaveBeenCalledOnce();
      const routed: unknown = await h.route.mock.results[0]?.value;
      expect(routed).toMatchObject({
        status: 'routed',
        decision: { tool_candidates: ['asset.get'], required_capabilities: ['asset.get'] }
      });
      expect(h.toolExecute).not.toHaveBeenCalled();
      expect(h.transport).not.toHaveBeenCalled();
      expect(h.core.completedReads()).toEqual([]);
    }
  );
  it('Gateway rejects caller-forged binding configuration before dispatcher execution', async () => {
    const h = createAssetComponentChain();
    await expect(
      h.execute(
        chainIdentity('a'),
        { asset_id: 'asset-a' },
        { bindings: { mode: 'deterministic_test', conceptual_capability: 'asset.search' } }
      )
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(h.forward).not.toHaveBeenCalled();
    expect(h.route).not.toHaveBeenCalled();
    expect(h.transport).not.toHaveBeenCalled();
    expect(h.core.completedReads()).toEqual([]);
  });
  it.each([
    [{ asset_id: 'asset-a\n' }, {}, 'INVALID_INPUT'],
    [{ asset_id: 'asset-a', tenant_id: 'tenant-b' }, {}, 'INVALID_INPUT'],
    [{ asset_id: 'asset-a' }, { extra: true }, 'VALIDATION_ERROR']
  ])(
    'blocks malformed or broadened structured request %# before routing',
    async (input, payload, code) => {
      const h = createAssetComponentChain();
      await expect(h.execute(chainIdentity('a'), input, payload)).rejects.toMatchObject({
        code
      });
      expect(h.route).not.toHaveBeenCalled();
      expect(h.toolExecute).not.toHaveBeenCalled();
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
    expect(h.route).toHaveBeenCalledOnce();
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
    const inputA = { asset_id: 'asset-a' },
      inputB = { asset_id: 'asset-b' };
    const pendingA = h.execute(a, inputA).then((r) => {
      completions.push('a');
      return r;
    });
    const pendingB = h.execute(b, inputB).then((r) => {
      completions.push('b');
      return r;
    });
    const settled = Promise.allSettled([pendingA, pendingB]);
    try {
      await Promise.all([enteredA.promise, enteredB.promise]);
      expect(completions).toEqual([]);
      expect(h.transport).toHaveBeenCalledTimes(2);
      inputA.asset_id = 'caller-changed-a';
      inputB.asset_id = 'caller-changed-b';
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
        const calls = toolRequests(h).filter((r) => r.context.request_id === identity.request_id);
        expect(calls).toHaveLength(1);
        expect(calls[0]?.input).toEqual({ asset_id: assetId });
        expect(Object.isFrozen(calls[0]?.input)).toBe(true);
        expect(calls[0]?.context).toMatchObject({
          tenant_id: identity.tenant_id,
          user_id: identity.user_id,
          role: identity.role,
          permissions: identity.permissions,
          entitlements: identity.entitlements,
          session_id: identity.session_id,
          request_id: identity.request_id,
          correlation_id: identity.correlation_id,
          channel: identity.channel,
          locale: identity.locale
        });
        expect(calls[0]?.trace_id).toBe(response.trace_id);
        const coreCalls = h.transport.mock.calls.filter(
          ([r]) => r.context.request_id === identity.request_id
        );
        expect(coreCalls).toHaveLength(1);
        expect(coreCalls[0]?.[0].context).toEqual(calls[0]?.context);
        expect(coreCalls[0]?.[0].input).toEqual({ asset_id: assetId });
        expect(Object.isFrozen(coreCalls[0]?.[0].input)).toBe(true);
        const actual = h.actualToolResponses.find((r) => r.request_id === identity.request_id);
        expect(actual).toMatchObject({
          tool_id: offlineAssetRegistration.metadata.tool_id,
          tool_version: offlineAssetRegistration.metadata.version,
          request_id: identity.request_id,
          correlation_id: identity.correlation_id,
          trace_id: response.trace_id,
          output: { asset_id: assetId }
        });
        expect(response.response).toMatchObject({
          citations: [
            {
              source_type: 'tool',
              source_id: offlineAssetRegistration.metadata.tool_id,
              source_version: offlineAssetRegistration.metadata.version,
              source_reference: `synthetic:${assetId}`
            }
          ]
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
