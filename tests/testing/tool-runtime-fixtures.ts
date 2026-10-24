import { z } from 'zod';
import type { AuditRecord } from '../../packages/audit/src/index.js';
import {
  ToolRateLimitCatalog,
  InMemoryToolRateLimiter,
  ToolRegistry,
  ToolRuntimeService,
  type ToolAdapter,
  type ToolMetadata,
  type ToolRegistration,
  type ToolRuntimeDependencies
} from '../../packages/tool-runtime/src/index.js';
import { createTrustedRequestContext } from '../../packages/security/src/index.js';
import { enabledTestFeatureControls } from '../../packages/testing/src/index.js';

export const toolValidationTime = new Date('2026-09-23T10:00:00.000Z');

export const toolContext = createTrustedRequestContext({
  tenant_id: 'tenant-a',
  user_id: 'user-1',
  role: 'operator',
  permissions: ['asset:read', 'maintenance:proposal'],
  entitlements: ['asset-tools', 'maintenance-tools'],
  session_id: 'session-tool-1',
  request_id: 'request-tool-1',
  correlation_id: 'correlation-tool-1',
  channel: 'web',
  locale: 'mn'
});

export const readToolMetadata: ToolMetadata = {
  registration_version: '3.0',
  rate_limit: { policy_id: 'synthetic-tool-rate', version: '1' },
  error_model: 'ibex.tool-error.v1',
  tool_id: 'asset.asset.get.v1',
  tool_name: 'Get asset',
  version: '1.0',
  domain: 'asset',
  description: 'Deterministic test registration for an approved read boundary',
  read_write_class: 'read',
  risk_level: 'low',
  input_schema_id: 'asset.get.input.v1',
  output_schema_id: 'asset.get.output.v1',
  tenant_scope: 'tenant',
  required_permissions: ['asset:read'],
  required_entitlements: ['asset-tools'],
  approval_policy: 'none',
  timeout_policy: { timeout_ms: 1_000 },
  retry_policy: { max_attempts: 2, backoff_ms: 0 },
  audit_policy: 'required',
  data_sensitivity: 'tenant_confidential',
  ownership_validation: 'resource',
  execution_mode: 'deterministic_test',
  safe_idempotent: true,
  proposal_only: false,
  enabled: true,
  environments: ['test']
};

export const readToolRegistration: ToolRegistration = {
  metadata: readToolMetadata,
  input_schema: z.object({ asset_id: z.string().trim().min(1) }).strict(),
  output_schema: z.object({ asset_id: z.string(), name: z.string(), status: z.string() }).strict(),
  resource_reference: (input) => ({
    type: 'asset',
    id: (input as { asset_id: string }).asset_id
  })
};

export const proposalToolMetadata: ToolMetadata = {
  registration_version: '3.0',
  rate_limit: { policy_id: 'synthetic-tool-rate', version: '1' },
  error_model: 'ibex.tool-error.v1',
  tool_id: 'maintenance.wo.create_draft.v1',
  tool_name: 'Draft work order request',
  version: '1.0',
  domain: 'maintenance',
  description: 'Creates an approval-required proposal without executing a write',
  read_write_class: 'proposal',
  risk_level: 'high',
  input_schema_id: 'maintenance.wo.draft.input.v1',
  output_schema_id: 'maintenance.wo.draft.output.v1',
  tenant_scope: 'tenant',
  required_permissions: ['maintenance:proposal'],
  required_entitlements: ['maintenance-tools'],
  approval_policy: 'workflow_approval',
  timeout_policy: { timeout_ms: 1_000 },
  retry_policy: { max_attempts: 1, backoff_ms: 0 },
  audit_policy: 'required',
  data_sensitivity: 'tenant_confidential',
  ownership_validation: 'resource',
  execution_mode: 'deterministic_test',
  safe_idempotent: false,
  proposal_only: true,
  enabled: true,
  environments: ['test']
};

export const proposalToolRegistration: ToolRegistration = {
  metadata: proposalToolMetadata,
  input_schema: z
    .object({ asset_id: z.string().trim().min(1), summary: z.string().trim().min(1).max(500) })
    .strict(),
  output_schema: z.never(),
  resource_reference: (input) => ({
    type: 'asset',
    id: (input as { asset_id: string }).asset_id
  })
};

export function successfulToolAdapter(): ToolAdapter {
  return {
    tool_id: readToolMetadata.tool_id,
    tool_version: readToolMetadata.version,
    execution_mode: 'deterministic_test',
    invoke: ({ input }) => {
      const { asset_id: assetId } = input as { asset_id: string };
      return Promise.resolve({
        output: { asset_id: assetId, name: 'Pump A', status: 'active' },
        source: { system: 'deterministic-test', reference: `asset:${assetId}` },
        observed_at: toolValidationTime.toISOString()
      });
    }
  };
}

export function toolRequest(overrides: Record<string, unknown> = {}) {
  return {
    context: toolContext,
    trace_id: 'tool-trace-1',
    agent_id: 'asset',
    prompt_version: 'asset-1.0',
    tool_id: readToolMetadata.tool_id,
    tool_version: readToolMetadata.version,
    input: { asset_id: 'asset-1' },
    ...overrides
  };
}

export function createToolRuntime(
  auditEvents: AuditRecord[],
  overrides: Partial<ToolRuntimeDependencies> = {}
): ToolRuntimeService {
  return new ToolRuntimeService({
    featureControls: enabledTestFeatureControls,
    registry: new ToolRegistry([readToolRegistration, proposalToolRegistration]),
    rateLimitPolicies: new ToolRateLimitCatalog([
      {
        reference: { policy_id: 'synthetic-tool-rate', version: '1' },
        limit: 1000,
        window_ms: 60000
      }
    ]),
    rateLimiter: new InMemoryToolRateLimiter(() => 100),
    adapters: [successfulToolAdapter()],
    authorization: {
      authorize: () => Promise.resolve({ allowed: true, decision_id: 'decision-tool-1' })
    },
    ownership: {
      resolveTenantId: () => Promise.resolve('tenant-a')
    },
    audit: {
      emit: (event) => {
        auditEvents.push(event);
        return Promise.resolve();
      }
    },
    service: 'tool-runtime-test',
    environment: 'test',
    traceIdFactory: () => 'generated-tool-trace-1',
    clock: () => 100,
    ...overrides
  });
}
