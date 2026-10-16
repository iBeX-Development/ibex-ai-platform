import { describe, expect, it, vi } from 'vitest';
import type { AuditRecord } from '../../packages/audit/src/index.js';
import { createTrustedRequestContext } from '../../packages/security/src/index.js';
import { ToolRegistry } from '../../packages/tool-runtime/src/index.js';
import {
  createOfflineAssetAdapter,
  offlineAssetRegistration
} from '../testing/core-asset-offline-prototype.js';
import {
  SyntheticAssetCore,
  syntheticCoreRead,
  type SyntheticCoreUser,
  type SyntheticResponseFault
} from '../testing/core-asset-simulator.js';
import {
  createToolRuntime,
  toolContext,
  toolRequest,
  toolValidationTime
} from '../testing/tool-runtime-fixtures.js';

const contextB = createTrustedRequestContext({
  ...toolContext,
  tenant_id: 'tenant-b',
  user_id: 'user-b',
  session_id: 'session-b',
  request_id: 'request-b',
  correlation_id: 'correlation-b'
});
const contexts = [toolContext, contextB] as const;
const userFor = (context: typeof toolContext): SyntheticCoreUser => ({
  tenant_id: context.tenant_id,
  user_id: context.user_id,
  enabled: true,
  permissions: ['fixture:core:asset:read'],
  entitlements: ['fixture:core:asset-tools'],
  resources: [context.tenant_id === 'tenant-a' ? 'asset-a' : 'asset-b', 'shared-id'],
  fields: ['asset_id']
});
function simulator() {
  return new SyntheticAssetCore({
    users: contexts.map(userFor),
    sessions: contexts.map((c) => ({
      session_id: c.session_id,
      tenant_id: c.tenant_id,
      user_id: c.user_id,
      active: true
    })),
    assets: contexts.flatMap((c) =>
      [c.tenant_id === 'tenant-a' ? 'asset-a' : 'asset-b', 'shared-id'].map((id) => ({
        tenant_id: c.tenant_id,
        asset_id: id,
        private_note: `private-${c.tenant_id}`
      }))
    )
  });
}
function harness(core = simulator()) {
  const audits: AuditRecord[] = [];
  const transport = vi.fn(syntheticCoreRead(core));
  const adapter = createOfflineAssetAdapter(transport, () => toolValidationTime);
  const invoke = vi.fn(adapter.invoke.bind(adapter));
  // Separate Platform lookup: no Core user/session policy is delegated to this resolver.
  const owners = new Map([
    ['asset-a', 'tenant-a'],
    ['asset-b', 'tenant-b']
  ]);
  const ownership = vi.fn(({ type, id }: { type: string; id: string }) =>
    Promise.resolve(type === 'asset' ? (owners.get(id) ?? null) : null)
  );
  const runtime = createToolRuntime(audits, {
    registry: new ToolRegistry([
      {
        ...offlineAssetRegistration,
        metadata: { ...offlineAssetRegistration.metadata, enabled: true }
      }
    ]),
    adapters: [{ ...adapter, invoke }],
    ownership: { resolveTenantId: ownership }
  });
  const execute = (context: typeof toolContext, assetId: string, signal?: AbortSignal) =>
    runtime.execute(
      toolRequest({
        context,
        input: { asset_id: assetId },
        trace_id: `sim-${context.tenant_id}`,
        tool_version: offlineAssetRegistration.metadata.version
      }),
      signal ? { signal } : {},
      toolValidationTime
    );
  return { core, audits, transport, invoke, ownership, execute };
}
const handle = (
  core: SyntheticAssetCore,
  context: unknown,
  assetId: unknown,
  signal = new AbortController().signal
) => core.handle({ method: 'GET', assetId, context, signal });
const denial = {
  kind: 'denied',
  message: 'Requested resource is unavailable within the current authorized scope'
};

