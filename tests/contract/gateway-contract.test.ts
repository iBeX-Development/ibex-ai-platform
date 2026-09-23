import { describe, expect, it } from 'vitest';
import {
  gatewayResponseEnvelopeSchema,
  gatewayRequestEnvelopeSchema
} from '../../packages/contracts/src/index.js';
import { gatewayEnvelope } from '../testing/security-fixtures.js';

describe('AI Gateway v1 contract', () => {
  it('requires a trusted channel and rejects unknown envelope fields', () => {
    expect(gatewayRequestEnvelopeSchema.parse(gatewayEnvelope).channel).toBe('web');
    expect(() =>
      gatewayRequestEnvelopeSchema.parse({ ...gatewayEnvelope, unapproved: true })
    ).toThrow();
  });

  it('validates the canonical response metadata', () => {
    expect(
      gatewayResponseEnvelopeSchema.parse({
        contract_version: '1.0',
        request_id: 'request-1',
        status: 'success',
        response: { accepted: true },
        sources: [],
        tools_used: [],
        action_type: 'informational',
        approval_required: false,
        warnings: [],
        trace_id: 'correlation-1'
      }).trace_id
    ).toBe('correlation-1');
  });

  it('rejects a proposed action without required approval', () => {
    expect(() =>
      gatewayResponseEnvelopeSchema.parse({
        contract_version: '1.0',
        request_id: 'request-1',
        status: 'success',
        sources: [],
        tools_used: [],
        action_type: 'proposed_action',
        approval_required: false,
        warnings: [],
        trace_id: 'correlation-1'
      })
    ).toThrow();
  });
});
