import { describe, expect, it } from 'vitest';
import { PromptRegistry } from '../../packages/runtime/src/index.js';
import {
  approvedPrompts,
  maintenanceAgent,
  runtimeValidationTime
} from '../testing/runtime-fixtures.js';

const hierarchyConfiguration = {
  master: { prompt_id: 'master-policy', prompt_version: '1.0' },
  orchestrator: { prompt_id: 'orchestrator-routing', prompt_version: '1.0' }
};

describe('Prompt registry', () => {
  it('builds an immutable ordered hierarchy from approved versions', () => {
    const hierarchy = new PromptRegistry(approvedPrompts).resolveHierarchy(
      maintenanceAgent,
      hierarchyConfiguration,
      runtimeValidationTime
    );
    expect(hierarchy.layers.map((layer) => layer.layer)).toEqual([
      'master',
      'orchestrator',
      'domain'
    ]);
    expect(Object.isFrozen(hierarchy)).toBe(true);
    expect(Object.isFrozen(hierarchy.layers)).toBe(true);
  });

  it('rejects an unapproved lower-level prompt', () => {
    const prompts = approvedPrompts.map((prompt) =>
      prompt.layer === 'domain' ? { ...prompt, status: 'testing' as const } : prompt
    );
    expect(() =>
      new PromptRegistry(prompts).resolveHierarchy(
        maintenanceAgent,
        hierarchyConfiguration,
        runtimeValidationTime
      )
    ).toThrow('Prompt hierarchy is unavailable');
  });

  it('rejects a domain prompt assigned to another agent', () => {
    const prompts = approvedPrompts.map((prompt) =>
      prompt.layer === 'domain' ? { ...prompt, agent_id: 'warehouse' } : prompt
    );
    expect(() =>
      new PromptRegistry(prompts).resolveHierarchy(
        maintenanceAgent,
        hierarchyConfiguration,
        runtimeValidationTime
      )
    ).toThrow('Prompt hierarchy is unavailable');
  });
});
