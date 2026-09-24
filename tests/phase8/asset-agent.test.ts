import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  assetAgentProfile,
  assetEvaluationDataset,
  assetPrompt
} from '../../agents/asset/src/index.js';
import { pilotAgentProfileSchema } from '../../packages/pilot-agents/src/index.js';
import {
  createPilotAgentRuntime,
  pilotContext,
  pilotEvidence,
  pilotRequest,
  pilotValidationTime,
  ragCitation,
  toolCitation
} from '../testing/pilot-agent-fixtures.js';

describe('Phase 8 Asset Agent acceptance', () => {
  const runtime = createPilotAgentRuntime(assetAgentProfile);

  it('validates versioned components, the prompt hash, and evaluation coverage', () => {
    expect(pilotAgentProfileSchema.parse(assetAgentProfile)).toBeDefined();
    expect(assetPrompt.content_hash).toBe(
      `sha256:${createHash('sha256').update(assetPrompt.content).digest('hex')}`
    );
    expect(new Set(assetEvaluationDataset.map((item) => item.category)).size).toBe(10);
  });

  it('answers technical knowledge only with approved citation evidence', () => {
    const response = runtime.execute(
      pilotRequest(assetAgentProfile, {
        intent: 'ASSET_TECHNICAL_KNOWLEDGE',
        requested_rag_scopes: ['approved-asset-manuals'],
        evidence: pilotEvidence({
          rag_citations: [ragCitation('asset-manual-1', 'approved-asset-manuals')]
        })
      }),
      pilotValidationTime
    );
    expect(response).toMatchObject({
      response_type: 'knowledge',
      evidence_status: 'sufficient',
      agent_id: 'asset'
    });
    expect(response.citations[0]?.source_id).toBe('asset-manual-1');
  });

  it('routes maintenance and warehouse ownership without executing another agent', () => {
    expect(
      runtime.execute(
        pilotRequest(assetAgentProfile, { intent: 'ASSET_DOMAIN_HANDOFF' }),
        pilotValidationTime
      ).response_type
    ).toBe('routed');
  });

  it('requires permission before disabled live asset lookup and never invents hierarchy', () => {
    expect(() =>
      runtime.execute(
        pilotRequest(assetAgentProfile, { intent: 'ASSET_HIERARCHY' }),
        pilotValidationTime
      )
    ).toThrow(expect.objectContaining({ code: 'PERMISSION_DENIED' }));
    const response = runtime.execute(
      pilotRequest(assetAgentProfile, {
        context: pilotContext({ permissions: ['asset.get_hierarchy'] }),
        intent: 'ASSET_HIERARCHY',
        requested_tool_capabilities: ['asset.get_hierarchy'],
        evidence: pilotEvidence({ tool_citations: [toolCitation('asset.get_hierarchy')] })
      }),
      pilotValidationTime
    );
    expect(response).toMatchObject({ response_type: 'operational', evidence_status: 'sufficient' });
    const live = runtime.execute(
      pilotRequest(assetAgentProfile, {
        context: pilotContext({ permissions: ['asset.get_hierarchy'] }),
        intent: 'ASSET_HIERARCHY',
        requested_tool_capabilities: ['asset.get_hierarchy'],
        evidence: pilotEvidence({
          tool_execution_mode: 'live_core',
          tool_citations: [toolCitation('asset.get_hierarchy')]
        })
      }),
      pilotValidationTime
    );
    expect(live.response_type).toBe('abstain');
  });

  it('denies tool/RAG widening and inconsistent tenant-bound correlation', () => {
    expect(() =>
      runtime.execute(
        pilotRequest(assetAgentProfile, {
          intent: 'ASSET_TECHNICAL_KNOWLEDGE',
          requested_rag_scopes: ['maintenance-handbook']
        }),
        pilotValidationTime
      )
    ).toThrow(expect.objectContaining({ code: 'PERMISSION_DENIED' }));
    expect(() =>
      runtime.execute(
        pilotRequest(assetAgentProfile, {
          context: pilotContext({ permissions: ['asset.get_location'] }),
          intent: 'ASSET_LOCATION',
          requested_tool_capabilities: ['asset.get_datahub_summary']
        }),
        pilotValidationTime
      )
    ).toThrow(expect.objectContaining({ code: 'PERMISSION_DENIED' }));
    expect(() =>
      runtime.execute(
        pilotRequest(assetAgentProfile, {
          evidence: pilotEvidence({ trace_id: 'tenant-b-trace' })
        }),
        pilotValidationTime
      )
    ).toThrow(expect.objectContaining({ code: 'TENANT_CONTEXT_ERROR' }));
  });

  it('abstains on missing evidence and out-of-scope asset modification', () => {
    expect(
      runtime.execute(
        pilotRequest(assetAgentProfile, { intent: 'ASSET_TECHNICAL_KNOWLEDGE' }),
        pilotValidationTime
      ).response_type
    ).toBe('abstain');
    expect(
      runtime.execute(
        pilotRequest(assetAgentProfile, { intent: 'ASSET_MASTER_UPDATE' }),
        pilotValidationTime
      ).response_type
    ).toBe('abstain');
  });

  it('preserves injection, prediction, and master-data boundaries', () => {
    expect(assetPrompt.content).toContain('untrusted data');
    expect(assetAgentProfile.forbidden_capabilities).toEqual(
      expect.arrayContaining(['asset_delete', 'predictive_failure', 'location_write'])
    );
    expect(
      assetAgentProfile.tool_allowlist.every(
        (tool) => tool.classification === 'read' && !tool.enabled
      )
    ).toBe(true);
  });
});
