import { describe, expect, it } from 'vitest';
import { compareDiagnosticRuns, type DiagnosticRun } from './support/diagnostic-run-comparator.js';

// Hand-authored synthetic arithmetic fixtures, never actual historical executions.
function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Fixture member missing');
  return value;
}
function previous(): DiagnosticRun {
  return {
    source_commit: 'a'.repeat(40),
    run_id: 'synthetic-before',
    artifact_id: 'fixture-before',
    artifact_digest: `sha256:${'1'.repeat(64)}`,
    dataset: {
      id: 'synthetic-golden',
      version: '1.0.0',
      content_digest: `sha256:${'3'.repeat(64)}`
    },
    population: ['case-b', 'case-a'],
    evaluator: {
      id: 'synthetic-evaluator',
      version: '1.0.0',
      config: { mode: 'literal', enabled: false, offset: 0 }
    },
    metrics: [
      {
        name: 'score',
        unit: 'fraction',
        direction: 'higher_is_better',
        measurement_classification: 'synthetic_fixture_only',
        value_domain: 'ratio'
      },
      {
        name: 'duration',
        unit: 'synthetic_ms',
        direction: 'lower_is_better',
        measurement_classification: 'synthetic_fixture_only',
        value_domain: 'finite_number'
      }
    ],
    observations: [
      { case_id: 'case-b', metric_name: 'score', value: 1 },
      { case_id: 'case-a', metric_name: 'score', value: 0 },
      { case_id: 'case-b', metric_name: 'duration', value: 8 },
      { case_id: 'case-a', metric_name: 'duration', value: 4 }
    ]
  };
}
function current(): DiagnosticRun {
  return {
    source_commit: 'b'.repeat(40),
    run_id: 'synthetic-after',
    artifact_id: 'fixture-after',
    artifact_digest: `sha256:${'2'.repeat(64)}`,
    dataset: {
      id: 'synthetic-golden',
      version: '1.0.0',
      content_digest: `sha256:${'3'.repeat(64)}`
    },
    population: ['case-a', 'case-b'],
    evaluator: {
      id: 'synthetic-evaluator',
      version: '1.0.0',
      config: { offset: 0, enabled: false, mode: 'literal' }
    },
    metrics: [
      {
        name: 'duration',
        unit: 'synthetic_ms',
        direction: 'lower_is_better',
        measurement_classification: 'synthetic_fixture_only',
        value_domain: 'finite_number'
      },
      {
        name: 'score',
        unit: 'fraction',
        direction: 'higher_is_better',
        measurement_classification: 'synthetic_fixture_only',
        value_domain: 'ratio'
      }
    ],
    observations: [
      { case_id: 'case-a', metric_name: 'duration', value: 4 },
      { case_id: 'case-b', metric_name: 'duration', value: 10 },
      { case_id: 'case-a', metric_name: 'score', value: 0.5 },
      { case_id: 'case-b', metric_name: 'score', value: 0.75 }
    ]
  };
}
function freezeDeep(value: unknown): void {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
}

