import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { assessFindingsRegistry, type FindingsRegistry } from './support/findings-registry.js';
import { assessPhase10 } from './support/phase10-assessment.js';
import type { EvaluationObservation } from './support/release-gate.js';
import { executePhase10Evaluation } from './support/runtime-evaluator.js';

const root = resolve(import.meta.dirname, '../..');
const scope = {
  repository: 'gt7719/ibex-ai-platform',
  phase: 'phase10',
  evaluated_commit: 'a'.repeat(40)
};
function fixture(): FindingsRegistry {
  return {
    schema_version: '1.0.0',
    registry_id: 'synthetic',
    revision: 1,
    ...scope,
    repository: 'gt7719/ibex-ai-platform',
    phase: 'phase10',
    completeness: 'unknown',
    review_state: 'unreviewed',
    sources: [
      { source_id: 'source', reference: 'https://example.invalid/source', coverage: 'partial' }
    ],
    evidence: [
      {
        evidence_id: 'evidence',
        source_id: 'source',
        reference: 'https://example.invalid/evidence'
      }
    ],
    findings: [
      {
        finding_id: 'UNKNOWN-1',
        revision: 1,
        severity: 'unknown',
        status: 'unreviewed',
        source_refs: ['source'],
        evidence_refs: ['evidence'],
        remediation_refs: [],
        verification_refs: []
      }
    ]
  };
}
const registry = (value = fixture()) => assessFindingsRegistry(JSON.stringify(value), scope);
let observations: readonly EvaluationObservation[];
beforeAll(async () => {
  observations = await executePhase10Evaluation();
});

