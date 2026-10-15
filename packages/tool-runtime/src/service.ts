import { randomUUID } from 'node:crypto';
import { SpanStatusCode } from '@opentelemetry/api';
import {
  createToolRuntimeAuditEvent,
  type AuditEventSink,
  type ToolRuntimeAuditStage
} from '../../audit/src/index.js';
import { PlatformError, type ErrorCode } from '../../errors/src/index.js';
import type { FeatureControls } from '../../configuration/src/index.js';
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
import {
  ToolRateLimitCatalog,
  type ToolRateLimiter,
  type ToolRateLimitPolicy
} from './rate-limit.js';
import { toolKey, type ToolRegistry } from './registry.js';

export interface ToolRuntimeDependencies {
  readonly featureControls: FeatureControls;
  readonly registry: ToolRegistry;
  readonly rateLimitPolicies: ToolRateLimitCatalog;
  readonly rateLimiter: ToolRateLimiter;
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
  const mapping: Readonly<Record<ToolAdapterError['kind'], readonly [ErrorCode, string, number]>> =
    {
      timeout: ['UPSTREAM_TIMEOUT', 'Tool dependency timed out', 504],
      transient: ['SERVICE_UNAVAILABLE', 'Tool dependency is unavailable', 503],
      unavailable: ['SERVICE_UNAVAILABLE', 'Tool dependency is unavailable', 503],
      invalid_response: ['INVALID_RESPONSE', 'Tool dependency response is invalid', 502],
      permanent: ['DEPENDENCY_ERROR', 'Tool dependency request failed', 502]
    };
  let failure = mapping.permanent;
  try {
    if (error instanceof ToolAdapterError) {
      const kind: unknown = error.kind;
      if (typeof kind === 'string' && Object.hasOwn(mapping, kind)) {
        failure = mapping[kind as keyof typeof mapping];
      }
    }
  } catch {
    // Malformed adapter errors retain the generic dependency failure.
  }
  const [code, message, status] = failure;
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

function cancellationError(): PlatformError {
  return new PlatformError('TIMEOUT_ERROR', 'Tool request was cancelled', 408);
}

function assertActive(signal?: AbortSignal, abortError: () => Error = cancellationError): void {
  if (signal?.aborted) throw abortError();
}

/** Observe both late outcomes; cancelling a wait does not terminate its dependency. */
async function awaitActive<T>(
  invoke: () => Promise<T>,
  signal?: AbortSignal,
  abortError: () => Error = cancellationError
): Promise<T> {
  assertActive(signal, abortError);
  let onAbort!: () => void;
  const pending = new Promise<T>((resolve, reject) => {
    onAbort = () => {
      reject(abortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      assertActive(signal, abortError);
      Promise.resolve(invoke()).then(resolve, reject);
    } catch (error) {
      reject(error instanceof Error ? error : new Error('Dependency operation failed'));
    }
  });
  try {
    const result = await pending;
    assertActive(signal, abortError);
    return result;
  } catch (error) {
    assertActive(signal, abortError);
    throw error;
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}

function shouldRetry(
  error: PlatformError,
  registration: ToolRegistration,
  attempt: number
): boolean {
  return (
    !(error instanceof AdmissionError) &&
    registration.metadata.read_write_class === 'read' &&
    registration.metadata.safe_idempotent &&
    attempt < registration.metadata.retry_policy.max_attempts &&
    (error.code === 'UPSTREAM_TIMEOUT' || error.code === 'SERVICE_UNAVAILABLE')
  );
}

// Kept distinct internally so limiter uncertainty never enters the adapter retry path.
class AdmissionError extends PlatformError {}

// Server-owned reporting budget; independent of caller cancellation and attempt policy.
const failureReportingBudgetMs = 1_000;

async function awaitAttemptErrorAudit(
  emit: () => Promise<void>,
  signal?: AbortSignal
): Promise<void> {
  assertActive(signal);
  const started = performance.now();
  const deadline = started + failureReportingBudgetMs;
  let lastObserved = started;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const checkDeadline = () => {
    assertActive(signal);
    const current = performance.now();
    if (
      !Number.isFinite(started) ||
      started < 0 ||
      !Number.isFinite(deadline) ||
      deadline <= started ||
      !Number.isFinite(current) ||
      current < lastObserved ||
      current >= deadline
    )
      throw new Error('Attempt error audit deadline is unavailable or expired');
    lastObserved = current;
  };
  try {
    checkDeadline();
    await awaitActive(
      () =>
        Promise.race([
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => {
              reject(new Error('Attempt error audit timed out'));
            }, deadline - lastObserved);
          }),
          // Observe both late outcomes; the sink itself cannot be cancelled here.
          Promise.resolve().then(() => {
            checkDeadline();
            return emit();
          })
        ]),
      signal
    );
    // A delayed timer or synchronously blocking sink must not authorize a late retry.
    checkDeadline();
  } finally {
    clearTimeout(timer);
  }
}

