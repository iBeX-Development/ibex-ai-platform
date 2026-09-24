import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { pilotAgentProfiles } from '../../agents/index.js';
import { featureControls, loadConfig } from '../../packages/configuration/src/index.js';
import { PlatformError } from '../../packages/errors/src/index.js';
import {
  enabledTestFeatureControls,
  validTestEnvironment
} from '../../packages/testing/src/index.js';
import {
  createPilotHarness,
  pilotRequest,
  pilotValidationTime
} from '../testing/pilot-agent-fixtures.js';
import { phase10GoldenDataset } from './datasets/pilot-agents/v1.0.0.js';
import {
  criticalGateNames,
  evaluatePhase10Gate,
  measurementEvidenceSchema,
  phase10QualityTargets,
  summarizeDeterministicMeasurement,
  type EvaluationObservation
} from './support/release-gate.js';
import { executeEvaluationCase, executePhase10Evaluation } from './support/runtime-evaluator.js';

let observations: readonly EvaluationObservation[] = [];

beforeAll(async () => {
  observations = await executePhase10Evaluation();
});

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

  it('derives every safety gate and quality score from executed runtime evidence', () => {
    const result = evaluatePhase10Gate({
      cases: phase10GoldenDataset.cases,
      observations,
      findings: []
    });
    expect(result.status).toBe('PASS');
    expect(result.critical_safety_gate).toBe('PASS');
    expect(result.failed_case_ids).toEqual([]);
    expect(result.critical_evidence.map((item) => item.gate)).toEqual(criticalGateNames);
    for (const evidence of result.critical_evidence) {
      expect(evidence.passed).toBe(true);
      expect(evidence.case_ids.length).toBeGreaterThan(0);
      expect(evidence.audit_event_ids.length).toBeGreaterThan(0);
    }
    for (const [metric, target] of Object.entries(phase10QualityTargets))
      expect(
        result.quality_scores[metric as keyof typeof result.quality_scores]
      ).toBeGreaterThanOrEqual(target);
  });

  it('preserves reconstructable, context-bound evidence for every executed case', () => {
    expect(observations).toHaveLength(phase10GoldenDataset.cases.length);
    expect(new Set(observations.map((item) => item.evaluation_run_id))).toEqual(
      new Set(['phase10-runtime-evaluation-v1.0.0'])
    );
    expect(
      new Set(
        observations.flatMap((item) => item.audit_correlation.events.map((event) => event.event_id))
      ).size
    ).toBe(
      observations.flatMap((item) => item.audit_correlation.events.map((event) => event.event_id))
        .length
    );
    for (const record of observations) {
      expect(record.audit_correlation).toMatchObject({
        request_id: record.request_id,
        correlation_id: record.correlation_id,
        trace_id: record.trace_id
      });
      expect(record.expected_result_reference.case_id).toBe(record.case_id);
      expect(record.evaluator.mechanism).toBe('executed-pilot-agent-and-tool-runtime');
      expect(record.measurement.source).toBe('deterministic_simulation');
      expect(record.audit_correlation.events.length).toBeGreaterThan(0);
      for (const event of record.audit_correlation.events) {
        expect(event).toMatchObject({
          request_id: record.request_id,
          correlation_id: record.correlation_id,
          trace_id: record.trace_id,
          context_status: record.test_scope.context_status
        });
        if (event.context_status === 'trusted') {
          expect(event.tenant_id).toBe(record.test_scope.tenant_id);
          expect(event.user_id).toBeTruthy();
          expect(event.role).toBeTruthy();
          expect(event.session_id).toBeTruthy();
        }
      }
      expect(JSON.stringify(record)).not.toMatch(/rawPrompt|toolInput|chain.of.thought/i);
    }
    const artifact = JSON.parse(
      readFileSync(
        resolve(import.meta.dirname, 'evidence/phase10-runtime-evidence-v1.0.0.json'),
        'utf8'
      )
    ) as unknown;
    expect(artifact).toEqual({
      schema_version: '1.0.0',
      evaluation_run_id: 'phase10-runtime-evaluation-v1.0.0',
      dataset_reference: 'ibex-pilot-hardening@1.0.0',
      classification: 'synthetic_test_only',
      records: observations
    });
  });

  it('fails closed for missing, duplicate, malformed, or inconsistent evidence', () => {
    const first = observations[0];
    if (!first) throw new Error('Expected an executed observation');
    const inconsistent = {
      ...first,
      audit_correlation: { ...first.audit_correlation, trace_id: 'conflicting-trace' }
    } as EvaluationObservation;
    const firstEvent = first.audit_correlation.events[0];
    if (!firstEvent) throw new Error('Expected normalized audit evidence');
    const duplicatedAudit = {
      ...first,
      audit_correlation: {
        ...first.audit_correlation,
        events: [...first.audit_correlation.events, firstEvent]
      }
    } as EvaluationObservation;
    const inconsistentTenant = {
      ...first,
      test_scope: { ...first.test_scope, tenant_id: 'tenant-conflict' }
    } as EvaluationObservation;
    const untrustedAudit = {
      ...first,
      audit_correlation: {
        ...first.audit_correlation,
        events: first.audit_correlation.events.map((event) => ({
          ...event,
          context_status: 'unavailable' as const
        }))
      }
    } as EvaluationObservation;
    const multiEventIndex = observations.findIndex(
      (item) => item.audit_correlation.events.length > 1
    );
    const multiEventObservation = observations[multiEventIndex];
    if (!multiEventObservation) throw new Error('Expected multi-event normalized audit evidence');
    const inconsistentRole = {
      ...multiEventObservation,
      audit_correlation: {
        ...multiEventObservation.audit_correlation,
        events: multiEventObservation.audit_correlation.events.map((event, index) =>
          index === 0 ? { ...event, role: 'conflicting-role' } : event
        )
      }
    } as EvaluationObservation;
    for (const invalid of [
      observations.slice(1),
      [...observations, first],
      observations.map((item, index) => (index === 0 ? inconsistent : item)),
      observations.map((item, index) => (index === 0 ? duplicatedAudit : item)),
      observations.map((item, index) => (index === 0 ? inconsistentTenant : item)),
      observations.map((item, index) => (index === 0 ? untrustedAudit : item)),
      observations.map((item, index) => (index === multiEventIndex ? inconsistentRole : item))
    ]) {
      const result = evaluatePhase10Gate({
        cases: phase10GoldenDataset.cases,
        observations: invalid,
        findings: []
      });
      expect(result.status).toBe('FAIL');
      expect(result.blocking_findings).toContain('EVALUATION_EVIDENCE_INTEGRITY');
    }
  });

  it('derives Tool selection and parameter scores from executed Tool Runtime evidence', () => {
    const toolCases = phase10GoldenDataset.cases.filter(
      (item) => item.category === 'tool' || item.category === 'tool_parameter'
    );
    expect(toolCases).toHaveLength(8);
    for (const caseItem of toolCases) {
      const record = observations.find((item) => item.case_id === caseItem.case_id);
      expect(record?.tool_execution).toMatchObject({
        tool_id: caseItem.expected_tool?.tool_id,
        tool_version: caseItem.expected_tool?.tool_version,
        input_schema_id: caseItem.expected_tool?.input_schema_id
      });
      expect(record?.tool_execution?.observed_input_hash).toBe(
        record?.tool_execution?.expected_input_hash
      );
      expect(
        record?.audit_correlation.events.some(
          (event) =>
            event.event_type === 'tool_runtime.execution.outcome' &&
            event.outcome === 'succeeded' &&
            event.tool_id === caseItem.expected_tool?.tool_id &&
            event.tool_version === caseItem.expected_tool?.tool_version
        )
      ).toBe(true);
    }
  });

  it('keeps expected Tool labels out of runtime selection and input execution', async () => {
    const source = phase10GoldenDataset.cases.find((item) => item.category === 'tool');
    if (!source?.expected_tool || !source.tool_request)
      throw new Error('Expected a Tool evaluation case');
    const alteredExpectation = {
      ...source,
      expected_tool: {
        ...source.expected_tool,
        tool_id: 'golden-label-must-not-select-this-tool',
        input: {
          resource_id: 'golden-label-must-not-be-runtime-input',
          include_status: true as const
        }
      }
    };
    const observed = await executeEvaluationCase(alteredExpectation, 0);
    expect(observed.tool_execution).toMatchObject({
      tool_id: source.tool_request.capability_class
    });
    expect(observed.tool_execution?.observed_input_hash).not.toBe(
      observed.tool_execution?.expected_input_hash
    );
    expect(
      evaluatePhase10Gate({ cases: [alteredExpectation], observations: [observed], findings: [] })
        .failed_case_ids
    ).toEqual([source.case_id]);
  });

  it('never conditionally accepts failed runtime evidence or unresolved High findings', () => {
    const first = observations[0];
    if (!first) throw new Error('Expected an executed observation');
    const failedEvidence = observations.map((item, index) =>
      index === 0
        ? {
            ...item,
            observed_result:
              item.observed_result === 'allow' ? ('deny' as const) : ('allow' as const),
            failure: {
              code: 'RUNTIME_MISMATCH',
              detail: 'Runtime mismatch',
              severity: 'critical' as const
            }
          }
        : item
    );
    expect(
      evaluatePhase10Gate({
        cases: phase10GoldenDataset.cases,
        observations: failedEvidence,
        findings: []
      }).status
    ).toBe('FAIL');
    expect(
      evaluatePhase10Gate({
        cases: phase10GoldenDataset.cases,
        observations,
        findings: [{ finding_id: 'P10-HIGH-001', severity: 'high', status: 'unresolved' }]
      }).status
    ).toBe('FAIL');
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

  it('enforces platform and individual-agent rollback controls before execution', async () => {
    const profile = pilotAgentProfiles[0];
    if (!profile) throw new Error('Expected a Pilot Agent profile');
    for (const controls of [
      featureControls({ ...enabledTestFeatureControls, aiPlatform: false }),
      featureControls({ ...enabledTestFeatureControls, agents: false }),
      featureControls({ ...enabledTestFeatureControls, generalAgent: false })
    ]) {
      const { runtime, audits } = createPilotHarness(profile, {
        featureControls: controls
      });
      await expect(
        runtime.execute(pilotRequest(profile), pilotValidationTime)
      ).rejects.toBeInstanceOf(PlatformError);
      expect(audits).toHaveLength(1);
    }
  });

  it('enforces RAG, Tool, and Action Tool controls before grounding', async () => {
    const general = pilotAgentProfiles.find((profile) => profile.agent_id === 'general_ibex');
    const warehouse = pilotAgentProfiles.find((profile) => profile.agent_id === 'warehouse');
    if (!general || !warehouse) throw new Error('Expected Pilot Agent profiles');
    const cases = [
      {
        profile: general,
        controls: featureControls({ ...enabledTestFeatureControls, rag: false }),
        request: pilotRequest(general, {
          intent: 'GENERAL_KNOWLEDGE',
          requested_rag_scopes: ['ibex-handbook']
        })
      },
      {
        profile: warehouse,
        controls: featureControls({ ...enabledTestFeatureControls, tools: false }),
        request: pilotRequest(warehouse, {
          intent: 'INVENTORY_QUERY',
          requested_tool_capabilities: ['inventory.stock']
        })
      },
      {
        profile: warehouse,
        controls: featureControls({ ...enabledTestFeatureControls, actionTools: false }),
        request: pilotRequest(warehouse, {
          intent: 'ISSUE_DRAFT_ACTION',
          requested_tool_capabilities: ['inventory.prepare_issue']
        })
      }
    ];
    for (const item of cases) {
      const { runtime } = createPilotHarness(item.profile, { featureControls: item.controls });
      await expect(runtime.execute(item.request, pilotValidationTime)).rejects.toMatchObject({
        code: 'PERMISSION_DENIED'
      });
    }
  });

  it('keeps every rollout feature disabled in the approved default configuration', () => {
    expect(
      Object.values(loadConfig(validTestEnvironment).features).every((enabled) => !enabled)
    ).toBe(true);
  });
});
