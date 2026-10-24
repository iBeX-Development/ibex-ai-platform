import { describe, expect, it, vi } from 'vitest';
import { assetAgentProfile, assetPrompt } from '../../agents/asset/src/index.js';
import {
  AiGatewayService,
  FixedWindowGatewayRateLimiter
} from '../../packages/gateway/src/index.js';
import { gatewayEnvelope, gatewayIdentity, validationTime } from '../testing/security-fixtures.js';
import type { AuditRecord } from '../../packages/audit/src/index.js';
import {
  PilotAgentRuntime,
  pilotAgentProfileSchema,
  pilotAgentResponseSchema
} from '../../packages/pilot-agents/src/index.js';
import {
  AgentRegistry,
  InactiveToolDispatcher,
  PromptRegistry,
  SharedAgentRuntime,
  type RoutingDecision
} from '../../packages/runtime/src/index.js';
import { createTrustedRequestContext } from '../../packages/security/src/index.js';
import { enabledTestFeatureControls } from '../../packages/testing/src/index.js';
import {
  ToolBindingCatalog,
  type ToolBindingDescriptor,
  ToolRegistry,
  type ToolExecutionResponse
} from '../../packages/tool-runtime/src/index.js';
import {
  createOfflineAssetAdapter,
  offlineAssetRegistration
} from '../testing/core-asset-offline-prototype.js';
import {
  approvedPrompts,
  maintenanceAgent,
  runtimeDependencies
} from '../testing/runtime-fixtures.js';
import { createToolRuntime, toolContext } from '../testing/tool-runtime-fixtures.js';

