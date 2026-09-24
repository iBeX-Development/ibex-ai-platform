import { describe, expect, it } from 'vitest';
import {
  assetAgentProfile,
  assetEvaluationDataset,
  assetPrompt
} from '../../agents/asset/src/index.js';
import {
  createPilotHarness,
  pilotContext,
  pilotRequest,
  pilotValidationTime,
  ragGrounding,
  toolGrounding
} from '../testing/pilot-agent-fixtures.js';

describe('Phase 8 Asset Agent acceptance', () => {
  it('keeps versioned scope and evaluation coverage', () => {
    expect(assetPrompt.prompt_version).toBe('1.0.0');
    expect(new Set(assetEvaluationDataset.map((item) => item.category)).size).toBe(10);
  });
  it('uses verified approved technical knowledge', async () => {
    const { runtime } = createPilotHarness(assetAgentProfile, {
      grounding: ragGrounding(assetAgentProfile, 'approved-asset-manuals')
    });
    const response = await runtime.execute(
      pilotRequest(assetAgentProfile, {
        intent: 'ASSET_TECHNICAL_KNOWLEDGE',
        requested_rag_scopes: ['approved-asset-manuals']
      }),
      pilotValidationTime
    );
    expect(response).toMatchObject({ response_type: 'knowledge', agent_id: 'asset' });
  });
  it('allows deterministic hierarchy evidence only in the explicit test fixture', async () => {
    const capability = 'asset.get_hierarchy';
    const { runtime } = createPilotHarness(assetAgentProfile, {
      grounding: toolGrounding(capability)
    });
    const response = await runtime.execute(
      pilotRequest(assetAgentProfile, {
        context: pilotContext({ permissions: [capability] }),
        intent: 'ASSET_HIERARCHY',
        requested_tool_capabilities: [capability]
      }),
      pilotValidationTime
    );
    expect(response.response_type).toBe('operational');
  });
  it('fails closed for disabled production lookup and scope widening', async () => {
    const production = createPilotHarness(assetAgentProfile, { synthetic: false }).runtime;
    await expect(
      production.execute(
        pilotRequest(assetAgentProfile, {
          context: pilotContext({ permissions: ['asset.get'] }),
          intent: 'ASSET_LOOKUP',
          requested_tool_capabilities: ['asset.get']
        }),
        pilotValidationTime
      )
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    const synthetic = createPilotHarness(assetAgentProfile).runtime;
    await expect(
      synthetic.execute(
        pilotRequest(assetAgentProfile, {
          intent: 'ASSET_TECHNICAL_KNOWLEDGE',
          requested_rag_scopes: ['maintenance-handbook']
        }),
        pilotValidationTime
      )
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  });
  it('rejects tenant-private evidence from another tenant', async () => {
    const evidence = ragGrounding(assetAgentProfile, 'approved-asset-manuals', {
      tenant_id: 'tenant-b'
    });
    const runtime = createPilotHarness(assetAgentProfile, { grounding: evidence }).runtime;
    const response = await runtime.execute(
      pilotRequest(assetAgentProfile, {
        intent: 'ASSET_TECHNICAL_KNOWLEDGE',
        requested_rag_scopes: ['approved-asset-manuals']
      }),
      pilotValidationTime
    );
    expect(response.response_type).toBe('abstain');
  });
  it('keeps master-data writes and predictions forbidden', () => {
    expect(assetAgentProfile.forbidden_capabilities).toEqual(
      expect.arrayContaining(['asset_delete', 'predictive_failure', 'location_write'])
    );
  });
});
