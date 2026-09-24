import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { ToolRegistry } from '../../packages/tool-runtime/src/index.js';
import {
  proposalToolMetadata,
  readToolMetadata,
  readToolRegistration
} from '../testing/tool-runtime-fixtures.js';

describe('Phase 5 Tool Registry', () => {
  it('registers immutable versioned metadata and schemas', () => {
    const registry = new ToolRegistry([readToolRegistration]);
    const registration = registry.resolve(readToolMetadata.tool_id, readToolMetadata.version);

    expect(registration?.metadata).toMatchObject({
      tool_id: 'asset.asset.get.v1',
      version: '1.0',
      tenant_scope: 'tenant',
      audit_policy: 'required'
    });
    expect(Object.isFrozen(registration?.metadata)).toBe(true);
    expect(Object.isFrozen(registration?.metadata.required_permissions)).toBe(true);
  });

  it('rejects duplicate tool id and version records', () => {
    expect(() => new ToolRegistry([readToolRegistration, readToolRegistration])).toThrow(
      expect.objectContaining({ code: 'CONFIGURATION_ERROR' })
    );
  });

  it('uses collision-safe keys even when identifiers contain separator characters', () => {
    const first = {
      ...readToolRegistration,
      metadata: { ...readToolMetadata, tool_id: 'asset:part', version: 'v1' }
    };
    const second = {
      ...readToolRegistration,
      metadata: { ...readToolMetadata, tool_id: 'asset', version: 'part:v1' }
    };
    const registry = new ToolRegistry([first, second]);

    expect(registry.resolve('asset:part', 'v1')?.metadata.tool_id).toBe('asset:part');
    expect(registry.resolve('asset', 'part:v1')?.metadata.tool_id).toBe('asset');
  });

  it('rejects resource-scoped registrations without a trusted resource selector', () => {
    expect(
      () =>
        new ToolRegistry([
          {
            ...readToolRegistration,
            resource_reference: undefined
          } as unknown as typeof readToolRegistration
        ])
    ).toThrow(expect.objectContaining({ code: 'CONFIGURATION_ERROR' }));
  });

  it('rejects retries for non-idempotent reads', () => {
    expect(
      () =>
        new ToolRegistry([
          {
            ...readToolRegistration,
            metadata: {
              ...readToolMetadata,
              safe_idempotent: false,
              retry_policy: { max_attempts: 2, backoff_ms: 0 }
            }
          }
        ])
    ).toThrow(expect.objectContaining({ code: 'CONFIGURATION_ERROR' }));
  });

  it('rejects action tools that are executable or retryable', () => {
    expect(
      () =>
        new ToolRegistry([
          {
            metadata: {
              ...proposalToolMetadata,
              proposal_only: false,
              retry_policy: { max_attempts: 2, backoff_ms: 0 }
            },
            input_schema: z.object({ asset_id: z.string() }),
            output_schema: z.never(),
            resource_reference: () => ({ type: 'asset', id: 'asset-1' })
          }
        ])
    ).toThrow(expect.objectContaining({ code: 'CONFIGURATION_ERROR' }));
  });
});
