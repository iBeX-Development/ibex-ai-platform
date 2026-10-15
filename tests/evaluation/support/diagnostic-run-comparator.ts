import { z } from 'zod';

const identity = z
  .string()
  .min(1)
  .refine((value) => value.trim() === value);
const digest = z
  .string()
  .length(71)
  .regex(/^sha256:[a-f0-9]{64}$/);
const metricSchema = z
  .object({
    name: identity,
    unit: identity,
    direction: z.enum(['higher_is_better', 'lower_is_better', 'neutral']),
    measurement_classification: identity,
    value_domain: z.enum(['ratio', 'finite_number'])
  })
  .strict()
  .refine((metric) => metric.value_domain !== 'ratio' || metric.unit === 'fraction');
const runSchema = z
  .object({
    source_commit: z
      .string()
      .length(40)
      .regex(/^[a-f0-9]{40}$/),
    run_id: identity,
    artifact_id: identity,
    artifact_digest: digest,
    dataset: z.object({ id: identity, version: identity, content_digest: digest }).strict(),
    population: z.array(identity).min(1),
    evaluator: z
      .object({
        id: identity,
        version: identity,
        // This deliberately narrow contract supports a flat, explicit configuration only.
        config: z
          .unknown()
          .superRefine((value, context) => {
            // Zod 3 record parsing drops this own key; reject before that parsing step.
            if (value !== null && typeof value === 'object' && Object.hasOwn(value, '__proto__'))
              context.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Configuration key __proto__ is unsupported'
              });
          })
          .pipe(
            z.record(identity, z.union([z.string(), z.number().finite(), z.boolean(), z.null()]))
          )
      })
      .strict(),
    metrics: z.array(metricSchema).min(1),
    observations: z
      .array(
        z
          .object({
            case_id: identity,
            metric_name: identity,
            value: z.number().finite()
          })
          .strict()
      )
      .min(1)
  })
  .strict();

export type DiagnosticRun = z.infer<typeof runSchema>;
type DeltaRow = z.infer<typeof metricSchema> & {
  case_id: string;
  previous: number;
  current: number;
  delta: number;
};
const ordered = (values: readonly string[]) => [...values].sort();
const equalSet = (left: readonly string[], right: readonly string[]) =>
  JSON.stringify(ordered(left)) === JSON.stringify(ordered(right));
const key = (caseId: string, metricName: string) => JSON.stringify([caseId, metricName]);

function integrity(run: DiagnosticRun): string[] {
  const issues: string[] = [];
  const population = new Set(run.population);
  const metrics = new Map(run.metrics.map((metric) => [metric.name, metric]));
  if (population.size !== run.population.length) issues.push('DUPLICATE_CASE_ID');
  if (metrics.size !== run.metrics.length) issues.push('DUPLICATE_METRIC_NAME');
  const seen = new Set<string>();
  for (const observation of run.observations) {
    const id = key(observation.case_id, observation.metric_name);
    if (seen.has(id)) issues.push('DUPLICATE_OBSERVATION');
    seen.add(id);
    const metric = metrics.get(observation.metric_name);
    if (!population.has(observation.case_id) || !metric) issues.push('UNKNOWN_OBSERVATION_KEY');
    if (metric?.value_domain === 'ratio' && (observation.value < 0 || observation.value > 1))
      issues.push('RATIO_OUT_OF_RANGE');
  }
  for (const caseId of population)
    for (const metricName of metrics.keys())
      if (!seen.has(key(caseId, metricName))) issues.push('INCOMPLETE_OBSERVATIONS');
  return ordered([...new Set(issues)]);
}

