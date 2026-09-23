import { describe, expect, it } from 'vitest';
import { PlatformError, toErrorEnvelope } from '../../packages/errors/src/index.js';

describe('public error envelope', () => {
  it('does not expose internal diagnostics', () => {
    const error = new PlatformError('INTERNAL_ERROR', 'An internal error occurred', 500, {
      stack: 'sensitive-stack'
    });
    const serialized = JSON.stringify(toErrorEnvelope(error, 'request-1'));
    expect(serialized).not.toContain('sensitive-stack');
    expect(serialized).toContain('request-1');
  });
});
