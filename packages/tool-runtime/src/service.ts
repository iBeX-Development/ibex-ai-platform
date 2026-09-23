import { randomUUID } from 'node:crypto';
import { SpanStatusCode } from '@opentelemetry/api';
import {
  createToolRuntimeAuditEvent,
  type AuditEventSink,
  type ToolRuntimeAuditStage
} from '../../audit/src/index.js';
import { PlatformError, type ErrorCode } from '../../errors/src/index.js';
import { tracer } from '../../observability/src/index.js';
import {
  createTrustedRequestContext,
  enforceAuthorization,
  enforceResourceOwnership,
  type ResourceOwnershipResolver,
  type ServerAuthorizationPolicy,
  type TrustedRequestContext
} from '../../security/src/index.js';
import { ToolAdapterError, type ToolAdapter } from './adapters.js';
import {
  toolAdapterResultSchema,
  toolExecutionRequestSchema,
  toolExecutionResponseSchema,
  type ToolAdapterResult,
  type ToolExecutionOptions,
  type ToolExecutionRequest,
  type ToolExecutionResponse,
  type ToolRegistration
} from './contracts.js';
import { toolKey, type ToolRegistry } from './registry.js';

export interface ToolRuntimeDependencies {
  readonly registry: ToolRegistry;
  readonly adapters: readonly ToolAdapter[];
  readonly authorization: ServerAuthorizationPolicy;
  readonly ownership: ResourceOwnershipResolver;
  readonly audit: AuditEventSink;
  readonly service: string;
  readonly environment: string;
  readonly approved_live_tools?: readonly string[];
  readonly traceIdFactory?: () => string;
  readonly clock?: () => number;
}

const protectedContextKeys = new Set([
  'tenant_id',
  'user_id',
  'role',
  'roles',
  'permissions',
  'entitlements',
  'session_id',
  'request_id',
  'correlation_id',
  'authorization'
]);

function readField(value: unknown, field: string): unknown {
  if (typeof value !== 'object' || value === null || !(field in value)) return undefined;
  return (value as Record<string, unknown>)[field];
}

function validatedTraceId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const traceId = value.trim();
  if (!traceId || traceId.length > 256) return undefined;
  for (let index = 0; index < traceId.length; index += 1) {
    const codeUnit = traceId.charCodeAt(index);
    if (codeUnit <= 31 || codeUnit === 127) return undefined;
  }
  return traceId;
}

function safeGeneratedTraceId(factory: () => string): string {
  try {
    return validatedTraceId(factory()) ?? randomUUID();
  } catch {
    return randomUUID();
  }
}

function containsProtectedContextKey(value: unknown, seen = new Set<object>()): boolean {
  if (typeof value !== 'object' || value === null) return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) {
    return value.some((item) => containsProtectedContextKey(item, seen));
  }
  for (const [key, child] of Object.entries(value)) {
    if (protectedContextKeys.has(key) || containsProtectedContextKey(child, seen)) return true;
  }
  return false;
}

function normalizedAdapterError(error: unknown): PlatformError {
  if (!(error instanceof ToolAdapterError)) {
    return new PlatformError('DEPENDENCY_ERROR', 'Tool dependency request failed', 502);
  }
  const mapping: Readonly<Record<typeof error.kind, readonly [ErrorCode, string, number]>> = {
    timeout: ['UPSTREAM_TIMEOUT', 'Tool dependency timed out', 504],
    transient: ['SERVICE_UNAVAILABLE', 'Tool dependency is unavailable', 503],
    unavailable: ['SERVICE_UNAVAILABLE', 'Tool dependency is unavailable', 503],
    invalid_response: ['INVALID_RESPONSE', 'Tool dependency response is invalid', 502],
    permanent: ['DEPENDENCY_ERROR', 'Tool dependency request failed', 502]
  };
  const [code, message, status] = mapping[error.kind];
  return new PlatformError(code, message, status);
}

function correlated(error: unknown, traceId: string, requestId?: string): PlatformError {
  const source =
    error instanceof PlatformError
      ? error
      : new PlatformError('INTERNAL_ERROR', 'An internal error occurred', 500);
  return new PlatformError(
    source.code,
    source.publicMessage,
    source.statusCode,
    source.diagnostics,
    traceId,
    requestId
  );
}