/** Diagnostic arithmetic only. Declarations do not authenticate runs or approve a baseline. */
export function compareDiagnosticRuns(previous: unknown, current: unknown) {
  const result = (
    status: 'UNESTABLISHED' | 'INVALID' | 'INCOMPARABLE' | 'COMPARED',
    diagnostics: readonly string[],
    rows: readonly DeltaRow[] = []
  ) => ({
    contract_version: '1.0.0' as const,
    diagnostic_only: true as const,
    authenticity: 'UNESTABLISHED' as const,
    baseline_approval: 'UNESTABLISHED' as const,
    status,
    diagnostics: ordered(diagnostics),
    rows
  });
  // Missing is explicit; false, zero, empty strings and malformed objects are invalid.
  const absentPrevious = previous === undefined || previous === null;
  const parsedPrevious = runSchema.safeParse(previous);
  const parsedCurrent = runSchema.safeParse(current);
  const invalid: string[] = [];
  if (!absentPrevious && !parsedPrevious.success) invalid.push('PREVIOUS_MALFORMED');
  if (!parsedCurrent.success) invalid.push('CURRENT_MALFORMED');
  if (parsedPrevious.success)
    invalid.push(...integrity(parsedPrevious.data).map((issue) => `PREVIOUS_${issue}`));
  if (parsedCurrent.success)
    invalid.push(...integrity(parsedCurrent.data).map((issue) => `CURRENT_${issue}`));
  if (invalid.length) return result('INVALID', invalid);
  if (absentPrevious) return result('UNESTABLISHED', ['PRIOR_RUN_ABSENT']);
  if (!parsedPrevious.success || !parsedCurrent.success) return result('INVALID', ['MALFORMED']);
  const before = parsedPrevious.data,
    after = parsedCurrent.data;
  const incompatible: string[] = [];
  if (
    before.run_id === after.run_id ||
    before.artifact_id === after.artifact_id ||
    before.artifact_digest === after.artifact_digest
  )
    incompatible.push('REUSED_RUN_OR_ARTIFACT');
  if (
    before.dataset.id !== after.dataset.id ||
    before.dataset.version !== after.dataset.version ||
    before.dataset.content_digest !== after.dataset.content_digest
  )
    incompatible.push('DATASET_MISMATCH');
  if (!equalSet(before.population, after.population)) incompatible.push('POPULATION_MISMATCH');
  const config = (run: DiagnosticRun) =>
    JSON.stringify(
      Object.entries(run.evaluator.config).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    );
  if (
    before.evaluator.id !== after.evaluator.id ||
    before.evaluator.version !== after.evaluator.version ||
    config(before) !== config(after)
  )
    incompatible.push('EVALUATOR_MISMATCH');
  const beforeMetrics = new Map(before.metrics.map((metric) => [metric.name, metric]));
  if (
    !equalSet(
      before.metrics.map((metric) => metric.name),
      after.metrics.map((metric) => metric.name)
    )
  )
    incompatible.push('METRIC_KEYS_MISMATCH');
  for (const metric of after.metrics) {
    const prior = beforeMetrics.get(metric.name);
    if (
      prior &&
      (prior.unit !== metric.unit ||
        prior.direction !== metric.direction ||
        prior.measurement_classification !== metric.measurement_classification ||
        prior.value_domain !== metric.value_domain)
    )
      incompatible.push(`METRIC_DEFINITION_MISMATCH:${metric.name}`);
  }
  if (incompatible.length) return result('INCOMPARABLE', incompatible);
  const beforeValues = new Map(
    before.observations.map((item) => [key(item.case_id, item.metric_name), item.value])
  );
  const afterValues = new Map(
    after.observations.map((item) => [key(item.case_id, item.metric_name), item.value])
  );
  const rows: DeltaRow[] = [];
  // No means, weighting, thresholds, percentage changes or favorable/unfavorable labels.
  for (const metricName of ordered([...beforeMetrics.keys()]))
    for (const caseId of ordered(before.population)) {
      const metric = beforeMetrics.get(metricName);
      const oldValue = beforeValues.get(key(caseId, metricName));
      const newValue = afterValues.get(key(caseId, metricName));
      if (!metric || oldValue === undefined || newValue === undefined)
        return result('INVALID', ['INCOMPLETE_OBSERVATIONS']);
      const delta = newValue - oldValue;
      if (!Number.isFinite(delta)) return result('INVALID', ['NONFINITE_DELTA']);
      rows.push({ ...metric, case_id: caseId, previous: oldValue, current: newValue, delta });
    }
  return {
    ...result('COMPARED', [], rows),
    // Copy parsed metadata, never retain mutable references into caller objects.
    previous_identity: {
      source_commit: before.source_commit,
      run_id: before.run_id,
      artifact_id: before.artifact_id,
      artifact_digest: before.artifact_digest
    },
    current_identity: {
      source_commit: after.source_commit,
      run_id: after.run_id,
      artifact_id: after.artifact_id,
      artifact_digest: after.artifact_digest
    },
    dataset: before.dataset,
    evaluator: before.evaluator,
    population: ordered(before.population)
  };
}