describe('engineering and release composition', () => {
  it('allows only engineering PASS for structurally valid unknown, incomplete, unreviewed data', () => {
    const result = assessPhase10({ observations, registry: registry(), evidence_parity: 'MATCH' });
    expect(result.engineering).toEqual({ status: 'PASS', diagnostics: [] });
    expect(result.findings_knowledge).toMatchObject({
      status: 'UNESTABLISHED',
      unknown_finding_ids: ['UNKNOWN-1']
    });
    expect(result.findings_knowledge.diagnostics).toEqual(
      expect.arrayContaining([
        'SOURCE_COVERAGE_INCOMPLETE',
        'REGISTRY_UNREVIEWED',
        'UNKNOWN_SEVERITY:UNKNOWN-1',
        'INDEPENDENT_AUTHORITY_UNCONFIGURED',
        'CLASSIFICATION_NOT_AUTHENTICATED:UNKNOWN-1'
      ])
    );
    expect(result.release_admission).toMatchObject({
      status: 'BLOCKED',
      artifact_binding: 'UNESTABLISHED'
    });
  });

  it.each(['critical', 'quality', 'missing observation', 'missing audit', 'wrong agent'] as const)(
    '%s runtime regression fails engineering and release',
    (failure) => {
      const changed = structuredClone(observations);
      const first = changed[0];
      if (!first) throw new Error('Missing synthetic observation');
      const altered =
        failure === 'missing observation'
          ? changed.slice(1)
          : changed.map((item, i) => {
              if (failure === 'quality')
                return {
                  ...item,
                  metric_scores: { ...item.metric_scores, agent_routing_accuracy: 0 }
                };
              if (i !== 0) return item;
              if (failure === 'wrong agent') return { ...item, agent_id: 'unrelated-agent' };
              if (failure === 'missing audit')
                return { ...item, audit_correlation: { ...item.audit_correlation, events: [] } };
              return {
                ...item,
                failure: {
                  code: 'SYNTHETIC_FAILURE',
                  detail: 'Negative test',
                  severity: 'critical' as const
                }
              };
            });
      const result = assessPhase10({
        observations: altered,
        registry: registry(),
        evidence_parity: 'MATCH'
      });
      expect(result.runtime.status).toBe('FAIL');
      expect(result.engineering.status).toBe('FAIL');
      expect(result.release_admission.status).toBe('BLOCKED');
    }
  );

  it.each(['MISMATCH', 'UNAVAILABLE'] as const)(
    'fails both stages on %s evidence',
    (evidence_parity) => {
      const result = assessPhase10({ observations, registry: registry(), evidence_parity });
      expect(result.runtime.status).toBe('PASS');
      expect(result.engineering.status).toBe('FAIL');
      expect(result.engineering.diagnostics).toContain(`EXECUTED_EVIDENCE_${evidence_parity}`);
      expect(result.release_admission.status).toBe('BLOCKED');
    }
  );

  it.each(['malformed', 'duplicate', 'broken source', 'broken evidence', 'contradictory'])(
    'never admits %s registry as engineering PASS',
    (failure) => {
      const value = fixture();
      const finding = value.findings[0];
      if (!finding) throw new Error('Missing synthetic finding');
      if (failure === 'duplicate') value.findings.push({ ...finding });
      if (failure === 'broken source') finding.source_refs = ['missing'];
      if (failure === 'broken evidence') finding.evidence_refs = ['missing'];
      if (failure === 'contradictory') finding.remediation_refs = ['evidence'];
      const integrity =
        failure === 'malformed' ? assessFindingsRegistry('{', scope) : registry(value);
      const result = assessPhase10({ observations, registry: integrity, evidence_parity: 'MATCH' });
      expect(integrity.technical_status).toBe('FAIL');
      expect(result.engineering.status).toBe('FAIL');
      expect(result.release_admission.status).toBe('BLOCKED');
    }
  );

  it.each(['high', 'critical'] as const)(
    'preserves the unresolved %s block in both stages',
    (severity) => {
      const value = fixture();
      const finding = value.findings[0];
      if (!finding) throw new Error('Missing synthetic finding');
      finding.severity = severity;
      finding.status = 'open';
      const result = assessPhase10({
        observations,
        registry: registry(value),
        evidence_parity: 'MATCH'
      });
      expect(result.runtime.blocking_findings).toContain('UNKNOWN-1');
      expect(result.engineering.status).toBe('FAIL');
      expect(result.release_admission.status).toBe('BLOCKED');
    }
  );

  it('keeps scope mismatch visible without accepting a parent or equivalent tree', () => {
    const value = fixture();
    value.evaluated_commit = 'b'.repeat(40);
    const result = assessPhase10({
      observations,
      registry: registry(value),
      evidence_parity: 'MATCH'
    });
    expect(result.engineering.status).toBe('PASS');
    expect(result.findings_knowledge.issues).toContainEqual({
      code: 'SCOPE_MISMATCH',
      kind: 'binding'
    });
    expect(result.release_admission.diagnostics).toContain('SCOPE_MISMATCH');
    expect(result.release_admission.status).toBe('BLOCKED');
  });

  it('does not equate synthetic registry approval with release-artifact authorization', () => {
    const value = fixture();
    value.completeness = 'complete';
    value.review_state = 'reviewed';
    for (const source of value.sources) source.coverage = 'complete';
    for (const finding of value.findings) {
      finding.severity = 'low';
      finding.status = 'open';
    }
    const integrity = assessFindingsRegistry(JSON.stringify(value), scope, {
      verifyCurrent: () => true
    });
    expect(integrity.status).toBe('PASS');
    const result = assessPhase10({ observations, registry: integrity, evidence_parity: 'MATCH' });
    expect(result.engineering.status).toBe('PASS');
    expect(result.release_admission).toEqual({
      status: 'BLOCKED',
      artifact_binding: 'UNESTABLISHED',
      diagnostics: ['RELEASE_ARTIFACT_BINDING_UNESTABLISHED']
    });
  });
});