function shouldRetry(
  error: PlatformError,
  registration: ToolRegistration,
  attempt: number
): boolean {
  return (
    registration.metadata.read_write_class === 'read' &&
    registration.metadata.safe_idempotent &&
    attempt < registration.metadata.retry_policy.max_attempts &&
    (error.code === 'UPSTREAM_TIMEOUT' || error.code === 'SERVICE_UNAVAILABLE')
  );
}

async function waitBackoff(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (milliseconds === 0) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new PlatformError('TIMEOUT_ERROR', 'Tool request was cancelled', 408));
      },
      { once: true }
    );
  });
}

export class ToolRuntimeService {
  private readonly adapters: ReadonlyMap<string, ToolAdapter>;
  private readonly approvedLiveTools: ReadonlySet<string>;
  private readonly clock: () => number;

  constructor(private readonly dependencies: ToolRuntimeDependencies) {
    const entries = dependencies.adapters.map(
      (adapter) => [toolKey(adapter.tool_id, adapter.tool_version), adapter] as const
    );
    if (
      new Set(entries.map(([key]) => key)).size !== entries.length ||
      entries.some(([, adapter]) => !adapter.tool_id.trim() || !adapter.tool_version.trim())
    ) {
      throw new PlatformError('CONFIGURATION_ERROR', 'Tool adapter configuration is invalid', 500);
    }
    this.adapters = new Map(entries);
    this.approvedLiveTools = new Set(dependencies.approved_live_tools ?? []);
    this.clock = dependencies.clock ?? Date.now;
  }

