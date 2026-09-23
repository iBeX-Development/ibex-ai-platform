import type { TrustedRequestContext } from '../../security/src/index.js';
import type { ToolAdapterResult, ToolMetadata } from './contracts.js';

export type ToolAdapterFailureKind =
  'timeout' | 'transient' | 'unavailable' | 'invalid_response' | 'permanent';

export class ToolAdapterError extends Error {
  constructor(public readonly kind: ToolAdapterFailureKind) {
    super('Tool adapter invocation failed');
    this.name = 'ToolAdapterError';
  }
}

export interface ToolAdapterRequest {
  readonly context: TrustedRequestContext;
  readonly tool: ToolMetadata;
  readonly input: unknown;
  readonly signal: AbortSignal;
}

/**
 * Controlled Core/API boundary. Concrete endpoints, credentials, and service
 * identities must be supplied by an approved integration and are absent here.
 */
export interface ToolAdapter {
  readonly tool_id: string;
  readonly tool_version: string;
  readonly execution_mode: 'deterministic_test' | 'live_core';
  invoke(request: ToolAdapterRequest): Promise<ToolAdapterResult>;
}
