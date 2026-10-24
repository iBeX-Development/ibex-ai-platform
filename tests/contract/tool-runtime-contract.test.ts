import { describe, expect, it } from 'vitest';
import {
  toolAdapterResultSchema,
  toolExecutionRequestSchema,
  toolExecutionResponseSchema,
  toolMetadataSchema
} from '../../packages/tool-runtime/src/index.js';
import {
  proposalToolMetadata,
  readToolMetadata,
  toolContext
} from '../testing/tool-runtime-fixtures.js';

describe('Gate P5 Tool Runtime contracts', () => {
  it('accepts approved read and proposal registry metadata', () => {
    for (const metadata of [readToolMetadata, proposalToolMetadata]) {
      const parsed = toolMetadataSchema.parse(metadata);
      expect(parsed).toMatchObject({
        registration_version: '3.0',
        error_model: 'ibex.tool-error.v1',
        version: '1.0'
      });
      expect(Object.isFrozen(parsed)).toBe(true);
    }
  });

  it('does not infer registration format from an individual Tool version', () => {
    const legacy: Record<string, unknown> = { ...readToolMetadata, version: '2.0' };
    delete legacy.registration_version;
    delete legacy.error_model;
    expect(toolMetadataSchema.safeParse(legacy).success).toBe(false);
    expect(toolMetadataSchema.safeParse({ ...readToolMetadata, version: '3.1' }).success).toBe(
      true
    );
  });

  it('keeps tenant context separate from tool input', () => {
    expect(
      toolExecutionRequestSchema.safeParse({
        context: toolContext,
        trace_id: 'trace-1',
        agent_id: 'asset',
        prompt_version: 'asset-1.0',
        tool_id: 'asset.asset.get.v1',
        tool_version: '1.0',
        input: { asset_id: 'asset-1' },
        tenant_id: 'tenant-b'
      }).success
    ).toBe(false);
  });

  it('requires structured source and timestamp evidence from adapters', () => {
    expect(
      toolAdapterResultSchema.safeParse({ output: {}, source: 'core', observed_at: 'now' }).success
    ).toBe(false);
  });

  it('requires approval evidence for proposal responses', () => {
    expect(
      toolExecutionResponseSchema.safeParse({
        contract_version: '1.0',
        status: 'proposed',
        request_id: 'request-1',
        correlation_id: 'correlation-1',
        trace_id: 'trace-1',
        tool_id: 'maintenance.wo.create_draft.v1',
        tool_version: '1.0',
        proposed_input: {},
        approval_required: false,
        approval_policy: 'workflow_approval'
      }).success
    ).toBe(false);
  });
});
