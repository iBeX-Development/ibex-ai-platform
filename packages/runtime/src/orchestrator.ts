import { SpanStatusCode } from '@opentelemetry/api';
import {
  createOrchestratorAuditEvent,
  type AuditEventSink,
  type OrchestratorAuditStage
} from '../../audit/src/index.js';
import { PlatformError } from '../../errors/src/index.js';
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
    if (!request.trace_id.trim()) {
      throw new PlatformError('VALIDATION_ERROR', 'Runtime request is invalid', 400);
    }
    const boundRequest: OrchestratorRequest = Object.freeze({
      context: createTrustedRequestContext(request.context),
      trace_id: request.trace_id,
      input: request.input,
      ...(request.requested_agent ? { requested_agent: request.requested_agent } : {}),
      ...(request.signal ? { signal: request.signal } : {})
    });

    return tracer.startActiveSpan('orchestrator.route', async (span) => {
      let stage: OrchestratorAuditStage = 'input_budget';
      let classification: Extract<IntentClassification, { status: 'classified' }> | undefined;
      let selectedAgent: AgentDefinition | undefined;
      let promptHierarchy: PromptHierarchy | undefined;
      span.setAttributes({
        'ibex.gateway.trace_id': boundRequest.trace_id,
        'ibex.request_id': boundRequest.context.request_id,
        'ibex.correlation_id': boundRequest.context.correlation_id,
        'ibex.tenant_id': boundRequest.context.tenant_id,
        'ibex.user_id': boundRequest.context.user_id
      });

      try {
        const result = await runWithRuntimeDeadline(
          async (signal) => {
            assertContextBudget(boundRequest.input, this.dependencies.controls);
            throwIfCancelled(signal);

            stage = 'intent_classification';
            const rawClassification = await this.dependencies.classifier.classify({
              context: boundRequest.context,
              input: boundRequest.input,
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
                  request_id: boundRequest.context.request_id,
                  correlation_id: boundRequest.context.correlation_id,
                  trace_id: boundRequest.trace_id
                })
              );
              await this.emitOutcome(boundRequest, 'fallback', stage, now);
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
              boundRequest.requested_agent
            );
            if (!selectedAgent) {
              stage = 'audit';
              const fallback = freezeResult(
                orchestratorResultSchema.parse({
                  status: 'fallback',
                  reason: 'no_matching_agent',
                  message: 'Unable to route this request safely',
                  request_id: boundRequest.context.request_id,
                  correlation_id: boundRequest.context.correlation_id,
                  trace_id: boundRequest.trace_id
                })
              );
              await this.emitOutcome(boundRequest, 'fallback', stage, now, classification);
              return fallback;
            }
            span.setAttribute('ibex.orchestrator.selected_agent', selectedAgent.agent_id);

            stage = 'authorization';
            this.dependencies.agents.authorize(
              boundRequest.context,
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
              boundRequest,
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

            stage = 'model_policy';
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
              request_id: boundRequest.context.request_id,
              correlation_id: boundRequest.context.correlation_id,
              trace_id: boundRequest.trace_id
            });
            const routed = freezeResult(
              orchestratorResultSchema.parse({ status: 'routed', decision })
            );

            stage = 'audit';
            await this.emitOutcome(
              boundRequest,
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
          boundRequest.signal
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
          boundRequest.trace_id,
          boundRequest.context.request_id
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
            boundRequest,
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
    request: OrchestratorRequest,
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
        context: request.context,
        outcome,
        stage,
        timestamp: now,
        ...(classification ? { intent: classification.intent, domain: classification.domain } : {}),
        ...(agent ? { selectedAgent: agent.agent_id, agentVersion: agent.version } : {}),
        ...(hierarchy
          ? { promptVersions: hierarchy.layers.map((layer) => layer.prompt_version) }
          : {}),
        ...(errorCode ? { errorCode } : {})
      })
    );
  }
}
