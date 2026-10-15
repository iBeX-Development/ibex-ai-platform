import { describe, expect, it, vi } from 'vitest';
import { warehouseAgentProfile, warehousePrompt } from '../../agents/warehouse/src/index.js';
import { warehouseReadResponseSchema } from '../../packages/pilot-agents/src/index.js';
import {
  createPilotHarness,
  pilotContext,
  pilotRequest,
  pilotValidationTime,
  ragGrounding,
  toolGrounding
} from '../testing/pilot-agent-fixtures.js';

describe('Phase 8 Warehouse Agent acceptance', () => {
  it('keeps versioned scope and evaluation coverage', () => {
    expect(warehousePrompt.prompt_version).toBe('1.0.0');
    expect(warehouseAgentProfile.versions.evaluation_dataset).toBe('1.0.0');
  });
  it('uses verified warehouse procedure evidence', async () => {
    const { runtime } = createPilotHarness(warehouseAgentProfile, {
      grounding: ragGrounding(warehouseAgentProfile, 'approved-warehouse-procedures')
    });
    const response = await runtime.execute(
      pilotRequest(warehouseAgentProfile, {
        intent: 'WAREHOUSE_KNOWLEDGE_QUERY',
        requested_rag_scopes: ['approved-warehouse-procedures']
      }),
      pilotValidationTime
    );
    expect(response.response_type).toBe('knowledge');
  });
  it('uses explicit synthetic stock evidence without enabling live Core', async () => {
    const capability = 'inventory.stock';
    const { runtime } = createPilotHarness(warehouseAgentProfile, {
      grounding: toolGrounding(capability)
    });
    const response = await runtime.execute(
      pilotRequest(warehouseAgentProfile, {
        context: pilotContext({ permissions: [capability] }),
        intent: 'INVENTORY_QUERY',
        requested_tool_capabilities: [capability]
      }),
      pilotValidationTime
    );
    expect(response.response_type).toBe('operational');
    expect(warehouseAgentProfile.live_capabilities_enabled).toBe(false);
  });
  it('keeps Issue preparation proposal-only and unavailable in production', async () => {
    const policy = warehouseAgentProfile.intents.find(
      (item) => item.intent === 'ISSUE_DRAFT_ACTION'
    );
    expect(policy).toMatchObject({
      response_type: 'proposed_action',
      proposal_only: true,
      authorization_status: 'blocked_pending_approved_mapping'
    });
    const runtime = createPilotHarness(warehouseAgentProfile, { synthetic: false }).runtime;
    await expect(
      runtime.execute(
        pilotRequest(warehouseAgentProfile, {
          context: pilotContext({ permissions: ['inventory.prepare_issue'] }),
          intent: 'ISSUE_DRAFT_ACTION',
          requested_tool_capabilities: ['inventory.prepare_issue']
        }),
        pilotValidationTime
      )
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  });
  it('denies Tool allowlist widening and autonomous transaction scope', async () => {
    const runtime = createPilotHarness(warehouseAgentProfile).runtime;
    await expect(
      runtime.execute(
        pilotRequest(warehouseAgentProfile, {
          context: pilotContext({ permissions: ['inventory.stock'] }),
          intent: 'INVENTORY_QUERY',
          requested_tool_capabilities: ['inventory.adjust']
        }),
        pilotValidationTime
      )
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    expect(warehouseAgentProfile.forbidden_capabilities).toContain('autonomous_purchase');
  });
  it('rejects a forged Tool identity from the server evidence boundary', async () => {
    const capability = 'inventory.stock';
    const evidence = toolGrounding(capability);
    const forged = {
      ...evidence,
      tool_responses: evidence.tool_responses.map((response) => ({
        ...response,
        tool_id: 'inventory.adjust'
      }))
    };
    const runtime = createPilotHarness(warehouseAgentProfile, { grounding: forged }).runtime;
    const response = await runtime.execute(
      pilotRequest(warehouseAgentProfile, {
        context: pilotContext({ permissions: [capability] }),
        intent: 'INVENTORY_QUERY',
        requested_tool_capabilities: [capability]
      }),
      pilotValidationTime
    );
    expect(response.response_type).toBe('abstain');
  });
});

describe('Warehouse P0 read projection', () => {
  const cases = [
    { intent: 'WAREHOUSE_KNOWLEDGE_QUERY', capability: '', type: 'informational', risk: 'R0' },
    { intent: 'INVENTORY_QUERY', capability: 'inventory.stock', type: 'analysis', risk: 'R1' },
    {
      intent: 'WORK_ORDER_MATERIAL_QUERY',
      capability: 'WO_MATERIAL_LOOKUP',
      type: 'analysis',
      risk: 'R1'
    }
  ] as const;
  const requestFor = (intent: string, capability = '') =>
    pilotRequest(warehouseAgentProfile, {
      intent,
      context: pilotContext({ permissions: capability ? [capability] : [] }),
      requested_tool_capabilities: capability ? [capability] : [],
      requested_rag_scopes:
        intent === 'WAREHOUSE_KNOWLEDGE_QUERY' ? ['approved-warehouse-procedures'] : []
    });
  const knowledge = () => ragGrounding(warehouseAgentProfile, 'approved-warehouse-procedures');

  it.each(cases)('projects $intent faithfully with no invented fields', async (item) => {
    const grounding = item.capability ? toolGrounding(item.capability) : knowledge();
    const { runtime } = createPilotHarness(warehouseAgentProfile, { grounding });
    const request = requestFor(item.intent, item.capability);
    const generic = await runtime.execute(request, pilotValidationTime);
    const response = await runtime.executeWarehouseRead(request, pilotValidationTime);
    expect(response).toEqual({
      agent: 'warehouse',
      response_type: item.type,
      risk_level: item.risk,
      answer: generic.answer,
      evidence_status: 'Sufficient',
      sources: generic.citations.filter((citation) => citation.source_type === 'rag'),
      tools_used: generic.citations.filter((citation) => citation.source_type === 'tool'),
      proposed_action: null,
      approval_required: false,
      warnings: [],
      limitations: generic.limitations
    });
    expect(Object.isFrozen(response)).toBe(true);
    expect(Object.isFrozen(response.sources)).toBe(true);
    expect(Object.isFrozen(response.tools_used)).toBe(true);
    expect(Object.isFrozen(response.limitations)).toBe(true);
    expect(warehouseReadResponseSchema.safeParse(response).success).toBe(true);
    for (const contradiction of [
      { unknown: true },
      { agent: 'asset' },
      { response_type: 'proposed_action' },
      { risk_level: item.risk === 'R0' ? 'R1' : 'R0' },
      { risk_level: 'R2' },
      { evidence_status: 'Partial' },
      { evidence_status: 'Insufficient' },
      { proposed_action: { type: 'prepare_issue' } },
      { approval_required: true },
      { sources: [], tools_used: [] },
      { sources: response.tools_used, tools_used: response.sources }
    ]) {
      expect(warehouseReadResponseSchema.safeParse({ ...response, ...contradiction }).success).toBe(
        false
      );
    }
    const citationField = item.capability ? 'tools_used' : 'sources';
    expect(
      warehouseReadResponseSchema.safeParse({
        ...response,
        [citationField]: response[citationField].map((citation) => ({ ...citation, unknown: true }))
      }).success
    ).toBe(false);
  });

  it('does not accept a fabricated response or an overridden public execute as evidence', async () => {
    const request = requestFor('WAREHOUSE_KNOWLEDGE_QUERY');
    const good = createPilotHarness(warehouseAgentProfile, { grounding: knowledge() }).runtime;
    const fabricated = {
      ...(await good.execute(request, pilotValidationTime)),
      answer: 'Invented stock: 99'
    };
    const runtime = createPilotHarness(warehouseAgentProfile).runtime;
    const override = vi.spyOn(runtime, 'execute').mockResolvedValue(fabricated);
    await expect(runtime.executeWarehouseRead(request, pilotValidationTime)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR'
    });
    await expect(
      runtime.executeWarehouseRead(fabricated, pilotValidationTime)
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(override).not.toHaveBeenCalled();
  });

  it.each(['knowledge', 'analysis', 'recommendation', 'routed', 'proposed_action'] as const)(
    'rejects contradictory inventory classification %s',
    async (response_type) => {
      const profile = {
        ...warehouseAgentProfile,
        intents: warehouseAgentProfile.intents.map((policy) =>
          policy.intent === 'INVENTORY_QUERY'
            ? { ...policy, response_type, proposal_only: response_type === 'proposed_action' }
            : policy
        )
      };
      const runtime = createPilotHarness(profile, {
        grounding: toolGrounding('inventory.stock')
      }).runtime;
      await expect(
        runtime.executeWarehouseRead(
          requestFor('INVENTORY_QUERY', 'inventory.stock'),
          pilotValidationTime
        )
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    }
  );

  it.each([
    ['PART_QUERY', 'PART_LOOKUP'],
    ['RECEIPT_ISSUE_QUERY', 'ISSUE_LOOKUP'],
    ['ISSUE_DRAFT_ACTION', 'inventory.prepare_issue'],
    ['WAREHOUSE_DOMAIN_HANDOFF', ''],
    ['UNKNOWN', '']
  ])('rejects unsupported intent %s', async (intent, capability) => {
    const runtime = createPilotHarness(warehouseAgentProfile, {
      grounding: toolGrounding(capability || 'inventory.stock')
    }).runtime;
    await expect(
      runtime.executeWarehouseRead(requestFor(intent, capability), pilotValidationTime)
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('rejects a non-Warehouse runtime and mismatched request agent', async () => {
    const wrong = createPilotHarness({
      ...warehouseAgentProfile,
      agent_id: 'asset',
      domain: 'asset'
    }).runtime;
    await expect(
      wrong.executeWarehouseRead(requestFor('WAREHOUSE_KNOWLEDGE_QUERY'), pilotValidationTime)
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const runtime = createPilotHarness(warehouseAgentProfile, { grounding: knowledge() }).runtime;
    await expect(
      runtime.executeWarehouseRead(
        { ...requestFor('WAREHOUSE_KNOWLEDGE_QUERY'), agent_id: 'asset' },
        pilotValidationTime
      )
    ).rejects.toMatchObject({ code: 'TENANT_CONTEXT_ERROR' });
  });

  it('fails closed on forged provenance and retains generic abstention', async () => {
    const evidence = toolGrounding('inventory.stock');
    const runtime = createPilotHarness(warehouseAgentProfile, {
      grounding: {
        ...evidence,
        tool_responses: evidence.tool_responses.map((response) => ({
          ...response,
          request_id: 'another-request'
        }))
      }
    }).runtime;
    const request = requestFor('INVENTORY_QUERY', 'inventory.stock');
    expect(await runtime.execute(request, pilotValidationTime)).toMatchObject({
      response_type: 'abstain',
      evidence_status: 'insufficient',
      citations: []
    });
    await expect(runtime.executeWarehouseRead(request, pilotValidationTime)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR'
    });
  });

  it.each(cases)('preserves real-profile denial for $intent', async ({ intent, capability }) => {
    const { runtime, grounding } = createPilotHarness(warehouseAgentProfile, { synthetic: false });
    const resolve = vi.spyOn(grounding, 'resolve');
    await expect(
      runtime.executeWarehouseRead(requestFor(intent, capability), pilotValidationTime)
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    expect(resolve).not.toHaveBeenCalled();
    expect(warehouseAgentProfile.deployment_stage).toBe('evaluation');
    expect(warehouseAgentProfile.live_capabilities_enabled).toBe(false);
    expect(
      warehouseAgentProfile.intents.every(
        (policy) => policy.authorization_status === 'blocked_pending_approved_mapping'
      )
    ).toBe(true);
    for (const tool of warehouseAgentProfile.tool_allowlist) {
      expect(tool.enabled).toBe(false);
      expect(tool.live_binding).toBe('blocked_pending_approved_core_contract');
    }
  });
});
