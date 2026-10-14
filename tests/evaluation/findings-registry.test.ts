import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assessFindingsRegistry,
  composePhase10Assessment,
  readFindingsRegistry,
  type FindingsRegistry,
  type RegistryAuthority,
  type RegistryScope
} from './support/findings-registry.js';
import { evaluatePhase10Gate } from './support/release-gate.js';
import { executePhase10Evaluation } from './support/runtime-evaluator.js';
import { phase10GoldenDataset } from './datasets/pilot-agents/v1.0.0.js';

const scope: RegistryScope = {
  repository: 'gt7719/ibex-ai-platform',
  phase: 'phase10',
  evaluated_commit: 'a'.repeat(40)
};
function fixture(): FindingsRegistry {
  return {
    schema_version: '1.0.0',
    registry_id: 'synthetic-only',
    revision: 2,
    repository: 'gt7719/ibex-ai-platform',
    phase: 'phase10',
    evaluated_commit: scope.evaluated_commit,
    completeness: 'complete',
    review_state: 'reviewed',
    sources: [
      { source_id: 'audit', reference: 'https://example.invalid/audit', coverage: 'complete' },
      {
        source_id: 'governance',
        reference: 'https://example.invalid/governance',
        coverage: 'complete'
      }
    ],
    evidence: [
      {
        evidence_id: 'original',
        source_id: 'audit',
        reference: 'https://example.invalid/original'
      },
      { evidence_id: 'repair', source_id: 'audit', reference: 'https://example.invalid/repair' },
      {
        evidence_id: 'verification',
        source_id: 'audit',
        reference: 'https://example.invalid/verification'
      }
    ],
    findings: [
      {
        finding_id: 'SYNTHETIC-1',
        revision: 2,
        severity: 'high',
        status: 'verified_closed',
        source_refs: ['audit'],
        evidence_refs: ['original'],
        remediation_refs: ['repair'],
        verification_refs: ['verification']
      }
    ]
  };
}
const serialize = (registry: FindingsRegistry) => JSON.stringify(registry);
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
// Exact current synthetic authorizations, held outside candidate data. This fixture is
// never imported by the CLI and does not assert real source or owner verification.
function syntheticAuthority(current: FindingsRegistry, deniedPurpose?: string): RegistryAuthority {
  const text = serialize(current);
  const bindings = new Set<string>();
  const base = {
    content_sha256: sha(text),
    scope,
    registry_id: current.registry_id,
    registry_revision: current.revision,
    registry_json: text
  };
  bindings.add(
    JSON.stringify({ purpose: 'inventory', ...base, finding_id: null, finding_revision: null })
  );
  for (const finding of current.findings) {
    for (const purpose of ['classification', 'closure'])
      bindings.add(
        JSON.stringify({
          purpose,
          ...base,
          finding_id: finding.finding_id,
          finding_revision: finding.revision
        })
      );
  }
  return {
    verifyCurrent: (binding) =>
      binding.purpose !== deniedPurpose &&
      bindings.has(
        JSON.stringify({
          purpose: binding.purpose,
          content_sha256: binding.content_sha256,
          scope: binding.scope,
          registry_id: binding.registry_id,
          registry_revision: binding.registry_revision,
          registry_json: binding.registry_json,
          finding_id: binding.finding_id,
          finding_revision: binding.finding_revision
        })
      )
  };
}
function assess(candidate: FindingsRegistry, authority = syntheticAuthority(candidate)) {
  return assessFindingsRegistry(serialize(candidate), scope, authority);
}
function required<T>(items: readonly T[]): T {
  const item = items[0];
  if (item === undefined) throw new Error('Synthetic fixture missing required item');
  return item;
}
function first(registry: FindingsRegistry) {
  const finding = registry.findings[0];
  if (!finding) throw new Error('Synthetic fixture missing finding');
  return finding;
}

