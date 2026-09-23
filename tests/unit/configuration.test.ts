import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../packages/configuration/src/index.js';
import { validTestEnvironment } from '../../packages/testing/src/index.js';

describe('configuration', () => {
  it('loads typed configuration', () => {
    expect(loadConfig(validTestEnvironment).environment).toBe('test');
  });
  it('fails safely when required configuration is missing', () => {
    expect(() => loadConfig({})).toThrow('Invalid application configuration');
  });
  it('requires external secrets in production', () => {
    expect(() => loadConfig({ ...validTestEnvironment, IBEX_ENVIRONMENT: 'production' })).toThrow();
  });
});