  async execute(
    inbound: unknown,
    options: ToolExecutionOptions = {},
    now: Date = new Date()
  ): Promise<ToolExecutionResponse> {
    const suppliedTrace = readField(inbound, 'trace_id');
    const suppliedTraceId = validatedTraceId(suppliedTrace);
    const traceId =
      suppliedTraceId ?? safeGeneratedTraceId(this.dependencies.traceIdFactory ?? randomUUID);

    return tracer.startActiveSpan('tool_runtime.execute', async (span) => {
      let stage: ToolRuntimeAuditStage = 'boundary_context';
      let context: TrustedRequestContext | undefined;
      let request: ToolExecutionRequest | undefined;
      let registration: ToolRegistration | undefined;
      let attempt: number | undefined;
      let permissionDecision: 'allowed' | 'denied' | undefined;
      const startedAt = this.clock();
      span.setAttribute('ibex.tool.trace_id', traceId);

      try {
        if (typeof inbound !== 'object' || inbound === null) {
          throw new PlatformError('VALIDATION_ERROR', 'Tool request is invalid', 400);
        }
        context = createTrustedRequestContext(readField(inbound, 'context'));
        span.setAttributes({
          'ibex.request_id': context.request_id,
          'ibex.correlation_id': context.correlation_id,
          'ibex.tenant_id': context.tenant_id,
          'ibex.user_id': context.user_id
        });

        stage = 'boundary_trace';
        if (!suppliedTraceId) {
          throw new PlatformError('VALIDATION_ERROR', 'Tool request is invalid', 400);
        }

        stage = 'request_validation';
        const parsedRequest = toolExecutionRequestSchema.safeParse({ ...inbound, context });
        if (
          !parsedRequest.success ||
          !Object.hasOwn(inbound, 'input') ||
          containsProtectedContextKey(parsedRequest.data.input)
        ) {
          throw new PlatformError('INVALID_INPUT', 'Tool input is invalid', 400);
        }
        const trustedRequest: ToolExecutionRequest = Object.freeze({
          context,
          trace_id: parsedRequest.data.trace_id,
          agent_id: parsedRequest.data.agent_id,
          prompt_version: parsedRequest.data.prompt_version,
          tool_id: parsedRequest.data.tool_id,
          tool_version: parsedRequest.data.tool_version,
          input: parsedRequest.data.input
        });
        request = trustedRequest;
        if (options.signal?.aborted) {
          throw new PlatformError('TIMEOUT_ERROR', 'Tool request was cancelled', 408);
        }

        stage = 'registry';
        registration = this.dependencies.registry.resolve(
          trustedRequest.tool_id,
          trustedRequest.tool_version
        );
        if (!registration) {
          throw new PlatformError('TOOL_NOT_ALLOWED', 'Tool is not available', 403);
        }
        const metadata = registration.metadata;
        span.setAttributes({
          'ibex.tool.id': metadata.tool_id,
          'ibex.tool.version': metadata.version
        });
        if (!metadata.enabled || !metadata.environments.includes(this.dependencies.environment)) {
          throw new PlatformError('TOOL_DISABLED', 'Tool is not available', 403);
        }
        if (
          metadata.execution_mode === 'live_core' &&
          !this.approvedLiveTools.has(toolKey(metadata.tool_id, metadata.version))
        ) {
          throw new PlatformError('TOOL_DISABLED', 'Tool is not available', 403);
        }

        stage = 'input_schema';
        const selectedRegistration = registration;
        const parsedInput = selectedRegistration.input_schema.safeParse(trustedRequest.input);
        if (!parsedInput.success) {
          throw new PlatformError('INVALID_INPUT', 'Tool input is invalid', 400);
        }

        stage = 'authorization';
        try {
          await enforceAuthorization(this.dependencies.authorization, context, {
            capability: `tool:${metadata.tool_id}`,
            action: metadata.read_write_class === 'read' ? 'read' : 'propose',
            required_permissions: metadata.required_permissions,
            required_entitlements: metadata.required_entitlements
          });
          permissionDecision = 'allowed';
        } catch (error) {
          permissionDecision = 'denied';
          throw error;
        }

        stage = 'tenant_ownership';
        if (metadata.ownership_validation === 'resource') {
          let resource: Readonly<{ type: string; id: string }>;
          try {
            resource = selectedRegistration.resource_reference?.(parsedInput.data) ?? {
              type: '',
              id: ''
            };
          } catch {
            throw new PlatformError(
              'AUTHORIZATION_ERROR',
              'Authorization could not be verified',
              403
            );
          }
          await enforceResourceOwnership(this.dependencies.ownership, context, resource);
        }

        stage = 'audit';
        await this.emitAudit({
          traceId,
          context,
          request: trustedRequest,
          registration: selectedRegistration,
          outcome: 'started',
          stage: 'execution',
          timestamp: now,
          permissionDecision
        });

        if (metadata.read_write_class === 'proposal') {
          const response = toolExecutionResponseSchema.parse({
            contract_version: '1.0',
            status: 'proposed',
            request_id: context.request_id,
            correlation_id: context.correlation_id,
            trace_id: traceId,
            tool_id: metadata.tool_id,
            tool_version: metadata.version,
            proposed_input: parsedInput.data,
            approval_required: true,
            approval_policy: metadata.approval_policy
          });
          await this.emitAudit({
            traceId,
            context,
            request: trustedRequest,
            registration: selectedRegistration,
            outcome: 'proposed',
            stage: 'audit',
            timestamp: now,
            permissionDecision,
            latencyMs: this.clock() - startedAt
          });
          span.setStatus({ code: SpanStatusCode.OK });
          return Object.freeze(response);
        }

        const adapter = this.adapters.get(toolKey(metadata.tool_id, metadata.version));
        if (!adapter || adapter.execution_mode !== metadata.execution_mode) {
          throw new PlatformError('CONFIGURATION_ERROR', 'Tool adapter is not configured', 500);
        }

        let result: ToolAdapterResult | undefined;
        let currentAttempt = 0;
        while (!result) {
          currentAttempt += 1;
          attempt = currentAttempt;
          stage = 'execution';
          try {
            const raw = await this.invokeAdapter(
              adapter,
              context,
              selectedRegistration,
              parsedInput.data,
              options.signal
            );
            stage = 'response_schema';
            const envelope = toolAdapterResultSchema.safeParse(raw);
            if (!envelope.success) {
              throw new PlatformError(
                'INVALID_RESPONSE',
                'Tool dependency response is invalid',
                502
              );
            }
            const output = selectedRegistration.output_schema.safeParse(envelope.data.output);
            if (!output.success) {
              throw new PlatformError(
                'INVALID_RESPONSE',
                'Tool dependency response is invalid',
                502
              );
            }
            result = Object.freeze({ ...envelope.data, output: output.data });
          } catch (error) {
            const normalized =
              error instanceof PlatformError ? error : normalizedAdapterError(error);
            await this.emitAudit({
              traceId,
              context,
              request: trustedRequest,
              registration: selectedRegistration,
              outcome: 'error',
              stage,
              timestamp: now,
              permissionDecision,
              attempt: currentAttempt,
              latencyMs: this.clock() - startedAt,
              errorCode: normalized.code
            });
            if (!shouldRetry(normalized, selectedRegistration, currentAttempt)) throw normalized;
            await waitBackoff(metadata.retry_policy.backoff_ms, options.signal);
          }
        }

        const response = toolExecutionResponseSchema.parse({
          contract_version: '1.0',
          status: 'success',
          request_id: context.request_id,
          correlation_id: context.correlation_id,
          trace_id: traceId,
          tool_id: metadata.tool_id,
          tool_version: metadata.version,
          output: result.output,
          source: result.source,
          observed_at: result.observed_at,
          attempts: currentAttempt
        });
        await this.emitAudit({
          traceId,
          context,
          request: trustedRequest,
          registration: selectedRegistration,
          outcome: 'succeeded',
          stage: 'audit',
          timestamp: now,
          permissionDecision,
          attempt: currentAttempt,
          latencyMs: this.clock() - startedAt
        });
        span.setStatus({ code: SpanStatusCode.OK });
        return Object.freeze(response);
      } catch (error) {
        const safeError = correlated(error, traceId, context?.request_id);
        span.setAttributes({
          'ibex.tool.outcome': safeError.statusCode >= 500 ? 'error' : 'rejected',
          'ibex.tool.error_code': safeError.code
        });
        span.recordException(new Error('Tool runtime request failed'));
        span.setStatus({ code: SpanStatusCode.ERROR });
        try {
          await this.emitAudit({
            traceId,
            ...(context ? { context } : {}),
            ...(request ? { request } : {}),
            ...(registration ? { registration } : {}),
            outcome: safeError.statusCode >= 500 ? 'error' : 'rejected',
            stage,
            timestamp: now,
            ...(permissionDecision ? { permissionDecision } : {}),
            ...(attempt !== undefined ? { attempt } : {}),
            latencyMs: this.clock() - startedAt,
            errorCode: safeError.code
          });
        } catch {
          span.addEvent('tool_runtime.audit.emission_failed');
        }
        throw safeError;
      } finally {
        span.end();
      }
    });
  }

