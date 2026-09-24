import { describe, expect, it } from 'vitest';
import {
  warehouseAgentProfile,
  warehouseEvaluationDataset,
  warehousePrompt
} from '../../agents/warehouse/src/index.js';
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
    expect(new Set(warehouseEvaluationDataset.map((item) => item.category)).size).toBe(10);
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
