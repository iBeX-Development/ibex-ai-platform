export const errorCodes = [
  'VALIDATION_ERROR',
  'AUTHENTICATION_ERROR',
  'AUTHORIZATION_ERROR',
  'TENANT_CONTEXT_ERROR',
  'PERMISSION_DENIED',
  'CONFIGURATION_ERROR',
  'DEPENDENCY_ERROR',
  'TIMEOUT_ERROR',
  'RATE_LIMIT_ERROR',
  'MODEL_UNAVAILABLE',
  'PROVIDER_TIMEOUT',
  'RATE_LIMITED',
  'POLICY_DENIED',
  'CONTEXT_TOO_LARGE',
  'MODEL_NOT_ALLOWED',
  'BUDGET_EXCEEDED',
  'INVALID_RESPONSE',
  'INVALID_INPUT',
  'TENANT_SCOPE_VIOLATION',
  'RESOURCE_NOT_FOUND',
  'CONFLICT',
  'UPSTREAM_TIMEOUT',
  'SERVICE_UNAVAILABLE',
  'TOOL_NOT_ALLOWED',
  'TOOL_DISABLED',
  'PROVIDER_ERROR',
  'GATEWAY_ERROR',
  'APPROVAL_REQUIRED',
  'INTERNAL_ERROR'
] as const;
export type ErrorCode = (typeof errorCodes)[number];

export class PlatformError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly publicMessage: string,
    public readonly statusCode: number,
    public readonly diagnostics?: unknown,
    public readonly traceId?: string,
    public readonly trustedRequestId?: string
  ) {
    super(publicMessage);
    this.name = 'PlatformError';
  }
}

export class ConfigurationError extends PlatformError {
  constructor(message: string, diagnostics?: unknown) {
    super('CONFIGURATION_ERROR', message, 500, diagnostics);
  }
}

export interface ErrorEnvelope {
  readonly error: {
    readonly code: ErrorCode;
    readonly message: string;
    readonly request_id?: string;
    readonly trace_id?: string;
  };
}

export function toErrorEnvelope(error: unknown, requestId?: string): ErrorEnvelope {
  const platformError =
    error instanceof PlatformError
      ? error
      : new PlatformError('INTERNAL_ERROR', 'An internal error occurred', 500);
  const safeRequestId = requestId ?? platformError.trustedRequestId;
  return {
    error: {
      code: platformError.code,
      message: platformError.publicMessage,
      ...(safeRequestId ? { request_id: safeRequestId } : {}),
      ...(platformError.traceId ? { trace_id: platformError.traceId } : {})
    }
  };
}
