import { randomUUID } from 'node:crypto';
import { SpanStatusCode } from '@opentelemetry/api';
import {
  createModelGatewayAuditEvent,
  type AuditEventSink,
  type ModelGatewayAuditStage
} from '../../audit/src/index.js';
import { PlatformError, type ErrorCode } from '../../errors/src/index.js';
import type { FeatureControls } from '../../configuration/src/index.js';
import { tracer } from '../../observability/src/index.js';
import {
  createTrustedRequestContext,
  type TrustedRequestContext
} from '../../security/src/index.js';
import type { SecretProvider } from '../../configuration/src/secrets.js';
import {
  ProviderAdapterError,
  type LiveProviderAccess,
  type ModelProviderAdapter,
  type ProviderInvocationRequest
} from './adapters.js';
import {
  modelGatewayRequestSchema,
  modelGatewayPolicySchema,
  modelGatewayResponseSchema,
  providerResultSchema,
  type ModelGatewayInvocationOptions,
  type ModelGatewayPolicy,
  type ModelGatewayRequest,
  type ModelGatewayResponse,
  type ProviderDefinition,
  type ProviderResult
} from './contracts.js';
import type { ModelMetricsSink, ModelUsageMetric } from './metrics.js';
import type { ModelCandidate, ModelRegistry } from './registry.js';
import { WorkflowOutputCatalog, type WorkflowOutputBinding } from './workflow-output-catalog.js';
import {
  accountingError,
  accountingHash,
  assertAccountingActive,
  snapshotAccountingReceipt,
  budgetDenied,
  freezeAccounting,
  parseBudgetPolicy,
  quoteCost,
  type AccountingReservationCommand,
  type AccountingSettlementCommand,
  type AccountingReceipt,
  type ModelAccountingPolicyInput,
  type ModelAccountingPort,
  type ModelBudgetPolicy
} from './accounting.js';

export interface ModelGatewayDependencies {
  readonly featureControls: FeatureControls;
  readonly registry: ModelRegistry;
  readonly workflowOutputs?: WorkflowOutputCatalog | undefined;
  readonly adapters: readonly ModelProviderAdapter[];
  readonly audit: AuditEventSink;
  readonly metrics: ModelMetricsSink;
  readonly secretProvider?: SecretProvider;
  readonly policy: ModelGatewayPolicy;
  readonly service: string;
  readonly environment: string;
  readonly traceIdFactory?: () => string;
  readonly clock?: () => number;
  /** Elapsed milliseconds, independent of the wall clock used for policy validity. */
  readonly monotonicClock?: () => number;
  readonly accounting?: ModelAccountingPolicyInput | undefined;
}

const maximumTraceIdLength = 256;

function readField(value: unknown, field: string): unknown {
  if (typeof value !== 'object' || value === null || !(field in value)) return undefined;
  return (value as Record<string, unknown>)[field];
}

function readTraceId(value: unknown): unknown {
  try {
    return readField(value, 'trace_id');
  } catch {
    return undefined;
  }
}

function validatedTraceId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const traceId = value.trim();
  if (!traceId || traceId.length > maximumTraceIdLength) return undefined;
  for (let index = 0; index < traceId.length; index += 1) {
    const codeUnit = traceId.charCodeAt(index);
    if (codeUnit <= 31 || codeUnit === 127) return undefined;
  }
  return traceId;
}

function safeTraceId(factory: () => string): string {
  try {
    return validatedTraceId(factory()) ?? randomUUID();
  } catch {
    return randomUUID();
  }
}

function snapshotInput(
  input: unknown,
  maximumInputBytes: number
): { input: unknown; estimate: number } {
  let serialized: string;
  try {
    serialized = JSON.stringify({ input });
  } catch {
    throw new PlatformError('VALIDATION_ERROR', 'Model request is invalid', 400);
  }
  const bytes = Buffer.byteLength(serialized, 'utf8');
  if (bytes > maximumInputBytes) {
    throw new PlatformError('CONTEXT_TOO_LARGE', 'Model context limit exceeded', 413);
  }
  const snapshot = JSON.parse(serialized) as { input: unknown };
  // This estimate is routing-only. Adapter certification is separately mandatory.
  return { input: freezeAccounting(snapshot.input), estimate: Math.max(1, Math.ceil(bytes / 4)) };
}

