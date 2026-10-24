import { describe, expect, it, vi } from 'vitest';
import type { AuditRecord } from '../../packages/audit/src/index.js';
import { createTrustedRequestContext } from '../../packages/security/src/index.js';
import { ToolRegistry, ToolAdapterError } from '../../packages/tool-runtime/src/index.js';
import {
  createOfflineAssetAdapter,
  offlineAssetRegistration,
  offlineAssetSchema,
  type OfflineAssetRead
} from '../testing/core-asset-offline-prototype.js';
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
const owners = new Map([
  ['asset-a', 'tenant-a'],
  ['asset-b', 'tenant-b']
]);
function harness(read: OfflineAssetRead, enabled = true) {
  const audits: AuditRecord[] = [];
  const transport = vi.fn(read);
  const ownership = vi.fn(({ id }: { type: string; id: string }) =>
    Promise.resolve(owners.get(id) ?? null)
  );
  const adapter = createOfflineAssetAdapter(transport, () => toolValidationTime);
  const invoke = vi.fn(adapter.invoke.bind(adapter));
  const runtime = createToolRuntime(audits, {
    // Explicit test-only enablement; exported prototype registration stays disabled.
    registry: new ToolRegistry([
      { ...offlineAssetRegistration, metadata: { ...offlineAssetRegistration.metadata, enabled } }
    ]),
    ownership: { resolveTenantId: ownership },
    adapters: [{ ...adapter, invoke }]
  });
  const execute = (assetId: string, context = toolContext, signal?: AbortSignal) =>
    runtime.execute(
      toolRequest({
        context,
        input: { asset_id: assetId },
        trace_id: `trace-${context.tenant_id}`,
        tool_version: offlineAssetRegistration.metadata.version
      }),
      signal ? { signal } : {},
      toolValidationTime
    );
  return { runtime, execute, transport, ownership, invoke, audits };
}