describe('real commands and independent CI jobs', () => {
  it.each([
    ['phase10-validate-engineering.ts', 0, 'engineering', 'PASS'],
    ['phase10-evaluate.ts', 1, 'release', 'FAIL']
  ] as const)(
    '%s cannot select fixture approval or force release',
    (script, exit, stage, status) => {
      const result = spawnSync(
        process.execPath,
        [
          '--import',
          'tsx',
          `scripts/${script}`,
          '--stage=engineering',
          '--release-status=PASS',
          '--findings-fixture=synthetic',
          '--findings-authority=synthetic'
        ],
        {
          cwd: root,
          encoding: 'utf8',
          timeout: 20_000,
          env: {
            ...process.env,
            IBEX_FINDINGS_FIXTURE: 'synthetic',
            IBEX_FINDINGS_AUTHORITY: 'synthetic',
            IBEX_RELEASE_STATUS: 'PASS'
          }
        }
      );
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(exit);
      const output: unknown = JSON.parse(result.stdout);
      expect(output).toMatchObject({
        command_stage: stage,
        status,
        engineering: { status: 'PASS' },
        findings_knowledge: {
          status: 'UNESTABLISHED',
          unknown_finding_ids: expect.arrayContaining(['F06', 'F07', 'F08', 'F09']) as unknown
        },
        release_admission: { status: 'BLOCKED', artifact_binding: 'UNESTABLISHED' },
        governance_status: 'BLOCKED',
        evidence_parity: 'MATCH',
        observation_count: 44,
        unique_audit_event_count: 68,
        findings_integrity: {
          diagnostics: expect.arrayContaining([
            'INDEPENDENT_AUTHORITY_UNCONFIGURED',
            'SCOPE_MISMATCH'
          ]) as unknown
        }
      });
    },
    30_000
  );

  it.each([
    ['phase10-validate-engineering.ts', 'MISMATCH'],
    ['phase10-validate-engineering.ts', 'UNAVAILABLE'],
    ['phase10-evaluate.ts', 'MISMATCH'],
    ['phase10-evaluate.ts', 'UNAVAILABLE']
  ])(
    '%s exits 1 when executed evidence is %s',
    (script, parity) => {
      const harness = `
      import fs from 'node:fs';
      import { syncBuiltinESMExports } from 'node:module';
      const read = fs.readFileSync;
      fs.readFileSync = function(path, ...args) {
        if (String(path).endsWith('/evidence/phase10-runtime-evidence-v1.0.0.json')) {
          if (${JSON.stringify(parity)} === 'UNAVAILABLE') throw new Error('Synthetic missing evidence');
          return '{}';
        }
        return read.call(this, path, ...args);
      };
      syncBuiltinESMExports();
      await import(${JSON.stringify(`../../scripts/${script}`)});
    `;
      const result = spawnSync(
        process.execPath,
        ['--import', 'tsx', '--input-type=module', '--eval', harness],
        {
          cwd: import.meta.dirname,
          encoding: 'utf8',
          timeout: 20_000
        }
      );
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      const output: unknown = JSON.parse(result.stdout);
      expect(output).toMatchObject({
        status: 'FAIL',
        evidence_parity: parity,
        engineering: {
          status: 'FAIL',
          diagnostics: expect.arrayContaining([`EXECUTED_EVIDENCE_${parity}`]) as unknown
        },
        release_admission: { status: 'BLOCKED' }
      });
    },
    30_000
  );

  it('retains every engineering command and runs release in an independent job', () => {
    const workflow = readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8');
    const engineering = workflow.split('  validate:\n')[1]?.split('  release-admission:\n')[0];
    const release = workflow
      .split('  release-admission:\n')[1]
      ?.split('  container-foundation:\n')[0];
    expect(engineering).toBeDefined();
    expect(release).toBeDefined();
    for (const command of [
      'format:check',
      'lint',
      'typecheck',
      'validate:phase10:engineering',
      'test',
      'build',
      'scan:dependency',
      'scan:secret',
      'scan:direct-core-db',
      'scan:provider-coupling',
      'scan:evaluation-leakage',
      'scan:phase11-scope'
    ]) {
      expect(engineering).toContain(`run: pnpm ${command}\n`);
    }
    expect(engineering).not.toContain('evaluate:phase10');
    expect(engineering).not.toMatch(/needs:|if:|continue-on-error/);
    expect(release).toContain('run: pnpm evaluate:phase10:release\n');
    expect(release).not.toMatch(/needs:|if:|continue-on-error/);
    expect(workflow).not.toContain('continue-on-error');
    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.validate).toBe(
      'corepack pnpm format:check && corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && corepack pnpm build && corepack pnpm scan:phase10 && corepack pnpm validate:phase10:engineering'
    );
    expect(pkg.scripts['evaluate:phase10']).toBe('tsx scripts/phase10-evaluate.ts');
    expect(pkg.scripts['evaluate:phase10:release']).toBe(pkg.scripts['evaluate:phase10']);
  });
});