function invalidResponse(): PlatformError {
  return new PlatformError('INVALID_RESPONSE', 'Model provider response is invalid', 502);
}

function validatedProviderResult(value: unknown): ProviderResult {
  try {
    return providerResultSchema.parse(value);
  } catch {
    // Neither schema diagnostics nor exceptions from provider properties are public errors.
    throw invalidResponse();
  }
}

/** Copy JSON data without invoking accessors/toJSON or dropping unsupported values.
 * Only owned copies are frozen; the provider retains ownership of its objects. */
function snapshotOutput(value: unknown, ancestors = new Set<object>()): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'object' || ancestors.has(value)) throw invalidResponse();
  const array = Array.isArray(value);
  const prototype: unknown = Object.getPrototypeOf(value);
  if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null)
    throw invalidResponse();
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== 'string')) throw invalidResponse();
  if (array && keys.length !== value.length + 1) throw invalidResponse();
  ancestors.add(value);
  try {
    const copy: Record<string, unknown> | unknown[] = array ? [] : {};
    const fields = array ? Array.from({ length: value.length }, (_, index) => String(index)) : keys;
    for (const key of fields) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !('value' in descriptor)) throw invalidResponse();
      const child: unknown = descriptor.value;
      Object.defineProperty(copy, key, {
        value: snapshotOutput(child, ancestors),
        enumerable: true
      });
    }
    return Object.freeze(copy);
  } finally {
    ancestors.delete(value);
  }
}

function normalizedProviderError(error: unknown): PlatformError {
  if (!(error instanceof ProviderAdapterError)) {
    return new PlatformError('PROVIDER_ERROR', 'Model provider request failed', 502);
  }
  const mapping: Readonly<Record<typeof error.kind, readonly [ErrorCode, string, number]>> = {
    timeout: ['PROVIDER_TIMEOUT', 'Model provider timed out', 504],
    rate_limit: ['RATE_LIMITED', 'Model provider rate limit exceeded', 429],
    unavailable: ['MODEL_UNAVAILABLE', 'Model provider is unavailable', 503],
    invalid_response: ['INVALID_RESPONSE', 'Model provider response is invalid', 502],
    permanent: ['PROVIDER_ERROR', 'Model provider request failed', 502]
  };
  const [code, message, status] = mapping[error.kind];
  return new PlatformError(code, message, status);
}

function cancellationError(): PlatformError {
  return new PlatformError('TIMEOUT_ERROR', 'Model request was cancelled', 408);
}

function assertActive(signal?: AbortSignal, abortError: () => Error = cancellationError): void {
  if (signal?.aborted) throw abortError();
}