describe('offline proposed Core Asset ID slice (synthetic only)', () => {
  it.each(['a', 'A_b-9', 'a'.repeat(128)])(
    'accepts exact valid ID %s without canonicalization',
    (assetId) => {
      expect(offlineAssetSchema.parse({ asset_id: assetId })).toEqual({ asset_id: assetId });
    }
  );
  it.each([
    '',
    'a'.repeat(129),
    ' asset-a',
    'asset-a ',
    'asset-a\n',
    'asset-a\r\n',
    '../asset',
    'a/b',
    'a%2Fb',
    'asset.a',
    'Монгол',
    1,
    null
  ])('rejects invalid ID case %#', (assetId) => {
    expect(offlineAssetSchema.safeParse({ asset_id: assetId }).success).toBe(false);
  });
  it.each([
    {},
    [],
    null,
    { asset_id: 'asset-a', tenant_id: 'tenant-b' },
    { asset_id: 'asset-a', status: 'active' },
    JSON.parse('{"asset_id":"asset-a","__proto__":{}}') as unknown
  ])('rejects nonminimal payload %#', (value) => {
    expect(offlineAssetSchema.safeParse(value).success).toBe(false);
  });
  it('does not evaluate accessor fields or accept inherited identifiers', () => {
    const getter = vi.fn(() => 'asset-a');
    expect(
      offlineAssetSchema.safeParse(Object.defineProperty({}, 'asset_id', { get: getter })).success
    ).toBe(false);
    expect(getter).not.toHaveBeenCalled();
    expect(offlineAssetSchema.safeParse(Object.create({ asset_id: 'asset-a' })).success).toBe(
      false
    );
  });
  it('keeps the exported registration disabled and preserves runtime registry rules', async () => {
    const h = harness(() => Promise.resolve('{"asset_id":"asset-a"}'), false);
    expect(offlineAssetRegistration.metadata).toMatchObject({
      registration_version: '3.0',
      error_model: 'ibex.tool-error.v1',
      ownership_validation: 'resource',
      execution_mode: 'deterministic_test',
      enabled: false,
      environments: ['test']
    });
    await expect(h.execute('asset-a')).rejects.toMatchObject({ code: 'TOOL_DISABLED' });
    expect(h.ownership).not.toHaveBeenCalled();
    expect(h.transport).not.toHaveBeenCalled();
  });
  it.each([
    [toolContext, 'asset-a'],
    [contextB, 'asset-b']
  ] as const)('binds allowed synthetic lookup to caller %#', async (context, assetId) => {
    const h = harness(({ input }) => Promise.resolve(JSON.stringify(input)));
    const response = await h.execute(assetId, context);
    expect(h.ownership).toHaveBeenCalledExactlyOnceWith({ type: 'asset', id: assetId });
    expect(h.ownership.mock.invocationCallOrder[0]).toBeLessThan(
      h.invoke.mock.invocationCallOrder[0] ?? 0
    );
    expect(response).toMatchObject({
      status: 'success',
      output: { asset_id: assetId },
      request_id: context.request_id,
      correlation_id: context.correlation_id,
      trace_id: `trace-${context.tenant_id}`,
      source: { system: 'offline-synthetic-asset-prototype', reference: `synthetic:${assetId}` },
      observed_at: toolValidationTime.toISOString(),
      attempts: 1
    });
    expect(response.status === 'success' && Object.keys(response.output as object)).toEqual([
      'asset_id'
    ]);
    expect(h.transport.mock.calls[0]?.[0].context).toEqual(context);
    expect(Object.isFrozen(h.transport.mock.calls[0]?.[0].context)).toBe(true);
    expect(h.audits).toHaveLength(2);
    expect(h.audits).toEqual([
      expect.objectContaining({ outcome: 'started', stage: 'execution' }),
      expect.objectContaining({ outcome: 'succeeded', stage: 'audit' })
    ]);
    for (const audit of h.audits)
      expect(audit).toMatchObject({
        tenant_id: context.tenant_id,
        request_id: context.request_id,
        correlation_id: context.correlation_id,
        trace_id: `trace-${context.tenant_id}`
      });
    expect(JSON.stringify(h.audits)).not.toContain(`synthetic:${assetId}`);
  });
  it.each([
    [toolContext, 'asset-b'],
    [contextB, 'asset-a'],
    [toolContext, 'missing']
  ] as const)(
    'denies wrong/unknown synthetic ownership before adapter %#',
    async (context, assetId) => {
      const h = harness(() => Promise.resolve(JSON.stringify({ asset_id: assetId })));
      await expect(h.execute(assetId, context)).rejects.toMatchObject({
        code: 'PERMISSION_DENIED',
        publicMessage: 'Requested resource is unavailable within the current authorized scope',
        trustedRequestId: context.request_id,
        traceId: `trace-${context.tenant_id}`
      });
      expect(h.invoke).not.toHaveBeenCalled();
      expect(h.transport).not.toHaveBeenCalled();
      expect(h.audits).toEqual([
        expect.objectContaining({
          stage: 'tenant_ownership',
          tenant_id: context.tenant_id,
          request_id: context.request_id,
          error_code: 'PERMISSION_DENIED'
        })
      ]);
    }
  );
  it.each([
    '{"asset_id":"asset-b"}',
    '{"asset_id":"ASSET-A"}',
    '{"asset_id":"asset-a","status":"private-marker"}',
    '{"asset_id":"asset-a","__proto__":{}}',
    '{"asset_id":1}',
    '{}',
    'null',
    'not-json',
    ' '.repeat(16 * 1024 + 1)
  ])('normalizes malformed/mismatched synthetic response %#', async (body) => {
    const h = harness(() => Promise.resolve(body));
    await expect(h.execute('asset-a')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
      statusCode: 502,
      diagnostics: undefined,
      trustedRequestId: toolContext.request_id,
      traceId: 'trace-tenant-a'
    });
    expect(h.transport).toHaveBeenCalledOnce();
    expect(JSON.stringify(h.audits)).not.toContain('private-marker');
  });
  it('accepts the proposed JSON body cap at equality', async () => {
    const body = '{"asset_id":"asset-a"}';
    const h = harness(() => Promise.resolve(body.padEnd(16 * 1024)));
    await expect(h.execute('asset-a')).resolves.toMatchObject({ output: { asset_id: 'asset-a' } });
  });
  it('uses existing normalization for synthetic transport failure without leaking diagnostics', async () => {
    const h = harness(() => Promise.reject(new Error('private-marker')));
    await expect(h.execute('asset-a')).rejects.toMatchObject({
      code: 'DEPENDENCY_ERROR',
      statusCode: 502,
      diagnostics: undefined
    });
    expect(h.transport).toHaveBeenCalledOnce();
    expect(JSON.stringify(h.audits)).not.toContain('private-marker');
  });
  it('preserves runtime cancellation and rejects a late synthetic body', async () => {
    const controller = new AbortController();
    const h = harness(() => {
      controller.abort();
      return Promise.resolve('{"asset_id":"asset-a"}');
    });
    await expect(h.execute('asset-a', toolContext, controller.signal)).rejects.toMatchObject({
      code: 'TIMEOUT_ERROR',
      statusCode: 408
    });
    expect(h.transport).toHaveBeenCalledOnce();
    expect(h.audits).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ outcome: 'succeeded' })])
    );
  });
  it('fails before dispatch for invalid direct adapter context/input or cancellation', async () => {
    const transport = vi.fn(() => Promise.resolve('{"asset_id":"asset-a"}'));
    const adapter = createOfflineAssetAdapter(transport, () => toolValidationTime);
    const request = {
      context: toolContext,
      input: { asset_id: 'asset-a' },
      tool: offlineAssetRegistration.metadata,
      signal: new AbortController().signal
    };
    await expect(
      adapter.invoke({ ...request, context: {} as typeof toolContext })
    ).rejects.toBeInstanceOf(ToolAdapterError);
    await expect(
      adapter.invoke({ ...request, input: { asset_id: 'asset-a', tenant_id: 'tenant-b' } })
    ).rejects.toBeInstanceOf(ToolAdapterError);
    await expect(
      adapter.invoke({ ...request, signal: AbortSignal.abort() })
    ).rejects.toBeInstanceOf(ToolAdapterError);
    expect(transport).not.toHaveBeenCalled();
  });
});
