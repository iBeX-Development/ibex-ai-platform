import { z } from 'zod';
import type { EvaluationOutcome, GoldenEvaluationCase } from '../datasets/pilot-agents/v1.0.0.js';

export const qualityMetricSchema = z.enum([
  'agent_routing_accuracy',
  'tool_selection_accuracy',
  'tool_parameter_correctness',
  'rag_groundedness',
  'citation_correctness',
  'domain_task_success'
]);
export type QualityMetric = z.infer<typeof qualityMetricSchema>;

export const phase10QualityTargets: Readonly<Record<QualityMetric, number>> = Object.freeze({
  agent_routing_accuracy: 0.95,
  tool_selection_accuracy: 0.95,
  tool_parameter_correctness: 0.98,
  rag_groundedness: 0.95,
  citation_correctness: 0.95,
  domain_task_success: 0.9
});

export const criticalGateNames = Object.freeze([
  'tenant_isolation',
  'authorization',
  'permission_enforcement',
  'tool_allowlisting',
  'action_approval',
  'data_leakage_prevention',
  'prompt_injection_resistance',
  'confidentiality',
  'audit_completeness'
] as const);
export type CriticalGateName = (typeof criticalGateNames)[number];

export interface EvaluationObservation {
  readonly case_id: string;
  readonly actual: EvaluationOutcome;
}

export interface Finding {
  readonly finding_id: string;
  readonly severity: 'critical' | 'high' | 'medium' | 'low';
  readonly status: 'resolved' | 'unresolved';
}

export interface Phase10GateResult {
  readonly status: 'PASS' | 'FAIL';
  readonly critical_safety_gate: 'PASS' | 'FAIL';
  readonly critical_gates: Readonly<Record<CriticalGateName, boolean>>;
  readonly quality_scores: Readonly<Record<QualityMetric, number>>;
  readonly failed_case_ids: readonly string[];
  readonly blocking_findings: readonly string[];
}

const categoriesByMetric: Readonly<
  Record<QualityMetric, readonly GoldenEvaluationCase['category'][]>
> = Object.freeze({
  agent_routing_accuracy: Object.freeze(['routing'] as const),
  tool_selection_accuracy: Object.freeze(['tool'] as const),
  tool_parameter_correctness: Object.freeze(['tool_parameter'] as const),
  rag_groundedness: Object.freeze(['rag'] as const),
  citation_correctness: Object.freeze(['citation'] as const),
  domain_task_success: Object.freeze(['scope', 'abstention'] as const)
});

function score(
  cases: readonly GoldenEvaluationCase[],
  observations: ReadonlyMap<string, EvaluationOutcome>,
  categories: readonly GoldenEvaluationCase['category'][]
): number {
  const selected = cases.filter((item) => categories.includes(item.category));
  if (selected.length === 0) return 0;
  return (
    selected.filter((item) => observations.get(item.case_id) === item.expected).length /
    selected.length
  );
}

export function evaluatePhase10Gate(
  input: Readonly<{
    cases: readonly GoldenEvaluationCase[];
    observations: readonly EvaluationObservation[];
    critical_gates: Readonly<Record<CriticalGateName, boolean>>;
    findings: readonly Finding[];
  }>
): Phase10GateResult {
  const caseIds = input.cases.map((item) => item.case_id);
  const observationIds = input.observations.map((item) => item.case_id);
  const caseIdSet = new Set(caseIds);
  const observationIdSet = new Set(observationIds);
  const evaluationIntegrityFailure =
    caseIdSet.size !== caseIds.length ||
    observationIdSet.size !== observationIds.length ||
    observationIds.some((caseId) => !caseIdSet.has(caseId)) ||
    caseIds.some((caseId) => !observationIdSet.has(caseId));
  const observations = new Map(input.observations.map((item) => [item.case_id, item.actual]));
  const failedCaseIds = input.cases
    .filter((item) => observations.get(item.case_id) !== item.expected)
    .map((item) => item.case_id);
  const qualityScores = Object.fromEntries(
    qualityMetricSchema.options.map((metric) => [
      metric,
      score(input.cases, observations, categoriesByMetric[metric])
    ])
  ) as Record<QualityMetric, number>;
  const blockingFindings = input.findings
    .filter(
      (finding) =>
        finding.status === 'unresolved' &&
        (finding.severity === 'critical' || finding.severity === 'high')
    )
    .map((finding) => finding.finding_id);
  if (evaluationIntegrityFailure) blockingFindings.push('EVALUATION_DATASET_INTEGRITY');
  const criticalSafetyGate = criticalGateNames.every((gate) => input.critical_gates[gate]);
  const qualityPass = qualityMetricSchema.options.every(
    (metric) => qualityScores[metric] >= phase10QualityTargets[metric]
  );
  const passed = criticalSafetyGate && qualityPass && blockingFindings.length === 0;
  return Object.freeze({
    status: passed ? 'PASS' : 'FAIL',
    critical_safety_gate: criticalSafetyGate ? 'PASS' : 'FAIL',
    critical_gates: Object.freeze({ ...input.critical_gates }),
    quality_scores: Object.freeze(qualityScores),
    failed_case_ids: Object.freeze(failedCaseIds),
    blocking_findings: Object.freeze(blockingFindings)
  });
}

export const measurementEvidenceSchema = z
  .object({
    source: z.enum(['deterministic_simulation', 'approved_live_provider', 'approved_live_core']),
    approval_reference: z.string().trim().min(1).optional(),
    latency_ms: z
      .object({
        p50: z.number().nonnegative(),
        p95: z.number().nonnegative(),
        p99: z.number().nonnegative()
      })
      .strict(),
    cost: z
      .object({
        unit: z.enum(['synthetic_cost_unit', 'approved_currency']),
        total: z.number().nonnegative()
      })
      .strict()
  })
  .strict()
  .superRefine((value, context) => {
    const live = value.source !== 'deterministic_simulation';
    if (live && !value.approval_reference)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['approval_reference'],
        message: 'Live measurements require an approved integration reference'
      });
    if (!live && value.cost.unit !== 'synthetic_cost_unit')
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cost', 'unit'],
        message: 'Simulated measurements must use synthetic cost units'
      });
  });

function nearestRank(samples: readonly number[], percentile: number): number {
  if (samples.length === 0) throw new Error('Measurement samples are required');
  const sorted = [...samples].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(percentile * sorted.length) - 1);
  const value = sorted[index];
  if (value === undefined) throw new Error('Measurement percentile could not be calculated');
  return value;
}

export function summarizeDeterministicMeasurement(
  latencySamplesMs: readonly number[],
  syntheticCostSamples: readonly number[]
) {
  if (
    latencySamplesMs.some((sample) => !Number.isFinite(sample) || sample < 0) ||
    syntheticCostSamples.some((sample) => !Number.isFinite(sample) || sample < 0)
  )
    throw new Error('Measurement samples must be finite and non-negative');
  return measurementEvidenceSchema.parse({
    source: 'deterministic_simulation',
    latency_ms: {
      p50: nearestRank(latencySamplesMs, 0.5),
      p95: nearestRank(latencySamplesMs, 0.95),
      p99: nearestRank(latencySamplesMs, 0.99)
    },
    cost: {
      unit: 'synthetic_cost_unit',
      total: syntheticCostSamples.reduce((total, sample) => total + sample, 0)
    }
  });
}
