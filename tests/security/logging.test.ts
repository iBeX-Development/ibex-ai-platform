import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../packages/configuration/src/index.js';
import { createLogger } from '../../packages/observability/src/index.js';
import { validTestEnvironment } from '../../packages/testing/src/index.js';

describe('sensitive logging', () => {
  it('redacts common secret fields', async () => {
    let output = '';
    const destination = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        output += chunk.toString('utf8');
        callback();
      }
    });
    const logger = createLogger(loadConfig(validTestEnvironment), destination);
    logger.info(
      {
        password: 'pw-value',
        api_key: 'key-value',
        headers: { authorization: 'Bearer token-value' }
      },
      'test'
    );
    await new Promise((resolve) => destination.end(resolve));
    expect(output).not.toContain('pw-value');
    expect(output).not.toContain('key-value');
    expect(output).not.toContain('token-value');
    expect(output).toContain('[REDACTED]');
  });
});
