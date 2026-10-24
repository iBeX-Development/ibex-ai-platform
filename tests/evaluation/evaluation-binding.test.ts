import { beforeAll, describe, expect, it } from 'vitest';
import { phase10GoldenDataset } from './datasets/pilot-agents/v1.0.0.js';
import { evaluatePhase10Gate, type EvaluationObservation } from './support/release-gate.js';
import { executePhase10Evaluation } from './support/runtime-evaluator.js';

let observations: readonly EvaluationObservation[];
beforeAll(async () => {
  observations = await executePhase10Evaluation();
});
const gate = (records: readonly EvaluationObservation[]) =>
  evaluatePhase10Gate({
    cases: phase10GoldenDataset.cases,
    observations: records,
    findings: []
  });
function tool(record: EvaluationObservation) {
  if (!record.tool_execution) throw new Error('Expected executed Tool evidence');
  return record.tool_execution;
}
function otherTool(record: EvaluationObservation) {
  const other = observations.find((item) => item.case_id !== record.case_id && item.tool_execution);
  if (!other) throw new Error('Expected another Tool case');
  return tool(other);
}
type Mutation = (record: EvaluationObservation) => EvaluationObservation;
const mutations: readonly [string, Mutation][] = [
  ['agent identity', (r) => ({ ...r, agent_id: 'different-agent' })],
  [
    'dataset identity',
    (r) => ({
      ...r,
      expected_result_reference: { ...r.expected_result_reference, dataset_id: 'different-dataset' }
    })
  ],
  [
    'dataset version',
    (r) => ({
      ...r,
      expected_result_reference: {
        ...r.expected_result_reference,
        dataset_version: 'different-version'
      }
    })
  ],
  ['run identity', (r) => ({ ...r, evaluation_run_id: 'different-run' })],
  [
    'case reference',
    (r) => ({
      ...r,
      expected_result_reference: { ...r.expected_result_reference, case_id: 'different-case' }
    })
  ],
  [
    'equal unrelated tool hashes',
    (r) => ({
      ...r,
      tool_execution: {
        ...tool(r),
        expected_input_hash: `sha256:${'a'.repeat(64)}`,
        observed_input_hash: `sha256:${'a'.repeat(64)}`
      }
    })
  ],
  [
    'duplicate tool references',
    (r) => ({
      ...r,
      tool_execution: {
        ...tool(r),
        audit_event_ids: [...tool(r).audit_event_ids, ...tool(r).audit_event_ids]
      }
    })
  ],
  [
    'dangling tool references',
    (r) => ({ ...r, tool_execution: { ...tool(r), audit_event_ids: ['nonexistent-event'] } })
  ],
  [
    'foreign-case tool references',
    (r) => ({ ...r, tool_execution: { ...tool(r), audit_event_ids: otherTool(r).audit_event_ids } })
  ],
  [
    'agent event substituted for tool references',
    (r) => ({
      ...r,
      tool_execution: {
        ...tool(r),
        audit_event_ids: r.audit_correlation.events
          .filter((e) => e.event_type !== 'tool_runtime.execution.outcome')
          .map((e) => e.event_id)
      }
    })
  ],
  [
    'missing tool events with unrelated agent event retained',
    (r) => ({
      ...r,
      audit_correlation: {
        ...r.audit_correlation,
        events: r.audit_correlation.events.filter(
          (e) => e.event_type !== 'tool_runtime.execution.outcome'
        )
      }
    })
  ],
  [
    'missing successful execution and its reference',
    (r) => {
      const removed = new Set(
        r.audit_correlation.events
          .filter(
            (e) => e.event_type === 'tool_runtime.execution.outcome' && e.outcome === 'succeeded'
          )
          .map((e) => e.event_id)
      );
      return {
        ...r,
        tool_execution: {
          ...tool(r),
          audit_event_ids: tool(r).audit_event_ids.filter((id) => !removed.has(id))
        },
        audit_correlation: {
          ...r.audit_correlation,
          events: r.audit_correlation.events.filter((e) => !removed.has(e.event_id))
        }
      };
    }
  ],
  ...(['tool_id', 'tool_version', 'stage', 'outcome'] as const).map((key): [string, Mutation] => [
    `tool event ${key}`,
    (r) => ({
      ...r,
      audit_correlation: {
        ...r.audit_correlation,
        events: r.audit_correlation.events.map((e) =>
          e.event_type === 'tool_runtime.execution.outcome' ? { ...e, [key]: 'unrelated' } : e
        )
      }
    })
  ])
];

describe('strict evaluation evidence binding', () => {
  it('accepts valid generated evidence', () => {
    expect(gate(observations).status).toBe('PASS');
  });
  it.each(mutations)('rejects %s', (_name, mutate) => {
    const target = observations.find((r) => r.tool_execution);
    if (!target) throw new Error('Expected a Tool case');
    const result = gate(observations.map((r) => (r === target ? mutate(r) : r)));
    expect(result.status).toBe('FAIL');
    expect(result.blocking_findings).toContain('EVALUATION_EVIDENCE_INTEGRITY');
    expect(result.failed_case_ids).toContain(target.case_id);
  });
  it('rejects a consistently substituted run, not merely mixed runs', () => {
    expect(
      gate(observations.map((r) => ({ ...r, evaluation_run_id: 'different-run' }))).status
    ).toBe('FAIL');
  });
  it('rejects unexpected Tool evidence on a non-Tool case', () => {
    const donor = observations.find((r) => r.tool_execution);
    const target = observations.find((r) => !r.tool_execution);
    if (!donor || !target) throw new Error('Expected Tool and non-Tool cases');
    expect(
      gate(observations.map((r) => (r === target ? { ...r, tool_execution: tool(donor) } : r)))
        .status
    ).toBe('FAIL');
  });
});
