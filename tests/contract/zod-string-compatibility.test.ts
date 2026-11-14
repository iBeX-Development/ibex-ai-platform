import { describe, expect, it } from 'vitest';
import { gatewayRequestEnvelopeSchema } from '../../packages/contracts/src/index.js';
import { authenticatedGatewayIdentitySchema } from '../../packages/security/src/authentication.js';
import { approvalProposalRequestSchema } from '../../packages/approval-runtime/src/contracts.js';
import { knowledgeMetadataSchema } from '../../packages/rag-runtime/src/contracts.js';
import { loadConfig } from '../../packages/configuration/src/index.js';
import { providerDefinitionSchema } from '../../packages/model-gateway/src/contracts.js';
import { validTestEnvironment } from '../../packages/testing/src/index.js';
import { gatewayEnvelope, gatewayIdentity } from '../testing/security-fixtures.js';
import { approvalProposalRequest } from '../testing/approval-runtime-fixtures.js';
import { makeDocument } from '../testing/rag-runtime-fixtures.js';
import { primaryProvider } from '../testing/model-gateway-fixtures.js';

const boundaries = {
  gateway: (value: string) => {
    const result = gatewayRequestEnvelopeSchema.safeParse({ ...gatewayEnvelope, timestamp: value });
    return result.success ? result.data.timestamp : null;
  },
  authentication: (value: string) => {
    const result = authenticatedGatewayIdentitySchema.safeParse({
      ...gatewayIdentity,
      authenticated_at: value,
      expires_at: value
    });
    return result.success ? result.data.authenticated_at : null;
  },
  approval: (value: string) => {
    const result = approvalProposalRequestSchema.safeParse({
      ...approvalProposalRequest(),
      expires_at: value
    });
    return result.success ? result.data.expires_at : null;
  },
  rag: (value: string) => {
    const result = knowledgeMetadataSchema.safeParse({
      ...makeDocument().metadata,
      effective_date: value,
      created_at: value,
      updated_at: value,
      expiry_date: undefined
    });
    return result.success ? result.data.effective_date : null;
  }
};

for (const [name, parse] of Object.entries(boundaries)) {
  describe(`${name} retains existing UTC timestamp grammar`, () => {
    it.each([
      '2026-01-01T12:00Z',
      '2026-01-01T12:00:00Z',
      '2026-01-01T12:00:00.123456789Z',
      '2000-02-29T00:00Z',
      '2024-02-29T23:59:59.1Z'
    ])('accepts and preserves %s', (value) => {
      expect(parse(value)).toBe(value);
    });
    it.each([
      '1900-02-29T12:00Z',
      '2026-02-29T12:00Z',
      '2026-04-31T12:00Z',
      '2026-13-01T12:00Z',
      '2026-01-01T24:00Z',
      '2026-01-01T12:60Z',
      '2026-01-01T12:00:60Z',
      '2026-01-01T12:00.1Z',
      '2026-01-01T12:00:00.Z',
      '2026-01-01T12:00+00:00',
      '2026-01-01T12:00',
      ' 2026-01-01T12:00Z'
    ])('rejects %s', (value) => {
      expect(parse(value)).toBeNull();
    });
  });
}

describe('configuration URLs preserve exact validated input', () => {
  it.each([
    'https://example.com',
    ' https://example.com ',
    '\thttps://example.com\n',
    'HTTPS://EXAMPLE.COM:443/a',
    'mailto:user@example.com'
  ])('retains %j', (value) => {
    expect(
      loadConfig({ ...validTestEnvironment, IBEX_AI_GATEWAY_BASE_URL: value }).aiGateway.baseUrl
    ).toBe(value);
  });
  it.each(['', '   ', 'not a URL', '/relative', 'https://'])('rejects %j', (value) => {
    expect(() => loadConfig({ ...validTestEnvironment, IBEX_AI_GATEWAY_BASE_URL: value })).toThrow(
      'Invalid application configuration'
    );
  });
  it('does not normalize past the existing live-provider HTTPS restriction', () => {
    const provider = {
      ...primaryProvider,
      mode: 'live',
      credential_reference: 'synthetic-reference'
    };
    expect(
      providerDefinitionSchema.safeParse({ ...provider, endpoint: 'https://example.com' }).success
    ).toBe(true);
    for (const endpoint of [' https://example.com ', 'http://example.com', 'HTTPS://EXAMPLE.COM']) {
      expect(providerDefinitionSchema.safeParse({ ...provider, endpoint }).success).toBe(false);
    }
  });
});
