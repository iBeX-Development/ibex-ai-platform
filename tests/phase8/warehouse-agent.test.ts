import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  warehouseAgentProfile,
  warehouseEvaluationDataset,
  warehousePrompt
} from '../../agents/warehouse/src/index.js';
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

describe('Phase 8 Warehouse Agent acceptance', () => {
  const runtime = createPilotAgentRuntime(warehouseAgentProfile);

  it('validates versioned components, prompt integrity, and evaluation coverage', () => {
    expect(pilotAgentProfileSchema.parse(warehouseAgentProfile)).toBeDefined();
    expect(warehousePrompt.content_hash).toBe(
      `sha256:${createHash('sha256').update(warehousePrompt.content).digest('hex')}`
    );
    expect(new Set(warehouseEvaluationDataset.map((item) => item.category)).size).toBe(10);
  });

  it('answers warehouse procedure questions only with approved citations', () => {
    const response = runtime.execute(
      pilotRequest(warehouseAgentProfile, {
        intent: 'WAREHOUSE_KNOWLEDGE_QUERY',
        requested_rag_scopes: ['approved-warehouse-procedures'],
        evidence: pilotEvidence({
          rag_citations: [ragCitation('warehouse-procedure-1', 'approved-warehouse-procedures')]
        })
      }),
      pilotValidationTime
    );
    expect(response).toMatchObject({
      response_type: 'knowledge',
      evidence_status: 'sufficient',
      agent_id: 'warehouse'
    });
    expect(response.citations[0]?.source_id).toBe('warehouse-procedure-1');
  });

  it('requires permission, accepts deterministic stock evidence, and disables live Core', () => {
    expect(() =>
      runtime.execute(
        pilotRequest(warehouseAgentProfile, { intent: 'INVENTORY_QUERY' }),
        pilotValidationTime
      )
    ).toThrow(expect.objectContaining({ code: 'PERMISSION_DENIED' }));
    const response = runtime.execute(
      pilotRequest(warehouseAgentProfile, {
        context: pilotContext({ permissions: ['inventory.stock'] }),
        intent: 'INVENTORY_QUERY',
        requested_tool_capabilities: ['inventory.stock'],
        evidence: pilotEvidence({ tool_citations: [toolCitation('inventory.stock')] })
      }),
      pilotValidationTime
    );
    expect(response).toMatchObject({ response_type: 'operational', evidence_status: 'sufficient' });
    const live = runtime.execute(
      pilotRequest(warehouseAgentProfile, {
        context: pilotContext({ permissions: ['inventory.stock'] }),
        intent: 'INVENTORY_QUERY',
        requested_tool_capabilities: ['inventory.stock'],
        evidence: pilotEvidence({
          tool_execution_mode: 'live_core',
          tool_citations: [toolCitation('inventory.stock')]
        })
      }),
      pilotValidationTime
    );
    expect(live.response_type).toBe('abstain');
  });

  it('denies widened tool/RAG scope and inconsistent trusted bindings', () => {
    expect(() =>
      runtime.execute(
        pilotRequest(warehouseAgentProfile, {
          context: pilotContext({ permissions: ['inventory.stock'] }),
          intent: 'INVENTORY_QUERY',
          requested_tool_capabilities: ['ISSUE_LOOKUP']
        }),
        pilotValidationTime
      )
    ).toThrow(expect.objectContaining({ code: 'PERMISSION_DENIED' }));
    expect(() =>
      runtime.execute(
        pilotRequest(warehouseAgentProfile, {
          intent: 'WAREHOUSE_KNOWLEDGE_QUERY',
          requested_rag_scopes: ['approved-asset-manuals']
        }),
        pilotValidationTime
      )
    ).toThrow(expect.objectContaining({ code: 'PERMISSION_DENIED' }));
    expect(() =>
      runtime.execute(
        pilotRequest(warehouseAgentProfile, {
          evidence: pilotEvidence({ tenant_id: 'tenant-b' })
        }),
        pilotValidationTime
      )
    ).toThrow(expect.objectContaining({ code: 'TENANT_CONTEXT_ERROR' }));
  });

  it('keeps Issue preparation proposal-only, disabled, and non-executable', () => {
    const policy = warehouseAgentProfile.intents.find(
      (item) => item.intent === 'ISSUE_DRAFT_ACTION'
    );
    const tool = warehouseAgentProfile.tool_allowlist.find(
      (item) => item.capability_class === 'inventory.prepare_issue'
    );
    expect(policy).toMatchObject({ response_type: 'proposed_action', proposal_only: true });
    expect(tool).toMatchObject({ classification: 'proposal', enabled: false });
    expect(warehouseAgentProfile.forbidden_capabilities).toContain('issue_approval');
  });

  it('abstains on missing evidence, ambiguity, and unapproved operations', () => {
    expect(
      runtime.execute(
        pilotRequest(warehouseAgentProfile, { intent: 'WAREHOUSE_KNOWLEDGE_QUERY' }),
        pilotValidationTime
      ).response_type
    ).toBe('abstain');
    expect(
      runtime.execute(
        pilotRequest(warehouseAgentProfile, { intent: 'STOCK_ADJUSTMENT' }),
        pilotValidationTime
      ).response_type
    ).toBe('abstain');
    expect(warehousePrompt.content).toContain('Never invent identifiers, quantities, availability');
  });

  it('routes domain-owned requests without autonomous multi-agent execution', () => {
    expect(
      runtime.execute(
        pilotRequest(warehouseAgentProfile, { intent: 'WAREHOUSE_DOMAIN_HANDOFF' }),
        pilotValidationTime
      ).response_type
    ).toBe('routed');
  });
});
