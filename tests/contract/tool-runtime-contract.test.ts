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
    expect(toolMetadataSchema.safeParse(readToolMetadata).success).toBe(true);
    expect(toolMetadataSchema.safeParse(proposalToolMetadata).success).toBe(true);
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
