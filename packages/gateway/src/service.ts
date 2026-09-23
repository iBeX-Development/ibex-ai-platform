import { SpanStatusCode } from '@opentelemetry/api';
import type { AuditEventSink } from '../../audit/src/index.js';
import { createSecurityAuditEvent } from '../../audit/src/index.js';
import {
  gatewayResponseEnvelopeSchema,
  type GatewayResponseEnvelope
} from '../../contracts/src/index.js';
import { PlatformError } from '../../errors/src/index.js';
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
  readonly authenticator: GatewayAuthenticator;
  readonly authorizationPolicy: ServerAuthorizationPolicy;
  readonly accessRequirements: GatewayAccessRequirementsResolver;
  readonly rateLimiter: GatewayRateLimiter;
  readonly platform: GatewayPlatformAdapter;
  readonly audit: AuditEventSink;
  readonly service: string;
  readonly environment: string;
  readonly maximumPayloadBytes: number;
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
    if (
      request.payload_bytes < 0 ||
      request.payload_bytes > this.dependencies.maximumPayloadBytes
    ) {
      throw new PlatformError('VALIDATION_ERROR', 'Request payload is invalid', 413);
    }

    const endpointResult = gatewayEndpointSchema.safeParse(request.endpoint);
    if (!endpointResult.success) {
      throw new PlatformError('VALIDATION_ERROR', 'Request endpoint is invalid', 404);
    }

    const bound = await this.boundary.bind(request, now);
    let payload: unknown;
    try {
      payload = validateEndpointPayload(endpointResult.data, bound.payload);
    } catch {
      throw new PlatformError('VALIDATION_ERROR', 'Request payload is invalid', 400);
    }

    const capability = bound.requested_capability ?? endpointResult.data;

    if (!bound.context.entitlements.includes(capability)) {
      throw new PlatformError('PERMISSION_DENIED', 'Access denied', 403);
    }

    await this.dependencies.rateLimiter.consume(
      { context: bound.context, endpoint: endpointResult.data, capability },
      now
    );
    const authorizationRequest = this.dependencies.accessRequirements.resolve(
      endpointResult.data,
      payload,
      bound.context
    );
    await enforceAuthorization(
      this.dependencies.authorizationPolicy,
      bound.context,
      authorizationRequest
    );

    const traceId = bound.context.correlation_id;
    return tracer.startActiveSpan('ai-gateway.request', async (span) => {
      span.setAttributes({
        'ibex.request_id': bound.context.request_id,
        'ibex.correlation_id': bound.context.correlation_id,
        'ibex.tenant_id': bound.context.tenant_id,
        'ibex.gateway.endpoint': endpointResult.data
      });
      try {
        await this.dependencies.audit.emit(
          createSecurityAuditEvent(
            bound.context,
            this.dependencies.service,
            this.dependencies.environment,
            'gateway.request.accepted',
            now
          )
        );
        const platformResult = await this.dependencies.platform.forward({
          endpoint: endpointResult.data,
          context: bound.context,
          payload,
          trace_id: traceId
        });
        const response = gatewayResponseEnvelopeSchema.parse({
          contract_version: '1.0',
          request_id: bound.context.request_id,
          ...platformResult,
          sources: platformResult.sources ?? [],
          tools_used: platformResult.tools_used ?? [],
          warnings: platformResult.warnings ?? [],
          trace_id: traceId
        });
        span.setStatus({ code: SpanStatusCode.OK });
        return freezeResponse(response);
      } catch (error) {
        span.recordException(error instanceof Error ? error : new Error('Gateway request failed'));
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw error;
      } finally {
        span.end();
      }
    });
  }
}
