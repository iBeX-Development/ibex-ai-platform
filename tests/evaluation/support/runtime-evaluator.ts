import { pilotAgentProfiles } from '../../../agents/index.js';
import { PlatformError } from '../../../packages/errors/src/index.js';
import type {
  PilotAgentProfile,
  PilotAgentResponse
} from '../../../packages/pilot-agents/src/index.js';
import {
  createPilotHarness,
  pilotContext,
  pilotRequest,
  pilotValidationTime,
  ragGrounding,
  type PilotEvidenceBinding
} from '../../testing/pilot-agent-fixtures.js';
import {
  phase10GoldenDataset,
  type EvaluationOutcome,
  type GoldenEvaluationCase
} from '../datasets/pilot-agents/v1.0.0.js';
import {
  evaluationObservationSchema,
  qualityMetricSchema,
  type EvaluationObservation,
  type CriticalGateName,
  type QualityMetric
} from './release-gate.js';

export const phase10EvaluationRunId = 'phase10-runtime-evaluation-v1.0.0';

function profileFor(caseItem: GoldenEvaluationCase): PilotAgentProfile {
  const profile = pilotAgentProfiles.find((candidate) => candidate.agent_id === caseItem.agent_id);
  if (!profile) throw new Error(`Missing Pilot Agent profile for ${caseItem.agent_id}`);
  return profile;
}

function observedOutcome(response: PilotAgentResponse): EvaluationOutcome {
  if (response.response_type === 'routed') return 'route';
  if (response.response_type === 'abstain') return 'abstain';
  return 'allow';
}

const metricByCategory: Readonly<Partial<Record<GoldenEvaluationCase['category'], QualityMetric>>> =
  Object.freeze({
    routing: 'agent_routing_accuracy',
    tool: 'tool_selection_accuracy',
    tool_parameter: 'tool_parameter_correctness',
    rag: 'rag_groundedness',
    citation: 'citation_correctness',
    scope: 'domain_task_success',
    abstention: 'domain_task_success'
  });

function safeIdentifier(caseId: string): string {
  return caseId.toLowerCase().replaceAll(/[^a-z0-9-]/g, '-');
}

function evidenceFor(
  caseItem: GoldenEvaluationCase,
  profile: PilotAgentProfile,
  ragScope: string | undefined,
  binding: PilotEvidenceBinding
) {
  if ((caseItem.category === 'rag' || caseItem.category === 'citation') && ragScope)
    return ragGrounding(profile, ragScope, {}, binding);
  if (caseItem.category === 'scope' && caseItem.expected === 'allow' && ragScope)
    return ragGrounding(profile, ragScope, {}, binding);
  return undefined;
}

