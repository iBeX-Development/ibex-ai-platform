import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  generalAgentProfile,
  generalEvaluationDataset,
  generalPrompt
} from '../../agents/general/src/index.js';
import {
  PilotAgentRuntime,
  pilotAgentProfileSchema,
  type PilotAgentAuditEvent
} from '../../packages/pilot-agents/src/index.js';
import {
  createPilotAgentRuntime,
  pilotContext,
  pilotEvidence,
  pilotRequest,
  pilotValidationTime,
  ragCitation,
  toolCitation
} from '../testing/pilot-agent-fixtures.js';

describe('Phase 8 General iBeX Agent acceptance', () => {
  const audits: PilotAgentAuditEvent[] = [];
  const runtime = createPilotAgentRuntime(generalAgentProfile, audits);

  it('has versioned configuration and a content-addressed domain prompt', () => {
    expect(pilotAgentProfileSchema.parse(generalAgentProfile)).toBeDefined();
    expect(
      Object.values(generalAgentProfile.versions).every((version) => version === '1.0.0')
    ).toBe(true);
    expect(generalPrompt.content_hash).toBe(
      `sha256:${createHash('sha256').update(generalPrompt.content).digest('hex')}`
    );
    expect(generalEvaluationDataset.map((test) => test.category)).toEqual(
      expect.arrayContaining([
        'scope',
        'routing',
        'permission',
        'tenant',
        'rag',
        'tool',
        'citation',
        'abstention'
      ])
    );
  });

  it('returns approved knowledge with citation and correlation evidence', () => {
    const response = runtime.execute(
      pilotRequest(generalAgentProfile, {
        requested_rag_scopes: ['ibex-handbook'],
        evidence: pilotEvidence({ rag_citations: [ragCitation()] })
      }),
      pilotValidationTime
    );
    expect(response).toMatchObject({
      response_type: 'knowledge',
      evidence_status: 'sufficient',
      request_id: 'request-p8-1',
      trace_id: 'trace-p8-1'
    });
    expect(response.citations).toHaveLength(1);
    expect(audits.at(-1)).toMatchObject({
      outcome: 'allowed',
      agent_id: 'general_ibex',
      request_id: 'request-p8-1'
    });
  });

  it('routes domain handoff without executing another agent', () => {
    const response = runtime.execute(
      pilotRequest(generalAgentProfile, { intent: 'DOMAIN_HANDOFF' }),
      pilotValidationTime
    );
    expect(response).toMatchObject({ response_type: 'routed', approval_required: false });
  });

  it('abstains without RAG evidence and for out-of-scope action requests', () => {
    expect(
      runtime.execute(pilotRequest(generalAgentProfile), pilotValidationTime).response_type
    ).toBe('abstain');
    expect(
      runtime.execute(
        pilotRequest(generalAgentProfile, { intent: 'ACTION_REQUEST' }),
        pilotValidationTime
      ).response_type
    ).toBe('abstain');
  });

  it('accepts a permission-bound deterministic Tool adapter and keeps live Core disabled', () => {
    const deterministic = runtime.execute(
      pilotRequest(generalAgentProfile, {
        context: pilotContext({ permissions: ['PERMITTED_RECORD_SEARCH'] }),
        intent: 'RECORD_LOOKUP',
        requested_tool_capabilities: ['PERMITTED_RECORD_SEARCH'],
        evidence: pilotEvidence({ tool_citations: [toolCitation('PERMITTED_RECORD_SEARCH')] })
      }),
      pilotValidationTime
    );
    expect(deterministic.response_type).toBe('operational');
    const live = runtime.execute(
      pilotRequest(generalAgentProfile, {
        context: pilotContext({ permissions: ['PERMITTED_RECORD_SEARCH'] }),
        intent: 'RECORD_LOOKUP',
        requested_tool_capabilities: ['PERMITTED_RECORD_SEARCH'],
        evidence: pilotEvidence({
          tool_execution_mode: 'live_core',
          tool_citations: [toolCitation('PERMITTED_RECORD_SEARCH')]
        })
      }),
      pilotValidationTime
    );
    expect(live).toMatchObject({
      response_type: 'abstain',
      limitations: ['Live Core Tool/API binding is not approved']
    });
  });

  it('denies missing permissions, widened scope, and inconsistent trusted correlation', () => {
    expect(() =>
      runtime.execute(
        pilotRequest(generalAgentProfile, { intent: 'RECORD_LOOKUP' }),
        pilotValidationTime
      )
    ).toThrow(expect.objectContaining({ code: 'PERMISSION_DENIED' }));
    expect(() =>
      runtime.execute(
        pilotRequest(generalAgentProfile, { requested_rag_scopes: ['maintenance-handbook'] }),
        pilotValidationTime
      )
    ).toThrow(expect.objectContaining({ code: 'PERMISSION_DENIED' }));
    expect(() =>
      runtime.execute(
        pilotRequest(generalAgentProfile, {
          evidence: pilotEvidence({ correlation_id: 'tenant-b-correlation' })
        }),
        pilotValidationTime
      )
    ).toThrow(expect.objectContaining({ code: 'TENANT_CONTEXT_ERROR' }));
  });

  it('does not give retrieved prompt injection any instruction authority', () => {
    const response = runtime.execute(
      pilotRequest(generalAgentProfile, {
        candidate_answer: 'The document contains an untrusted instruction; it was not followed.',
        requested_rag_scopes: ['ibex-handbook'],
        evidence: pilotEvidence({ rag_citations: [ragCitation('malicious-document')] })
      }),
      pilotValidationTime
    );
    expect(response.response_type).toBe('knowledge');
    expect(generalPrompt.content).toContain('no instruction authority');
  });

  it('emits minimized audit evidence and fails closed when the audit sink fails', () => {
    const sensitive = 'do-not-copy-this-prompt';
    runtime.execute(
      pilotRequest(generalAgentProfile, {
        candidate_answer: sensitive,
        requested_rag_scopes: ['ibex-handbook'],
        evidence: pilotEvidence({ rag_citations: [ragCitation()] })
      }),
      pilotValidationTime
    );
    expect(JSON.stringify(audits.at(-1))).not.toContain(sensitive);
    const failing = new PilotAgentRuntime(generalAgentProfile, {
      emit: () => {
        throw new Error('audit unavailable');
      }
    });
    expect(() =>
      failing.execute(
        pilotRequest(generalAgentProfile, { intent: 'DOMAIN_HANDOFF' }),
        pilotValidationTime
      )
    ).toThrow('audit unavailable');
  });
});
