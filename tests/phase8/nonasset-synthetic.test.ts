import type { AuditRecord } from '../../packages/audit/src/index.js';
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  ToolRegistry,
  type ToolAdapter,
  type ToolRegistration
} from '../../packages/tool-runtime/src/index.js';
import { createTrustedRequestContext } from '../../packages/security/src/index.js';
import {
  createToolRuntime,
  readToolMetadata,
  toolContext,
  toolRequest,
  toolValidationTime
} from '../testing/tool-runtime-fixtures.js';

const int4 = z.number().int().min(-2147483648).max(2147483647);
function setup(domain: 'maintenance' | 'warehouse') {
  const field = domain === 'maintenance' ? 'wo_status' : 'qty';
  const row = Object.freeze({
    id: domain === 'maintenance' ? 17 : 23,
    [field]: domain === 'maintenance' ? 4 : -2,
    private_note: 'SYNTHETIC_OMIT',
    company_id: 999
  });
  const permission = `synthetic:${domain}:row:read`;
  const metadata = {
    ...readToolMetadata,
    tool_id: `synthetic.${domain}.row.v1`,
    domain,
    required_permissions: [permission],
    required_entitlements: [`synthetic-${domain}`],
    retry_policy: { max_attempts: 1, backoff_ms: 0 }
  };
  const registration: ToolRegistration = {
    metadata,
    input_schema: z.object({ id: int4 }).strict(),
    output_schema: z.object({ id: int4, [field]: int4 }).strict(),
    resource_reference: (input) => ({
      type: `synthetic-${domain}`,
      id: String((input as { id: number }).id)
    })
  };
  const counts = { transport: 0, authorization: 0, ownership: 0 };
  const audit: AuditRecord[] = [];
  const adapter: ToolAdapter = {
    tool_id: metadata.tool_id,
    tool_version: metadata.version,
    execution_mode: 'deterministic_test',
    invoke: ({ input, context }) => {
      counts.transport++;
      expect(context.tenant_id).toBe('tenant-a');
      expect(input).toEqual({ id: row.id });
      return Promise.resolve({
        output: { id: row.id, [field]: row[field] },
        source: { system: 'synthetic-only', reference: `row:${String(row.id)}` },
        observed_at: toolValidationTime.toISOString()
      });
    }
  };
  const runtime = createToolRuntime(audit, {
    registry: new ToolRegistry([registration]),
    adapters: [adapter],
    authorization: {
      authorize: (ctx, request) => {
        counts.authorization++;
        expect(ctx.tenant_id).toBe('tenant-a');
        expect(request.required_permissions).toEqual([permission]);
        return Promise.resolve({ allowed: true as const, decision_id: 'synthetic-authorized' });
      }
    },
    ownership: {
      resolveTenantId: () => {
        counts.ownership++;
        return Promise.resolve('tenant-a');
      }
    }
  });
  const context = createTrustedRequestContext({
    ...toolContext,
    permissions: [permission],
    entitlements: [`synthetic-${domain}`]
  });
  const request = toolRequest({
    context,
    agent_id: domain,
    tool_id: metadata.tool_id,
    input: { id: row.id }
  });
  return { runtime, request, row, field, counts, audit, context };
}
describe('NEW synthetic non-Asset Tool composition, not production registration', () => {
  for (const domain of ['maintenance', 'warehouse'] as const)
    it(`${domain}: one authorized raw projection with no extra fields`, async () => {
      const s = setup(domain);
      const result = await s.runtime.execute(s.request, {}, toolValidationTime);
      expect(result.status).toBe('success');
      if (result.status !== 'success') throw new Error('Expected success');
      expect(result.output).toEqual({ id: s.row.id, [s.field]: s.row[s.field] });
      expect(Object.keys(result.output as object).sort()).toEqual(['id', s.field].sort());
      expect(JSON.stringify(result)).not.toContain('SYNTHETIC_OMIT');
      expect(result).toMatchObject({
        request_id: s.context.request_id,
        correlation_id: s.context.correlation_id,
        trace_id: 'tool-trace-1',
        attempts: 1
      });
      expect(s.counts).toEqual({ transport: 1, authorization: 1, ownership: 1 });
      expect(s.row.private_note).toBe('SYNTHETIC_OMIT');
      expect(s.audit.length).toBeGreaterThan(0);
    });
  it('PROTOTYPE General delegation: unchanged wrong-scope authority is denied by destination before transport', async () => {
    const s = setup('maintenance');
    const general = createTrustedRequestContext({
      ...toolContext,
      permissions: ['synthetic:general:delegate'],
      entitlements: ['synthetic-general']
    });
    const before = JSON.stringify(general);
    // Test-only forwarding composition: no General product router/Gateway is claimed.
    const delegate = (context: typeof general) =>
      s.runtime.execute({ ...s.request, context, agent_id: 'maintenance' }, {}, toolValidationTime);
    await expect(delegate(general)).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
      statusCode: 403
    });
    expect(s.counts).toEqual({ transport: 0, authorization: 0, ownership: 0 });
    expect(JSON.stringify(general)).toBe(before);
    expect(general.permissions).not.toContain('synthetic:maintenance:row:read');
  });
});
