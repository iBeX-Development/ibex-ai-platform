import { expect, it, vi } from 'vitest';
import type { AuditRecord } from '../../packages/audit/src/index.js';
import { createTrustedRequestContext } from '../../packages/security/src/index.js';
import {
  createRuntime,
  runtimeContext,
  runtimeRequest,
  runtimeValidationTime
} from '../testing/runtime-fixtures.js';
import {
  createToolRuntime,
  readToolMetadata,
  successfulToolAdapter
} from '../testing/tool-runtime-fixtures.js';
it('hands an actual Maintenance routing decision to destination ToolRuntime without changing caller scope', async () => {
  const audits: AuditRecord[] = [];
  // Explicit synthetic identity has these grants BEFORE entry; General receives no tool binding.
  const context = createTrustedRequestContext({
    ...runtimeContext,
    permissions: ['maintenance:read', 'asset:read'],
    entitlements: ['ai:general', 'asset-tools']
  });
  const before = JSON.stringify(context);
  const order: string[] = [];
  const router = createRuntime(audits);
  const routed = await router.route(runtimeRequest({ context }), runtimeValidationTime);
  if (routed.status !== 'routed') throw new Error('No authorized destination');
  order.push('router-decision');
  expect(routed.decision.selected_agent).toBe('maintenance-agent');
  expect(routed.decision.tool_candidates).toContain('asset.get');
  // Fixture-only bridge: explicit destination and conceptual-to-registered-tool mapping.
  if (
    routed.decision.selected_agent !== 'maintenance-agent' ||
    !routed.decision.tool_candidates.includes('asset.get')
  )
    throw new Error('No fixture handoff binding');
  const underlying = successfulToolAdapter();
  const transport = vi.fn<typeof underlying.invoke>((request) => {
    order.push('destination-transport');
    return underlying.invoke(request);
  });
  const authorize = vi.fn(() => {
    order.push('destination-authorization');
    return Promise.resolve({ allowed: true as const, decision_id: 'synthetic-destination-read' });
  });
  const ownership = vi.fn(() => {
    order.push('destination-ownership');
    return Promise.resolve('tenant-a');
  });
  const destination = createToolRuntime(audits, {
    adapters: [{ ...underlying, invoke: transport }],
    authorization: { authorize },
    ownership: { resolveTenantId: ownership }
  });
  const result = await destination.execute(
    {
      context,
      trace_id: routed.decision.trace_id,
      agent_id: routed.decision.selected_agent,
      prompt_version: '1.0',
      tool_id: readToolMetadata.tool_id,
      tool_version: readToolMetadata.version,
      input: { asset_id: 'asset-1' }
    },
    {},
    runtimeValidationTime
  );
  expect(result).toMatchObject({
    status: 'success',
    request_id: context.request_id,
    correlation_id: context.correlation_id,
    trace_id: routed.decision.trace_id,
    output: { asset_id: 'asset-1', name: 'Pump A', status: 'active' }
  });
  expect(authorize).toHaveBeenCalledTimes(1);
  expect(ownership).toHaveBeenCalledTimes(1);
  expect(transport).toHaveBeenCalledTimes(1);
  expect(order[0]).toBe('router-decision');
  expect(order.indexOf('destination-authorization')).toBeLessThan(
    order.indexOf('destination-transport')
  );
  expect(order.indexOf('destination-ownership')).toBeLessThan(
    order.indexOf('destination-transport')
  );
  expect(transport.mock.calls[0]?.[0].context).toEqual(context);
  expect(JSON.stringify(context)).toBe(before);
  const toolAudits = audits.filter((e) => e.event_type === 'tool_runtime.execution.outcome');
  expect(toolAudits.length).toBeGreaterThan(0);
  for (const e of toolAudits)
    expect(e).toMatchObject({
      agent_id: 'maintenance-agent',
      request_id: context.request_id,
      correlation_id: context.correlation_id,
      trace_id: routed.decision.trace_id
    });
});