describe('mandatory findings registry integrity', () => {
  it('accepts only an independently bound synthetic current closure', () => {
    expect(assess(fixture())).toMatchObject({
      status: 'PASS',
      diagnostics: [],
      findings: [{ finding_id: 'SYNTHETIC-1', severity: 'high', status: 'resolved' }]
    });
  });

  it.each([
    '',
    '{',
    'null',
    '[]',
    '{"revision":1,"revision":2}',
    '{"revision":1,"revis\\u0069on":2}'
  ])('rejects invalid JSON/schema %s', (text) => {
    expect(assessFindingsRegistry(text, scope)).toMatchObject({
      status: 'FAIL',
      diagnostics: ['REGISTRY_MALFORMED']
    });
  });

  it('rejects duplicate keys inside otherwise valid nested findings', () => {
    const text = serialize(fixture()).replace(
      '"severity":"high"',
      '"severity":"low","sever\\u0069ty":"high"'
    );
    expect(assessFindingsRegistry(text, scope, syntheticAuthority(fixture())).diagnostics).toEqual([
      'REGISTRY_MALFORMED'
    ]);
  });

  const invalidCases: [string, (r: FindingsRegistry) => void][] = [
    [
      'empty inventory',
      (r) => {
        r.sources = [];
      }
    ],
    [
      'incomplete inventory',
      (r) => {
        r.completeness = 'incomplete';
      }
    ],
    [
      'unknown coverage',
      (r) => {
        required(r.sources).coverage = 'unknown';
      }
    ],
    [
      'unreviewed registry',
      (r) => {
        r.review_state = 'unreviewed';
      }
    ],
    [
      'unknown severity',
      (r) => {
        first(r).severity = 'unknown';
      }
    ],
    [
      'duplicate finding IDs',
      (r) => {
        r.findings.push({ ...first(r) });
      }
    ],
    [
      'duplicate source IDs',
      (r) => {
        r.sources.push({ ...required(r.sources) });
      }
    ],
    [
      'duplicate evidence IDs',
      (r) => {
        r.evidence.push({ ...required(r.evidence) });
      }
    ],
    [
      'broken source',
      (r) => {
        first(r).source_refs = ['missing'];
      }
    ],
    [
      'broken evidence',
      (r) => {
        first(r).evidence_refs = ['missing'];
      }
    ],
    [
      'evidence source missing',
      (r) => {
        required(r.evidence).source_id = 'missing';
      }
    ],
    [
      'evidence outside finding source',
      (r) => {
        required(r.evidence).source_id = 'governance';
      }
    ],
    [
      'empty reference',
      (r) => {
        required(r.sources).reference = '';
      }
    ],
    [
      'invalid reference',
      (r) => {
        required(r.evidence).reference = 'not-a-url';
      }
    ],
    [
      'empty evidence refs',
      (r) => {
        first(r).evidence_refs = [];
      }
    ],
    [
      'duplicate reference IDs',
      (r) => {
        first(r).evidence_refs = ['original', 'original'];
      }
    ],
    [
      'missing remediation',
      (r) => {
        first(r).remediation_refs = [];
      }
    ],
    [
      'missing verification',
      (r) => {
        first(r).verification_refs = [];
      }
    ],
    [
      'verification reuses remediation',
      (r) => {
        first(r).verification_refs = ['repair'];
      }
    ],
    [
      'open with closure evidence',
      (r) => {
        first(r).status = 'open';
      }
    ]
  ];
  it.each(invalidCases)('rejects %s even with a synthetic authorizer', (label, mutate) => {
    const registry = fixture();
    mutate(registry);
    const result = assess(registry);
    expect(result.status).toBe('FAIL');
    expect(result.findings.every((finding) => finding.status === 'unresolved')).toBe(true);
    const knowledgeOnly = [
      'incomplete inventory',
      'unknown coverage',
      'unreviewed registry',
      'unknown severity'
    ];
    expect(result.technical_status).toBe(knowledgeOnly.includes(label) ? 'PASS' : 'FAIL');
    if (!knowledgeOnly.includes(label))
      expect(
        result.issues.some((issue) => issue.kind === 'structural' || issue.kind === 'reference')
      ).toBe(true);
  });

  it.each([
    ['unknown key', '"revision":2', '"approved":true,"revision":2'],
    ['unknown severity enum', '"severity":"high"', '"severity":"safe"'],
    ['unknown status enum', '"status":"verified_closed"', '"status":"approved"'],
    ['nested unknown key', '"finding_id":', '"approver":"owner","finding_id":']
  ])('rejects %s', (_label, before, after) => {
    expect(
      assessFindingsRegistry(serialize(fixture()).replace(before, after), scope).diagnostics
    ).toEqual(['REGISTRY_MALFORMED']);
  });

  it.each(['inventory', 'classification', 'closure'])(
    'requires separate %s authorization',
    (purpose) => {
      const registry = fixture();
      const result = assess(registry, syntheticAuthority(registry, purpose));
      expect(result.status).toBe('FAIL');
      expect(result.findings.every((finding) => finding.status === 'unresolved')).toBe(true);
    }
  );

  it('fails closed with no authority or a throwing authority despite complete/reviewed claims', () => {
    expect(assessFindingsRegistry(serialize(fixture()), scope).diagnostics).toContain(
      'INDEPENDENT_AUTHORITY_UNCONFIGURED'
    );
    expect(
      assess(fixture(), {
        verifyCurrent: () => {
          throw new Error('Unavailable authority');
        }
      }).status
    ).toBe('FAIL');
  });

  const tampering: [string, (r: FindingsRegistry) => void][] = [
    [
      'removed required inventory entry',
      (r) => {
        r.sources.pop();
      }
    ],
    [
      'removed required finding',
      (r) => {
        r.findings = [];
      }
    ],
    [
      'wrong registry ID',
      (r) => {
        r.registry_id = 'different';
      }
    ],
    [
      'stale registry revision',
      (r) => {
        r.revision--;
      }
    ],
    [
      'wrong finding ID',
      (r) => {
        first(r).finding_id = 'different';
      }
    ],
    [
      'stale finding revision',
      (r) => {
        first(r).revision--;
      }
    ],
    [
      'wrong commit',
      (r) => {
        r.evaluated_commit = 'b'.repeat(40);
      }
    ],
    [
      'unauthorized severity downgrade',
      (r) => {
        first(r).severity = 'low';
      }
    ],
    [
      'wrong remediation',
      (r) => {
        first(r).remediation_refs = ['original'];
      }
    ],
    [
      'wrong verification',
      (r) => {
        first(r).verification_refs = ['original'];
      }
    ],
    [
      'wrong source content reference',
      (r) => {
        required(r.sources).reference = 'https://example.invalid/other';
      }
    ]
  ];
  it.each(tampering)('rejects %s against independent current binding', (_label, mutate) => {
    const current = fixture();
    const candidate = structuredClone(current);
    mutate(candidate);
    expect(assess(candidate, syntheticAuthority(current)).status).toBe('FAIL');
  });

  it.each(['expired', 'revoked', 'unverifiable'])(
    'keeps %s authority decisions unauthenticated',
    (state) => {
      const result = assess(fixture(), { verifyCurrent: () => ({ state, approved: true }) });
      expect(result.status).toBe('FAIL');
      expect(result.technical_status).toBe('PASS');
      expect(result.issues).toContainEqual({
        code: 'INVENTORY_NOT_AUTHENTICATED',
        kind: 'authority'
      });
      expect(result.findings).toContainEqual({
        finding_id: 'SYNTHETIC-1',
        severity: 'high',
        status: 'unresolved'
      });
    }
  );

  it('rejects a nonboolean authorization result', () => {
    expect(assess(fixture(), { verifyCurrent: () => 'approved' }).status).toBe('FAIL');
  });

  it.each(['repository', 'phase', 'evaluated_commit'] as const)(
    'rejects mismatched expected %s',
    (key) => {
      expect(
        assessFindingsRegistry(
          serialize(fixture()),
          { ...scope, [key]: 'wrong' },
          syntheticAuthority(fixture())
        ).diagnostics
      ).toContain('SCOPE_MISMATCH');
    }
  );

  it('binds exact bytes, not just candidate digest claims', () => {
    const current = fixture();
    expect(
      assessFindingsRegistry(serialize(current) + '\n', scope, syntheticAuthority(current)).status
    ).toBe('FAIL');
    const text = serialize(current).replace(
      '"revision":2',
      '"digest":"' + sha(serialize(current)) + '","revision":2'
    );
    expect(assessFindingsRegistry(text, scope).diagnostics).toEqual(['REGISTRY_MALFORMED']);
  });

  it('rejects a formerly closed revision superseded by a reopened current finding', () => {
    const old = fixture();
    const current = fixture();
    current.revision++;
    first(current).revision++;
    first(current).status = 'open';
    first(current).remediation_refs = [];
    first(current).verification_refs = [];
    expect(assess(old, syntheticAuthority(current)).status).toBe('FAIL');
  });

  it.each(['critical', 'high'] as const)(
    'keeps every nonclosed %s status unresolved',
    async (severity) => {
      const observations = await executePhase10Evaluation();
      for (const status of [
        'unreviewed',
        'open',
        'remediation_claimed',
        'verification_pending'
      ] as const) {
        const registry = fixture();
        const finding = first(registry);
        finding.severity = severity;
        finding.status = status;
        finding.verification_refs = [];
        if (status === 'unreviewed' || status === 'open') finding.remediation_refs = [];
        const assessment = assess(registry);
        expect(assessment.findings).toContainEqual({
          finding_id: finding.finding_id,
          severity,
          status: 'unresolved'
        });
        expect(
          evaluatePhase10Gate({
            cases: phase10GoldenDataset.cases,
            observations,
            findings: assessment.findings
          }).status
        ).toBe('FAIL');
      }
    }
  );

  it('retains the existing policy for independently classified unresolved Medium/Low fixtures', async () => {
    const observations = await executePhase10Evaluation();
    for (const severity of ['medium', 'low'] as const) {
      const registry = fixture();
      Object.assign(first(registry), {
        severity,
        status: 'open',
        remediation_refs: [],
        verification_refs: []
      });
      const assessment = assess(registry);
      expect(assessment.status).toBe('PASS');
      expect(
        evaluatePhase10Gate({
          cases: phase10GoldenDataset.cases,
          observations,
          findings: assessment.findings
        }).status
      ).toBe('PASS');
    }
  });

  it('fails closed for missing and unreadable input without changing permissions', () => {
    expect(
      readFindingsRegistry(resolve(import.meta.dirname, 'no-such-registry.json'), scope).diagnostics
    ).toEqual(['REGISTRY_UNREADABLE']);
    expect(readFindingsRegistry(import.meta.dirname, scope).diagnostics).toEqual([
      'REGISTRY_UNREADABLE'
    ]);
  });

  it('keeps missing, malformed and real unknown input separate from a passing runtime gate', async () => {
    const observations = await executePhase10Evaluation();
    const root = resolve(import.meta.dirname, '../..');
    const assessments = [
      readFindingsRegistry(resolve(import.meta.dirname, 'no-such-registry.json'), scope),
      assessFindingsRegistry('{', scope),
      readFindingsRegistry(resolve(root, 'docs/evaluation/findings/registry.v1.json'), {
        ...scope,
        evaluated_commit: execFileSync('git', ['rev-parse', 'HEAD'], {
          cwd: root,
          encoding: 'utf8'
        }).trim()
      })
    ];
    for (const integrity of assessments) {
      expect(integrity.status).toBe('FAIL');
      expect(integrity.findings).toEqual([]);
      const runtime = evaluatePhase10Gate({
        cases: phase10GoldenDataset.cases,
        observations,
        findings: integrity.findings
      });
      expect(runtime.status).toBe('PASS');
      expect(composePhase10Assessment(runtime, integrity)).toEqual({
        status: 'FAIL',
        blocking_findings: []
      });
    }
    expect(required(assessments).diagnostics).toEqual(['REGISTRY_UNREADABLE']);
    const real = assessments.at(-1);
    expect(real?.diagnostics).toEqual(
      expect.arrayContaining([
        'UNKNOWN_SEVERITY:F06',
        'UNKNOWN_SEVERITY:F07',
        'UNKNOWN_SEVERITY:F08',
        'UNKNOWN_SEVERITY:F09'
      ])
    );
  });

  it('preserves runtime failure with synthetic integrity PASS without inventing policy findings', () => {
    const integrity = assess(fixture());
    expect(integrity.status).toBe('PASS');
    const runtime = evaluatePhase10Gate({
      cases: phase10GoldenDataset.cases,
      observations: [],
      findings: integrity.findings
    });
    expect(runtime.status).toBe('FAIL');
    expect(composePhase10Assessment(runtime, integrity)).toEqual({
      status: 'FAIL',
      blocking_findings: []
    });
  });

  it('reports only actual policy-blocking classified findings on integrity failure', async () => {
    const registry = fixture();
    const integrity = assessFindingsRegistry(serialize(registry), scope);
    expect(integrity.status).toBe('FAIL');
    expect(integrity.findings).toEqual([
      { finding_id: 'SYNTHETIC-1', severity: 'high', status: 'unresolved' }
    ]);
    const runtime = evaluatePhase10Gate({
      cases: phase10GoldenDataset.cases,
      observations: await executePhase10Evaluation(),
      findings: integrity.findings
    });
    expect(composePhase10Assessment(runtime, integrity)).toEqual({
      status: 'FAIL',
      blocking_findings: ['SYNTHETIC-1']
    });
  });

  it.each([
    { args: [], selectionAttempt: false },
    { args: ['--write-evidence'], selectionAttempt: false },
    {
      args: ['--findings-fixture=synthetic', '--findings-authority=synthetic'],
      selectionAttempt: true
    }
  ])(
    'CLI runtime PASS plus real registry FAIL exits nonzero with args %j',
    ({ args, selectionAttempt }) => {
      const root = resolve(import.meta.dirname, '../..');
      const registryPath = resolve(root, 'docs/evaluation/findings/registry.v1.json');
      const evidencePath = resolve(
        root,
        'tests/evaluation/evidence/phase10-runtime-evidence-v1.0.0.json'
      );
      const registryBefore = readFileSync(registryPath, 'utf8');
      const evidenceBefore = readFileSync(evidencePath, 'utf8');
      const result = spawnSync(
        process.execPath,
        ['--import', 'tsx', 'scripts/phase10-evaluate.ts', ...args],
        {
          cwd: root,
          encoding: 'utf8',
          timeout: 20_000,
          env: selectionAttempt
            ? {
                ...process.env,
                IBEX_FINDINGS_FIXTURE: 'synthetic',
                IBEX_FINDINGS_AUTHORITY: 'synthetic'
              }
            : process.env
        }
      );
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      const output = JSON.parse(result.stdout) as {
        status: string;
        governance_status: string;
        critical_safety_gate: string;
        findings_integrity: { status: string; diagnostics: string[] };
        observation_count: number;
        blocking_findings: string[];
      };
      expect(output).toMatchObject({
        status: 'FAIL',
        governance_status: 'BLOCKED',
        critical_safety_gate: 'PASS',
        observation_count: 44,
        findings_integrity: { status: 'FAIL' },
        blocking_findings: []
      });
      expect(output.findings_integrity.diagnostics).toContain('INDEPENDENT_AUTHORITY_UNCONFIGURED');
      expect(readFileSync(registryPath, 'utf8')).toBe(registryBefore);
      expect(readFileSync(evidencePath, 'utf8')).toBe(evidenceBefore);
      expect(
        execFileSync('git', ['diff', '--', 'tests/evaluation/evidence'], {
          cwd: root,
          encoding: 'utf8'
        })
      ).toBe('');
    },
    30_000
  );
});
