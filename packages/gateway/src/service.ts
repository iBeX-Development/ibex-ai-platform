import { randomUUID } from 'node:crypto';
import { SpanStatusCode } from '@opentelemetry/api';
import {
  createGatewaySecurityAuditEvent,
  type AuditEventSink,
  type GatewayAuditStage
} from '../../audit/src/index.js';
import {
  gatewayResponseEnvelopeSchema,
  type GatewayResponseEnvelope
} from '../../contracts/src/index.js';
import { PlatformError } from '../../errors/src/index.js';
import type { FeatureControls } from '../../configuration/src/index.js';
import { tracer } from '../../observability/src/index.js';
import {
  enforceAuthorization,
  TrustedGatewayBoundary,
  type AuthorizationRequest,
  type GatewayAuthenticator,
  type InboundAuthenticationRequest,
  type ServerAuthorizationPolicy,
  type TrustedRequestContext
} from '../../security/src/index.js';
import {
  gatewayEndpointSchema,
  validateEndpointPayload,
  type GatewayEndpoint
} from './contracts.js';
import type { GatewayRateLimiter } from './rate-limit.js';

export interface GatewayAccessRequirementsResolver {
  resolve(
    endpoint: GatewayEndpoint,
    payload: unknown,
    context: TrustedRequestContext
  ): AuthorizationRequest;
}

export interface GatewayPlatformRequest {
  readonly endpoint: GatewayEndpoint;
  readonly context: TrustedRequestContext;
  readonly payload: unknown;
  readonly trace_id: string;
}

export interface GatewayPlatformResult {
  readonly status: 'success' | 'partial' | 'rejected' | 'error';
  readonly response?: unknown;
  readonly agent?: string;
  readonly sources?: readonly Readonly<{ source_id: string; version: string }>[];
  readonly tools_used?: readonly Readonly<{ tool_id: string; version: string }>[];
  readonly action_type: 'informational' | 'recommendation' | 'proposed_action';
  readonly approval_required: boolean;
  readonly warnings?: readonly string[];
}

/** Adapter for the later shared runtime; Phase 2 does not implement that runtime. */
export interface GatewayPlatformAdapter {
  forward(request: GatewayPlatformRequest): Promise<GatewayPlatformResult>;
}

export interface GatewayExecutionRequest extends InboundAuthenticationRequest {
  readonly endpoint: string;
  readonly payload_bytes: number;
}

export interface GatewayServiceDependencies {
  readonly featureControls: FeatureControls;
  readonly authenticator: GatewayAuthenticator;
  readonly authorizationPolicy: ServerAuthorizationPolicy;
  readonly accessRequirements: GatewayAccessRequirementsResolver;
  readonly rateLimiter: GatewayRateLimiter;
  readonly platform: GatewayPlatformAdapter;
  readonly audit: AuditEventSink;
  readonly service: string;
  readonly environment: string;
  readonly maximumPayloadBytes: number;
  readonly traceIdFactory?: () => string;
  readonly clock?: () => number;
}

function freezeResponse(result: GatewayResponseEnvelope): GatewayResponseEnvelope {
  return Object.freeze({
    ...result,
    sources: Object.freeze([...result.sources]),
    tools_used: Object.freeze([...result.tools_used]),
    warnings: Object.freeze([...result.warnings])
  });
}

export class AiGatewayService {
  private readonly boundary: TrustedGatewayBoundary;

  constructor(private readonly dependencies: GatewayServiceDependencies) {
    if (
      !Number.isInteger(dependencies.maximumPayloadBytes) ||
      dependencies.maximumPayloadBytes < 1
    ) {
      throw new Error('maximumPayloadBytes must be a positive integer');
    }
    this.boundary = new TrustedGatewayBoundary(dependencies.authenticator);
  }

