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
  readonly accounting_attempt_id: string;
  readonly input_token_bound: number;
  readonly max_output_tokens: number;
}

export type ProviderTokenCountRequest = Omit<
  ProviderInvocationRequest,
  'signal' | 'accounting_attempt_id' | 'input_token_bound'
>;

export interface LiveProviderAccess {
  readonly endpoint: string;
  readonly credential: string;
}

export interface ModelProviderAdapter {
  readonly adapter_id: string;
  /** Certifies complete formatted input without provider execution or billable side effects.
   * Dispatch must enforce input_token_bound and max_output_tokens at the backend.
   * A declaration alone is not production proof; unsupported adapters are denied dispatch. */
  readonly tokenBounds?:
    | {
        readonly version: string;
        readonly enforces_input_bound: boolean;
        readonly enforces_output_limit: boolean;
        countInputTokens(request: ProviderTokenCountRequest): Promise<number>;
      }
    | undefined;
  invoke(
    request: ProviderInvocationRequest,
    liveAccess?: LiveProviderAccess
  ): Promise<ProviderResult>;
}
