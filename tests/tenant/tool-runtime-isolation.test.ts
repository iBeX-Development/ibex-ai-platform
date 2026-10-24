import { describe, expect, it, vi } from 'vitest';
import type { AuditRecord } from '../../packages/audit/src/index.js';
import { createTrustedRequestContext } from '../../packages/security/src/index.js';
import type { ToolAdapter } from '../../packages/tool-runtime/src/index.js';
import {
  createToolRuntime,
  successfulToolAdapter,
  toolContext,
  toolRequest,
  toolValidationTime
} from '../testing/tool-runtime-fixtures.js';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('Gate P5 Tool Runtime tenant isolation', () => {
  it('denies a Tenant A request for a Tenant B resource before adapter invocation', async () => {
    const audits: AuditRecord[] = [];
    const invoke = vi.fn();
    const runtime = createToolRuntime(audits, {
      adapters: [{ ...successfulToolAdapter(), invoke }],
      ownership: { resolveTenantId: () => Promise.resolve('tenant-b') }
    });

    await expect(runtime.execute(toolRequest(), {}, toolValidationTime)).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
      publicMessage: 'Requested resource is unavailable within the current authorized scope'
    });
    expect(invoke).not.toHaveBeenCalled();
    expect(JSON.stringify(audits)).not.toContain('tenant-b');
  });

  it('rejects tenant and authorization context injected anywhere in tool input', async () => {
    const invoke = vi.fn();
    const runtime = createToolRuntime([], {
      adapters: [{ ...successfulToolAdapter(), invoke }]
    });

    await expect(
      runtime.execute(
        toolRequest({ input: { asset_id: 'asset-1', nested: { tenant_id: 'tenant-b' } } }),
        {},
        toolValidationTime
      )
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(
      runtime.execute(
        toolRequest({ input: { asset_id: 'asset-1', permissions: ['admin'] } }),
        {},
        toolValidationTime
      )
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('passes only the immutable server-derived context to the adapter', async () => {
    const seenContexts: unknown[] = [];
    const adapter = successfulToolAdapter();
    const runtime = createToolRuntime([], {
      adapters: [
        {
          ...adapter,
          invoke: (request) => {
            seenContexts.push(request.context);
            return adapter.invoke(request);
          }
        }
      ]
    });

    await runtime.execute(toolRequest(), {}, toolValidationTime);

    expect(seenContexts).toEqual([toolContext]);
    expect(Object.isFrozen(seenContexts[0])).toBe(true);
  });

  it('does not reuse a trusted context for another tenant', async () => {
    const audits: AuditRecord[] = [];
    const invoke = vi.fn();
    const tenantBContext = createTrustedRequestContext({
      ...toolContext,
      tenant_id: 'tenant-b',
      user_id: 'user-tool-b',
      session_id: 'session-tool-b',
      request_id: 'request-tool-b',
      correlation_id: 'correlation-tool-b'
    });
    const ownership = vi.fn(({ id }: { id: string }) =>
      Promise.resolve(id === 'asset-a' ? 'tenant-a' : 'tenant-b')
    );
    const runtime = createToolRuntime(audits, {
      ownership: { resolveTenantId: ownership },
      adapters: [{ ...successfulToolAdapter(), invoke }]
    });

    await expect(
      runtime.execute(
        toolRequest({ input: { asset_id: 'asset-b' }, trace_id: 'denied-trace-a' }),
        {},
        toolValidationTime
      )
    ).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
      publicMessage: 'Requested resource is unavailable within the current authorized scope',
      trustedRequestId: toolContext.request_id,
      traceId: 'denied-trace-a'
    });
    expect(invoke).not.toHaveBeenCalled();
    expect(audits).toEqual([
      expect.objectContaining({
        tenant_id: toolContext.tenant_id,
        request_id: toolContext.request_id,
        correlation_id: toolContext.correlation_id,
        trace_id: 'denied-trace-a',
        stage: 'tenant_ownership',
        outcome: 'rejected',
        error_code: 'PERMISSION_DENIED'
      })
    ]);
    expect(JSON.stringify(audits)).not.toContain('tenant-b');
    const priorAuditCount = audits.length;
    await expect(
      runtime.execute(
        toolRequest({
          context: tenantBContext,
          input: { asset_id: 'asset-a' },
          trace_id: 'denied-trace-b'
        }),
        {},
        toolValidationTime
      )
    ).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
      publicMessage: 'Requested resource is unavailable within the current authorized scope',
      trustedRequestId: tenantBContext.request_id,
      traceId: 'denied-trace-b'
    });
    expect(invoke).not.toHaveBeenCalled();
    const tenantBDenial = audits.slice(priorAuditCount);
    expect(tenantBDenial).toEqual([
      expect.objectContaining({
        tenant_id: tenantBContext.tenant_id,
        request_id: tenantBContext.request_id,
        correlation_id: tenantBContext.correlation_id,
        trace_id: 'denied-trace-b',
        stage: 'tenant_ownership',
        outcome: 'rejected',
        error_code: 'PERMISSION_DENIED'
      })
    ]);
    expect(JSON.stringify(tenantBDenial)).not.toContain('tenant-a');
    expect(ownership.mock.calls).toEqual([
      [{ type: 'asset', id: 'asset-b' }],
      [{ type: 'asset', id: 'asset-a' }]
    ]);
  });

  it('keeps overlapping tenant reads isolated when the second call completes first', async () => {
    const audits: AuditRecord[] = [];
    const contextA = toolContext;
    const contextB = createTrustedRequestContext({
      ...toolContext,
      tenant_id: 'tenant-b',
      user_id: 'user-tool-b',
      session_id: 'session-tool-b',
      request_id: 'request-tool-b',
      correlation_id: 'correlation-tool-b'
    });
    const enteredA = deferred();
    const enteredB = deferred();
    const releaseA = deferred();
    const releaseB = deferred();
    const sequence: string[] = [];
    const completions: string[] = [];
    // Distinct references match the existing {type,id} -> tenant resolver contract.
    // This does not demonstrate identical textual IDs owned by different tenants.
    const owners = new Map([
      ['asset-a', 'tenant-a'],
      ['asset-b', 'tenant-b']
    ]);
    const ownership = vi.fn(({ id }: { type: string; id: string }) => {
      sequence.push(`ownership:${id}`);
      return Promise.resolve(owners.get(id) ?? null);
    });
    const invoke = vi.fn<ToolAdapter['invoke']>(async ({ context, input }) => {
      const { asset_id: assetId } = input as { asset_id: string };
      sequence.push(`adapter:${assetId}`);
      const isA = context.tenant_id === 'tenant-a';
      (isA ? enteredA : enteredB).resolve();
      await (isA ? releaseA : releaseB).promise;
      return {
        output: {
          asset_id: assetId,
          name: isA ? 'Synthetic pump A' : 'Synthetic pump B',
          status: 'active'
        },
        source: { system: 'deterministic-test', reference: `asset:${assetId}` },
        observed_at: toolValidationTime.toISOString()
      };
    });
    const runtime = createToolRuntime(audits, {
      ownership: { resolveTenantId: ownership },
      adapters: [{ ...successfulToolAdapter(), invoke }]
    });
    const start = (context: typeof toolContext, assetId: string, traceId: string) =>
      runtime
        .execute(
          toolRequest({ context, input: { asset_id: assetId }, trace_id: traceId }),
          {},
          toolValidationTime
        )
        .then((response) => {
          completions.push(context.tenant_id);
          return response;
        });
    const pendingA = start(contextA, 'asset-a', 'overlap-trace-a');
    const pendingB = start(contextB, 'asset-b', 'overlap-trace-b');
    // Attach rejection handlers immediately, including when an overlap assertion fails.
    const settled = Promise.allSettled([pendingA, pendingB]);
    try {
      await Promise.all([enteredA.promise, enteredB.promise]);
      expect(completions).toEqual([]);
      expect(invoke).toHaveBeenCalledTimes(2);
      expect(ownership).toHaveBeenCalledTimes(2);
      for (const assetId of ['asset-a', 'asset-b']) {
        expect(
          ownership.mock.calls.filter(
            ([resource]) => resource.type === 'asset' && resource.id === assetId
          )
        ).toHaveLength(1);
        expect(sequence.indexOf(`ownership:${assetId}`)).toBeLessThan(
          sequence.indexOf(`adapter:${assetId}`)
        );
      }
      releaseB.resolve();
      const responseB = await pendingB;
      expect(completions).toEqual(['tenant-b']);
      releaseA.resolve();
      const responseA = await pendingA;
      expect(completions).toEqual(['tenant-b', 'tenant-a']);
      for (const [context, assetId, traceId, name, response] of [
        [contextA, 'asset-a', 'overlap-trace-a', 'Synthetic pump A', responseA],
        [contextB, 'asset-b', 'overlap-trace-b', 'Synthetic pump B', responseB]
      ] as const) {
        expect(response).toMatchObject({
          status: 'success',
          request_id: context.request_id,
          correlation_id: context.correlation_id,
          trace_id: traceId,
          output: { asset_id: assetId, name, status: 'active' },
          source: { system: 'deterministic-test', reference: `asset:${assetId}` },
          attempts: 1
        });
        const calls = invoke.mock.calls.filter(
          ([request]) => request.context.request_id === context.request_id
        );
        expect(calls).toHaveLength(1);
        expect(calls[0]?.[0].context).toEqual(context);
        expect(Object.isFrozen(calls[0]?.[0].context)).toBe(true);
        expect(calls[0]?.[0].input).toEqual({ asset_id: assetId });
        const events = audits.filter(
          (event) => 'request_id' in event && event.request_id === context.request_id
        );
        expect(events.map((event) => ('outcome' in event ? event.outcome : undefined))).toEqual([
          'started',
          'succeeded'
        ]);
        for (const event of events)
          expect(event).toMatchObject({
            tenant_id: context.tenant_id,
            user_id: context.user_id,
            session_id: context.session_id,
            request_id: context.request_id,
            correlation_id: context.correlation_id,
            trace_id: traceId
          });
        expect(JSON.stringify(events)).not.toContain(
          context === contextA ? 'tenant-b' : 'tenant-a'
        );
        expect(JSON.stringify(events)).not.toContain(name);
      }
      expect(audits).toHaveLength(4);
    } finally {
      releaseA.resolve();
      releaseB.resolve();
      await settled;
    }
  });
});
