import { describe, expect, it } from 'vitest';
import { AgentRegistry } from '../../packages/runtime/src/index.js';
import { maintenanceAgent, runtimeContext } from '../testing/runtime-fixtures.js';

const classification = {
  status: 'classified' as const,
  intent: 'maintenance_lookup',
  domain: 'maintenance',
  required_capabilities: ['maintenance:read']
};

describe('Agent registry', () => {
  it('selects one active matching agent deterministically', () => {
    const registry = new AgentRegistry([maintenanceAgent]);
    expect(registry.select(classification)?.agent_id).toBe('maintenance');
  });

  it('does not route a disabled requested agent', () => {
    const registry = new AgentRegistry([{ ...maintenanceAgent, status: 'disabled' }]);
    expect(() => registry.select(classification, 'maintenance')).toThrow('Access denied');
  });

  it('fails closed for ambiguous active routes', () => {
    const registry = new AgentRegistry([
      maintenanceAgent,
      { ...maintenanceAgent, agent_id: 'maintenance-secondary' }
    ]);
    expect(() => registry.select(classification)).toThrow('Agent routing is ambiguous');
  });

  it('denies missing permissions and unregistered capabilities', () => {
    const registry = new AgentRegistry([maintenanceAgent]);
    expect(() => {
      registry.authorize({ ...runtimeContext, permissions: [] }, maintenanceAgent, [
        'maintenance:read'
      ]);
    }).toThrow('Access denied');
    expect(() => {
      registry.authorize(runtimeContext, maintenanceAgent, ['maintenance:write']);
    }).toThrow('Access denied');
  });
});
