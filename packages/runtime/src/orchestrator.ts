import { randomUUID } from 'node:crypto';
import { SpanStatusCode } from '@opentelemetry/api';
import {
  createOrchestratorAuditEvent,
  type AuditEventSink,
  type OrchestratorAuditStage,
  type PromptHierarchyAuditEvidence
} from '../../audit/src/index.js';
import { PlatformError } from '../../errors/src/index.js';
import { agentFeatureEnabled, type FeatureControls } from '../../configuration/src/index.js';
import { tracer } from '../../observability/src/index.js';
import { createTrustedRequestContext } from '../../security/src/index.js';
import {
  intentClassificationSchema,
  modelPolicySelectionSchema,
  orchestratorResultSchema,
  ragPlanSchema,
  routingDecisionSchema,
  toolPlanSchema,
  type AgentDefinition,
  type IntentClassification,
  type OrchestratorRequest,
  type OrchestratorResult,
  type PromptHierarchy,
  type RuntimeControlPolicy
} from './contracts.js';
import { assertContextBudget, runWithRuntimeDeadline, throwIfCancelled } from './controls.js';
import type {
  IntentClassifier,
  ModelPolicyPort,
  PlanningRequest,
  RagPlanningPort,
  ToolPlanningPort
} from './ports.js';
import type { PromptHierarchyConfiguration, PromptRegistry } from './prompts.js';
import type { AgentRegistry } from './registry.js';

export interface SharedAgentRuntimeDependencies {
  readonly featureControls: FeatureControls;
  readonly classifier: IntentClassifier;
  readonly ragPlanning: RagPlanningPort;
  readonly toolPlanning: ToolPlanningPort;
  readonly modelPolicy: ModelPolicyPort;
  readonly agents: AgentRegistry;
  readonly prompts: PromptRegistry;
  readonly promptHierarchy: PromptHierarchyConfiguration;
  readonly controls: RuntimeControlPolicy;
  readonly audit: AuditEventSink;
  readonly service: string;
  readonly environment: string;
  readonly traceIdFactory?: () => string;
}

const maximumTraceIdLength = 256;

function readTraceId(request: unknown): unknown {
  if (typeof request !== 'object' || request === null || !('trace_id' in request)) return undefined;
  return request.trace_id;
}

function validatedTraceId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  let containsControlCharacter = false;
  for (let index = 0; index < trimmed.length; index += 1) {
    const codeUnit = trimmed.charCodeAt(index);
    if (codeUnit <= 31 || codeUnit === 127) {
      containsControlCharacter = true;
      break;
    }
  }
  if (!trimmed || trimmed.length > maximumTraceIdLength || containsControlCharacter) {
    return undefined;
  }
  return trimmed;
}

function createBoundaryTraceId(factory: () => string): string {
  try {
    return validatedTraceId(factory()) ?? randomUUID();
  } catch {
    return randomUUID();
  }
}

function promptAuditEvidence(hierarchy: PromptHierarchy): PromptHierarchyAuditEvidence {
  const [masterPolicy, orchestratorPrompt, domainPrompt] = hierarchy.layers;
  const reference = (prompt: (typeof hierarchy.layers)[number]) =>
    Object.freeze({
      prompt_id: prompt.prompt_id,
      prompt_version: prompt.prompt_version,
      content_hash: prompt.content_hash
    });
  return Object.freeze({
    master_policy: reference(masterPolicy),
    orchestrator_prompt: reference(orchestratorPrompt),
    domain_prompt: reference(domainPrompt)
  });
}

function isSubset(values: readonly string[], allowed: readonly string[]): boolean {
  return values.every((value) => allowed.includes(value));
}

function freezeClassification(
  classification: Extract<IntentClassification, { status: 'classified' }>
): Extract<IntentClassification, { status: 'classified' }> {
  return Object.freeze({
    ...classification,
    required_capabilities: Object.freeze([...classification.required_capabilities])
  });
}

function planningRequest(
  request: OrchestratorRequest,
  classification: Extract<IntentClassification, { status: 'classified' }>,
  agent: AgentDefinition,
  controls: RuntimeControlPolicy,
  signal: AbortSignal
): PlanningRequest {
  return Object.freeze({
    context: request.context,
    input: request.input,
    classification,
    agent,
    token_budget: controls.token_budget,
    signal
  });
}

