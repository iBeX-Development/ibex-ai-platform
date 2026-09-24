import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pilotAgentProfiles } from '../../agents/index.js';
import { loadConfig } from '../../packages/configuration/src/index.js';
import { validTestEnvironment } from '../../packages/testing/src/index.js';
import { phase10GoldenDataset } from './datasets/pilot-agents/v1.0.0.js';
import {
  criticalGateNames,
  evaluatePhase10Gate,
  measurementEvidenceSchema,
  phase10QualityTargets,
  summarizeDeterministicMeasurement,
  type CriticalGateName,
  type EvaluationObservation
} from './support/release-gate.js';

function deterministicOutcome(item: (typeof phase10GoldenDataset.cases)[number]) {
  if (item.category === 'routing') return 'route' as const;
  if (['tenant', 'permission', 'tool_parameter', 'prompt_injection'].includes(item.category))
    return 'deny' as const;
  if (['tool', 'abstention', 'action_boundary'].includes(item.category)) return 'abstain' as const;
  if (item.category === 'scope' && ['asset', 'warehouse'].includes(item.agent_id))
    return 'abstain' as const;
  return 'allow' as const;
}

const observations: readonly EvaluationObservation[] = Object.freeze(
  phase10GoldenDataset.cases.map((item) => ({
    case_id: item.case_id,
    actual: deterministicOutcome(item)
  }))
);
const passingCriticalGates = Object.freeze(
  Object.fromEntries(criticalGateNames.map((name) => [name, true]))
) as Readonly<Record<CriticalGateName, boolean>>;

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry);
    return statSync(path).isDirectory() ? sourceFiles(path) : path.endsWith('.ts') ? [path] : [];
  });
}

describe('Phase 10 hardening gate', () => {
  it('keeps the versioned golden dataset synthetic, complete, unique, and profile-linked', () => {
    expect(phase10GoldenDataset).toMatchObject({
      dataset_id: 'ibex-pilot-hardening',
      version: '1.0.0',
      classification: 'synthetic_test_only'
    });
    expect(new Set(phase10GoldenDataset.cases.map((item) => item.case_id)).size).toBe(
      phase10GoldenDataset.cases.length
    );
    for (const profile of pilotAgentProfiles) {
      const cases = phase10GoldenDataset.cases.filter((item) => item.agent_id === profile.agent_id);
      expect(cases).toHaveLength(11);
      expect(new Set(cases.map((item) => item.category)).size).toBe(11);
      expect(profile.versions.evaluation_dataset).toBe(phase10GoldenDataset.version);
    }
  });

  it('keeps golden labels outside runtime, prompts, RAG, Tool, and agent import paths', () => {
    const repositoryRoot = resolve(import.meta.dirname, '../..');
    const runtimeRoots = ['agents', 'apps', 'packages'].map((path) => join(repositoryRoot, path));
    for (const root of runtimeRoots) {
      for (const file of sourceFiles(root)) {
        const content = readFileSync(file, 'utf8');
        expect(content, relative(repositoryRoot, file)).not.toMatch(/tests[\\/]evaluation/);
        expect(content, relative(repositoryRoot, file)).not.toContain('GEN-SCOPE-001');
        expect(content, relative(repositoryRoot, file)).not.toContain('expected:');
      }
    }
  });

  it('passes every critical gate and all approved quality thresholds', () => {
    const result = evaluatePhase10Gate({
      cases: phase10GoldenDataset.cases,
      observations,
      critical_gates: passingCriticalGates,
      findings: []
    });
    expect(result.status).toBe('PASS');
    expect(result.critical_safety_gate).toBe('PASS');
    expect(result.failed_case_ids).toEqual([]);
    for (const [metric, target] of Object.entries(phase10QualityTargets))
      expect(
        result.quality_scores[metric as keyof typeof result.quality_scores]
      ).toBeGreaterThanOrEqual(target);
  });

  it('never conditionally accepts a failed critical gate or unresolved High finding', () => {
    const failedCritical = evaluatePhase10Gate({
      cases: phase10GoldenDataset.cases,
      observations,
      critical_gates: { ...passingCriticalGates, tenant_isolation: false },
      findings: []
    });
    expect(failedCritical.status).toBe('FAIL');
    expect(failedCritical.critical_safety_gate).toBe('FAIL');

    const unresolvedHigh = evaluatePhase10Gate({
      cases: phase10GoldenDataset.cases,
      observations,
      critical_gates: passingCriticalGates,
      findings: [{ finding_id: 'P10-HIGH-001', severity: 'high', status: 'unresolved' }]
    });
    expect(unresolvedHigh.status).toBe('FAIL');
    expect(unresolvedHigh.blocking_findings).toEqual(['P10-HIGH-001']);
  });

  it('fails closed for missing, duplicate, or unknown evaluation observations', () => {
    const first = observations[0];
    if (!first) throw new Error('Expected a deterministic observation');
    for (const invalid of [
      observations.slice(1),
      [...observations, first],
      [...observations, { case_id: 'UNKNOWN-CASE', actual: 'deny' as const }]
    ]) {
      const result = evaluatePhase10Gate({
        cases: phase10GoldenDataset.cases,
        observations: invalid,
        critical_gates: passingCriticalGates,
        findings: []
      });
      expect(result.status).toBe('FAIL');
      expect(result.blocking_findings).toContain('EVALUATION_DATASET_INTEGRITY');
    }
  });

  it('labels deterministic latency and cost separately from approved live measurements', () => {
    expect(summarizeDeterministicMeasurement([2, 4, 4, 5, 9, 12], [8, 8, 7, 7, 7, 7])).toEqual({
      source: 'deterministic_simulation',
      latency_ms: { p50: 4, p95: 12, p99: 12 },
      cost: { unit: 'synthetic_cost_unit', total: 44 }
    });
    expect(() =>
      measurementEvidenceSchema.parse({
        source: 'approved_live_provider',
        latency_ms: { p50: 4, p95: 9, p99: 12 },
        cost: { unit: 'approved_currency', total: 1 }
      })
    ).toThrow('Live measurements require an approved integration reference');
  });

  it('keeps all rollout and rollback feature controls fail-closed by default', () => {
    const features = loadConfig(validTestEnvironment).features;
    expect(Object.values(features).every((enabled) => !enabled)).toBe(true);
    expect(pilotAgentProfiles.map((profile) => profile.live_capabilities_enabled)).toEqual([
      false,
      false,
      false,
      false
    ]);
    expect(
      pilotAgentProfiles.every((profile) => profile.tool_allowlist.every((tool) => !tool.enabled))
    ).toBe(true);
  });
});
