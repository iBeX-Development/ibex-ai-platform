import { z } from 'zod';
import type { AuditEventSink } from '../../audit/src/index.js';
import type { FeatureControls } from '../../configuration/src/index.js';
import { PlatformError } from '../../errors/src/index.js';
import type {
  GatewayPlatformAdapter,
  GatewayPlatformRequest,
  GatewayPlatformResult
} from '../../gateway/src/index.js';
import {
  PilotAgentRuntime,
  pilotAgentProfileSchema,
  type PilotAgentGroundingPort
} from '../../pilot-agents/src/index.js';
import { createTrustedRequestContext } from '../../security/src/index.js';
import {
  ToolBindingCatalog,
  type ToolRegistry,
  type ToolRuntimeService
} from '../../tool-runtime/src/index.js';
import type { SharedAgentRuntime } from './orchestrator.js';

const payloadSchema = z
  .object({
    tool_id: z.string().min(1),
    tool_version: z.string().min(1),
    input: z.unknown().optional()
  })
  .strict();
const assetIdSchema = z
  .object({
    asset_id: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[A-Za-z0-9_-]+(?![\s\S])/)
  })
  .strict()
  .readonly();

// Reject accessors, prototypes and non-JSON data before any parser can read them.
function snapshot(value: unknown, depth = 0): unknown {
  if (depth > 20) throw new Error('Input exceeds supported depth');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'object') throw new Error('Input is not JSON');
  const prototype: unknown = Object.getPrototypeOf(value);
  if (Array.isArray(value)) {
    if (prototype !== Array.prototype) throw new Error('Invalid array');
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(value).length !== value.length + 1) throw new Error('Invalid array');
    return Object.freeze(
      Array.from({ length: value.length }, (_, index) => {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !('value' in descriptor)) throw new Error('Invalid array entry');
        return snapshot(descriptor.value, depth + 1);
      })
    );
  }
  if (prototype !== Object.prototype && prototype !== null) throw new Error('Invalid object');
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const name of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    if (
      typeof name !== 'string' ||
      name === '__proto__' ||
      !descriptor ||
      !('value' in descriptor) ||
      !descriptor.enumerable
    )
      throw new Error('Invalid object entry');
    result[name] = snapshot(descriptor.value, depth + 1);
  }
  return Object.freeze(result);
}

export interface InactiveToolDispatcherOptions {
  readonly environment: string;
  readonly featureControls: FeatureControls;
  readonly routing: Pick<SharedAgentRuntime, 'route'>;
  readonly registry: ToolRegistry;
  readonly tools: Pick<ToolRuntimeService, 'execute'>;
  readonly audit: AuditEventSink;
  readonly profile: unknown;
  readonly bindings?: ToolBindingCatalog;
}

/** Inert unless explicitly composed in tests. No production/bootstrap composition is supplied. */
export class InactiveToolDispatcher implements GatewayPlatformAdapter {
  private readonly bindings: ToolBindingCatalog;
  private readonly profile;
  constructor(private readonly options: InactiveToolDispatcherOptions) {
    this.bindings = options.bindings ?? new ToolBindingCatalog(options.registry);
    this.profile = pilotAgentProfileSchema.parse(options.profile);
  }

