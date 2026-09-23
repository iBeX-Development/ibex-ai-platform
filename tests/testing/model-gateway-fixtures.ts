import type { AuditRecord } from '../../packages/audit/src/index.js';
import {
  ModelGatewayService,
  ModelRegistry,
  type ModelDefinition,
  type ModelGatewayDependencies,
  type ModelProviderAdapter,
  type ModelUsageMetric,
  type ProviderDefinition
} from '../../packages/model-gateway/src/index.js';
import { createTrustedRequestContext } from '../../packages/security/src/index.js';

export const modelGatewayValidationTime = new Date('2026-09-23T06:00:00.000Z');

export const modelContext = createTrustedRequestContext({
  tenant_id: 'tenant-a',
  user_id: 'user-1',
  role: 'operator',
  permissions: ['ai:model:invoke'],
  entitlements: ['ai:model-general'],
  session_id: 'session-1',
  request_id: 'request-model-1',
  correlation_id: 'correlation-model-1',
  channel: 'web',
  locale: 'mn'
});

export const primaryProvider: ProviderDefinition = {
  provider_id: 'provider-primary',
  adapter_id: 'adapter-primary',
  mode: 'test',
  capabilities: ['MG-GENERAL'],
  maximum_confidentiality: 'RESTRICTED',
  required_entitlements: ['ai:model-general'],
  approved_environments: ['test'],
  fallback_priority: 0,
  health: 'healthy',
  status: 'enabled'
};

export const fallbackProvider: ProviderDefinition = {
  ...primaryProvider,
  provider_id: 'provider-fallback',
  adapter_id: 'adapter-fallback',
  fallback_priority: 1
};

export const primaryModel: ModelDefinition = {
  provider_id: 'provider-primary',
  model_id: 'general-primary',
  model_version: '2026-09',
  capabilities: ['MG-GENERAL'],
  context_limit: 8_192,
  structured_output: true,
  tool_use: false,
  latency_class: 'standard',
  cost_class: 'standard',
  quality_rank: 8,
  maximum_confidentiality: 'RESTRICTED',
  deployment_type: 'private',
  required_entitlements: ['ai:model-general'],
  approved_environments: ['test'],
  input_cost_per_1k: 0.01,
  output_cost_per_1k: 0.02,
  status: 'approved'
};

export const fallbackModel: ModelDefinition = {
  ...primaryModel,
  provider_id: 'provider-fallback',
  model_id: 'general-fallback',
  model_version: '2026-08',
  cost_class: 'low',
  quality_rank: 7
};

export function successfulAdapter(adapterId: string): ModelProviderAdapter {
  return {
    adapter_id: adapterId,
    invoke: () =>
      Promise.resolve({
        result: { message: 'safe model result' },
        input_tokens: 10,
        output_tokens: 5,
        finish_reason: 'stop',
        policy_flags: []
      })
  };
}

export function modelGatewayRequest(overrides: Record<string, unknown> = {}) {
  return {
    context: modelContext,
    trace_id: 'model-trace-1',
    agent_id: 'general',
    capability: 'MG-GENERAL',
    confidentiality_class: 'TENANT_CONFIDENTIAL',
    prompt_version: 'general-1.0',
    policy_version: 'model-policy-1.0',
    input: { message: 'summarize approved information' },
    requires_structured_output: false,
    requires_tool_use: false,
    latency_priority: 'standard',
    cost_policy: 'balanced',
    ...overrides
  };
}

export function createModelGateway(
  auditEvents: AuditRecord[],
  metrics: ModelUsageMetric[],
  overrides: Partial<ModelGatewayDependencies> = {}
): ModelGatewayService {
  const dependencies: ModelGatewayDependencies = {
    registry: new ModelRegistry([primaryProvider, fallbackProvider], [primaryModel, fallbackModel]),
    adapters: [
      successfulAdapter(primaryProvider.adapter_id),
      successfulAdapter(fallbackProvider.adapter_id)
    ],
    audit: {
      emit: (event) => {
        auditEvents.push(event);
        return Promise.resolve();
      }
    },
    metrics: {
      emit: (metric) => {
        metrics.push(metric);
        return Promise.resolve();
      }
    },
    policy: {
      version: 'model-policy-1.0',
      required_permission: 'ai:model:invoke',
      agent_capabilities: { general: ['MG-GENERAL'] },
      timeout_ms: 1_000,
      max_retries: 0,
      fallback_enabled: true,
      maximum_input_bytes: 16_384
    },
    service: 'model-gateway-test',
    environment: 'test',
    traceIdFactory: () => 'generated-model-trace-1',
    clock: () => 100,
    ...overrides
  };
  return new ModelGatewayService(dependencies);
}
