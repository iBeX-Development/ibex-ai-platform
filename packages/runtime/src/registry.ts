import { PlatformError } from '../../errors/src/index.js';
import type { TrustedRequestContext } from '../../security/src/index.js';
import {
  agentDefinitionSchema,
  type AgentDefinition,
  type IntentClassification
} from './contracts.js';

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function freezeDefinition(definition: AgentDefinition): AgentDefinition {
  return Object.freeze({
    ...definition,
    supported_intents: Object.freeze([...definition.supported_intents]),
    capabilities: Object.freeze([...definition.capabilities]),
    allowed_tools: Object.freeze([...definition.allowed_tools]),
    allowed_rag_scopes: Object.freeze([...definition.allowed_rag_scopes]),
    required_permissions: Object.freeze([...definition.required_permissions]),
    required_entitlements: Object.freeze([...definition.required_entitlements]),
    model_policy: Object.freeze({
      ...definition.model_policy,
      fallback_policies: Object.freeze([...definition.model_policy.fallback_policies])
    })
  });
}

export class AgentRegistry {
  private readonly definitions: readonly AgentDefinition[];

  constructor(records: readonly unknown[]) {
    const definitions = records.map((record) =>
      freezeDefinition(agentDefinitionSchema.parse(record))
    );
    const versionKeys = definitions.map((record) => `${record.agent_id}\u0000${record.version}`);
    if (!unique(versionKeys)) {
      throw new PlatformError(
        'CONFIGURATION_ERROR',
        'Agent registry configuration is invalid',
        500
      );
    }

    const activeIds = definitions
      .filter((record) => record.status === 'active')
      .map((record) => record.agent_id);
    if (!unique(activeIds)) {
      throw new PlatformError(
        'CONFIGURATION_ERROR',
        'Agent registry configuration is invalid',
        500
      );
    }
    this.definitions = Object.freeze(definitions);
  }

  select(
    classification: Extract<IntentClassification, { status: 'classified' }>,
    requestedAgent?: string
  ): AgentDefinition | undefined {
    const candidates = this.definitions.filter(
      (definition) =>
        definition.status === 'active' &&
        definition.domain === classification.domain &&
        definition.supported_intents.includes(classification.intent)
    );

    if (requestedAgent) {
      const requested = candidates.find((candidate) => candidate.agent_id === requestedAgent);
      if (!requested) throw new PlatformError('PERMISSION_DENIED', 'Access denied', 403);
      return requested;
    }

    if (candidates.length > 1) {
      throw new PlatformError('CONFIGURATION_ERROR', 'Agent routing is ambiguous', 500);
    }
    return candidates[0];
  }

  authorize(
    context: TrustedRequestContext,
    agent: AgentDefinition,
    requiredCapabilities: readonly string[]
  ): void {
    const allowed =
      agent.required_permissions.every((permission) => context.permissions.includes(permission)) &&
      agent.required_entitlements.every((entitlement) =>
        context.entitlements.includes(entitlement)
      ) &&
      requiredCapabilities.every((capability) => agent.capabilities.includes(capability));

    if (!allowed) throw new PlatformError('PERMISSION_DENIED', 'Access denied', 403);
  }
}