  async forward(raw: GatewayPlatformRequest): Promise<GatewayPlatformResult> {
    const deny = () =>
      new PlatformError('PERMISSION_DENIED', 'Test tool dispatch is unavailable', 403);
    if (
      this.options.environment !== 'test' ||
      raw.endpoint !== 'tools' ||
      !this.options.featureControls.tools
    )
      throw deny();
    // Capture before the first await: no shared request slot or caller-owned arguments survive.
    const context = createTrustedRequestContext(raw.context);
    const trace = raw.trace_id;
    let payload;
    let input;
    try {
      payload = payloadSchema.parse(snapshot(raw.payload));
      input = assetIdSchema.parse(payload.input);
    } catch {
      throw new PlatformError('INVALID_INPUT', 'Tool input is invalid', 400);
    }
    const routed = await this.options.routing.route({
      context,
      trace_id: trace,
      input: Object.freeze({ ...payload, input })
    });
    if (routed.status !== 'routed') throw deny();
    const d = routed.decision;
    if (
      d.request_id !== context.request_id ||
      d.correlation_id !== context.correlation_id ||
      d.trace_id !== trace ||
      d.selected_agent !== this.profile.agent_id ||
      d.agent_version !== this.profile.versions.agent ||
      d.domain !== this.profile.domain ||
      d.domain !== 'asset' ||
      d.intent !== 'ASSET_LOOKUP' ||
      d.action_class !== 'read' ||
      d.risk_class !== 'low' ||
      d.approval_required ||
      d.rag_required ||
      d.rag_scopes.length !== 0 ||
      d.tool_candidates.length !== 1 ||
      d.tool_candidates[0] !== 'asset.get' ||
      d.required_capabilities.length !== 1 ||
      d.required_capabilities[0] !== 'asset.get'
    )
      throw deny();
    const binding = this.bindings.resolve({
      agent_id: d.selected_agent,
      agent_version: d.agent_version,
      domain: d.domain,
      intent: d.intent,
      conceptual_capability: 'asset.get'
    });
    if (
      !binding ||
      binding.mode !== 'deterministic_test' ||
      payload.tool_id !== binding.concrete_tool.tool_id ||
      payload.tool_version !== binding.concrete_tool.tool_version
    )
      throw deny();
    const concrete = binding.concrete_tool;
    const registration = this.options.registry.resolve(concrete.tool_id, concrete.tool_version);
    if (
      !registration ||
      !registration.metadata.enabled ||
      registration.metadata.input_schema_id !== concrete.input_schema_id ||
      registration.metadata.output_schema_id !== concrete.output_schema_id ||
      registration.metadata.execution_mode !== 'deterministic_test' ||
      registration.metadata.read_write_class !== 'read' ||
      registration.metadata.proposal_only ||
      registration.metadata.ownership_validation !== 'resource' ||
      registration.metadata.environments.length !== 1 ||
      registration.metadata.environments[0] !== 'test'
    )
      throw deny();
    const captured = snapshot(registration.input_schema.parse(input));
    const expected = JSON.stringify({
      context,
      trace_id: trace,
      agent_id: d.selected_agent,
      agent_version: d.agent_version,
      domain: d.domain,
      intent: d.intent,
      rag_scopes: [],
      tool_capabilities: ['asset.get']
    });
    const grounding: PilotAgentGroundingPort = {
      resolve: async (request) => {
        if (JSON.stringify(request) !== expected) throw deny();
        const response = await this.options.tools.execute({
          context,
          trace_id: trace,
          agent_id: d.selected_agent,
          prompt_version: this.profile.versions.prompt,
          tool_id: concrete.tool_id,
          tool_version: concrete.tool_version,
          input: captured
        });
        if (response.status !== 'success') throw deny();
        const output = assetIdSchema.parse(registration.output_schema.parse(response.output));
        if (output.asset_id !== input.asset_id) throw deny();
        return {
          answer: `Synthetic lookup returned Asset ID ${output.asset_id}.`,
          tool_responses: [response],
          rag: []
        };
      }
    };
    const layers = d.prompt_hierarchy.layers;
    const pilot = new PilotAgentRuntime(this.profile, grounding, this.options.audit, {
      featureControls: this.options.featureControls,
      service: 'inactive-tool-dispatch',
      environment: 'test',
      allowDeterministicTestAdapters: true,
      toolEvidenceBindings: this.bindings,
      promptHierarchy: {
        master_policy: layers[0],
        orchestrator_prompt: layers[1],
        domain_prompt: layers[2]
      }
    });
    const response = await pilot.execute({
      context,
      trace_id: trace,
      agent_id: d.selected_agent,
      agent_version: d.agent_version,
      domain: d.domain,
      intent: d.intent,
      requested_rag_scopes: [],
      requested_tool_capabilities: ['asset.get']
    });
    return {
      status: response.response_type === 'abstain' ? 'partial' : 'success',
      response,
      agent: response.agent_id,
      action_type: 'informational',
      approval_required: response.approval_required,
      tools_used: response.citations
        .filter((c) => c.source_type === 'tool')
        .map((c) => ({ tool_id: c.source_id, version: c.source_version }))
    };
  }
}