  private async invokeAdapter(
    adapter: ToolAdapter,
    context: TrustedRequestContext,
    registration: ToolRegistration,
    input: unknown,
    externalSignal?: AbortSignal
  ): Promise<ToolAdapterResult> {
    const controller = new AbortController();
    const cancel = () => {
      controller.abort();
    };
    externalSignal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(() => {
      controller.abort();
    }, registration.metadata.timeout_policy.timeout_ms);
    try {
      return await Promise.race([
        adapter.invoke(
          Object.freeze({ context, tool: registration.metadata, input, signal: controller.signal })
        ),
        new Promise<never>((_resolve, reject) => {
          controller.signal.addEventListener(
            'abort',
            () => {
              reject(new ToolAdapterError('timeout'));
            },
            { once: true }
          );
        })
      ]);
    } finally {
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', cancel);
    }
  }

  private emitAudit(input: {
    readonly traceId: string;
    readonly context?: TrustedRequestContext;
    readonly request?: ToolExecutionRequest;
    readonly registration?: ToolRegistration;
    readonly outcome: 'started' | 'succeeded' | 'proposed' | 'rejected' | 'error';
    readonly stage: ToolRuntimeAuditStage;
    readonly timestamp: Date;
    readonly permissionDecision?: 'allowed' | 'denied';
    readonly attempt?: number;
    readonly latencyMs?: number;
    readonly errorCode?: string;
  }): Promise<void> {
    return this.dependencies.audit.emit(
      createToolRuntimeAuditEvent({
        traceId: input.traceId,
        service: this.dependencies.service,
        environment: this.dependencies.environment,
        outcome: input.outcome,
        stage: input.stage,
        timestamp: input.timestamp,
        ...(input.context ? { context: input.context } : {}),
        ...(input.request
          ? {
              toolId: input.request.tool_id,
              toolVersion: input.request.tool_version,
              agentId: input.request.agent_id,
              promptVersion: input.request.prompt_version
            }
          : {}),
        ...(input.registration
          ? {
              actionClass: input.registration.metadata.read_write_class,
              requestedOperation:
                input.registration.metadata.read_write_class === 'read' ? 'read' : 'propose',
              approvalPolicy: input.registration.metadata.approval_policy,
              approvalState:
                input.registration.metadata.read_write_class === 'read'
                  ? 'not_required'
                  : 'required_not_executed'
            }
          : {}),
        ...(input.permissionDecision ? { permissionDecision: input.permissionDecision } : {}),
        ...(input.attempt !== undefined ? { attempt: input.attempt } : {}),
        ...(input.latencyMs !== undefined ? { latencyMs: input.latencyMs } : {}),
        ...(input.errorCode ? { errorCode: input.errorCode } : {})
      })
    );
  }
}
