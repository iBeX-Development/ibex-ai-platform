import type { TrustedRequestContext } from '../../security/src/index.js';
import type { AgentDefinition, IntentClassification } from './contracts.js';

export interface IntentClassificationRequest {
  readonly context: TrustedRequestContext;
  readonly input: unknown;
  readonly signal: AbortSignal;
}

/** Model-independent classifier contract. Phase 3 supplies no provider implementation. */
export interface IntentClassifier {
  classify(request: IntentClassificationRequest): Promise<unknown>;
}

export interface PlanningRequest {
  readonly context: TrustedRequestContext;
  readonly input: unknown;
  readonly classification: Extract<IntentClassification, { status: 'classified' }>;
  readonly agent: AgentDefinition;
  readonly token_budget: number;
  readonly signal: AbortSignal;
}

/** Contract-only RAG planning boundary. It does not retrieve documents. */
export interface RagPlanningPort {
  plan(request: PlanningRequest): Promise<unknown>;
}

/** Contract-only Tool planning boundary. It does not execute tools or actions. */
export interface ToolPlanningPort {
  plan(request: PlanningRequest): Promise<unknown>;
}

/** Contract-only Model Gateway policy boundary. It does not call a model or provider. */
export interface ModelPolicyPort {
  select(request: PlanningRequest): Promise<unknown>;
}
