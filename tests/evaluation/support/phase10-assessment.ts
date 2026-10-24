import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import prettier from 'prettier';
import { phase10GoldenDataset } from '../datasets/pilot-agents/v1.0.0.js';
import { readFindingsRegistry, type RegistryAssessment } from './findings-registry.js';
import {
  evaluatePhase10Gate,
  phase10ExpectedRun,
  type EvaluationObservation
} from './release-gate.js';
import { executePhase10Evaluation } from './runtime-evaluator.js';

export type EvidenceParity = 'MATCH' | 'MISMATCH' | 'UNAVAILABLE';

export function assessPhase10(
  input: Readonly<{
    observations: readonly EvaluationObservation[];
    registry: RegistryAssessment;
    evidence_parity: EvidenceParity;
  }>
) {
  const { registry } = input;
  // Always use the assessed registry projection. Structural failure cannot be
  // converted to technical success by its empty projection; unknown IDs stay visible.
  const runtime = evaluatePhase10Gate({
    cases: phase10GoldenDataset.cases,
    expected_run: phase10ExpectedRun,
    observations: input.observations,
    findings: registry.findings
  });
  const engineeringDiagnostics = [
    ...registry.issues
      .filter((issue) => issue.kind === 'structural' || issue.kind === 'reference')
      .map((issue) => (issue.finding_id ? `${issue.code}:${issue.finding_id}` : issue.code)),
    ...(runtime.status === 'FAIL' ? ['RUNTIME_GATE_FAILED'] : []),
    ...(input.evidence_parity !== 'MATCH' ? [`EXECUTED_EVIDENCE_${input.evidence_parity}`] : [])
  ];
  const engineeringStatus =
    engineeringDiagnostics.length === 0 && registry.technical_status === 'PASS' ? 'PASS' : 'FAIL';
  return {
    engineering: { status: engineeringStatus, diagnostics: engineeringDiagnostics },
    findings_knowledge: {
      status: registry.status === 'PASS' ? 'ESTABLISHED' : 'UNESTABLISHED',
      unknown_finding_ids: registry.unknown_finding_ids,
      issues: registry.issues,
      diagnostics: registry.diagnostics
    },
    // No independent release-artifact admission adapter exists. Neither a matching
    // Git label nor the disconnected comparator authenticates executed bytes.
    // Even synthetic registry approval cannot establish this separate requirement.
    release_admission: {
      status: 'BLOCKED',
      artifact_binding: 'UNESTABLISHED',
      diagnostics: [
        ...engineeringDiagnostics,
        ...registry.diagnostics,
        'RELEASE_ARTIFACT_BINDING_UNESTABLISHED'
      ]
    },
    evidence_parity: input.evidence_parity,
    runtime
  } as const;
}

export async function runPhase10Command(
  stage: 'engineering' | 'release',
  writeEvidence = false
): Promise<0 | 1> {
  const root = resolve(import.meta.dirname, '../../..');
  let evaluatedCommit = 'unavailable';
  try {
    evaluatedCommit = execFileSync('git', ['rev-parse', '--verify', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
  } catch {
    // An unavailable Git label cannot satisfy the registry scope check.
  }
  // Fixed input, no authority/fixture/path selector and no parent-SHA substitution.
  const registry = readFindingsRegistry(
    resolve(root, 'docs/evaluation/findings/registry.v1.json'),
    {
      repository: 'iBeX-Development/ibex-ai-platform',
      phase: 'phase10',
      evaluated_commit: evaluatedCommit
    }
  );
  const observations = await executePhase10Evaluation();
  const serializedEvidence = await prettier.format(
    JSON.stringify({
      schema_version: '1.0.0',
      evaluation_run_id: observations[0]?.evaluation_run_id,
      dataset_reference: `${phase10GoldenDataset.dataset_id}@${phase10GoldenDataset.version}`,
      classification: 'synthetic_test_only',
      records: observations
    }),
    { parser: 'json', printWidth: 100, endOfLine: 'lf' }
  );
  const evidencePath = resolve(
    root,
    'tests/evaluation/evidence/phase10-runtime-evidence-v1.0.0.json'
  );
  let parity: EvidenceParity;
  try {
    parity = readFileSync(evidencePath, 'utf8') === serializedEvidence ? 'MATCH' : 'MISMATCH';
  } catch {
    parity = 'UNAVAILABLE';
  }
  // Regeneration does not erase a mismatch observed by this invocation.
  if (stage === 'release' && writeEvidence) writeFileSync(evidencePath, serializedEvidence);
  const assessment = assessPhase10({ observations, registry, evidence_parity: parity });
  const { runtime } = assessment;
  const status = stage === 'engineering' ? assessment.engineering.status : 'FAIL';
  console.log(
    JSON.stringify(
      {
        command_stage: stage,
        status,
        engineering: assessment.engineering,
        findings_knowledge: assessment.findings_knowledge,
        release_admission: assessment.release_admission,
        evidence_parity: parity,
        evaluation_run_id: observations[0]?.evaluation_run_id,
        governance_status: assessment.release_admission.status,
        findings_integrity: {
          status: registry.status,
          technical_status: registry.technical_status,
          diagnostics: registry.diagnostics,
          content_sha256: registry.content_sha256,
          evaluated_commit: evaluatedCommit
        },
        critical_safety_gate: runtime.critical_safety_gate,
        critical_gates: runtime.critical_evidence.map((evidence) => ({
          gate: evidence.gate,
          passed: evidence.passed,
          case_count: evidence.case_ids.length,
          audit_event_count: evidence.audit_event_ids.length
        })),
        quality_scores: runtime.quality_scores,
        observation_count: observations.length,
        unique_audit_event_count: new Set(
          observations.flatMap((record) =>
            record.audit_correlation.events.map((event) => event.event_id)
          )
        ).size,
        failed_case_ids: runtime.failed_case_ids,
        blocking_findings: registry.findings
          .filter(
            (finding) =>
              finding.status === 'unresolved' && ['high', 'critical'].includes(finding.severity)
          )
          .map((finding) => finding.finding_id),
        runtime_blockers: runtime.blocking_findings,
        measurement_classification: 'deterministic_simulation'
      },
      undefined,
      2
    )
  );
  return status === 'PASS' ? 0 : 1;
}