describe('AQ11 diagnostic-only run comparator 1.0.0', () => {
  it.each([
    [
      '{"__proto__":"before"}',
      '{"__proto__":"after"}',
      ['PREVIOUS_MALFORMED', 'CURRENT_MALFORMED']
    ],
    ['{"__proto__":0}', '{}', ['PREVIOUS_MALFORMED']],
    ['{}', '{"__proto__":false}', ['CURRENT_MALFORMED']],
    ['{"__proto__":{"nested":true}}', '{}', ['PREVIOUS_MALFORMED']],
    ['{}', '{"__proto__":{"nested":true}}', ['CURRENT_MALFORMED']]
  ] as const)(
    'rejects own JSON __proto__ configuration %s versus %s',
    (beforeJson, afterJson, diagnostics) => {
      const beforeConfig: unknown = JSON.parse(beforeJson);
      const afterConfig: unknown = JSON.parse(afterJson);
      for (const [config, json] of [
        [beforeConfig, beforeJson],
        [afterConfig, afterJson]
      ] as const) {
        if (config === null || typeof config !== 'object') throw new Error('Expected JSON object');
        expect(Object.hasOwn(config, '__proto__')).toBe(json !== '{}');
      }
      const before = previous(),
        after = current();
      const beforeInput = { ...before, evaluator: { ...before.evaluator, config: beforeConfig } };
      const afterInput = { ...after, evaluator: { ...after.evaluator, config: afterConfig } };
      const snapshot = JSON.stringify([beforeInput, afterInput]);
      freezeDeep(beforeInput);
      freezeDeep(afterInput);
      expect(compareDiagnosticRuns(beforeInput, afterInput)).toMatchObject({
        status: 'INVALID',
        rows: [],
        diagnostics: [...diagnostics].sort()
      });
      expect(JSON.stringify([beforeInput, afterInput])).toBe(snapshot);
    }
  );

  it('reports exact per-case metric arithmetic, metadata and no admission decision', () => {
    const result = compareDiagnosticRuns(previous(), current());
    expect(result).toMatchObject({
      status: 'COMPARED',
      diagnostic_only: true,
      authenticity: 'UNESTABLISHED',
      baseline_approval: 'UNESTABLISHED',
      diagnostics: [],
      population: ['case-a', 'case-b'],
      previous_identity: { source_commit: 'a'.repeat(40), run_id: 'synthetic-before' },
      current_identity: { source_commit: 'b'.repeat(40), run_id: 'synthetic-after' }
    });
    expect(
      result.rows.map(
        ({
          name,
          case_id,
          previous,
          current,
          delta,
          unit,
          direction,
          measurement_classification
        }) => [name, case_id, previous, current, delta, unit, direction, measurement_classification]
      )
    ).toEqual([
      ['duration', 'case-a', 4, 4, 0, 'synthetic_ms', 'lower_is_better', 'synthetic_fixture_only'],
      ['duration', 'case-b', 8, 10, 2, 'synthetic_ms', 'lower_is_better', 'synthetic_fixture_only'],
      ['score', 'case-a', 0, 0.5, 0.5, 'fraction', 'higher_is_better', 'synthetic_fixture_only'],
      ['score', 'case-b', 1, 0.75, -0.25, 'fraction', 'higher_is_better', 'synthetic_fixture_only']
    ]);
    expect(result).not.toHaveProperty('passed');
    expect(result).not.toHaveProperty('release_admission');
  });

  it('is deterministic under every input collection permutation and does not mutate inputs', () => {
    const before = previous(),
      after = current();
    const expected = compareDiagnosticRuns(before, after);
    before.population.reverse();
    before.metrics.reverse();
    before.observations.reverse();
    after.population.reverse();
    after.metrics.reverse();
    after.observations.reverse();
    const snapshot = structuredClone({ before, after });
    freezeDeep(before);
    freezeDeep(after);
    const actual = compareDiagnosticRuns(before, after);
    expect(actual).toEqual(expected);
    expect({ before, after }).toEqual(snapshot);
    if ('dataset' in actual) actual.dataset.id = 'changed-result';
    expect({ before, after }).toEqual(snapshot);
  });

  it.each([undefined, null])(
    'leaves absent prior %j unestablished without copying current',
    (absent) => {
      expect(compareDiagnosticRuns(absent, current())).toMatchObject({
        status: 'UNESTABLISHED',
        diagnostics: ['PRIOR_RUN_ABSENT'],
        rows: []
      });
    }
  );
  it('permits distinct runs on the same commit without declaring independent execution proven', () => {
    const after = current();
    after.source_commit = 'a'.repeat(40);
    expect(compareDiagnosticRuns(previous(), after)).toMatchObject({
      status: 'COMPARED',
      authenticity: 'UNESTABLISHED'
    });
  });

  const incompatible: readonly [string, (run: DiagnosticRun) => void, string][] = [
    [
      'dataset id',
      (r) => {
        r.dataset.id = 'different';
      },
      'DATASET_MISMATCH'
    ],
    [
      'dataset version',
      (r) => {
        r.dataset.version = '2';
      },
      'DATASET_MISMATCH'
    ],
    [
      'dataset digest',
      (r) => {
        r.dataset.content_digest = `sha256:${'4'.repeat(64)}`;
      },
      'DATASET_MISMATCH'
    ],
    [
      'evaluator id',
      (r) => {
        r.evaluator.id = 'different';
      },
      'EVALUATOR_MISMATCH'
    ],
    [
      'evaluator version',
      (r) => {
        r.evaluator.version = '2';
      },
      'EVALUATOR_MISMATCH'
    ],
    [
      'config false/zero',
      (r) => {
        r.evaluator.config.enabled = 0;
      },
      'EVALUATOR_MISMATCH'
    ],
    [
      'config missing',
      (r) => {
        delete r.evaluator.config.offset;
      },
      'EVALUATOR_MISMATCH'
    ],
    [
      'unit',
      (r) => {
        required(r.metrics[0]).unit = 'seconds';
      },
      'METRIC_DEFINITION_MISMATCH:duration'
    ],
    [
      'direction',
      (r) => {
        required(r.metrics[0]).direction = 'neutral';
      },
      'METRIC_DEFINITION_MISMATCH:duration'
    ],
    [
      'classification',
      (r) => {
        required(r.metrics[0]).measurement_classification = 'claimed_live';
      },
      'METRIC_DEFINITION_MISMATCH:duration'
    ],
    [
      'value domain',
      (r) => {
        required(r.metrics[1]).value_domain = 'finite_number';
      },
      'METRIC_DEFINITION_MISMATCH:score'
    ],
    [
      'run id',
      (r) => {
        r.run_id = 'synthetic-before';
      },
      'REUSED_RUN_OR_ARTIFACT'
    ],
    [
      'artifact id',
      (r) => {
        r.artifact_id = 'fixture-before';
      },
      'REUSED_RUN_OR_ARTIFACT'
    ],
    [
      'artifact digest',
      (r) => {
        r.artifact_digest = `sha256:${'1'.repeat(64)}`;
      },
      'REUSED_RUN_OR_ARTIFACT'
    ],
    [
      'complete but different population',
      (r) => {
        r.population = ['case-a', 'case-c'];
        r.observations.forEach((o) => {
          if (o.case_id === 'case-b') o.case_id = 'case-c';
        });
      },
      'POPULATION_MISMATCH'
    ],
    [
      'complete but different metric keys',
      (r) => {
        required(r.metrics[0]).name = 'other';
        r.observations.forEach((o) => {
          if (o.metric_name === 'duration') o.metric_name = 'other';
        });
      },
      'METRIC_KEYS_MISMATCH'
    ]
  ];
  it.each(incompatible)('rejects incompatible %s without deltas', (_name, change, diagnostic) => {
    const after = current();
    change(after);
    const result = compareDiagnosticRuns(previous(), after);
    expect(result).toMatchObject({
      status: 'INCOMPARABLE',
      rows: []
    });
    expect(result.diagnostics).toContain(diagnostic);
  });
  it('rejects a copied record and identical object', () => {
    const record = current();
    for (const copy of [record, structuredClone(record)])
      expect(compareDiagnosticRuns(copy, record)).toMatchObject({
        status: 'INCOMPARABLE',
        rows: [],
        diagnostics: ['REUSED_RUN_OR_ARTIFACT']
      });
  });

  const invalid: readonly [string, (run: DiagnosticRun) => void, string][] = [
    [
      'duplicate case',
      (r) => {
        r.population.push('case-a');
      },
      'DUPLICATE_CASE_ID'
    ],
    [
      'duplicate metric',
      (r) => {
        r.metrics.push({ ...required(r.metrics[0]) });
      },
      'DUPLICATE_METRIC_NAME'
    ],
    [
      'duplicate observation',
      (r) => {
        r.observations.push({ ...required(r.observations[0]) });
      },
      'DUPLICATE_OBSERVATION'
    ],
    [
      'missing observation',
      (r) => {
        r.observations.pop();
      },
      'INCOMPLETE_OBSERVATIONS'
    ],
    [
      'unknown case',
      (r) => {
        r.observations.push({ case_id: 'unknown', metric_name: 'score', value: 0 });
      },
      'UNKNOWN_OBSERVATION_KEY'
    ],
    [
      'unknown metric',
      (r) => {
        r.observations.push({ case_id: 'case-a', metric_name: 'unknown', value: 0 });
      },
      'UNKNOWN_OBSERVATION_KEY'
    ],
    [
      'negative ratio',
      (r) => {
        required(r.observations.find((o) => o.metric_name === 'score')).value = -0.01;
      },
      'RATIO_OUT_OF_RANGE'
    ],
    [
      'ratio above one',
      (r) => {
        required(r.observations.find((o) => o.metric_name === 'score')).value = 1.01;
      },
      'RATIO_OUT_OF_RANGE'
    ],
    [
      'NaN',
      (r) => {
        required(r.observations[0]).value = NaN;
      },
      'MALFORMED'
    ],
    [
      'Infinity',
      (r) => {
        required(r.observations[0]).value = Infinity;
      },
      'MALFORMED'
    ],
    [
      'negative Infinity',
      (r) => {
        required(r.observations[0]).value = -Infinity;
      },
      'MALFORMED'
    ],
    [
      'empty population',
      (r) => {
        r.population = [];
      },
      'MALFORMED'
    ],
    [
      'empty metric set',
      (r) => {
        r.metrics = [];
      },
      'MALFORMED'
    ],
    [
      'empty observations',
      (r) => {
        r.observations = [];
      },
      'MALFORMED'
    ]
  ];
  it.each(invalid)(
    'rejects %s on either side without dropping records',
    (_name, change, diagnostic) => {
      for (const side of ['PREVIOUS', 'CURRENT']) {
        const before = previous(),
          after = current();
        change(side === 'PREVIOUS' ? before : after);
        const result = compareDiagnosticRuns(before, after);
        expect(result).toMatchObject({
          status: 'INVALID',
          rows: []
        });
        expect(result.diagnostics).toContain(`${side}_${diagnostic}`);
      }
    }
  );
  it.each([
    false,
    0,
    '',
    {},
    [],
    'run',
    { ...current(), extra: true },
    { ...current(), source_commit: 'not-a-commit' },
    { ...current(), source_commit: 'b'.repeat(40) + '\n' },
    { ...current(), artifact_digest: 'invalid' },
    { ...current(), artifact_digest: `sha256:${'2'.repeat(64)}\n` },
    { ...current(), evaluator: { id: 'e', version: '1', config: { missing: undefined } } },
    { ...current(), observations: [{ case_id: 'case-a', metric_name: 'score' }] },
    { ...current(), observations: [{ case_id: 'case-a', metric_name: 'score', value: '0' }] }
  ])('rejects malformed input %j on either side', (malformed) => {
    expect(compareDiagnosticRuns(malformed, current())).toMatchObject({
      status: 'INVALID',
      rows: [],
      diagnostics: ['PREVIOUS_MALFORMED']
    });
    expect(compareDiagnosticRuns(previous(), malformed)).toMatchObject({
      status: 'INVALID',
      rows: [],
      diagnostics: ['CURRENT_MALFORMED']
    });
  });
  it.each(Object.keys(current()))('rejects missing required field %s on either side', (field) => {
    const incomplete: Record<string, unknown> = Object.fromEntries(
      Object.entries(current()).filter(([key]) => key !== field)
    );
    expect(compareDiagnosticRuns(incomplete, current())).toMatchObject({
      status: 'INVALID',
      rows: [],
      diagnostics: ['PREVIOUS_MALFORMED']
    });
    expect(compareDiagnosticRuns(previous(), incomplete)).toMatchObject({
      status: 'INVALID',
      rows: [],
      diagnostics: ['CURRENT_MALFORMED']
    });
  });
  it('does not hide an invalid current run behind absent prior', () => {
    expect(compareDiagnosticRuns(undefined, null)).toMatchObject({
      status: 'INVALID',
      rows: [],
      diagnostics: ['CURRENT_MALFORMED']
    });
  });
  it('rejects finite operands whose subtraction overflows, without partial deltas', () => {
    const before = previous(),
      after = current();
    required(before.observations.find((o) => o.metric_name === 'duration')).value =
      -Number.MAX_VALUE;
    required(
      after.observations.find((o) => o.metric_name === 'duration' && o.case_id === 'case-b')
    ).value = Number.MAX_VALUE;
    expect(compareDiagnosticRuns(before, after)).toMatchObject({
      status: 'INVALID',
      rows: [],
      diagnostics: ['NONFINITE_DELTA']
    });
  });
});
