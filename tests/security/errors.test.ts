import { describe, expect, it } from 'vitest';
import { PlatformError, toErrorEnvelope } from '../../packages/errors/src/index.js';

describe('public error envelope', () => {
  it('does not expose internal diagnostics', () => {
    const error = new PlatformError(
      'INTERNAL_ERROR',
      'An internal error occurred',
      500,
      { stack: 'sensitive-stack' },
      'trace-safe-1',
      'request-trusted-1'
    );
    const serialized = JSON.stringify(toErrorEnvelope(error));
    expect(serialized).not.toContain('sensitive-stack');
    expect(serialized).toContain('request-trusted-1');
    expect(serialized).toContain('trace-safe-1');
  });
});