const descriptor: ToolBindingDescriptor = {
  binding_id: 'fixture.asset.lookup',
  binding_version: '1.0.0',
  mode: 'deterministic_test',
  agent_id: 'asset',
  agent_version: '1.0.0',
  domain: 'asset',
  intent: 'ASSET_LOOKUP',
  conceptual_capability: 'asset.get',
  concrete_tool: {
    tool_id: offlineAssetRegistration.metadata.tool_id,
    tool_version: offlineAssetRegistration.metadata.version,
    input_schema_id: offlineAssetRegistration.metadata.input_schema_id,
    output_schema_id: offlineAssetRegistration.metadata.output_schema_id
  }
};
const scope = {
  agent_id: descriptor.agent_id,
  agent_version: descriptor.agent_version,
  domain: descriptor.domain,
  intent: descriptor.intent,
  conceptual_capability: descriptor.conceptual_capability
};
const lookup = assetAgentProfile.intents.find((p) => p.intent === 'ASSET_LOOKUP');
if (!lookup) throw new Error('Missing fixture intent');
const profile = pilotAgentProfileSchema.parse({
  ...assetAgentProfile,
  intents: [
    {
      ...lookup,
      authorization_status: 'approved',
      tool_capability_classes: ['asset.get'],
      required_entitlements: ['pilot:test']
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
function fixture(
  options: {
    empty?: boolean;
    inactive?: boolean;
    disabled?: boolean;
    environment?: string;
    blocked?: boolean;
    toolsOff?: boolean;
    deny?: boolean;
    routeChange?: Partial<RoutingDecision>;
    responseChange?: (r: ToolExecutionResponse) => ToolExecutionResponse;
  } = {}
) {
  const audits: AuditRecord[] = [];
  const audit = {
    emit: (e: AuditRecord) => {
      audits.push(e);
      return Promise.resolve();
    }
  };
  const registry = new ToolRegistry([
    {
      ...offlineAssetRegistration,
      metadata: { ...offlineAssetRegistration.metadata, enabled: !options.disabled }
    }
  ]);
  const bindings = new ToolBindingCatalog(
    registry,
    options.empty
      ? []
      : [{ ...descriptor, mode: options.inactive ? 'inactive' : 'deterministic_test' }]
  );
  const read = vi.fn(({ input }: { input: Readonly<{ asset_id: string }> }) =>
    Promise.resolve(JSON.stringify(input))
  );
  const adapter = createOfflineAssetAdapter(read, () => new Date());
  const runtime = createToolRuntime(audits, {
    registry,
    adapters: [adapter],
    audit,
    authorization: {
      authorize: () =>
        Promise.resolve(
          options.deny
            ? { allowed: false as const, reason: 'fixture deny' }
            : { allowed: true as const, decision_id: 'fixture-only' }
        )
    }
  });
  const execute = vi.fn(async (...args: Parameters<typeof runtime.execute>) => {
    expect(Object.isFrozen((args[0] as { input: unknown }).input)).toBe(true);
    const response = await runtime.execute(...args);
    return options.responseChange?.(response) ?? response;
  });
  const routing = new SharedAgentRuntime(
    runtimeDependencies(audits, {
      agents: new AgentRegistry([
        {
          ...maintenanceAgent,
          agent_id: 'asset',
          version: '1.0.0',
          domain: 'asset',
          supported_intents: ['ASSET_LOOKUP'],
          capabilities: ['asset.get'],
          prompt_version: assetPrompt.prompt_version,
          allowed_tools: ['asset.get'],
          allowed_rag_scopes: [],
          required_permissions: ['asset.get'],
          required_entitlements: ['pilot:test']
        }
      ]),
      prompts: new PromptRegistry([
        ...approvedPrompts.slice(0, 2),
        {
          ...approvedPrompts[2],
          agent_id: 'asset',
          prompt_id: assetPrompt.prompt_id,
          prompt_version: assetPrompt.prompt_version,
          content_hash: assetPrompt.content_hash
        }
      ]),
      classifier: {
        classify: () =>
          Promise.resolve({
            status: 'classified',
            domain: 'asset',
            intent: 'ASSET_LOOKUP',
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
      }
    })
  );
  const route = vi.fn(async (...args: Parameters<typeof routing.route>) => {
    const result = await routing.route(...args);
    return result.status === 'routed'
      ? { ...result, decision: { ...result.decision, ...options.routeChange } }
      : result;
  });
  const context = createTrustedRequestContext({
    ...toolContext,
    permissions: ['asset.get', 'asset:read'],
    entitlements: ['pilot:test', 'asset-tools', 'ai:general']
  });
  const request = {
    endpoint: 'tools' as const,
    context,
    trace_id: 'dispatch-trace',
    payload: {
      tool_id: descriptor.concrete_tool.tool_id,
      tool_version: descriptor.concrete_tool.tool_version,
      input: { asset_id: 'asset-a' }
    }
  };
  const dispatcher = new InactiveToolDispatcher({
    environment: options.environment ?? 'test',
    featureControls: { ...enabledTestFeatureControls, tools: !options.toolsOff },
    routing: { route },
    registry,
    tools: { execute },
    audit,
    profile: options.blocked ? assetAgentProfile : profile,
    ...(options.empty ? {} : { bindings })
  });
  return { dispatcher, request, read, execute, route, audits, bindings, registry };
}

describe('exact server-owned binding catalog', () => {
  it('snapshots immutable descriptors and scopes with no default executable mapping', () => {
    const f = fixture();
    const raw = { ...descriptor, concrete_tool: { ...descriptor.concrete_tool } };
    const catalog = new ToolBindingCatalog(f.registry, [raw]);
    raw.concrete_tool.tool_id = 'other';
    expect(catalog.resolve(scope)).toEqual(descriptor);
    expect(Object.isFrozen(catalog.resolve(scope)?.concrete_tool)).toBe(true);
    expect(new ToolBindingCatalog(f.registry).resolve(scope)).toBeUndefined();
    for (const change of [
      { agent_id: 'other' },
      { agent_version: '2.0.0' },
      { domain: 'other' },
      { intent: 'other' },
      { conceptual_capability: 'asset.search' }
    ])
      expect(catalog.resolve({ ...scope, ...change })).toBeUndefined();
  });
  it.each([
    { ...descriptor, conceptual_capability: 'asset.*' },
    { ...descriptor, concrete_tool: { ...descriptor.concrete_tool, tool_version: 'latest' } },
    { ...descriptor, concrete_tool: { ...descriptor.concrete_tool, tool_version: '9.0.0' } },
    { ...descriptor, concrete_tool: { ...descriptor.concrete_tool, input_schema_id: 'stale' } },
    { ...descriptor, concrete_tool: { ...descriptor.concrete_tool, output_schema_id: 'stale' } }
  ])('rejects broad, stale or unversioned configuration %#', (binding) => {
    expect(() => new ToolBindingCatalog(fixture().registry, [binding])).toThrow();
  });
  it('rejects ambiguous revisions and proposal/live registrations', () => {
    const f = fixture();
    expect(
      () =>
        new ToolBindingCatalog(f.registry, [
          descriptor,
          { ...descriptor, binding_version: '2.0.0' }
        ])
    ).toThrow();
    for (const metadata of [
      { ...offlineAssetRegistration.metadata, execution_mode: 'live_core' as const },
      {
        ...offlineAssetRegistration.metadata,
        read_write_class: 'proposal' as const,
        proposal_only: true,
        approval_policy: 'workflow_approval' as const,
        safe_idempotent: false
      }
    ])
      expect(
        () =>
          new ToolBindingCatalog(new ToolRegistry([{ ...offlineAssetRegistration, metadata }]), [
            descriptor
          ])
      ).toThrow();
  });
});

describe('inactive structured-tools dispatcher', () => {
  it('accepts the existing Gateway tools wire shape through real server authentication and authorization', async () => {
    const f = fixture();
    const gateway = new AiGatewayService({
      featureControls: enabledTestFeatureControls,
      authenticator: {
        authenticate: () => Promise.resolve({ ...gatewayIdentity, ...f.request.context })
      },
      authorizationPolicy: {
        authorize: () => Promise.resolve({ allowed: true, decision_id: 'fixture-gateway' })
      },
      accessRequirements: {
        resolve: () => ({
          capability: 'asset-tools',
          action: 'invoke',
          required_permissions: ['asset:read'],
          required_entitlements: ['asset-tools']
        })
      },
      rateLimiter: new FixedWindowGatewayRateLimiter(100),
      platform: f.dispatcher,
      audit: { emit: () => Promise.resolve() },
      service: 'fixture-dispatch-gateway',
      environment: 'test',
      maximumPayloadBytes: 4096
    });
    const envelope = {
      ...gatewayEnvelope,
      ...f.request.context,
      requested_capability: 'asset-tools',
      payload: f.request.payload
    };
    const response = await gateway.execute(
      {
        endpoint: 'tools',
        headers: {},
        envelope,
        payload_bytes: Buffer.byteLength(JSON.stringify(envelope))
      },
      validationTime
    );
    expect(response.status).toBe('success');
    expect(f.read).toHaveBeenCalledOnce();
  });
  it.each([
    { user_id: 'other' },
    { tenant_id: 'other' },
    { role: 'other' },
    { session_id: 'other' },
    { request_id: 'other' },
    { correlation_id: 'other' },
    { permissions: ['asset.get', 'asset:read', 'extra'] },
    { entitlements: ['pilot:test', 'asset-tools', 'extra'] },
    { channel: 'mobile' },
    { locale: 'other' }
  ])('rejects grounding when any captured trusted context field changes %j', async (change) => {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Invoked with the explicit instance receiver through call below.
    const original = PilotAgentRuntime.prototype.execute;
    const spy = vi.spyOn(PilotAgentRuntime.prototype, 'execute').mockImplementation(function (
      this: PilotAgentRuntime,
      raw,
      now
    ) {
      const request = raw as { context: Record<string, unknown> };
      return original.call(this, { ...request, context: { ...request.context, ...change } }, now);
    });
    try {
      const f = fixture();
      await f.dispatcher.forward(f.request).catch(() => undefined);
      expect(f.read).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
  it('composes actual routing, Pilot and Tool Runtime without relabeling conceptual scope or concrete evidence', async () => {
    const f = fixture();
    const result = await f.dispatcher.forward(f.request);
    expect(result.status).toBe('success');
    expect(f.read).toHaveBeenCalledOnce();
    expect(result.tools_used).toEqual([
      { tool_id: descriptor.concrete_tool.tool_id, version: descriptor.concrete_tool.tool_version }
    ]);
    expect(f.route.mock.results).toHaveLength(1);
    expect(f.execute.mock.calls[0]?.[0]).toMatchObject({
      agent_id: 'asset',
      input: { asset_id: 'asset-a' },
      context: f.request.context
    });
    expect(f.audits.some((e) => JSON.stringify(e).includes('asset.asset.get.v1'))).toBe(true);
  });
  it.each([
    { empty: true },
    { inactive: true },
    { disabled: true },
    { environment: 'production' },
    { blocked: true },
    { toolsOff: true },
    { deny: true }
  ])('never grants authority through mapping %j', async (options) => {
    const f = fixture(options);
    await f.dispatcher.forward(f.request).catch(() => undefined);
    expect(f.read).not.toHaveBeenCalled();
  });
  it.each([
    { tool_candidates: ['asset.get', 'asset.search'] },
    { tool_candidates: ['asset.search'] },
    { required_capabilities: ['asset.get', 'asset.search'] },
    { action_class: 'proposed_action' as const },
    { approval_required: true },
    { intent: 'OTHER' },
    { agent_version: '9.0.0' },
    { request_id: 'other' },
    { correlation_id: 'other' },
    { trace_id: 'other' },
    { rag_required: true }
  ])('rejects route broadening and correlation mismatch %j', async (routeChange) => {
    const f = fixture({ routeChange });
    await expect(f.dispatcher.forward(f.request)).rejects.toThrow();
    expect(f.execute).not.toHaveBeenCalled();
  });
  it('rejects forged bindings, extra authority fields, wrong concrete versions and non-data inputs', async () => {
    const f = fixture();
    for (const payload of [
      { ...f.request.payload, bindings: descriptor },
      { ...f.request.payload, tool_version: '9.0.0' },
      { ...f.request.payload, input: { asset_id: 'asset-a', tenant_id: 'tenant-b' } },
      {
        ...f.request.payload,
        input: {
          get asset_id() {
            throw new Error('must not run');
          }
        }
      }
    ])
      await expect(f.dispatcher.forward({ ...f.request, payload })).rejects.toThrow();
    expect(f.execute).not.toHaveBeenCalled();
  });
  it.each(['tool_id', 'tool_version', 'request_id', 'correlation_id', 'trace_id'] as const)(
    'abstains on forged concrete evidence %s',
    async (field) => {
      const f = fixture({ responseChange: (r) => ({ ...r, [field]: 'wrong' }) });
      const result = await f.dispatcher.forward(f.request);
      expect(result.status).toBe('partial');
      expect(result.tools_used).toEqual([]);
    }
  );
  it('captures immutable arguments before await and isolates overlapping requests', async () => {
    const f = fixture();
    let release!: () => void;
    const wait = new Promise<void>((r) => {
      release = r;
    });
    const originalRoute = f.route.getMockImplementation();
    if (!originalRoute) throw new Error('Missing route fixture');
    f.route.mockImplementationOnce(async (...args) => {
      await wait;
      return originalRoute(...args);
    });
    const first = f.dispatcher.forward(f.request);
    f.request.payload.input.asset_id = 'changed';
    const secondContext = createTrustedRequestContext({
      ...f.request.context,
      request_id: 'second',
      correlation_id: 'second-correlation',
      session_id: 'second-session'
    });
    const second = f.dispatcher.forward({
      ...f.request,
      context: secondContext,
      trace_id: 'second-trace'
    });
    const [secondResult, firstResult] = await Promise.all([second.finally(release), first]);
    expect(f.read).toHaveBeenCalledTimes(2);
    expect(f.execute).toHaveBeenCalledTimes(2);
    for (const [result, index, context, trace, assetId] of [
      [secondResult, 0, secondContext, 'second-trace', 'changed'],
      [firstResult, 1, f.request.context, f.request.trace_id, 'asset-a']
    ] as const) {
      expect(result.status).toBe('success');
      expect(f.execute.mock.calls[index]?.[0]).toMatchObject({
        context,
        trace_id: trace,
        input: { asset_id: assetId }
      });
      const call = f.execute.mock.results[index];
      if (!call || call.type !== 'return') throw new Error('Missing Tool execution');
      const evidence = await call.value;
      expect(evidence).toMatchObject({
        status: 'success',
        request_id: context.request_id,
        correlation_id: context.correlation_id,
        trace_id: trace,
        output: { asset_id: assetId },
        tool_id: descriptor.concrete_tool.tool_id,
        tool_version: descriptor.concrete_tool.tool_version
      });
      if (evidence.status !== 'success') throw new Error('Expected read evidence');
      const response = pilotAgentResponseSchema.parse(result.response);
      expect(response).toMatchObject({
        request_id: context.request_id,
        correlation_id: context.correlation_id,
        trace_id: trace,
        evidence_status: 'sufficient',
        response_type: 'operational'
      });
      expect(response.answer).toBe(`Synthetic lookup returned Asset ID ${assetId}.`);
      expect(response.citations).toEqual([
        {
          source_type: 'tool',
          source_id: evidence.tool_id,
          source_version: evidence.tool_version,
          source_reference: evidence.source.reference
        }
      ]);
    }
  });
  it('keeps legacy no-binding concrete evidence behavior', async () => {
    const f = fixture();
    const response = await f.dispatcher.forward(f.request);
    expect(response.status).toBe('success');
    const toolResponse = f.execute.mock.results[0];
    if (!toolResponse || toolResponse.type !== 'return') throw new Error('missing');
    const evidence = await toolResponse.value;
    const legacy = {
      ...profile,
      intents: profile.intents.map((p) => ({
        ...p,
        tool_capability_classes: [descriptor.concrete_tool.tool_id]
      })),
      tool_allowlist: [
        { ...profile.tool_allowlist[0], capability_class: descriptor.concrete_tool.tool_id }
      ]
    };
    const hierarchy = await f.route({
      context: f.request.context,
      trace_id: f.request.trace_id,
      input: {}
    });
    if (hierarchy.status !== 'routed') throw new Error('missing route');
    const l = hierarchy.decision.prompt_hierarchy.layers;
    const pilot = new PilotAgentRuntime(
      legacy,
      {
        resolve: () =>
          Promise.resolve({ answer: 'Legacy evidence', tool_responses: [evidence], rag: [] })
      },
      { emit: () => Promise.resolve() },
      {
        featureControls: enabledTestFeatureControls,
        service: 'legacy-test',
        environment: 'test',
        allowDeterministicTestAdapters: true,
        promptHierarchy: { master_policy: l[0], orchestrator_prompt: l[1], domain_prompt: l[2] }
      }
    );
    expect(
      (
        await pilot.execute({
          context: f.request.context,
          trace_id: f.request.trace_id,
          agent_id: 'asset',
          agent_version: '1.0.0',
          domain: 'asset',
          intent: 'ASSET_LOOKUP',
          requested_rag_scopes: [],
          requested_tool_capabilities: [descriptor.concrete_tool.tool_id]
        })
      ).response_type
    ).toBe('operational');
  });
});
