import { InactiveToolDispatcher } from './local-location-dispatch.js';
import { assetAgentProfile, assetPrompt } from '../../agents/asset/src/index.js';
import type { AuditRecord } from '../../packages/audit/src/index.js';
import {
  AiGatewayService,
  FixedWindowGatewayRateLimiter,
  type GatewayPlatformRequest
} from '../../packages/gateway/src/index.js';
import { pilotAgentProfileSchema } from '../../packages/pilot-agents/src/index.js';
import {
  AgentRegistry,
  PromptRegistry,
  SharedAgentRuntime,
  type AgentDefinition
} from '../../packages/runtime/src/index.js';
import {
  createTrustedRequestContext,
  type AuthenticatedGatewayIdentity
} from '../../packages/security/src/index.js';
import { enabledTestFeatureControls } from '../../packages/testing/src/index.js';
import {
  ToolRegistry,
  ToolBindingCatalog,
  type ToolExecutionResponse
} from '../../packages/tool-runtime/src/index.js';
import { vi } from 'vitest';
import {
  createOfflineAssetAdapter,
  offlineAssetRegistration,
  type OfflineAssetRead
} from './local-location-adapter.js';
import { approvedPrompts, runtimeDependencies } from './runtime-fixtures.js';
import { gatewayEnvelope, gatewayIdentity, validationTime } from './security-fixtures.js';
import { createToolRuntime } from './tool-runtime-fixtures.js';

const toolId = offlineAssetRegistration.metadata.tool_id;
const toolVersion = offlineAssetRegistration.metadata.version;
export function chainIdentity(tenant: 'a' | 'b', suffix = '1'): AuthenticatedGatewayIdentity {
  return Object.freeze({
    ...gatewayIdentity,
    tenant_id: `tenant-${tenant}`,
    user_id: `user-${tenant}`,
    session_id: `session-${tenant}`,
    request_id: `chain-request-${tenant}-${suffix}`,
    correlation_id: `chain-correlation-${tenant}-${suffix}`,
    permissions: Object.freeze(['asset.get', 'asset:read']),
    entitlements: Object.freeze(['fixture:asset-chain', 'ai:general', 'asset-tools', 'pilot:test'])
  });
}
function contextOf(identity: AuthenticatedGatewayIdentity) {
  return createTrustedRequestContext({
    tenant_id: identity.tenant_id,
    user_id: identity.user_id,
    role: identity.role,
    permissions: identity.permissions,
    entitlements: identity.entitlements,
    session_id: identity.session_id,
    request_id: identity.request_id,
    correlation_id: identity.correlation_id,
    channel: identity.channel,
    locale: identity.locale
  });
}

