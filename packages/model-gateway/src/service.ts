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

export interface ModelGatewayDependencies {
  readonly featureControls: FeatureControls;
  readonly registry: ModelRegistry;
  readonly adapters: readonly ModelProviderAdapter[];
  readonly audit: AuditEventSink;
  readonly metrics: ModelMetricsSink;
  readonly secretProvider?: SecretProvider;
  readonly policy: ModelGatewayPolicy;
  readonly service: string;
  readonly environment: string;
  readonly traceIdFactory?: () => string;
  readonly clock?: () => number;
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

function estimatedInputTokens(input: unknown, maximumInputBytes: number): number {
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
  return Math.max(1, Math.ceil(bytes / 4));
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

function retryable(error: PlatformError): boolean {
  return ['PROVIDER_TIMEOUT', 'RATE_LIMITED', 'MODEL_UNAVAILABLE'].includes(error.code);
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
  private readonly policy: ModelGatewayPolicy;

  constructor(private readonly dependencies: ModelGatewayDependencies) {
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
        const parsed = modelGatewayRequestSchema.safeParse({ ...inbound, context });
        if (!parsed.success) {
          throw new PlatformError('VALIDATION_ERROR', 'Model request is invalid', 400);
        }
        request = Object.freeze({ ...parsed.data, context });
        if (options.signal?.aborted) {
          throw new PlatformError('TIMEOUT_ERROR', 'Model request was cancelled', 408);
        }
        const inputTokens = estimatedInputTokens(request.input, this.policy.maximum_input_bytes);

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

        let lastError: PlatformError | undefined;
        for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
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
          const liveAccess = await this.liveAccess(candidate.provider);

          for (let retryIndex = 0; retryIndex <= this.policy.max_retries; retryIndex += 1) {
            attempt = retryIndex + 1;
            stage = 'provider_invocation';
            const startedAt = this.clock();
            try {
              const providerResult = await this.invokeAdapter(
                adapter,
                candidate,
                request,
                options.signal,
                liveAccess
              );
              stage = 'response_validation';
              const result = providerResultSchema.safeParse(providerResult);
              if (!result.success) throw new ProviderAdapterError('invalid_response');
              const latencyMs = Math.max(0, Math.round(this.clock() - startedAt));
              const response = this.response(
                request,
                candidate,
                result.data,
                latencyMs,
                fallbackUsed
              );
              stage = 'metrics';
              await this.dependencies.metrics.emit(this.metric(request, response, now));
              await this.emitAudit({
                traceId,
                context,
                request,
                candidate,
                outcome: 'succeeded',
                stage,
                timestamp: now,
                attempt,
                fallbackUsed,
                response
              });
              span.setAttributes({
                'ibex.model_gateway.provider_id': response.provider_id,
                'ibex.model_gateway.model_id': response.model_id,
                'ibex.model_gateway.fallback_used': response.fallback_used,
                'ibex.model_gateway.latency_ms': response.latency_ms
              });
              span.setStatus({ code: SpanStatusCode.OK });
              return response;
            } catch (error) {
              if (stage === 'metrics') {
                throw new PlatformError('GATEWAY_ERROR', 'Model Gateway telemetry failed', 500);
              }
              if (error instanceof PlatformError) throw error;
              lastError = normalizedProviderError(error);
              const latencyMs = Math.max(0, Math.round(this.clock() - startedAt));
              await this.emitAudit({
                traceId,
                context,
                request,
                candidate,
                outcome: 'error',
                stage,
                timestamp: now,
                attempt,
                fallbackUsed,
                latencyMs,
                errorCode: lastError.code
              });
              if (options.signal?.aborted) {
                throw new PlatformError('TIMEOUT_ERROR', 'Model request was cancelled', 408);
              }
              if (!retryable(lastError) || retryIndex >= this.policy.max_retries) {
                break;
              }
            }
          }
        }
        throw lastError ?? new PlatformError('MODEL_UNAVAILABLE', 'Model is unavailable', 503);
      } catch (error) {
        const source =
          error instanceof PlatformError
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
          await this.emitAudit({
            traceId,
            ...(context ? { context } : {}),
            ...(request ? { request } : {}),
            ...(selected ? { candidate: selected } : {}),
            outcome: correlated.statusCode >= 500 ? 'error' : 'rejected',
            stage,
            timestamp: now,
            ...(attempt !== undefined ? { attempt } : {}),
            fallbackUsed,
            errorCode: correlated.code
          });
        } catch {
          span.addEvent('model_gateway.audit.emission_failed');
        }
        throw correlated;
      } finally {
        span.end();
      }
    });
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
    liveAccess: LiveProviderAccess | undefined
  ): Promise<ProviderResult> {
    const controller = new AbortController();
    const cancel = () => {
      controller.abort();
    };
    externalSignal?.addEventListener('abort', cancel, { once: true });
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
      signal: controller.signal
    });
    try {
      return await Promise.race([
        adapter.invoke(invocation, liveAccess),
        new Promise<never>((_resolve, reject) => {
          controller.signal.addEventListener(
            'abort',
            () => {
              reject(new ProviderAdapterError('timeout'));
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

  private response(
    request: ModelGatewayRequest,
    candidate: ModelCandidate,
    result: ProviderResult,
    latencyMs: number,
    fallbackUsed: boolean
  ): ModelGatewayResponse {
    const estimatedCost =
      (result.input_tokens * candidate.model.input_cost_per_1k +
        result.output_tokens * candidate.model.output_cost_per_1k) /
      1000;
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
    timestamp: Date
  ): ModelUsageMetric {
    return Object.freeze({
      event_type: 'model_gateway.usage',
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
        ...(input.errorCode ? { errorCode: input.errorCode } : {})
      })
    );
  }
}
