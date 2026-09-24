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

  it('recursively minimizes AI content and confidential reasoning', async () => {
    let output = '';
    const destination = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        output += chunk.toString('utf8');
        callback();
      }
    });
    const logger = createLogger(loadConfig(validTestEnvironment), destination);
    logger.info({
      operation: {
        prompt: 'raw prompt value',
        retrieved_content: 'confidential document text',
        tool_payload: { asset: 'private tool value' },
        chain_of_thought: 'private reasoning',
        prompt_version: 'approved-v1',
        content_hash: 'sha256:safe-reference'
      }
    });
    await new Promise((resolve) => destination.end(resolve));
    expect(output).not.toMatch(
      /raw prompt value|confidential document text|private tool value|private reasoning/
    );
    expect(output).toContain('approved-v1');
    expect(output).toContain('sha256:safe-reference');
  });
});
