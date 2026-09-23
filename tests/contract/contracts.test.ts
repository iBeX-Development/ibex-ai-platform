import { describe, expect, it } from 'vitest';
import {
  apiRequestEnvelopeSchema,
  gatewayRequestEnvelopeSchema
} from '../../packages/contracts/src/index.js';
import { gatewayEnvelope } from '../testing/security-fixtures.js';

describe('versioned contracts', () => {
  it('accepts the canonical API envelope', () => {
    expect(
      apiRequestEnvelopeSchema.parse({ contract_version: '1.0', request_id: 'r-1', payload: {} })
        .request_id
    ).toBe('r-1');
  });
  it('rejects unknown fields', () => {
    expect(() =>
      apiRequestEnvelopeSchema.parse({
        contract_version: '1.0',
        request_id: 'r-1',
        payload: {},
        tenant_id: 'untrusted'
      })
    ).toThrow();
  });
  it('accepts the canonical authenticated Gateway envelope', () => {
    expect(gatewayRequestEnvelopeSchema.parse(gatewayEnvelope).tenant_id).toBe('tenant-a');
  });
});
