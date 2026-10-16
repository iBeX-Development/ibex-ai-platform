import { z } from 'zod';
import { assetAgentProfile, assetPrompt } from '../../agents/asset/src/index.js';
import type { AuditRecord } from '../../packages/audit/src/index.js';
import { PlatformError } from '../../packages/errors/src/index.js';
import {
  AiGatewayService,
  FixedWindowGatewayRateLimiter,
  type GatewayPlatformRequest
} from '../../packages/gateway/src/index.js';
import {
  PilotAgentRuntime,
  pilotAgentProfileSchema,
  type PilotAgentGroundingPort,
  type PilotAgentResponse,
  type PilotGroundingEvidence
} from '../../packages/pilot-agents/src/index.js';
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
  type ToolExecutionRequest,
  type ToolExecutionResponse
} from '../../packages/tool-runtime/src/index.js';
import { vi } from 'vitest';
import {
  createOfflineAssetAdapter,
  offlineAssetRegistration,
  offlineAssetSchema,
  type OfflineAssetRead
} from './core-asset-offline-prototype.js';
import { SyntheticAssetCore, syntheticCoreRead } from './core-asset-simulator.js';
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
      tool_capability_classes: [toolId]
    }
  ],
  tool_allowlist: [
    {
      capability_class: toolId,
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
  allowed_tools: [toolId],
  allowed_rag_scopes: [],
  required_permissions: ['asset.get'],
  required_entitlements: ['pilot:test'],
  model_policy: { default_policy: assetAgentProfile.model_policy, fallback_policies: [] },
  evaluation_profile: 'fixture-only-component-chain',
  status: 'active'
};
const payloadSchema = z
  .object({
    tool_id: z.literal(toolId),
    tool_version: z.literal(toolVersion),
    input: offlineAssetSchema
  })
  .strict();

export function createAssetComponentChain(
  options: Readonly<{
    denyGateway?: boolean;
    productionProfile?: boolean;
    beforeCore?: (request: Parameters<OfflineAssetRead>[0]) => Promise<void>;
  }> = {}
) {
  const audits: AuditRecord[] = [];
  const order: string[] = [];
  const identities = [chainIdentity('a'), chainIdentity('b')];
  const core = new SyntheticAssetCore({
    users: identities.map((c) => ({
      tenant_id: c.tenant_id,
      user_id: c.user_id,
      enabled: true,
      permissions: ['fixture:core:asset:read'],
      entitlements: ['fixture:core:asset-tools'],
      resources: [c.tenant_id === 'tenant-a' ? 'asset-a' : 'asset-b'],
      fields: ['asset_id']
    })),
    sessions: identities.map((c) => ({
      tenant_id: c.tenant_id,
      user_id: c.user_id,
      session_id: c.session_id,
      active: true
    })),
    assets: identities.map((c) => ({
      tenant_id: c.tenant_id,
      asset_id: c.tenant_id === 'tenant-a' ? 'asset-a' : 'asset-b',
      private_note: `private-${c.tenant_id}`
    }))
  });
  const audit = {
    emit: (event: AuditRecord) => {
      audits.push(event);
      return Promise.resolve();
    }
  };
  const transport = vi.fn<OfflineAssetRead>(async (request) => {
    order.push(`core:${request.context.request_id}`);
    await options.beforeCore?.(request);
    return syntheticCoreRead(core)(request);
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
  const tools = createToolRuntime(audits, {
    service: 'chain-tool',
    audit,
    registry: new ToolRegistry([
      {
        ...offlineAssetRegistration,
        metadata: { ...offlineAssetRegistration.metadata, enabled: true }
      }
    ]),
    adapters: [{ ...adapter, invoke }],
    ownership: { resolveTenantId: ownership }
  });
  const toolExecute = vi.fn((request: ToolExecutionRequest) =>
    tools.execute(request, {}, validationTime)
  );
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
            candidates: [toolId],
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
  const route = vi.fn(routing.route.bind(routing));
  const actualToolResponses: ToolExecutionResponse[] = [];
  const evidences: PilotGroundingEvidence[] = [];
  const pilotResponses: PilotAgentResponse[] = [];
  const ground = vi.fn(
    async (
      request: Parameters<PilotAgentGroundingPort['resolve']>[0],
      captured: Readonly<{ asset_id: string }>,
      binding: GatewayPlatformRequest
    ) => {
      if (
        request.context.request_id !== binding.context.request_id ||
        request.context.correlation_id !== binding.context.correlation_id ||
        request.context.tenant_id !== binding.context.tenant_id ||
        request.trace_id !== binding.trace_id
      )
        throw new Error('Fixture request binding mismatch');
      order.push(`ground:${request.context.request_id}`);
      const response = await toolExecute({
        context: request.context,
        trace_id: request.trace_id,
        agent_id: request.agent_id,
        prompt_version: assetAgentProfile.versions.prompt,
        tool_id: toolId,
        tool_version: toolVersion,
        input: captured
      });
      actualToolResponses.push(response);
      if (response.status !== 'success') throw new Error('Fixture requires read evidence');
      const output = offlineAssetSchema.parse(response.output);
      const evidence: PilotGroundingEvidence = Object.freeze({
        answer: `Synthetic lookup returned Asset ID ${output.asset_id}.`,
        tool_responses: Object.freeze([response]),
        rag: Object.freeze([])
      });
      evidences.push(evidence);
      return evidence;
    }
  );
  const pilotExecute = vi.fn(
    async (
      binding: GatewayPlatformRequest,
      captured: Readonly<{ asset_id: string }>,
      decision: Awaited<ReturnType<typeof routing.route>>
    ) => {
      if (
        decision.status !== 'routed' ||
        decision.decision.selected_agent !== 'asset' ||
        decision.decision.tool_candidates.length !== 1 ||
        decision.decision.tool_candidates[0] !== toolId
      )
        throw new Error('Fixture route is unavailable');
      const hierarchy = decision.decision.prompt_hierarchy.layers;
      const pilot = new PilotAgentRuntime(
        options.productionProfile ? assetAgentProfile : fixtureProfile,
        { resolve: (request) => ground(request, captured, binding) },
        audit,
        {
          featureControls: enabledTestFeatureControls,
          service: 'chain-pilot',
          environment: 'test',
          allowDeterministicTestAdapters: true,
          boundaryIdentityFactory: () => ({
            trace_id: binding.trace_id,
            request_id: binding.context.request_id,
            correlation_id: binding.context.correlation_id
          }),
          promptHierarchy: {
            master_policy: hierarchy[0],
            orchestrator_prompt: hierarchy[1],
            domain_prompt: hierarchy[2]
          }
        }
      );
      order.push(`pilot:${binding.context.request_id}`);
      const result = await pilot.execute(
        {
          context: binding.context,
          trace_id: binding.trace_id,
          agent_id: 'asset',
          agent_version: decision.decision.agent_version,
          domain: 'asset',
          intent: decision.decision.intent,
          requested_rag_scopes: [],
          requested_tool_capabilities: decision.decision.tool_candidates
        },
        validationTime
      );
      pilotResponses.push(result);
      return result;
    }
  );
  const forward = vi.fn(async (binding: GatewayPlatformRequest) => {
    // Capture validated arguments in this invocation, not a shared current-request slot.
    const parsed = payloadSchema.safeParse(binding.payload);
    if (binding.endpoint !== 'tools' || !parsed.success)
      throw new PlatformError('INVALID_INPUT', 'Tool input is invalid', 400);
    const captured = parsed.data.input;
    order.push(`route:${binding.context.request_id}`);
    const decision = await route(
      {
        context: binding.context,
        trace_id: binding.trace_id,
        input: parsed.data,
        requested_agent: 'asset'
      },
      validationTime
    );
    const result = await pilotExecute(binding, captured, decision);
    return {
      status: result.response_type === 'abstain' ? ('partial' as const) : ('success' as const),
      response: result,
      agent: result.agent_id,
      action_type: 'informational' as const,
      approval_required: result.approval_required,
      tools_used: result.citations
        .filter((c) => c.source_type === 'tool')
        .map((c) => ({ tool_id: c.source_id, version: c.source_version }))
    };
  });
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
    core,
    audits,
    order,
    route,
    forward,
    pilotExecute,
    ground,
    toolExecute,
    invoke,
    ownership,
    transport,
    actualToolResponses,
    evidences,
    pilotResponses
  };
}