// Only one fixture intent is authorized. No production profile or conceptual-ID alias is mutated.
const lookup = assetAgentProfile.intents.find((intent) => intent.intent === 'ASSET_LOOKUP');
if (!lookup) throw new Error('Asset lookup fixture policy is absent');
const fixtureProfile = pilotAgentProfileSchema.parse({
  ...assetAgentProfile,
  intents: [
    {
      ...lookup,
      authorization_status: 'approved',
      required_entitlements: ['pilot:test'],
      tool_capability_classes: ['asset.get']
    }
  ],
  tool_allowlist: [
    {
      capability_class: 'asset.get',
      classification: 'read',
      enabled: true,
      live_binding: 'deterministic_test_adapter'
    }
  ]
});
const selectedAgent: AgentDefinition = {
  agent_id: 'asset',
  version: assetAgentProfile.versions.agent,
  domain: 'asset',
  supported_intents: ['ASSET_LOOKUP'],
  capabilities: ['asset.get'],
  prompt_version: assetAgentProfile.versions.prompt,
  allowed_tools: ['asset.get'],
  allowed_rag_scopes: [],
  required_permissions: ['asset.get'],
  required_entitlements: ['pilot:test'],
  model_policy: { default_policy: assetAgentProfile.model_policy, fallback_policies: [] },
  evaluation_profile: 'fixture-only-component-chain',
  status: 'active'
};
export function createAssetComponentChain(
  options: Readonly<{
    record: Readonly<Record<string, unknown>>;
    denyGateway?: boolean;
    productionProfile?: boolean;
    bindingMode?: 'empty' | 'inactive';
    disabledRegistration?: boolean;
    beforeCore?: (request: Parameters<OfflineAssetRead>[0]) => Promise<void>;
  }>
) {
  const audits: AuditRecord[] = [];
  const order: string[] = [];
  const audit = {
    emit: (event: AuditRecord) => {
      audits.push(event);
      return Promise.resolve();
    }
  };
  const transport = vi.fn<OfflineAssetRead>(async (request) => {
    order.push(`core:${request.context.request_id}`);
    await options.beforeCore?.(request);
    return JSON.stringify(options.record);
  });
  const adapter = createOfflineAssetAdapter(transport, () => validationTime);
  const invoke = vi.fn<typeof adapter.invoke>((request) => {
    order.push(`adapter:${request.context.request_id}`);
    return adapter.invoke(request);
  });
  const ownership = vi.fn(({ type, id }: { type: string; id: string }) => {
    order.push(`ownership:${id}`);
    return Promise.resolve(
      type === 'asset'
        ? (new Map([
            ['asset-a', 'tenant-a'],
            ['asset-b', 'tenant-b']
          ]).get(id) ?? null)
        : null
    );
  });
  const registry = new ToolRegistry([
    {
      ...offlineAssetRegistration,
      metadata: { ...offlineAssetRegistration.metadata, enabled: !options.disabledRegistration }
    }
  ]);
  const bindings = new ToolBindingCatalog(
    registry,
    options.bindingMode === 'empty'
      ? []
      : [
          {
            binding_id: 'fixture.asset.component-chain',
            binding_version: '1.0.0',
            agent_id: 'asset',
            agent_version: fixtureProfile.versions.agent,
            domain: 'asset',
            intent: 'ASSET_LOOKUP',
            conceptual_capability: 'asset.get',
            mode: options.bindingMode === 'inactive' ? 'inactive' : 'deterministic_test',
            concrete_tool: {
              tool_id: toolId,
              tool_version: toolVersion,
              input_schema_id: offlineAssetRegistration.metadata.input_schema_id,
              output_schema_id: offlineAssetRegistration.metadata.output_schema_id
            }
          }
        ]
  );
  const tools = createToolRuntime(audits, {
    service: 'chain-tool',
    audit,
    registry,
    adapters: [{ ...adapter, invoke }],
    ownership: { resolveTenantId: ownership }
  });
  const actualToolResponses: ToolExecutionResponse[] = [];
  const toolExecute = vi.fn(async (request: unknown) => {
    const response = await tools.execute(request, {}, validationTime);
    actualToolResponses.push(response);
    return response;
  });
  const prompts = new PromptRegistry([
    ...approvedPrompts.slice(0, 2),
    {
      ...approvedPrompts[2],
      prompt_id: assetPrompt.prompt_id,
      prompt_version: assetPrompt.prompt_version,
      agent_id: 'asset',
      content_hash: assetPrompt.content_hash,
      created_by: 'fixture-only',
      approved_by: 'fixture-only'
    }
  ]);
  const routing = new SharedAgentRuntime(
    runtimeDependencies(audits, {
      service: 'chain-routing',
      audit,
      agents: new AgentRegistry([selectedAgent]),
      prompts,
      classifier: {
        classify: () =>
          Promise.resolve({
            status: 'classified',
            intent: 'ASSET_LOOKUP',
            domain: 'asset',
            required_capabilities: ['asset.get']
          })
      },
      ragPlanning: { plan: () => Promise.resolve({ required: false, scopes: [] }) },
      toolPlanning: {
        plan: () =>
          Promise.resolve({
            candidates: ['asset.get'],
            action_class: 'read',
            risk_class: 'low',
            approval_required: false
          })
      },
      // Required routing policy selection only; no Model Gateway/provider executes.
      modelPolicy: {
        select: () =>
          Promise.resolve({ policy_id: assetAgentProfile.model_policy, fallback: false })
      }
    })
  );
  const route = vi.fn((...args: Parameters<typeof routing.route>) => {
    order.push(`route:${args[0].context.request_id}`);
    return routing.route(...args);
  });
  const dispatcher = new InactiveToolDispatcher({
    environment: 'test',
    featureControls: enabledTestFeatureControls,
    routing: { route },
    registry,
    tools: { execute: toolExecute },
    audit,
    profile: options.productionProfile ? assetAgentProfile : fixtureProfile,
    bindings
  });
  const forward = vi.fn((request: GatewayPlatformRequest) => dispatcher.forward(request));
  const authenticatedFixtures = new Map<string, AuthenticatedGatewayIdentity>();
  let trace = 0;
  const gateway = new AiGatewayService({
    featureControls: enabledTestFeatureControls,
    authenticator: {
      authenticate: ({ headers }) =>
        Promise.resolve(
          typeof headers['fixture-handle'] === 'string'
            ? authenticatedFixtures.get(headers['fixture-handle'])
            : undefined
        )
    },
    authorizationPolicy: {
      authorize: () =>
        Promise.resolve(
          options.denyGateway
            ? { allowed: false as const, reason: 'fixture denial' }
            : { allowed: true as const, decision_id: 'fixture-allow' }
        )
    },
    accessRequirements: {
      resolve: () => ({
        capability: 'fixture:asset-chain',
        action: 'invoke',
        required_permissions: ['asset:read'],
        required_entitlements: ['asset-tools']
      })
    },
    rateLimiter: new FixedWindowGatewayRateLimiter(100),
    platform: { forward },
    audit,
    service: 'chain-gateway',
    environment: 'test',
    maximumPayloadBytes: 4096,
    traceIdFactory: () => `chain-trace-${String(++trace)}`
  });
  const execute = (
    identity: AuthenticatedGatewayIdentity,
    input: unknown,
    payloadOverrides: Record<string, unknown> = {},
    envelopeOverrides: Record<string, unknown> = {}
  ) => {
    const handle = `fixture-only-${identity.request_id}`;
    authenticatedFixtures.set(handle, identity);
    const envelope = {
      ...gatewayEnvelope,
      ...contextOf(identity),
      requested_capability: 'fixture:asset-chain',
      payload: { tool_id: toolId, tool_version: toolVersion, input, ...payloadOverrides },
      ...envelopeOverrides
    };
    return gateway.execute(
      {
        endpoint: 'tools',
        headers: { 'fixture-handle': handle },
        envelope,
        payload_bytes: Buffer.byteLength(JSON.stringify(envelope))
      },
      validationTime
    );
  };
  return {
    execute,
    audits,
    order,
    route,
    forward,
    toolExecute,
    invoke,
    ownership,
    transport,
    actualToolResponses,
    bindings,
    registry
  };
}