function certified(value: unknown): boolean {
  return value === true;
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

function retryable(error: PlatformError): boolean {
  return ['PROVIDER_TIMEOUT', 'RATE_LIMITED', 'MODEL_UNAVAILABLE'].includes(error.code);
}

// Server-owned reporting budget; independent of caller cancellation and attempt policy.
const failureReportingBudgetMs = 1_000;

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

function freezeResponse(response: ModelGatewayResponse): ModelGatewayResponse {
  return Object.freeze({
    ...response,
    usage: Object.freeze({ ...response.usage }),
    policy_flags: Object.freeze([...response.policy_flags])
  });
}

export class ModelGatewayService {
  private readonly adapters: ReadonlyMap<string, ModelProviderAdapter>;
  private readonly clock: () => number;
  private readonly monotonicClock: () => number;
  private readonly policy: ModelGatewayPolicy;
  readonly #workflowOutputs: WorkflowOutputCatalog | undefined;

  constructor(private readonly dependencies: ModelGatewayDependencies) {
    if (
      dependencies.workflowOutputs !== undefined &&
      !(dependencies.workflowOutputs instanceof WorkflowOutputCatalog)
    ) {
      throw new PlatformError(
        'CONFIGURATION_ERROR',
        'Workflow output configuration is invalid',
        500
      );
    }
    this.#workflowOutputs = dependencies.workflowOutputs;
    const adapterIds = dependencies.adapters.map((adapter) => adapter.adapter_id);
    if (
      new Set(adapterIds).size !== adapterIds.length ||
      adapterIds.some((adapterId) => !adapterId.trim())
    ) {
      throw new PlatformError('CONFIGURATION_ERROR', 'Model adapter configuration is invalid', 500);
    }
    const parsedPolicy = modelGatewayPolicySchema.safeParse(dependencies.policy);
    if (!parsedPolicy.success || Object.keys(parsedPolicy.data.agent_capabilities).length === 0) {
      throw new PlatformError('CONFIGURATION_ERROR', 'Model Gateway policy is invalid', 500);
    }
    this.adapters = new Map(
      dependencies.adapters.map((adapter) => [adapter.adapter_id, adapter] as const)
    );
    this.policy = Object.freeze({
      ...parsedPolicy.data,
      agent_capabilities: Object.freeze(
        Object.fromEntries(
          Object.entries(parsedPolicy.data.agent_capabilities).map(([agentId, capabilities]) => [
            agentId,
            Object.freeze([...capabilities])
          ])
        )
      )
    });
    this.clock = dependencies.clock ?? Date.now;
    this.monotonicClock = dependencies.monotonicClock ?? (() => performance.now());
  }

  async invoke(
    inbound: unknown,
    options: ModelGatewayInvocationOptions = {},
    now: Date = new Date()
  ): Promise<ModelGatewayResponse> {
    const suppliedTraceId = validatedTraceId(readTraceId(inbound));
    const traceId = suppliedTraceId ?? safeTraceId(this.dependencies.traceIdFactory ?? randomUUID);

    return tracer.startActiveSpan('model_gateway.invoke', async (span) => {
      let stage: ModelGatewayAuditStage = 'boundary_context';
      let context: TrustedRequestContext | undefined;
      let request: ModelGatewayRequest | undefined;
      let selected: ModelCandidate | undefined;
      let attempt: number | undefined;
      let fallbackUsed = false;
      const invocationId = randomUUID();
      let accounting: AccountingReceipt | undefined;
      span.setAttribute('ibex.model_gateway.trace_id', traceId);

      try {
        if (
          !this.dependencies.featureControls.aiPlatform ||
          !this.dependencies.featureControls.modelGateway
        ) {
          throw new PlatformError('MODEL_UNAVAILABLE', 'Model provider is unavailable', 503);
        }
        if (typeof inbound !== 'object' || inbound === null) {
          throw new PlatformError('VALIDATION_ERROR', 'Model request is invalid', 400);
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
          throw new PlatformError('VALIDATION_ERROR', 'Model request is invalid', 400);
        }

        stage = 'request_validation';
        const requestRecord = { ...inbound, context };
        const parsed = modelGatewayRequestSchema.safeParse(requestRecord);
        if (!parsed.success) {
          throw new PlatformError('VALIDATION_ERROR', 'Model request is invalid', 400);
        }
        // Snapshot once: schema validation, token certification and dispatch share this input.
        const snapshot = snapshotInput(parsed.data.input, this.policy.maximum_input_bytes);
        request = Object.freeze({ ...parsed.data, input: snapshot.input, context });
        assertActive(options.signal);
        const activeRequest = request;
        const inputTokens = snapshot.estimate;

        stage = 'policy';
        const approvedCapabilities = Object.hasOwn(this.policy.agent_capabilities, request.agent_id)
          ? this.policy.agent_capabilities[request.agent_id]
          : undefined;
        if (
          request.policy_version !== this.policy.version ||
          !request.context.permissions.includes(this.policy.required_permission) ||
          !approvedCapabilities?.includes(request.capability)
        ) {
          throw new PlatformError('POLICY_DENIED', 'Model policy denied the request', 403);
        }
        const candidates = this.dependencies.registry.candidates(
          request,
          this.dependencies.environment,
          inputTokens
        );
        if (candidates.length === 0) {
          throw new PlatformError('MODEL_NOT_ALLOWED', 'Model policy denied the request', 403);
        }
        let workflowBinding: WorkflowOutputBinding | undefined;
        if (request.requires_structured_output) {
          stage = 'request_validation';
          try {
            if (!this.#workflowOutputs) {
              throw new PlatformError(
                'CONFIGURATION_ERROR',
                'Workflow output configuration is invalid',
                500
              );
            }
            // Resolve the exact wire value, not the request schema's trimmed identifier.
            workflowBinding = this.#workflowOutputs.resolve(
              readField(requestRecord, 'output_schema_id')
            );
          } finally {
            assertActive(options.signal);
          }
        }
        stage = 'accounting';
        const budget = parseBudgetPolicy(this.dependencies.accounting?.policy);
        const ledger = this.dependencies.accounting?.port;
        if (!ledger || typeof ledger.reserve !== 'function' || typeof ledger.settle !== 'function')
          throw accountingError();
        assertAccountingActive(budget, this.clock());

        let lastError: PlatformError | undefined;
        for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
          assertActive(options.signal);
          const candidate = candidates[candidateIndex];
          if (!candidate) continue;
          if (
            candidateIndex > 0 &&
            (!this.policy.fallback_enabled || !this.dependencies.featureControls.modelFallback)
          )
            break;
          selected = candidate;
          fallbackUsed = candidateIndex > 0;
          const adapter = this.adapters.get(candidate.provider.adapter_id);
          if (!adapter) {
            throw new PlatformError('CONFIGURATION_ERROR', 'Model adapter is unavailable', 500);
          }
          let liveAccess: LiveProviderAccess | undefined;

          for (let retryIndex = 0; retryIndex <= this.policy.max_retries; retryIndex += 1) {
            assertActive(options.signal);
            const currentAttempt = retryIndex + 1;
            attempt = currentAttempt;
            stage = 'request_validation';
            try {
              this.dependencies.registry.validateInput(candidate.model, request.input);
            } finally {
              assertActive(options.signal);
            }
            // Gate every attempt before new side effects or clearing prior liability.
            stage = 'accounting';
            if (retryIndex === 0) {
              liveAccess = await awaitActive(
                () => this.liveAccess(candidate.provider),
                options.signal
              );
            }
            assertActive(options.signal);
            const startedAt = this.clock();
            try {
              accounting = undefined;
              const reservation = await this.reserveAttempt(
                adapter,
                candidate,
                request,
                budget,
                invocationId,
                ledger,
                (command) => {
                  // Correlate a possible hold even when its acknowledgement is lost.
                  accounting = {
                    command_hash: command.command_hash,
                    attempt_id: command.attempt.attempt_id,
                    policy_version: command.policy.version,
                    period_id: command.policy.period.id,
                    state: 'unresolved',
                    warnings: []
                  };
                },
                options.signal
              );
              accounting = reservation.receipt;
              stage = 'provider_invocation';
              const providerResult = await this.invokeAdapter(
                adapter,
                candidate,
                request,
                options.signal,
                liveAccess,
                reservation.command
              );
              assertActive(options.signal);
              stage = 'response_validation';
              const result = validatedProviderResult(providerResult);
              if (
                !Number.isSafeInteger(result.input_tokens) ||
                !Number.isSafeInteger(result.output_tokens) ||
                result.input_tokens > reservation.command.attempt.input_tokens ||
                result.output_tokens > reservation.command.attempt.output_tokens
              )
                throw invalidResponse();
              // The complete envelope and bounded usage are trusted before output inspection.
              // Snapshot/predicate failure cannot erase known usage; cancellation still wins.
              let output: ProviderResult | undefined;
              let outputFailure: PlatformError | undefined;
              try {
                output = Object.freeze({
                  ...result,
                  result: snapshotOutput(result.result),
                  ...(result.structured_output !== undefined
                    ? { structured_output: snapshotOutput(result.structured_output) }
                    : {}),
                  policy_flags: Object.freeze([...result.policy_flags])
                });
              } catch {
                outputFailure = invalidResponse();
              }
              assertActive(options.signal);
              if (output) {
                try {
                  this.dependencies.registry.validateOutput(candidate.model, output.result);
                  assertActive(options.signal);
                  workflowBinding?.validate(output.structured_output);
                } catch (error) {
                  outputFailure =
                    error instanceof PlatformError && error.code === 'INVALID_RESPONSE'
                      ? invalidResponse()
                      : new PlatformError(
                          'CONFIGURATION_ERROR',
                          'Model output validator failed',
                          500
                        );
                } finally {
                  assertActive(options.signal);
                }
              }
              stage = 'accounting';
              const cost = quoteCost(
                budget,
                reservation.command.attempt,
                result.input_tokens,
                result.output_tokens
              );
              const settlementBody = {
                reservation: reservation.command,
                usage: {
                  input_tokens: result.input_tokens,
                  output_tokens: result.output_tokens,
                  cost_units: cost
                }
              };
              const settlement: AccountingSettlementCommand = freezeAccounting({
                ...settlementBody,
                command_hash: accountingHash(settlementBody)
              });
              const settled = await this.accountingWait(
                () => ledger.settle(settlement),
                budget,
                options.signal
              );
              accounting = snapshotAccountingReceipt(settled, settlement, 'settled');
              stage = 'response_validation';
              assertActive(options.signal);
              if (outputFailure) throw outputFailure;
              if (!output) throw invalidResponse();
              const latencyMs = Math.max(0, Math.round(this.clock() - startedAt));
              const response = this.response(
                request,
                candidate,
                output,
                latencyMs,
                fallbackUsed,
                cost / budget.units_per_cost
              );
              stage = 'metrics';
              await awaitActive(
                () =>
                  this.dependencies.metrics.emit(
                    this.metric(activeRequest, response, now, budget, reservation.command)
                  ),
                options.signal
              );
              await awaitActive(
                () =>
                  this.emitAudit({
                    traceId,
                    context: activeRequest.context,
                    request: activeRequest,
                    candidate,
                    outcome: 'succeeded',
                    stage,
                    timestamp: now,
                    attempt: currentAttempt,
                    fallbackUsed,
                    response,
                    ...(accounting ? { accounting } : {})
                  }),
                options.signal
              );
              span.setAttributes({
                'ibex.model_gateway.provider_id': response.provider_id,
                'ibex.model_gateway.model_id': response.model_id,
                'ibex.model_gateway.fallback_used': response.fallback_used,
                'ibex.model_gateway.latency_ms': response.latency_ms
              });
              assertActive(options.signal);
              span.setStatus({ code: SpanStatusCode.OK });
              return response;
            } catch (error) {
              assertActive(options.signal);
              if (stage === 'metrics') {
                throw new PlatformError('GATEWAY_ERROR', 'Model Gateway telemetry failed', 500);
              }
              if (stage === 'accounting') {
                if (error instanceof PlatformError && error.code === 'BUDGET_EXCEEDED')
                  throw budgetDenied();
                throw accountingError();
              }
              if (stage === 'response_validation') {
                if (error instanceof PlatformError && error.code === 'CONFIGURATION_ERROR')
                  throw new PlatformError(
                    'CONFIGURATION_ERROR',
                    'Model output validator failed',
                    500
                  );
                throw invalidResponse();
              }
              if (error instanceof PlatformError) throw error;
              const providerError = normalizedProviderError(error);
              // Invalid output terminates directly through the bounded outer failure reporter.
              if (providerError.code === 'INVALID_RESPONSE') throw providerError;
              lastError = providerError;
              const latencyMs = Math.max(0, Math.round(this.clock() - startedAt));
              await awaitActive(
                () =>
                  this.emitAudit({
                    traceId,
                    context: activeRequest.context,
                    request: activeRequest,
                    candidate,
                    outcome: 'error',
                    stage,
                    timestamp: now,
                    attempt: currentAttempt,
                    fallbackUsed,
                    latencyMs,
                    errorCode: providerError.code,
                    ...(accounting ? { accounting } : {})
                  }),
                options.signal
              );
              assertActive(options.signal);
              // Timeout leaves an uncertain dispatched liability; never replay it automatically.
              if (providerError.code === 'PROVIDER_TIMEOUT') throw providerError;
              if (!retryable(lastError) || retryIndex >= this.policy.max_retries) {
                break;
              }
            }
          }
        }
        throw lastError ?? new PlatformError('MODEL_UNAVAILABLE', 'Model is unavailable', 503);
      } catch (error) {
        const source = options.signal?.aborted
          ? cancellationError()
          : error instanceof PlatformError
            ? error
            : new PlatformError('GATEWAY_ERROR', 'Model Gateway request failed', 500);
        const correlated = new PlatformError(
          source.code,
          source.publicMessage,
          source.statusCode,
          undefined,
          traceId,
          context?.request_id
        );
        span.setAttributes({
          'ibex.model_gateway.outcome': correlated.statusCode >= 500 ? 'error' : 'rejected',
          'ibex.model_gateway.stage': stage,
          'ibex.model_gateway.error_code': correlated.code
        });
        span.recordException(new Error('Model Gateway invocation failed'));
        span.setStatus({ code: SpanStatusCode.ERROR });
        try {
          await awaitFailureReport(() =>
            this.emitAudit({
              traceId,
              ...(context ? { context } : {}),
              ...(request ? { request } : {}),
              ...(selected ? { candidate: selected } : {}),
              outcome: correlated.statusCode >= 500 ? 'error' : 'rejected',
              stage,
              timestamp: now,
              ...(attempt !== undefined ? { attempt } : {}),
              fallbackUsed,
              errorCode: correlated.code,
              ...(accounting ? { accounting } : {})
            })
          );
        } catch {
          span.addEvent('model_gateway.audit.emission_failed');
        }
        throw correlated;
      } finally {
        span.end();
      }
    });
  }

  /** Finite server policy budget; late acknowledgements are observed, never continued. */
  private async accountingWait<T>(
    invoke: () => Promise<T>,
    policy: ModelBudgetPolicy,
    externalSignal?: AbortSignal
  ): Promise<T> {
    assertActive(externalSignal);
    const startedAt = this.monotonicClock();
    const checkedAt = this.clock();
    assertAccountingActive(policy, checkedAt);
    const deadline =
      startedAt +
      Math.min(
        policy.operation_timeout_ms,
        policy.valid_until_ms - checkedAt,
        policy.period.ends_at_ms - checkedAt
      );
    if (!Number.isFinite(startedAt) || !Number.isFinite(deadline) || deadline <= startedAt)
      throw accountingError();
    const guard = () => {
      assertActive(externalSignal);
      assertAccountingActive(policy, this.clock());
      const elapsedNow = this.monotonicClock();
      // Clock access cannot override caller cancellation, including on rejection.
      assertActive(externalSignal);
      if (!Number.isFinite(elapsedNow) || elapsedNow < startedAt || elapsedNow >= deadline)
        throw accountingError();
      return elapsedNow;
    };
    const controller = new AbortController();
    const cancel = () => {
      controller.abort();
    };
    externalSignal?.addEventListener('abort', cancel, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const remaining = deadline - guard();
      timer = setTimeout(cancel, Math.max(1, remaining));
      const result = await awaitActive(
        () => {
          guard();
          return invoke();
        },
        controller.signal,
        accountingError
      );
      guard();
      return result;
    } catch (error) {
      guard();
      throw error;
    } finally {
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', cancel);
    }
  }

  private async reserveAttempt(
    adapter: ModelProviderAdapter,
    candidate: ModelCandidate,
    request: ModelGatewayRequest,
    policy: ModelBudgetPolicy,
    invocationId: string,
    ledger: ModelAccountingPort,
    onCommand: (command: AccountingReservationCommand) => void,
    signal?: AbortSignal
  ): Promise<{ command: AccountingReservationCommand; receipt: AccountingReceipt }> {
    const bounds = adapter.tokenBounds;
    if (
      typeof bounds?.version !== 'string' ||
      !bounds.version.trim() ||
      !certified(bounds.enforces_output_limit) ||
      !certified(bounds.enforces_input_bound) ||
      typeof bounds.countInputTokens !== 'function'
    )
      throw accountingError();
    const countRequest = freezeAccounting({
      request_id: request.context.request_id,
      capability: request.capability,
      model: candidate.model,
      input: request.input,
      requires_structured_output: request.requires_structured_output,
      requires_tool_use: request.requires_tool_use,
      ...(request.output_schema_id ? { output_schema_id: request.output_schema_id } : {}),
      max_output_tokens: policy.request.output_tokens
    });
    const input = await this.accountingWait(
      () => bounds.countInputTokens(countRequest),
      policy,
      signal
    );
    if (!Number.isSafeInteger(input) || input < 0) throw accountingError();
    const identity = {
      provider_id: candidate.provider.provider_id,
      model_id: candidate.model.model_id,
      model_version: candidate.model.model_version
    };
    const cost = quoteCost(policy, identity, input, countRequest.max_output_tokens);
    if (
      input > policy.request.input_tokens ||
      input + countRequest.max_output_tokens > policy.request.tokens ||
      input + countRequest.max_output_tokens > candidate.model.context_limit ||
      cost > policy.request.cost_units
    )
      throw budgetDenied();
    const body = {
      policy,
      attempt: {
        ...identity,
        invocation_id: invocationId,
        attempt_id: randomUUID(),
        request_id: request.context.request_id,
        correlation_id: request.context.correlation_id,
        trace_id: request.trace_id,
        tenant_id: request.context.tenant_id,
        agent_id: request.agent_id,
        environment: this.dependencies.environment,
        bounds_version: bounds.version,
        input_digest: accountingHash(countRequest),
        input_tokens: input,
        output_tokens: countRequest.max_output_tokens,
        cost_units: cost
      }
    };
    const command = freezeAccounting({ ...body, command_hash: accountingHash(body) });
    onCommand(command);
    const rawReceipt = await this.accountingWait(() => ledger.reserve(command), policy, signal);
    const receipt = snapshotAccountingReceipt(rawReceipt, command, 'unresolved');
    return { command, receipt };
  }

  private async liveAccess(provider: ProviderDefinition): Promise<LiveProviderAccess | undefined> {
    if (provider.mode === 'test') return undefined;
    if (!provider.endpoint || !provider.credential_reference || !this.dependencies.secretProvider) {
      throw new PlatformError('CONFIGURATION_ERROR', 'Live model provider is not configured', 500);
    }
    const credential = await this.dependencies.secretProvider.getSecret(
      provider.credential_reference
    );
    if (!credential.trim()) {
      throw new PlatformError('CONFIGURATION_ERROR', 'Live model provider is not configured', 500);
    }
    return Object.freeze({ endpoint: provider.endpoint, credential });
  }

  private async invokeAdapter(
    adapter: ModelProviderAdapter,
    candidate: ModelCandidate,
    request: ModelGatewayRequest,
    externalSignal: AbortSignal | undefined,
    liveAccess: LiveProviderAccess | undefined,
    reservation: AccountingReservationCommand
  ): Promise<ProviderResult> {
    assertActive(externalSignal);
    const controller = new AbortController();
    const cancel = () => {
      controller.abort();
    };
    if (externalSignal?.aborted) cancel();
    else externalSignal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(() => {
      controller.abort();
    }, this.policy.timeout_ms);
    const invocation: ProviderInvocationRequest = Object.freeze({
      request_id: request.context.request_id,
      capability: request.capability,
      model: candidate.model,
      input: request.input,
      requires_structured_output: request.requires_structured_output,
      requires_tool_use: request.requires_tool_use,
      ...(request.output_schema_id ? { output_schema_id: request.output_schema_id } : {}),
      signal: controller.signal,
      accounting_attempt_id: reservation.attempt.attempt_id,
      input_token_bound: reservation.attempt.input_tokens,
      max_output_tokens: reservation.attempt.output_tokens
    });
    try {
      const result = await awaitActive(
        () => {
          assertActive(externalSignal);
          assertAccountingActive(reservation.policy, this.clock());
          return adapter.invoke(invocation, liveAccess);
        },
        controller.signal,
        () => new ProviderAdapterError('timeout')
      );
      assertActive(externalSignal);
      return result;
    } catch (error) {
      assertActive(externalSignal);
      throw error;
    } finally {
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', cancel);
    }
  }

  private response(
    request: ModelGatewayRequest,
    candidate: ModelCandidate,
    result: ProviderResult,
    latencyMs: number,
    fallbackUsed: boolean,
    estimatedCost: number
  ): ModelGatewayResponse {
    return freezeResponse(
      modelGatewayResponseSchema.parse({
        request_id: request.context.request_id,
        correlation_id: request.context.correlation_id,
        trace_id: request.trace_id,
        result: result.result,
        ...(result.structured_output !== undefined
          ? { structured_output: result.structured_output }
          : {}),
        provider_id: candidate.provider.provider_id,
        model_id: candidate.model.model_id,
        model_version: candidate.model.model_version,
        usage: {
          input_tokens: result.input_tokens,
          output_tokens: result.output_tokens,
          total_tokens: result.input_tokens + result.output_tokens,
          estimated_cost: estimatedCost
        },
        latency_ms: latencyMs,
        finish_reason: result.finish_reason,
        fallback_used: fallbackUsed,
        policy_flags: result.policy_flags
      })
    );
  }

  private metric(
    request: ModelGatewayRequest,
    response: ModelGatewayResponse,
    timestamp: Date,
    budget: ModelBudgetPolicy,
    reservation: AccountingReservationCommand
  ): ModelUsageMetric {
    return Object.freeze({
      event_type: 'model_gateway.usage',
      accounting: Object.freeze({
        attempt_id: reservation.attempt.attempt_id,
        policy_version: budget.version,
        pricing_version: budget.pricing_version,
        period_id: budget.period.id,
        cost_unit: budget.cost_unit,
        units_per_cost: budget.units_per_cost
      }),
      timestamp: timestamp.toISOString(),
      request_id: request.context.request_id,
      correlation_id: request.context.correlation_id,
      trace_id: request.trace_id,
      tenant_id: request.context.tenant_id,
      user_id: request.context.user_id,
      agent_id: request.agent_id,
      provider_id: response.provider_id,
      model_id: response.model_id,
      model_version: response.model_version,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      total_tokens: response.usage.total_tokens,
      estimated_cost: response.usage.estimated_cost,
      latency_ms: response.latency_ms,
      fallback_used: response.fallback_used
    });
  }

  private emitAudit(input: {
    readonly traceId: string;
    readonly context?: TrustedRequestContext;
    readonly request?: ModelGatewayRequest;
    readonly candidate?: ModelCandidate;
    readonly outcome: 'succeeded' | 'rejected' | 'error';
    readonly stage: ModelGatewayAuditStage;
    readonly timestamp: Date;
    readonly attempt?: number;
    readonly fallbackUsed?: boolean;
    readonly response?: ModelGatewayResponse;
    readonly latencyMs?: number;
    readonly errorCode?: string;
    readonly accounting?: AccountingReceipt;
  }): Promise<void> {
    return this.dependencies.audit.emit(
      createModelGatewayAuditEvent({
        traceId: input.traceId,
        service: this.dependencies.service,
        environment: this.dependencies.environment,
        outcome: input.outcome,
        stage: input.stage,
        timestamp: input.timestamp,
        ...(input.context ? { context: input.context } : {}),
        ...(input.request
          ? {
              agentId: input.request.agent_id,
              capability: input.request.capability,
              confidentialityClass: input.request.confidentiality_class,
              promptVersion: input.request.prompt_version,
              policyVersion: input.request.policy_version
            }
          : {}),
        ...(input.candidate
          ? {
              providerId: input.candidate.provider.provider_id,
              modelId: input.candidate.model.model_id,
              modelVersion: input.candidate.model.model_version
            }
          : {}),
        ...(input.attempt !== undefined ? { attempt: input.attempt } : {}),
        ...(input.fallbackUsed !== undefined ? { fallbackUsed: input.fallbackUsed } : {}),
        ...(input.response
          ? {
              inputTokens: input.response.usage.input_tokens,
              outputTokens: input.response.usage.output_tokens,
              estimatedCost: input.response.usage.estimated_cost,
              latencyMs: input.response.latency_ms
            }
          : input.latencyMs !== undefined
            ? { latencyMs: input.latencyMs }
            : {}),
        ...(input.errorCode ? { errorCode: input.errorCode } : {}),
        ...(input.accounting ? { accounting: input.accounting } : {})
      })
    );
  }
}
