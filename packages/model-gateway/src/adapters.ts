import type { ModelCapability, ModelDefinition, ProviderResult } from './contracts.js';

export type ProviderFailureKind =
  'timeout' | 'rate_limit' | 'unavailable' | 'invalid_response' | 'permanent';

export class ProviderAdapterError extends Error {
  constructor(public readonly kind: ProviderFailureKind) {
    super('Model provider invocation failed');
    this.name = 'ProviderAdapterError';
  }
}

export interface ProviderInvocationRequest {
  readonly request_id: string;
  readonly capability: ModelCapability;
  readonly model: ModelDefinition;
  readonly input: unknown;
  readonly requires_structured_output: boolean;
  readonly requires_tool_use: boolean;
  readonly output_schema_id?: string;
  readonly signal: AbortSignal;
}

export interface LiveProviderAccess {
  readonly endpoint: string;
  readonly credential: string;
}

export interface ModelProviderAdapter {
  readonly adapter_id: string;
  invoke(
    request: ProviderInvocationRequest,
    liveAccess?: LiveProviderAccess
  ): Promise<ProviderResult>;
}
