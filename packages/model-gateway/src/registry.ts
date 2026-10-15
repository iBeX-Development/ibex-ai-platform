import { PlatformError } from '../../errors/src/index.js';
import {
  modelDefinitionSchema,
  providerDefinitionSchema,
  type ConfidentialityClass,
  type ModelDefinition,
  type ModelPayloadType,
  type ModelGatewayRequest,
  type ProviderDefinition
} from './contracts.js';
import { LocalModelSchemaCatalog, type ModelPayloadValidator } from './schema-catalog.js';

export interface ModelCandidate {
  readonly provider: ProviderDefinition;
  readonly model: ModelDefinition;
}

const confidentialityRank: Readonly<Record<ConfidentialityClass, number>> = Object.freeze({
  PUBLIC: 0,
  INTERNAL: 1,
  TENANT_CONFIDENTIAL: 2,
  RESTRICTED: 3
});

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function freezeProvider(provider: ProviderDefinition): ProviderDefinition {
  return Object.freeze({
    ...provider,
    capabilities: Object.freeze([...provider.capabilities]),
    required_entitlements: Object.freeze([...provider.required_entitlements]),
    approved_environments: Object.freeze([...provider.approved_environments])
  });
}

function freezePayloadType(type: ModelPayloadType): ModelPayloadType {
  return Object.freeze({
    modalities: Object.freeze([...type.modalities]),
    schema: Object.freeze({ ...type.schema })
  });
}

function freezeModel(model: ModelDefinition): ModelDefinition {
  return Object.freeze({
    ...model,
    input_type: freezePayloadType(model.input_type),
    output_type: freezePayloadType(model.output_type),
    capabilities: Object.freeze([...model.capabilities]),
    required_entitlements: Object.freeze([...model.required_entitlements]),
    approved_environments: Object.freeze([...model.approved_environments])
  });
}

function classRank(value: 'low' | 'standard' | 'high'): number {
  return value === 'low' ? 0 : value === 'standard' ? 1 : 2;
}

function compareCandidates(
  left: ModelCandidate,
  right: ModelCandidate,
  request: ModelGatewayRequest
): number {
  if (left.provider.fallback_priority !== right.provider.fallback_priority) {
    return left.provider.fallback_priority - right.provider.fallback_priority;
  }
  if (request.cost_policy === 'quality' && left.model.quality_rank !== right.model.quality_rank) {
    return right.model.quality_rank - left.model.quality_rank;
  }
  if (request.latency_priority === 'low') {
    const latency = classRank(left.model.latency_class) - classRank(right.model.latency_class);
    if (latency !== 0) return latency;
  }
  if (request.cost_policy !== 'quality') {
    const cost = classRank(left.model.cost_class) - classRank(right.model.cost_class);
    if (cost !== 0) return cost;
  }
  const identity = `${left.provider.provider_id}\u0000${left.model.model_id}\u0000${left.model.model_version}`;
  const otherIdentity = `${right.provider.provider_id}\u0000${right.model.model_id}\u0000${right.model.model_version}`;
  return identity.localeCompare(otherIdentity);
}

export class ModelRegistry {
  private readonly providers: ReadonlyMap<string, ProviderDefinition>;
  private readonly models: readonly ModelDefinition[];
  readonly #inputValidators = new WeakMap<ModelDefinition, ModelPayloadValidator>();

  constructor(
    providerRecords: readonly unknown[],
    modelRecords: readonly unknown[],
    schemaCatalog: LocalModelSchemaCatalog
  ) {
    if (!(schemaCatalog instanceof LocalModelSchemaCatalog)) {
      throw new PlatformError(
        'CONFIGURATION_ERROR',
        'A local model schema catalog is required',
        500
      );
    }
    const providers = providerRecords.map((record) =>
      freezeProvider(providerDefinitionSchema.parse(record))
    );
    if (!unique(providers.map((provider) => provider.provider_id))) {
      throw new PlatformError(
        'CONFIGURATION_ERROR',
        'Model registry configuration is invalid',
        500
      );
    }
    this.providers = new Map(providers.map((provider) => [provider.provider_id, provider]));

    const models = modelRecords.map((record) => freezeModel(modelDefinitionSchema.parse(record)));
    for (const model of models) {
      this.#inputValidators.set(model, schemaCatalog.resolve(model.input_type.schema).validate);
      schemaCatalog.resolve(model.output_type.schema);
    }
    const modelKeys = models.map(
      (model) => `${model.provider_id}\u0000${model.model_id}\u0000${model.model_version}`
    );
    if (!unique(modelKeys) || models.some((model) => !this.providers.has(model.provider_id))) {
      throw new PlatformError(
        'CONFIGURATION_ERROR',
        'Model registry configuration is invalid',
        500
      );
    }
    this.models = Object.freeze(models);
  }

  /** Only registry-owned model identities can use their registration-time input binding. */
  validateInput(model: ModelDefinition, input: unknown): void {
    let accepted: unknown;
    try {
      const validate = this.#inputValidators.get(model);
      if (!validate) throw new Error('Missing registered input validator');
      accepted = validate(input);
      if (accepted !== true && accepted !== false) {
        // Observe faulty async predicates without awaiting or accepting their result.
        void Promise.resolve(accepted).catch(() => undefined);
        throw new Error('Invalid input validator result');
      }
    } catch {
      throw new PlatformError('CONFIGURATION_ERROR', 'Model input validator failed', 500);
    }
    if (!accepted) {
      throw new PlatformError('VALIDATION_ERROR', 'Model input is invalid', 400);
    }
  }

  candidates(
    request: ModelGatewayRequest,
    environment: string,
    estimatedInputTokens: number
  ): readonly ModelCandidate[] {
    const candidates = this.models.flatMap((model): ModelCandidate[] => {
      const provider = this.providers.get(model.provider_id);
      if (!provider) return [];
      const allowed =
        provider.status === 'enabled' &&
        provider.health !== 'unavailable' &&
        model.status === 'approved' &&
        provider.approved_environments.includes(environment) &&
        model.approved_environments.includes(environment) &&
        provider.capabilities.includes(request.capability) &&
        model.capabilities.includes(request.capability) &&
        estimatedInputTokens <= model.context_limit &&
        (!request.requires_structured_output || model.structured_output) &&
        (!request.requires_tool_use || model.tool_use) &&
        confidentialityRank[request.confidentiality_class] <=
          confidentialityRank[provider.maximum_confidentiality] &&
        confidentialityRank[request.confidentiality_class] <=
          confidentialityRank[model.maximum_confidentiality] &&
        provider.required_entitlements.every((entitlement) =>
          request.context.entitlements.includes(entitlement)
        ) &&
        model.required_entitlements.every((entitlement) =>
          request.context.entitlements.includes(entitlement)
        );
      return allowed ? [{ provider, model }] : [];
    });
    return Object.freeze(candidates.sort((left, right) => compareCandidates(left, right, request)));
  }
}