function freezeResult(result: OrchestratorResult): OrchestratorResult {
  if (result.status === 'fallback') return Object.freeze({ ...result });
  const [masterPrompt, orchestratorPrompt, domainPrompt] = result.decision.prompt_hierarchy.layers;
  return Object.freeze({
    status: 'routed',
    decision: Object.freeze({
      ...result.decision,
      required_capabilities: Object.freeze([...result.decision.required_capabilities]),
      rag_scopes: Object.freeze([...result.decision.rag_scopes]),
      tool_candidates: Object.freeze([...result.decision.tool_candidates]),
      prompt_hierarchy: Object.freeze({
        layers: Object.freeze([masterPrompt, orchestratorPrompt, domainPrompt] as const)
      }),
      runtime_controls: Object.freeze({
        ...result.decision.runtime_controls,
        retry_policy: Object.freeze({ ...result.decision.runtime_controls.retry_policy })
      })
    })
  });
}

export class SharedAgentRuntime {
  constructor(private readonly dependencies: SharedAgentRuntimeDependencies) {}

  async route(request: OrchestratorRequest, now: Date = new Date()): Promise<OrchestratorResult> {
    const inboundRequest: unknown = request;
    const suppliedTraceId = validatedTraceId(readTraceId(inboundRequest));
    const traceId =
      suppliedTraceId ?? createBoundaryTraceId(this.dependencies.traceIdFactory ?? randomUUID);

    return tracer.startActiveSpan('orchestrator.route', async (span) => {
      let stage: OrchestratorAuditStage = 'boundary_context';
      let trustedContext: OrchestratorRequest['context'] | undefined;
      let classification: Extract<IntentClassification, { status: 'classified' }> | undefined;
      let selectedAgent: AgentDefinition | undefined;
      let promptHierarchy: PromptHierarchy | undefined;
      span.setAttribute('ibex.orchestrator.trace_id', traceId);

      try {
        if (
          !this.dependencies.featureControls.aiPlatform ||
          !this.dependencies.featureControls.agents
        ) {
          throw new PlatformError('SERVICE_UNAVAILABLE', 'AI runtime is unavailable', 503);
        }
        if (typeof inboundRequest !== 'object' || inboundRequest === null) {
          throw new PlatformError('VALIDATION_ERROR', 'Runtime request is invalid', 400);
        }
        const candidateRequest = inboundRequest as OrchestratorRequest;
        trustedContext = createTrustedRequestContext(candidateRequest.context);
        span.setAttributes({
          'ibex.request_id': trustedContext.request_id,
          'ibex.correlation_id': trustedContext.correlation_id,
          'ibex.tenant_id': trustedContext.tenant_id,
          'ibex.user_id': trustedContext.user_id
        });

        stage = 'boundary_trace';
        if (!suppliedTraceId) {
          throw new PlatformError('VALIDATION_ERROR', 'Runtime request is invalid', 400);
        }

        const validatedRequest: OrchestratorRequest = Object.freeze({
          context: trustedContext,
          trace_id: suppliedTraceId,
          input: candidateRequest.input,
          ...(candidateRequest.requested_agent
            ? { requested_agent: candidateRequest.requested_agent }
            : {}),
          ...(candidateRequest.signal ? { signal: candidateRequest.signal } : {})
        });

        stage = 'input_budget';
        const result = await runWithRuntimeDeadline(
          async (signal) => {
            assertContextBudget(validatedRequest.input, this.dependencies.controls);
            throwIfCancelled(signal);

            stage = 'intent_classification';
            const rawClassification = await this.dependencies.classifier.classify({
              context: validatedRequest.context,
              input: validatedRequest.input,
              signal
            });
            throwIfCancelled(signal);
            const parsedClassification = intentClassificationSchema.safeParse(rawClassification);
            if (!parsedClassification.success) {
              throw new PlatformError(
                'DEPENDENCY_ERROR',
                'Intent classification could not be verified',
                503
              );
            }

            if (parsedClassification.data.status === 'unknown') {
              stage = 'audit';
              const fallback = freezeResult(
                orchestratorResultSchema.parse({
                  status: 'fallback',
                  reason: 'unknown_intent',
                  message: 'Unable to route this request safely',
                  request_id: validatedRequest.context.request_id,
                  correlation_id: validatedRequest.context.correlation_id,
                  trace_id: validatedRequest.trace_id
                })
              );
              await this.emitOutcome(validatedRequest, 'fallback', stage, now);
              return fallback;
            }
            classification = freezeClassification(parsedClassification.data);
            span.setAttributes({
              'ibex.orchestrator.intent': classification.intent,
              'ibex.orchestrator.domain': classification.domain
            });

            stage = 'agent_selection';
            selectedAgent = this.dependencies.agents.select(
              classification,
              validatedRequest.requested_agent
            );
            if (!selectedAgent) {
              stage = 'audit';
              const fallback = freezeResult(
                orchestratorResultSchema.parse({
                  status: 'fallback',
                  reason: 'no_matching_agent',
                  message: 'Unable to route this request safely',
                  request_id: validatedRequest.context.request_id,
                  correlation_id: validatedRequest.context.correlation_id,
                  trace_id: validatedRequest.trace_id
                })
              );
              await this.emitOutcome(validatedRequest, 'fallback', stage, now, classification);
              return fallback;
            }
            if (!agentFeatureEnabled(this.dependencies.featureControls, selectedAgent.agent_id)) {
              throw new PlatformError('PERMISSION_DENIED', 'Access denied', 403);
            }
            span.setAttribute('ibex.orchestrator.selected_agent', selectedAgent.agent_id);

            stage = 'authorization';
            this.dependencies.agents.authorize(
              validatedRequest.context,
              selectedAgent,
              classification.required_capabilities
            );

            stage = 'prompt_hierarchy';
            promptHierarchy = this.dependencies.prompts.resolveHierarchy(
              selectedAgent,
              this.dependencies.promptHierarchy,
              now
            );

            const plannerRequest = planningRequest(
              validatedRequest,
              classification,
              selectedAgent,
              this.dependencies.controls,
              signal
            );

            stage = 'rag_planning';
            const ragResult = ragPlanSchema.safeParse(
              await this.dependencies.ragPlanning.plan(plannerRequest)
            );
            throwIfCancelled(signal);
            if (!ragResult.success) {
              throw new PlatformError('DEPENDENCY_ERROR', 'RAG plan could not be verified', 503);
            }
            if (!isSubset(ragResult.data.scopes, selectedAgent.allowed_rag_scopes)) {
              throw new PlatformError('PERMISSION_DENIED', 'Access denied', 403);
            }
            if (ragResult.data.required && !this.dependencies.featureControls.rag) {
              throw new PlatformError('PERMISSION_DENIED', 'Access denied', 403);
            }

            stage = 'tool_planning';
            const toolResult = toolPlanSchema.safeParse(
              await this.dependencies.toolPlanning.plan(plannerRequest)
            );
            throwIfCancelled(signal);
            if (!toolResult.success) {
              throw new PlatformError('DEPENDENCY_ERROR', 'Tool plan could not be verified', 503);
            }
            if (!isSubset(toolResult.data.candidates, selectedAgent.allowed_tools)) {
              throw new PlatformError('PERMISSION_DENIED', 'Access denied', 403);
            }
            if (toolResult.data.candidates.length > 0 && !this.dependencies.featureControls.tools) {
              throw new PlatformError('PERMISSION_DENIED', 'Access denied', 403);
            }
            if (
              toolResult.data.action_class === 'proposed_action' &&
              !this.dependencies.featureControls.actionTools
            ) {
              throw new PlatformError('PERMISSION_DENIED', 'Access denied', 403);
            }

            stage = 'model_policy';
            if (!this.dependencies.featureControls.modelGateway) {
              throw new PlatformError('PERMISSION_DENIED', 'Access denied', 403);
            }
            const modelResult = modelPolicySelectionSchema.safeParse(
              await this.dependencies.modelPolicy.select(plannerRequest)
            );
            throwIfCancelled(signal);
            if (!modelResult.success) {
              throw new PlatformError(
                'DEPENDENCY_ERROR',
                'Model policy could not be verified',
                503
              );
            }
            const modelAllowed = modelResult.data.fallback
              ? this.dependencies.controls.model_fallback_allowed &&
                this.dependencies.featureControls.modelFallback &&
                selectedAgent.model_policy.fallback_policies.includes(modelResult.data.policy_id)
              : modelResult.data.policy_id === selectedAgent.model_policy.default_policy;
            if (!modelAllowed) throw new PlatformError('PERMISSION_DENIED', 'Access denied', 403);

            stage = 'output_validation';
            const decision = routingDecisionSchema.parse({
              intent: classification.intent,
              domain: classification.domain,
              selected_agent: selectedAgent.agent_id,
              agent_version: selectedAgent.version,
              required_capabilities: classification.required_capabilities,
              rag_required: ragResult.data.required,
              rag_scopes: ragResult.data.scopes,
              tool_candidates: toolResult.data.candidates,
              action_class: toolResult.data.action_class,
              risk_class: toolResult.data.risk_class,
              approval_required: toolResult.data.approval_required,
              model_policy: modelResult.data.policy_id,
              evaluation_profile: selectedAgent.evaluation_profile,
              prompt_hierarchy: promptHierarchy,
              runtime_controls: this.dependencies.controls,
              request_id: validatedRequest.context.request_id,
              correlation_id: validatedRequest.context.correlation_id,
              trace_id: validatedRequest.trace_id
            });
            const routed = freezeResult(
              orchestratorResultSchema.parse({ status: 'routed', decision })
            );

            stage = 'audit';
            await this.emitOutcome(
              validatedRequest,
              'routed',
              stage,
              now,
              classification,
              selectedAgent,
              promptHierarchy
            );
            return routed;
          },
          this.dependencies.controls,
          validatedRequest.signal
        );
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        const source =
          error instanceof PlatformError
            ? error
            : new PlatformError('INTERNAL_ERROR', 'An internal error occurred', 500);
        const correlated = new PlatformError(
          source.code,
          source.publicMessage,
          source.statusCode,
          undefined,
          traceId,
          trustedContext?.request_id
        );
        const outcome = correlated.statusCode >= 500 ? 'error' : 'rejected';
        span.setAttributes({
          'ibex.orchestrator.outcome': outcome,
          'ibex.orchestrator.stage': stage,
          'ibex.orchestrator.error_code': correlated.code
        });
        span.recordException(new Error('Orchestrator routing failed'));
        span.setStatus({ code: SpanStatusCode.ERROR });
        try {
          await this.emitOutcome(
            { trace_id: traceId, ...(trustedContext ? { context: trustedContext } : {}) },
            outcome,
            stage,
            now,
            classification,
            selectedAgent,
            promptHierarchy,
            correlated.code
          );
        } catch {
          span.addEvent('orchestrator.audit.emission_failed');
        }
        throw correlated;
      } finally {
        span.end();
      }
    });
  }

  private emitOutcome(
    request: Readonly<{ trace_id: string; context?: OrchestratorRequest['context'] }>,
    outcome: 'routed' | 'fallback' | 'rejected' | 'error',
    stage: OrchestratorAuditStage,
    now: Date,
    classification?: Extract<IntentClassification, { status: 'classified' }>,
    agent?: AgentDefinition,
    hierarchy?: PromptHierarchy,
    errorCode?: string
  ): Promise<void> {
    return this.dependencies.audit.emit(
      createOrchestratorAuditEvent({
        traceId: request.trace_id,
        service: this.dependencies.service,
        environment: this.dependencies.environment,
        outcome,
        stage,
        timestamp: now,
        ...(classification ? { intent: classification.intent, domain: classification.domain } : {}),
        ...(agent ? { selectedAgent: agent.agent_id, agentVersion: agent.version } : {}),
        ...(request.context ? { context: request.context } : {}),
        ...(hierarchy ? { promptHierarchy: promptAuditEvidence(hierarchy) } : {}),
        ...(errorCode ? { errorCode } : {})
      })
    );
  }
}
