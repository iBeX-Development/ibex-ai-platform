import { describe, expect, it } from 'vitest';
import {
  agentDefinitionSchema,
  intentClassificationSchema,
  toolPlanSchema
} from '../../packages/runtime/src/index.js';
import { maintenanceAgent } from '../testing/runtime-fixtures.js';

describe('Shared runtime contracts', () => {
  it('accepts versioned agent definitions and rejects unknown fields', () => {
    expect(agentDefinitionSchema.parse(maintenanceAgent).agent_id).toBe('maintenance');
    expect(() =>
      agentDefinitionSchema.parse({ ...maintenanceAgent, provider: 'unapproved' })
    ).toThrow();
  });

  it('requires structured classified or unknown intent results', () => {
    expect(intentClassificationSchema.parse({ status: 'unknown' })).toEqual({ status: 'unknown' });
    expect(() =>
      intentClassificationSchema.parse({
        status: 'classified',
        intent: '',
        domain: 'maintenance',
        required_capabilities: []
      })
    ).toThrow();
  });

  it('rejects proposed actions without an approval requirement', () => {
    expect(() =>
      toolPlanSchema.parse({
        candidates: [],
        action_class: 'proposed_action',
        risk_class: 'high',
        approval_required: false
      })
    ).toThrow();
  });
});
