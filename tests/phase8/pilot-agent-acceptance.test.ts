import { describe, expect, it } from 'vitest';
import {
  pilotAgentDefinitions,
  pilotAgentProfiles,
  pilotDomainPromptRecords
} from '../../agents/index.js';
import { AgentRegistry, PromptRegistry } from '../../packages/runtime/src/index.js';

describe('Phase 8 Pilot Agent Acceptance', () => {
  it('registers all four agents in the approved sequential set with deterministic routing', () => {
    const registry = new AgentRegistry(pilotAgentDefinitions);
    for (const definition of pilotAgentDefinitions) {
      const intent = definition.supported_intents[0];
      expect(intent).toBeDefined();
      expect(
        registry.select({
          status: 'classified',
          domain: definition.domain,
          intent: intent ?? '',
          required_capabilities: [`intent:${intent ?? ''}`]
        })
      ).toMatchObject({ agent_id: definition.agent_id, version: '1.0.0' });
    }
    expect(pilotAgentDefinitions.map((agent) => agent.agent_id)).toEqual([
      'general_ibex',
      'maintenance',
      'asset',
      'warehouse'
    ]);
  });

  it('publishes versioned domain prompt evidence for every agent', () => {
    const shared = [
      {
        prompt_id: 'master-policy',
        prompt_version: '1.0',
        agent_id: 'platform',
        layer: 'master',
        status: 'approved',
        effective_date: '2026-01-01T00:00:00.000Z',
        content_hash: `sha256:${'a'.repeat(64)}`,
        created_by: 'platform',
        approved_by: 'security',
        change_reason: 'approved baseline'
      },
      {
        prompt_id: 'orchestrator-routing',
        prompt_version: '1.0',
        agent_id: 'orchestrator',
        layer: 'orchestrator',
        status: 'approved',
        effective_date: '2026-01-01T00:00:00.000Z',
        content_hash: `sha256:${'b'.repeat(64)}`,
        created_by: 'platform',
        approved_by: 'security',
        change_reason: 'approved baseline'
      }
    ] as const;
    const records = new PromptRegistry([...shared, ...pilotDomainPromptRecords]);
    for (const definition of pilotAgentDefinitions) {
      const hierarchy = records.resolveHierarchy(
        definition,
        {
          master: { prompt_id: 'master-policy', prompt_version: '1.0' },
          orchestrator: { prompt_id: 'orchestrator-routing', prompt_version: '1.0' }
        },
        new Date('2026-09-24T00:00:00.000Z')
      );
      expect(hierarchy.layers[2]).toMatchObject({ agent_id: definition.agent_id, layer: 'domain' });
      expect(hierarchy.layers[2].content_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    }
  });

  it('keeps conceptual Tool capabilities disabled until exact Core contracts are approved', () => {
    expect(pilotAgentDefinitions.every((definition) => definition.allowed_tools.length === 0)).toBe(
      true
    );
    for (const profile of pilotAgentProfiles) {
      expect(profile.live_capabilities_enabled).toBe(false);
      for (const tool of profile.tool_allowlist) expect(tool.enabled).toBe(false);
    }
  });

  it('keeps writes and Phase 9 approval execution outside every profile', () => {
    for (const profile of pilotAgentProfiles) {
      expect(profile.deployment_stage).toBe('evaluation');
      expect(
        profile.intents
          .filter((intent) => intent.response_type === 'proposed_action')
          .every((intent) => intent.proposal_only)
      ).toBe(true);
      for (const tool of profile.tool_allowlist.filter(
        (entry) => entry.classification === 'proposal'
      )) {
        expect(tool.enabled).toBe(false);
      }
    }
  });

  it('keeps RAG scopes and evaluation datasets independently versioned', () => {
    for (const profile of pilotAgentProfiles) {
      expect(profile.versions.rag_scope).toBe('1.0.0');
      expect(profile.versions.evaluation_dataset).toBe('1.0.0');
      expect(profile.rag_scopes.length).toBeGreaterThan(0);
    }
  });
});