  async execute(
    request: GatewayExecutionRequest,
    now: Date = new Date()
  ): Promise<GatewayResponseEnvelope> {
    const traceId = (this.dependencies.traceIdFactory ?? randomUUID)();
    const startedAt = (this.dependencies.clock ?? Date.now)();
    return tracer.startActiveSpan('ai-gateway.request', async (span) => {
      let stage: GatewayAuditStage = 'payload_size';
      let trustedContext: TrustedRequestContext | undefined;
      span.setAttribute('ibex.gateway.trace_id', traceId);
      try {
        if (!this.dependencies.featureControls.aiPlatform) {
          throw new PlatformError('SERVICE_UNAVAILABLE', 'AI platform is unavailable', 503);
        }
        if (
          request.payload_bytes < 0 ||
          request.payload_bytes > this.dependencies.maximumPayloadBytes
        ) {
          throw new PlatformError('VALIDATION_ERROR', 'Request payload is invalid', 413);
        }

        stage = 'endpoint';
        const endpointResult = gatewayEndpointSchema.safeParse(request.endpoint);
        if (!endpointResult.success) {
          throw new PlatformError('VALIDATION_ERROR', 'Request endpoint is invalid', 404);
        }
        span.setAttribute('ibex.gateway.endpoint', endpointResult.data);

        stage = 'authentication';
        let bound;
        try {
          bound = await this.boundary.bind(request, now);
        } catch (error) {
          if (error instanceof PlatformError && error.code === 'TENANT_CONTEXT_ERROR') {
            stage = 'tenant_context';
          }
          throw error;
        }
        trustedContext = bound.context;
        span.setAttributes({
          'ibex.request_id': trustedContext.request_id,
          'ibex.correlation_id': trustedContext.correlation_id,
          'ibex.tenant_id': trustedContext.tenant_id,
          'ibex.user_id': trustedContext.user_id
        });

        stage = 'payload_schema';
        let payload: unknown;
        try {
          payload = validateEndpointPayload(endpointResult.data, bound.payload);
        } catch {
          throw new PlatformError('VALIDATION_ERROR', 'Request payload is invalid', 400);
        }

        const capability = bound.requested_capability ?? endpointResult.data;
        stage = 'entitlement';
        if (!trustedContext.entitlements.includes(capability)) {
          throw new PlatformError('PERMISSION_DENIED', 'Access denied', 403);
        }

        stage = 'rate_limit';
        await this.dependencies.rateLimiter.consume(
          { context: trustedContext, endpoint: endpointResult.data, capability },
          now
        );

        stage = 'authorization';
        const authorizationRequest = this.dependencies.accessRequirements.resolve(
          endpointResult.data,
          payload,
          trustedContext
        );
        await enforceAuthorization(
          this.dependencies.authorizationPolicy,
          trustedContext,
          authorizationRequest
        );

        stage = 'audit';
        await this.dependencies.audit.emit(
          createGatewaySecurityAuditEvent({
            traceId,
            service: this.dependencies.service,
            environment: this.dependencies.environment,
            outcome: 'accepted',
            stage: 'authorization',
            timestamp: now,
            context: trustedContext
          })
        );

        stage = 'platform';
        const platformResult = await this.dependencies.platform.forward({
          endpoint: endpointResult.data,
          context: trustedContext,
          payload,
          trace_id: traceId
        });

        stage = 'response_schema';
        const response = gatewayResponseEnvelopeSchema.parse({
          contract_version: '1.0',
          ...platformResult,
          request_id: trustedContext.request_id,
          sources: platformResult.sources ?? [],
          tools_used: platformResult.tools_used ?? [],
          warnings: platformResult.warnings ?? [],
          trace_id: traceId
        });
        stage = 'response';
        await this.dependencies.audit.emit(
          createGatewaySecurityAuditEvent({
            traceId,
            service: this.dependencies.service,
            environment: this.dependencies.environment,
            outcome: 'accepted',
            stage,
            timestamp: now,
            context: trustedContext,
            ...(platformResult.agent ? { agent: platformResult.agent } : {}),
            sourcesUsed: platformResult.sources ?? [],
            toolsUsed: platformResult.tools_used ?? [],
            approvalState: platformResult.approval_required
              ? 'required_not_executed'
              : 'not_required',
            responseStatus: platformResult.status,
            latencyMs: Math.max(0, Math.round((this.dependencies.clock ?? Date.now)() - startedAt))
          })
        );
        span.setStatus({ code: SpanStatusCode.OK });
        return freezeResponse(response);
      } catch (error) {
        const sourceError =
          error instanceof PlatformError
            ? error
            : new PlatformError('INTERNAL_ERROR', 'An internal error occurred', 500);
        const correlatedError = new PlatformError(
          sourceError.code,
          sourceError.publicMessage,
          sourceError.statusCode,
          undefined,
          traceId,
          trustedContext?.request_id
        );
        const outcome = correlatedError.statusCode >= 500 ? 'error' : 'rejected';
        span.setAttributes({
          'ibex.gateway.outcome': outcome,
          'ibex.gateway.rejection_stage': stage,
          'ibex.gateway.error_code': correlatedError.code
        });
        span.recordException(new Error('Gateway request rejected'));
        span.setStatus({ code: SpanStatusCode.ERROR });
        try {
          await this.dependencies.audit.emit(
            createGatewaySecurityAuditEvent({
              traceId,
              service: this.dependencies.service,
              environment: this.dependencies.environment,
              outcome,
              stage,
              timestamp: now,
              errorCode: correlatedError.code,
              ...(trustedContext ? { context: trustedContext } : {})
            })
          );
        } catch {
          span.addEvent('gateway.audit.emission_failed');
        }
        throw correlatedError;
      } finally {
        span.end();
      }
    });
  }
}
