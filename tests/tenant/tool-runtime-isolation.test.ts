import { describe, expect, it, vi } from 'vitest';
import type { AuditRecord } from '../../packages/audit/src/index.js';
import { createTrustedRequestContext } from '../../packages/security/src/index.js';
import {
  createToolRuntime,
  successfulToolAdapter,
  toolContext,
  toolRequest,
  toolValidationTime
} from '../testing/tool-runtime-fixtures.js';

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
    const tenantBContext = createTrustedRequestContext({
      ...toolContext,
      tenant_id: 'tenant-b',
      request_id: 'request-tool-b',
      correlation_id: 'correlation-tool-b'
    });
    const ownership = vi.fn(({ id }: { id: string }) =>
      Promise.resolve(id === 'asset-a' ? 'tenant-a' : 'tenant-b')
    );
    const runtime = createToolRuntime([], { ownership: { resolveTenantId: ownership } });

    await expect(
      runtime.execute(toolRequest({ input: { asset_id: 'asset-b' } }), {}, toolValidationTime)
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    await expect(
      runtime.execute(
        toolRequest({ context: tenantBContext, input: { asset_id: 'asset-a' } }),
        {},
        toolValidationTime
      )
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  });
});