describe('stateful synthetic Core Asset boundary (not real Core evidence)', () => {
  it.each(contexts)(
    'runs allowed caller %# through both Platform and Core checks',
    async (context) => {
      const h = harness();
      const assetId = context.tenant_id === 'tenant-a' ? 'asset-a' : 'asset-b';
      const result = await h.execute(context, assetId);
      expect(h.ownership).toHaveBeenCalledExactlyOnceWith({ type: 'asset', id: assetId });
      expect(h.ownership.mock.invocationCallOrder[0]).toBeLessThan(
        h.invoke.mock.invocationCallOrder[0] ?? 0
      );
      expect(result).toMatchObject({
        status: 'success',
        output: { asset_id: assetId },
        request_id: context.request_id,
        correlation_id: context.correlation_id,
        trace_id: `sim-${context.tenant_id}`,
        attempts: 1
      });
      expect(h.core.completedReads()).toEqual([
        { tenant_id: context.tenant_id, user_id: context.user_id, asset_id: assetId }
      ]);
      expect(h.audits).toEqual([
        expect.objectContaining({ outcome: 'started' }),
        expect.objectContaining({ outcome: 'succeeded' })
      ]);
      for (const audit of h.audits)
        expect(audit).toMatchObject({
          tenant_id: context.tenant_id,
          request_id: context.request_id,
          correlation_id: context.correlation_id,
          trace_id: `sim-${context.tenant_id}`
        });
      expect(JSON.stringify({ result, audits: h.audits })).not.toContain('private-tenant');
    }
  );
  it.each([
    [toolContext, 'asset-b'],
    [contextB, 'asset-a']
  ] as const)('denies cross-tenant access before adapter %#', async (context, assetId) => {
    const h = harness();
    await expect(h.execute(context, assetId)).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    expect(h.invoke).not.toHaveBeenCalled();
    expect(h.transport).not.toHaveBeenCalled();
    expect(h.core.completedReads()).toEqual([]);
  });
  it.each([
    ['disabled user', { enabled: false }],
    ['missing permission', { permissions: [] }],
    ['missing entitlement', { entitlements: [] }],
    ['resource denied', { resources: [] }],
    ['field denied', { fields: [] }]
  ] as const)('Core independently rejects %s despite Platform allow', async (_name, change) => {
    const h = harness();
    h.core.replaceUser({ ...userFor(toolContext), ...change });
    await expect(h.execute(toolContext, 'asset-a')).rejects.toMatchObject({
      code: 'DEPENDENCY_ERROR',
      statusCode: 502,
      diagnostics: undefined,
      trustedRequestId: toolContext.request_id,
      traceId: 'sim-tenant-a'
    });
    expect(h.ownership).toHaveBeenCalledOnce();
    expect(h.transport).toHaveBeenCalledOnce();
    expect(h.core.completedReads()).toEqual([]);
    expect(h.audits.at(-1)).toMatchObject({ outcome: 'error', error_code: 'DEPENDENCY_ERROR' });
  });
  it('uses current server policy instead of caller-injected Core grants', async () => {
    const core = simulator();
    core.replaceUser({ ...userFor(toolContext), permissions: [] });
    const forged = createTrustedRequestContext({
      ...toolContext,
      permissions: [...toolContext.permissions, 'fixture:core:asset:read']
    });
    expect(await handle(core, forged, 'asset-a')).toEqual(denial);
    expect(core.completedReads()).toEqual([]);
  });
  it('revocation takes effect after an earlier allowed call and during an in-flight handler', async () => {
    const h = harness();
    await expect(h.execute(toolContext, 'asset-a')).resolves.toMatchObject({ status: 'success' });
    const inFlight = handle(h.core, toolContext, 'asset-a');
    h.core.revokeSession(toolContext.session_id);
    expect(await inFlight).toEqual(denial);
    await expect(h.execute(toolContext, 'asset-a')).rejects.toMatchObject({
      code: 'DEPENDENCY_ERROR'
    });
    expect(h.core.completedReads()).toHaveLength(1);
    expect(h.transport).toHaveBeenCalledTimes(2);
  });
  it.each([
    { ...toolContext, session_id: 'invalid-fixture-session' },
    { ...toolContext, tenant_id: 'tenant-b' },
    { ...toolContext, user_id: 'user-b' },
    {},
    null
  ])(
    'does not disclose existence for invalid or mismatched session/context %#',
    async (context) => {
      const core = simulator();
      expect(await handle(core, context, 'asset-a')).toEqual(denial);
      expect(await handle(core, context, 'missing')).toEqual(denial);
      expect(core.completedReads()).toEqual([]);
    }
  );
  it('has identical logical denial for hidden, foreign and absent resources', async () => {
    const core = simulator();
    core.replaceUser({ ...userFor(toolContext), resources: [] });
    const results = await Promise.all(
      ['asset-a', 'asset-b', 'missing'].map((id) => handle(core, toolContext, id))
    );
    expect(results).toEqual([denial, denial, denial]);
    expect(JSON.stringify(results)).not.toMatch(/tenant-b|private-|asset-a|asset-b|missing/);
  });
  it('denies a granted textual ID when the asset exists only in another tenant', async () => {
    const core = simulator();
    core.replaceUser({ ...userFor(toolContext), resources: ['asset-b'] });
    // This grant matches the requested ID; only the tenant-keyed asset lookup denies it.
    expect(await handle(core, toolContext, 'asset-b')).toEqual(denial);
    expect(core.completedReads()).toEqual([]);
    const ownerResult = await handle(core, contextB, 'asset-b');
    expect(ownerResult).toEqual({ kind: 'success', body: '{"asset_id":"asset-b"}' });
    expect(core.completedReads()).toEqual([
      { tenant_id: 'tenant-b', user_id: contextB.user_id, asset_id: 'asset-b' }
    ]);
  });
  it('demonstrates same-text ID scoping inside Core only, not through the Platform resolver', async () => {
    const core = simulator();
    const results = await Promise.all(
      contexts.map((context) => handle(core, context, 'shared-id'))
    );
    expect(results).toEqual([
      { kind: 'success', body: '{"asset_id":"shared-id"}' },
      { kind: 'success', body: '{"asset_id":"shared-id"}' }
    ]);
    expect(core.completedReads()).toEqual(
      contexts.map((c) => ({ tenant_id: c.tenant_id, user_id: c.user_id, asset_id: 'shared-id' }))
    );
    core.revokeSession(contextB.session_id);
    expect(await handle(core, contextB, 'shared-id')).toEqual(denial);
    expect(await handle(core, toolContext, 'shared-id')).toMatchObject({ kind: 'success' });
    const h = harness(core);
    await expect(h.execute(toolContext, 'shared-id')).rejects.toMatchObject({
      code: 'PERMISSION_DENIED'
    });
    expect(h.transport).not.toHaveBeenCalled();
  });
  it('fails closed when the simulated dependency is unavailable and can recover without changing grants', async () => {
    const h = harness();
    h.core.setAvailable(false);
    await expect(h.execute(toolContext, 'asset-a')).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      statusCode: 503
    });
    expect(h.transport).toHaveBeenCalledOnce();
    expect(h.core.completedReads()).toEqual([]);
    h.core.setAvailable(true);
    await expect(h.execute(toolContext, 'asset-a')).resolves.toMatchObject({ status: 'success' });
  });
  it.each([
    'malformed',
    'oversized',
    'mismatched',
    'extra-field'
  ] satisfies SyntheticResponseFault[])(
    'adapter rejects simulated %s output without leakage',
    async (fault) => {
      const h = harness();
      h.core.setResponseFault(fault);
      await expect(h.execute(toolContext, 'asset-a')).rejects.toMatchObject({
        code: 'INVALID_RESPONSE',
        statusCode: 502,
        diagnostics: undefined
      });
      expect(h.transport).toHaveBeenCalledOnce();
      expect(JSON.stringify(h.audits)).not.toContain('private-tenant');
      expect(h.audits).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ outcome: 'succeeded' })])
      );
    }
  );
  it('cancels during the simulated final authorization window without releasing a result', async () => {
    const h = harness();
    const controller = new AbortController();
    h.transport.mockImplementation(async (request) => {
      const pending = syntheticCoreRead(h.core)(request);
      controller.abort();
      return pending;
    });
    await expect(h.execute(toolContext, 'asset-a', controller.signal)).rejects.toMatchObject({
      code: 'TIMEOUT_ERROR',
      statusCode: 408
    });
    expect(h.core.completedReads()).toEqual([]);
    expect(h.audits).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ outcome: 'succeeded' })])
    );
  });
  it('supports only the exact logical GET identifier slice', async () => {
    const core = simulator();
    expect(
      await core.handle({
        method: 'POST',
        assetId: 'asset-a',
        context: toolContext,
        signal: new AbortController().signal
      })
    ).toEqual(denial);
    expect(await handle(core, toolContext, '../asset-a')).toEqual(denial);
    expect(core.completedReads()).toEqual([]);
  });
});
