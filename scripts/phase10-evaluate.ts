import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import prettier from 'prettier';
import { phase10GoldenDataset } from '../tests/evaluation/datasets/pilot-agents/v1.0.0.js';
import {
  composePhase10Assessment,
  readFindingsRegistry
} from '../tests/evaluation/support/findings-registry.js';
import { evaluatePhase10Gate } from '../tests/evaluation/support/release-gate.js';
import { executePhase10Evaluation } from '../tests/evaluation/support/runtime-evaluator.js';

const repositoryRoot = resolve(import.meta.dirname, '..');
let evaluatedCommit = 'unavailable';
try {
  evaluatedCommit = execFileSync('git', ['rev-parse', '--verify', 'HEAD'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
} catch {
  // An unavailable revision cannot match the mandatory registry scope.
}
const findingsIntegrity = readFindingsRegistry(
  resolve(repositoryRoot, 'docs/evaluation/findings/registry.v1.json'),
  { repository: 'gt7719/ibex-ai-platform', phase: 'phase10', evaluated_commit: evaluatedCommit }
);
const observations = await executePhase10Evaluation();
const result = evaluatePhase10Gate({
  cases: phase10GoldenDataset.cases,
  observations,
  findings: findingsIntegrity.findings
});
const combined = composePhase10Assessment(result, findingsIntegrity);
const evidenceArtifact = Object.freeze({
  schema_version: '1.0.0',
  evaluation_run_id: observations[0]?.evaluation_run_id,
  dataset_reference: `${phase10GoldenDataset.dataset_id}@${phase10GoldenDataset.version}`,
  classification: 'synthetic_test_only',
  records: observations
});
const evidencePath = resolve(
  import.meta.dirname,
  '../tests/evaluation/evidence/phase10-runtime-evidence-v1.0.0.json'
);
const serializedEvidence = await prettier.format(JSON.stringify(evidenceArtifact), {
  parser: 'json',
  printWidth: 100,
  endOfLine: 'lf'
});
if (process.argv.includes('--write-evidence')) writeFileSync(evidencePath, serializedEvidence);
else if (readFileSync(evidencePath, 'utf8') !== serializedEvidence) {
  console.error('Versioned Phase 10 evaluation evidence does not match executed runtime results');
  process.exitCode = 1;
}

console.log(
  JSON.stringify(
    {
      evaluation_run_id: observations[0]?.evaluation_run_id,
      status: combined.status,
      governance_status:
        findingsIntegrity.status === 'PASS' && combined.blocking_findings.length === 0
          ? 'PASS'
          : 'BLOCKED',
      findings_integrity: {
        status: findingsIntegrity.status,
        diagnostics: findingsIntegrity.diagnostics,
        content_sha256: findingsIntegrity.content_sha256,
        evaluated_commit: evaluatedCommit
      },
      critical_safety_gate: result.critical_safety_gate,
      critical_gates: result.critical_evidence.map((evidence) => ({
        gate: evidence.gate,
        passed: evidence.passed,
        case_count: evidence.case_ids.length,
        audit_event_count: evidence.audit_event_ids.length
      })),
      quality_scores: result.quality_scores,
      observation_count: observations.length,
      unique_audit_event_count: new Set(
        observations.flatMap((record) =>
          record.audit_correlation.events.map((event) => event.event_id)
        )
      ).size,
      failed_case_ids: result.failed_case_ids,
      blocking_findings: combined.blocking_findings,
      measurement_classification: 'deterministic_simulation'
    },
    undefined,
    2
  )
);

if (combined.status !== 'PASS') process.exitCode = 1;