async function awaitFailureReport(emit: () => Promise<void>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error('Failure audit reporting timed out'));
        }, failureReportingBudgetMs);
      }),
      // Observe late rejection/fulfillment even when the reporting budget expires.
      Promise.resolve().then(emit)
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function waitBackoff(milliseconds: number, signal?: AbortSignal): Promise<void> {
  assertActive(signal);
  if (milliseconds === 0) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await awaitActive(
      () =>
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, milliseconds);
        }),
      signal
    );
  } finally {
    clearTimeout(timer);
  }
}

export class ToolRuntimeService {
  private readonly adapters: ReadonlyMap<string, ToolAdapter>;
  private readonly approvedLiveTools: ReadonlySet<string>;
  private readonly clock: () => number;
  readonly #environment: string;
  readonly #policies: ToolRateLimitCatalog;
  readonly #consume: ToolRateLimiter['consume'];

  constructor(private readonly dependencies: ToolRuntimeDependencies) {
    try {
      if (
        !(dependencies.rateLimitPolicies instanceof ToolRateLimitCatalog) ||
        typeof dependencies.environment !== 'string' ||
        !dependencies.environment.trim() ||
        typeof dependencies.rateLimiter.consume !== 'function'
      )
        throw new Error('Invalid admission configuration');
      this.#environment = dependencies.environment;
      this.#policies = dependencies.rateLimitPolicies;
      this.#consume = dependencies.rateLimiter.consume.bind(dependencies.rateLimiter);
    } catch {
      throw new PlatformError('CONFIGURATION_ERROR', 'Tool admission is not configured', 500);
    }
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
        if (
          !this.dependencies.featureControls.aiPlatform ||
          !this.dependencies.featureControls.tools
        ) {
          throw new PlatformError('TOOL_DISABLED', 'Tool is not available', 403);
        }
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
        assertActive(options.signal);

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
        if (!metadata.enabled || !metadata.environments.includes(this.#environment)) {
          throw new PlatformError('TOOL_DISABLED', 'Tool is not available', 403);
        }
        if (
          metadata.read_write_class === 'proposal' &&
          !this.dependencies.featureControls.actionTools
        ) {
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
          await awaitActive(
            () =>
              enforceAuthorization(this.dependencies.authorization, trustedRequest.context, {
                capability: `tool:${metadata.tool_id}`,
                action: metadata.read_write_class === 'read' ? 'read' : 'propose',
                required_permissions: metadata.required_permissions,
                required_entitlements: metadata.required_entitlements
              }),
            options.signal
          );
          permissionDecision = 'allowed';
        } catch (error) {
          // Cancellation or an unverifiable authority response is not a denial decision.
          if (error instanceof PlatformError && error.code === 'PERMISSION_DENIED') {
            permissionDecision = 'denied';
          }
          throw error;
        }
        const activePermissionDecision = permissionDecision;

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
          await awaitActive(
            () =>
              enforceResourceOwnership(
                this.dependencies.ownership,
                trustedRequest.context,
                resource
              ),
            options.signal
          );
        }

        // Resolve only after input, authorization and ownership checks, before side effects.
        const ratePolicy = this.#policies.resolve(metadata.rate_limit);

        stage = 'audit';
        await awaitActive(
          () =>
            this.emitAudit({
              traceId,
              context: trustedRequest.context,
              request: trustedRequest,
              registration: selectedRegistration,
              outcome: 'started',
              stage: 'execution',
              timestamp: now,
              permissionDecision: activePermissionDecision
            }),
          options.signal
        );

        if (metadata.read_write_class === 'proposal') {
          stage = 'execution';
          await this.admitProposal(context, selectedRegistration, ratePolicy, options.signal);
          assertActive(options.signal);
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
          stage = 'audit';
          await awaitActive(
            () =>
              this.emitAudit({
                traceId,
                context: trustedRequest.context,
                request: trustedRequest,
                registration: selectedRegistration,
                outcome: 'proposed',
                stage: 'audit',
                timestamp: now,
                permissionDecision: activePermissionDecision,
                latencyMs: this.clock() - startedAt
              }),
            options.signal
          );
          assertActive(options.signal);
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
          assertActive(options.signal);
          currentAttempt += 1;
          attempt = currentAttempt;
          stage = 'execution';
          try {
            const raw = await this.invokeAdapter(
              adapter,
              context,
              selectedRegistration,
              parsedInput.data,
              ratePolicy,
              options.signal
            );
            assertActive(options.signal);
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
            assertActive(options.signal);
            const normalized =
              error instanceof PlatformError ? error : normalizedAdapterError(error);
            try {
              await awaitAttemptErrorAudit(
                () =>
                  this.emitAudit({
                    traceId,
                    context: trustedRequest.context,
                    request: trustedRequest,
                    registration: selectedRegistration,
                    outcome: 'error',
                    stage,
                    timestamp: now,
                    permissionDecision: activePermissionDecision,
                    attempt: currentAttempt,
                    latencyMs: this.clock() - startedAt,
                    errorCode: normalized.code
                  }),
                options.signal
              );
            } catch {
              span.addEvent('tool_runtime.audit.emission_failed');
              assertActive(options.signal);
              throw normalized;
            }
            assertActive(options.signal);
            if (!shouldRetry(normalized, selectedRegistration, currentAttempt)) throw normalized;
            await waitBackoff(metadata.retry_policy.backoff_ms, options.signal);
            assertActive(options.signal);
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
        stage = 'audit';
        await awaitActive(
          () =>
            this.emitAudit({
              traceId,
              context: trustedRequest.context,
              request: trustedRequest,
              registration: selectedRegistration,
              outcome: 'succeeded',
              stage: 'audit',
              timestamp: now,
              permissionDecision: activePermissionDecision,
              attempt: currentAttempt,
              latencyMs: this.clock() - startedAt
            }),
          options.signal
        );
        assertActive(options.signal);
        span.setStatus({ code: SpanStatusCode.OK });
        return Object.freeze(response);
      } catch (error) {
        const safeError = correlated(
          options.signal?.aborted ? cancellationError() : error,
          traceId,
          context?.request_id
        );
        span.setAttributes({
          'ibex.tool.outcome': safeError.statusCode >= 500 ? 'error' : 'rejected',
          'ibex.tool.error_code': safeError.code
        });
        span.recordException(new Error('Tool runtime request failed'));
        span.setStatus({ code: SpanStatusCode.ERROR });
        try {
          await awaitFailureReport(() =>
            this.emitAudit({
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
            })
          );
        } catch {
          span.addEvent('tool_runtime.audit.emission_failed');
        }
        throw safeError;
      } finally {
        span.end();
      }
    });
  }

  private async consumeAdmission(
    context: TrustedRequestContext,
    registration: ToolRegistration,
    policy: ToolRateLimitPolicy,
    signal: AbortSignal
  ): Promise<void> {
    let allowed: boolean;
    try {
      const raw: unknown = await awaitActive(
        () =>
          this.#consume(
            Object.freeze({
              tenant_id: context.tenant_id,
              tool_id: registration.metadata.tool_id,
              tool_version: registration.metadata.version,
              environment: this.#environment,
              policy,
              signal
            })
          ),
        signal,
        () => new Error('Admission deadline')
      );
      // Copy only a literal decision; accept no extra fields, getters or malformed envelopes.
      if (typeof raw !== 'object' || raw === null || Reflect.ownKeys(raw).length !== 1)
        throw new Error('Invalid admission response');
      const descriptor = Object.getOwnPropertyDescriptor(raw, 'allowed');
      if (!descriptor || !('value' in descriptor) || typeof descriptor.value !== 'boolean')
        throw new Error('Invalid admission decision');
      allowed = descriptor.value;
      assertActive(signal);
    } catch {
      throw new AdmissionError('SERVICE_UNAVAILABLE', 'Tool admission is unavailable', 503);
    }
    if (!allowed) throw new AdmissionError('RATE_LIMITED', 'Tool rate limit exceeded', 429);
  }

  private async admitProposal(
    context: TrustedRequestContext,
    registration: ToolRegistration,
    policy: ToolRateLimitPolicy,
    externalSignal?: AbortSignal
  ): Promise<void> {
    assertActive(externalSignal);
    const controller = new AbortController();
    const cancel = () => {
      controller.abort();
    };
    externalSignal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(cancel, registration.metadata.timeout_policy.timeout_ms);
    try {
      await this.consumeAdmission(context, registration, policy, controller.signal);
      assertActive(externalSignal);
    } finally {
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', cancel);
    }
  }

  private async invokeAdapter(
    adapter: ToolAdapter,
    context: TrustedRequestContext,
    registration: ToolRegistration,
    input: unknown,
    policy: ToolRateLimitPolicy,
    externalSignal?: AbortSignal
  ): Promise<ToolAdapterResult> {
    assertActive(externalSignal);
    const controller = new AbortController();
    const cancel = () => {
      controller.abort();
    };
    if (externalSignal?.aborted) cancel();
    else externalSignal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(() => {
      controller.abort();
    }, registration.metadata.timeout_policy.timeout_ms);
    try {
      await this.consumeAdmission(context, registration, policy, controller.signal);
      const result = await awaitActive(
        () => {
          assertActive(externalSignal);
          return adapter.invoke(
            Object.freeze({
              context,
              tool: registration.metadata,
              input,
              signal: controller.signal
            })
          );
        },
        controller.signal,
        () => new ToolAdapterError('timeout')
      );
      assertActive(externalSignal);
      return result;
    } catch (error) {
      assertActive(externalSignal);
      if (error instanceof AdmissionError) throw error;
      throw normalizedAdapterError(error);
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
        environment: this.#environment,
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
