import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  maintenanceAgentProfile,
  maintenanceEvaluationDataset,
  maintenancePrompt
} from '../../agents/maintenance/src/index.js';
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

describe('Phase 8 Maintenance Agent acceptance', () => {
  const runtime = createPilotAgentRuntime(maintenanceAgentProfile);

  it('validates every versioned component, prompt hash, and acceptance category', () => {
    expect(pilotAgentProfileSchema.parse(maintenanceAgentProfile)).toBeDefined();
    expect(maintenancePrompt.content_hash).toBe(
      `sha256:${createHash('sha256').update(maintenancePrompt.content).digest('hex')}`
    );
    expect(new Set(maintenanceEvaluationDataset.map((item) => item.category)).size).toBe(10);
  });

  it('answers procedure requests only with approved RAG citation evidence', () => {
    const response = runtime.execute(
      pilotRequest(maintenanceAgentProfile, {
        intent: 'PROCEDURE_ASSISTANCE',
        requested_rag_scopes: ['approved-maintenance-procedures'],
        evidence: pilotEvidence({
          rag_citations: [ragCitation('procedure-1', 'approved-maintenance-procedures')]
        })
      }),
      pilotValidationTime
    );
    expect(response).toMatchObject({
      response_type: 'knowledge',
      evidence_status: 'sufficient',
      agent_id: 'maintenance'
    });
    expect(response.citations[0]?.source_id).toBe('procedure-1');
  });

  it('routes warehouse context through the orchestrator', () => {
    expect(
      runtime.execute(
        pilotRequest(maintenanceAgentProfile, { intent: 'CROSS_DOMAIN_REQUEST' }),
        pilotValidationTime
      ).response_type
    ).toBe('routed');
  });

  it('abstains for missing evidence and keeps live tool paths disabled', () => {
    expect(
      runtime.execute(
        pilotRequest(maintenanceAgentProfile, { intent: 'PROCEDURE_ASSISTANCE' }),
        pilotValidationTime
      ).response_type
    ).toBe('abstain');
    const deterministic = runtime.execute(
      pilotRequest(maintenanceAgentProfile, {
        context: pilotContext({ permissions: ['FAILURE_HISTORY_READ'] }),
        intent: 'FAILURE_REVIEW',
        requested_tool_capabilities: ['FAILURE_HISTORY_READ'],
        evidence: pilotEvidence({ tool_citations: [toolCitation('FAILURE_HISTORY_READ')] })
      }),
      pilotValidationTime
    );
    expect(deterministic.response_type).toBe('analysis');
    const live = runtime.execute(
      pilotRequest(maintenanceAgentProfile, {
        context: pilotContext({ permissions: ['FAILURE_HISTORY_READ'] }),
        intent: 'FAILURE_REVIEW',
        requested_tool_capabilities: ['FAILURE_HISTORY_READ'],
        evidence: pilotEvidence({
          tool_execution_mode: 'live_core',
          tool_citations: [toolCitation('FAILURE_HISTORY_READ')]
        })
      }),
      pilotValidationTime
    );
    expect(live.limitations).toContain('Live Core Tool/API binding is not approved');
  });

  it('denies permission bypass, scope widening, and cross-context evidence', () => {
    expect(() =>
      runtime.execute(
        pilotRequest(maintenanceAgentProfile, { intent: 'FAILURE_REVIEW' }),
        pilotValidationTime
      )
    ).toThrow(expect.objectContaining({ code: 'PERMISSION_DENIED' }));
    expect(() =>
      runtime.execute(
        pilotRequest(maintenanceAgentProfile, {
          intent: 'PROCEDURE_ASSISTANCE',
          requested_rag_scopes: ['warehouse']
        }),
        pilotValidationTime
      )
    ).toThrow(expect.objectContaining({ code: 'PERMISSION_DENIED' }));
    expect(() =>
      runtime.execute(
        pilotRequest(maintenanceAgentProfile, {
          evidence: pilotEvidence({ request_id: 'other-request' })
        }),
        pilotValidationTime
      )
    ).toThrow(expect.objectContaining({ code: 'TENANT_CONTEXT_ERROR' }));
  });

  it('keeps draft actions proposal-only and unavailable without approved Core contracts', () => {
    const policy = maintenanceAgentProfile.intents.find((item) => item.intent === 'DRAFT_ACTION');
    expect(policy).toMatchObject({ response_type: 'proposed_action', proposal_only: true });
    for (const tool of maintenanceAgentProfile.tool_allowlist.filter(
      (entry) => entry.classification === 'proposal'
    )) {
      expect(tool.enabled).toBe(false);
    }
  });

  it('preserves the recommendation and predictive-authority boundaries', () => {
    expect(maintenancePrompt.content).toContain(
      'Keep facts, inference, recommendations, and missing evidence distinct'
    );
    expect(maintenanceAgentProfile.forbidden_capabilities).toEqual(
      expect.arrayContaining(['engineering_approval', 'pm_pdm_prediction'])
    );
  });
});
