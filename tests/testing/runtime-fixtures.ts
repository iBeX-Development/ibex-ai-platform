import type { AuditRecord } from '../../packages/audit/src/index.js';
import {
  AgentRegistry,
  createRuntimeControlPolicy,
  PromptRegistry,
  SharedAgentRuntime,
  type AgentDefinition,
  type SharedAgentRuntimeDependencies
} from '../../packages/runtime/src/index.js';
import { createTrustedRequestContext } from '../../packages/security/src/index.js';
import { enabledTestFeatureControls } from '../../packages/testing/src/index.js';

export const runtimeValidationTime = new Date('2026-09-23T00:30:00.000Z');

export const runtimeContext = createTrustedRequestContext({
  tenant_id: 'tenant-a',
  user_id: 'user-1',
  role: 'operator',
  permissions: ['maintenance:read'],
  entitlements: ['ai:general'],
  session_id: 'session-1',
  request_id: 'request-1',
  correlation_id: 'correlation-1',
  channel: 'web',
  locale: 'mn'
});

export const maintenanceAgent: AgentDefinition = {
  agent_id: 'maintenance-agent',
  version: '1.0',
  domain: 'maintenance',
  supported_intents: ['maintenance_lookup'],
  capabilities: ['maintenance:read'],
  prompt_version: '1.0',
  allowed_tools: ['asset.get'],
  allowed_rag_scopes: ['maintenance-approved'],
  required_permissions: ['maintenance:read'],
  required_entitlements: ['ai:general'],
  model_policy: {
    default_policy: 'balanced',
    fallback_policies: ['balanced-fallback']
  },
  evaluation_profile: 'maintenance-routing-v1',
  status: 'active'
};

export const approvedPrompts = [
  {
    prompt_id: 'master-policy',
    prompt_version: '1.0',
    agent_id: 'platform',
    layer: 'master',
    status: 'approved',
    effective_date: '2026-09-01T00:00:00.000Z',
    content_hash: 'master-hash-v1',
    created_by: 'platform-team',
    approved_by: 'security-owner',
    change_reason: 'approved baseline'
  },
  {
    prompt_id: 'orchestrator-routing',
    prompt_version: '1.0',
    agent_id: 'orchestrator',
    layer: 'orchestrator',
    status: 'approved',
    effective_date: '2026-09-01T00:00:00.000Z',
    content_hash: 'orchestrator-hash-v1',
    created_by: 'platform-team',
    approved_by: 'security-owner',
    change_reason: 'approved routing baseline'
  },
  {
    prompt_id: 'maintenance-domain',
    prompt_version: '1.0',
    agent_id: 'maintenance-agent',
    layer: 'domain',
    status: 'approved',
    effective_date: '2026-09-01T00:00:00.000Z',
    content_hash: 'maintenance-hash-v1',
    created_by: 'maintenance-owner',
    approved_by: 'security-owner',
    change_reason: 'approved registry metadata'
  }
] as const;

export function runtimeDependencies(
  auditEvents: AuditRecord[],
  overrides: Partial<SharedAgentRuntimeDependencies> = {}
): SharedAgentRuntimeDependencies {
  return {
    featureControls: enabledTestFeatureControls,
    classifier: {
      classify: () =>
        Promise.resolve({
          status: 'classified',
          intent: 'maintenance_lookup',
          domain: 'maintenance',
          required_capabilities: ['maintenance:read']
        })
    },
    ragPlanning: {
      plan: () => Promise.resolve({ required: true, scopes: ['maintenance-approved'] })
    },
    toolPlanning: {
      plan: () =>
        Promise.resolve({
          candidates: ['asset.get'],
          action_class: 'read',
          risk_class: 'low',
          approval_required: false
        })
    },
    modelPolicy: {
      select: () => Promise.resolve({ policy_id: 'balanced', fallback: false })
    },
    agents: new AgentRegistry([maintenanceAgent]),
    prompts: new PromptRegistry(approvedPrompts),
    promptHierarchy: {
      master: { prompt_id: 'master-policy', prompt_version: '1.0' },
      orchestrator: { prompt_id: 'orchestrator-routing', prompt_version: '1.0' }
    },
    controls: createRuntimeControlPolicy({
      timeout_ms: 1_000,
      max_context_bytes: 4_096,
      token_budget: 2_000,
      retry_policy: { max_attempts: 1 },
      model_fallback_allowed: true
    }),
    audit: {
      emit: (event) => {
        auditEvents.push(event);
        return Promise.resolve();
      }
    },
    service: 'orchestrator-test',
    environment: 'test',
    traceIdFactory: () => 'runtime-generated-trace-1',
    ...overrides
  };
}

export function runtimeRequest(overrides: Record<string, unknown> = {}) {
  return {
    context: runtimeContext,
    trace_id: 'trace-1',
    input: { message: 'show maintenance information' },
    ...overrides
  };
}

export function createRuntime(
  auditEvents: AuditRecord[],
  overrides: Partial<SharedAgentRuntimeDependencies> = {}
): SharedAgentRuntime {
  return new SharedAgentRuntime(runtimeDependencies(auditEvents, overrides));
}