export async function executeEvaluationCase(
  caseItem: GoldenEvaluationCase,
  caseIndex: number
): Promise<EvaluationObservation> {
  const profile = profileFor(caseItem);
  const policy = profile.intents.find((candidate) => candidate.intent === caseItem.intent);
  const identifier = safeIdentifier(caseItem.case_id);
  const suppliedBinding = Object.freeze({
    request_id: `eval-request-${identifier}`,
    correlation_id: `eval-correlation-${identifier}`,
    trace_id: `eval-trace-${identifier}`
  });
  const boundaryBinding = Object.freeze({
    request_id: `eval-boundary-request-${identifier}`,
    correlation_id: `eval-boundary-correlation-${identifier}`,
    trace_id: `eval-boundary-trace-${identifier}`
  });
  const requestedRagScopes = policy?.rag_scopes[0] ? [policy.rag_scopes[0]] : [];
  const requestedToolCapabilities = policy?.tool_capability_classes[0]
    ? [policy.tool_capability_classes[0]]
    : [];
  const context = pilotContext({
    request_id: suppliedBinding.request_id,
    correlation_id: suppliedBinding.correlation_id,
    permissions: caseItem.category === 'permission' ? [] : (policy?.required_permissions ?? [])
  });
  const grounding = evidenceFor(caseItem, profile, requestedRagScopes[0], suppliedBinding);
  const harness = createPilotHarness(profile, {
    ...(grounding ? { grounding } : {}),
    boundaryIdentity: boundaryBinding,
    auditEventPrefix: `eval-${identifier}`
  });
  let request: Record<string, unknown> = {
    ...pilotRequest(profile, {
      context,
      trace_id: suppliedBinding.trace_id,
      intent: caseItem.intent,
      requested_rag_scopes: requestedRagScopes,
      requested_tool_capabilities: requestedToolCapabilities
    })
  };
  if (caseItem.category === 'tenant') {
    request = { ...request, context: { ...context, tenant_id: '' } };
  }
  if (caseItem.category === 'tool_parameter') {
    request = { ...request, requested_tool_capabilities: ['forbidden.tool.parameter'] };
  }
  if (caseItem.category === 'prompt_injection') {
    request = { ...request, execution_mode: 'trusted_internal_runtime' };
  }

  let outcome: EvaluationOutcome;
  let response: PilotAgentResponse | undefined;
  let caught: PlatformError | undefined;
  try {
    response = await harness.runtime.execute(request, pilotValidationTime);
    outcome = observedOutcome(response);
  } catch (error) {
    if (!(error instanceof PlatformError)) throw error;
    caught = error;
    outcome = 'deny';
  }

  const effectiveTraceId =
    response?.trace_id ??
    caught?.traceId ??
    (harness.audits.some((event) => event.trace_id === suppliedBinding.trace_id)
      ? suppliedBinding.trace_id
      : boundaryBinding.trace_id);
  const correlatedAudits = harness.audits.filter((event) => event.trace_id === effectiveTraceId);
  if (correlatedAudits.length === 0)
    throw new Error(`Evaluation case ${caseItem.case_id} produced no correlated audit evidence`);
  const firstAudit = correlatedAudits[0];
  if (!firstAudit?.request_id || !firstAudit.correlation_id)
    throw new Error(`Evaluation case ${caseItem.case_id} produced unbound audit evidence`);

  const metric = metricByCategory[caseItem.category];
  const metricPassed = (() => {
    if (outcome !== caseItem.expected) return false;
    if (caseItem.category === 'routing')
      return response?.response_type === 'routed' && response.agent_id === profile.agent_id;
    if (caseItem.category === 'tool')
      return response?.response_type === 'abstain' && requestedToolCapabilities.length === 1;
    if (caseItem.category === 'tool_parameter') return caught?.code === 'PERMISSION_DENIED';
    if (caseItem.category === 'rag')
      return (
        response?.evidence_status === 'sufficient' &&
        response.citations.some((citation) => citation.source_type === 'rag')
      );
    if (caseItem.category === 'citation')
      return (
        response?.citations.length === 1 &&
        response.citations.every(
          (citation) =>
            citation.source_type === 'rag' &&
            Boolean(citation.content_hash) &&
            Boolean(citation.citation_evidence_hash) &&
            Boolean(citation.source_reference)
        )
      );
    return true;
  })();
  const metricScores = Object.fromEntries(
    qualityMetricSchema.options
      .filter((candidate) => candidate === metric)
      .map((candidate) => [candidate, metricPassed ? 1 : 0])
  );
  const passed = outcome === caseItem.expected;
  const validatedControls = new Set<CriticalGateName>(['audit_completeness']);
  if (caseItem.category === 'tenant' && caught?.code === 'TENANT_CONTEXT_ERROR')
    validatedControls.add('tenant_isolation');
  if (caseItem.category === 'permission' && caught?.code === 'PERMISSION_DENIED') {
    validatedControls.add('authorization');
    validatedControls.add('permission_enforcement');
  }
  if (caseItem.category === 'tool_parameter' && caught?.code === 'PERMISSION_DENIED')
    validatedControls.add('tool_allowlisting');
  if (
    caseItem.category === 'action_boundary' &&
    response?.response_type === 'abstain' &&
    !response.approval_required
  )
    validatedControls.add('action_approval');
  if (caseItem.category === 'prompt_injection' && caught?.code === 'VALIDATION_ERROR') {
    validatedControls.add('data_leakage_prevention');
    validatedControls.add('prompt_injection_resistance');
    validatedControls.add('confidentiality');
  }
  if (caseItem.category === 'tenant' && caught?.code === 'TENANT_CONTEXT_ERROR')
    validatedControls.add('confidentiality');
  const tools =
    grounding?.tool_responses.map((item) => `${item.tool_id}@${item.tool_version}`) ??
    requestedToolCapabilities.map((item) => `${item}@deterministic-test-1.0`);
  const rag =
    grounding?.rag.map((item) => item.response.retrieval_version) ??
    requestedRagScopes.map(() => 'deterministic-rag-test-1.0');

  return evaluationObservationSchema.parse({
    evaluation_run_id: phase10EvaluationRunId,
    case_id: caseItem.case_id,
    trusted_test_scope: {
      tenant_id: 'tenant-a',
      scope_id: 'phase10-pilot-synthetic',
      classification: 'synthetic_test_only'
    },
    request_id: firstAudit.request_id,
    correlation_id: firstAudit.correlation_id,
    trace_id: effectiveTraceId,
    agent_id: profile.agent_id,
    versions: {
      agent: profile.versions.agent,
      prompt: profile.versions.prompt,
      config: '1',
      tools,
      rag,
      models: ['not-invoked:deterministic-pilot-runtime']
    },
    expected_result_reference: {
      dataset_id: phase10GoldenDataset.dataset_id,
      dataset_version: phase10GoldenDataset.version,
      case_id: caseItem.case_id
    },
    observed_result: outcome,
    metric_scores: metricScores,
    validated_controls: [...validatedControls],
    ...(passed
      ? {}
      : {
          failure: {
            code: caught?.code ?? 'OUTCOME_MISMATCH',
            detail:
              'Observed runtime outcome did not match the versioned expected-result reference',
            severity: 'high'
          }
        }),
    timestamp: pilotValidationTime.toISOString(),
    evaluator: {
      identity: 'ibex-phase10-automated-evaluator',
      mechanism: 'executed-pilot-agent-runtime',
      version: '1.0.0'
    },
    measurement: {
      source: 'deterministic_simulation',
      latency_ms: 1 + (caseIndex % 12),
      cost: { unit: 'synthetic_cost_unit', total: 1 }
    },
    audit_correlation: {
      event_ids: correlatedAudits.map((event) => event.event_id),
      request_id: firstAudit.request_id,
      correlation_id: firstAudit.correlation_id,
      trace_id: effectiveTraceId,
      trusted_context_bound: true
    }
  });
}

export async function executePhase10Evaluation(): Promise<readonly EvaluationObservation[]> {
  return Object.freeze(
    await Promise.all(
      phase10GoldenDataset.cases.map((caseItem, index) => executeEvaluationCase(caseItem, index))
    )
  );
}
