import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import type { Finding, Phase10GateResult } from './release-gate.js';

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/);
const revision = z.number().int().positive().safe();
const reference = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  });
const refs = z.array(id);
const findingSchema = z
  .object({
    finding_id: id,
    revision,
    severity: z.enum(['unknown', 'critical', 'high', 'medium', 'low']),
    status: z.enum([
      'unreviewed',
      'open',
      'remediation_claimed',
      'verification_pending',
      'verified_closed'
    ]),
    source_refs: refs.min(1),
    evidence_refs: refs.min(1),
    remediation_refs: refs,
    verification_refs: refs
  })
  .strict();

export const findingsRegistrySchema = z
  .object({
    schema_version: z.literal('1.0.0'),
    registry_id: id,
    revision,
    repository: z.literal('gt7719/ibex-ai-platform'),
    phase: z.literal('phase10'),
    evaluated_commit: z.string().regex(/^[a-f0-9]{40}$/),
    completeness: z.enum(['unknown', 'incomplete', 'complete']),
    review_state: z.enum(['unreviewed', 'reviewed']),
    sources: z
      .array(
        z
          .object({
            source_id: id,
            reference,
            coverage: z.enum(['unknown', 'partial', 'complete'])
          })
          .strict()
      )
      .min(1),
    evidence: z
      .array(
        z
          .object({
            evidence_id: id,
            source_id: id,
            reference
          })
          .strict()
      )
      .min(1),
    findings: z.array(findingSchema).min(1)
  })
  .strict();
export type FindingsRegistry = z.infer<typeof findingsRegistrySchema>;

export interface RegistryScope {
  readonly repository: string;
  readonly phase: string;
  readonly evaluated_commit: string;
}

// This is a port, not an approval mechanism. Only an independently configured authority
// may implement it. It must verify current authorization, source/evidence content and
// completeness against its own inventory, including revoked/superseded decisions.
// There is deliberately no production implementation or CLI/environment selector.
export interface RegistryAuthority {
  verifyCurrent(
    binding: Readonly<{
      purpose: 'inventory' | 'classification' | 'closure';
      content_sha256: string;
      scope: RegistryScope;
      registry_id: string;
      registry_revision: number;
      finding_id: string | null;
      finding_revision: number | null;
      // Exact parsed content includes sources, severity, remediation and verification refs.
      registry_json: string;
    }>
  ): unknown;
}

export interface RegistryAssessment {
  readonly status: 'PASS' | 'FAIL';
  readonly diagnostics: readonly string[];
  readonly content_sha256: string | null;
  readonly findings: readonly Finding[];
}

export function composePhase10Assessment(
  runtimeGate: Pick<Phase10GateResult, 'status' | 'blocking_findings'>,
  integrity: RegistryAssessment
): Pick<Phase10GateResult, 'status' | 'blocking_findings'> {
  return {
    status: integrity.status === 'FAIL' || runtimeGate.status === 'FAIL' ? 'FAIL' : 'PASS',
    blocking_findings: integrity.findings
      .filter(
        (finding) =>
          finding.status === 'unresolved' &&
          (finding.severity === 'high' || finding.severity === 'critical') &&
          runtimeGate.blocking_findings.includes(finding.finding_id)
      )
      .map((finding) => finding.finding_id)
  };
}

// JSON.parse alone silently accepts duplicate keys. Walk the validated token stream
// before schema validation, comparing decoded keys (including escaped spellings).
function parseUniqueJson(text: string): unknown {
  if (Buffer.byteLength(text, 'utf8') > 1_048_576) throw new Error('Registry too large');
  const parsed: unknown = JSON.parse(text);
  let offset = 0;
  const space = () => {
    while (/\s/.test(text[offset] ?? '') && offset < text.length) offset++;
  };
  const string = () => {
    const token = /"(?:[^"\\]|\\.)*"/y;
    token.lastIndex = offset;
    const match = token.exec(text);
    if (!match) throw new Error('Invalid string');
    offset = token.lastIndex;
    return JSON.parse(match[0]) as string;
  };
  const value = (depth: number): void => {
    if (depth > 100) throw new Error('Registry too deep');
    space();
    const start = text[offset];
    if (start === '{') {
      offset++;
      space();
      const keys = new Set<string>();
      while (text[offset] !== '}') {
        const key = string();
        if (keys.has(key)) throw new Error('Duplicate JSON key');
        keys.add(key);
        space();
        offset++; // colon: syntax was already validated by JSON.parse
        value(depth + 1);
        space();
        if (text[offset] !== ',') break;
        offset++;
        space();
      }
      offset++;
    } else if (start === '[') {
      offset++;
      space();
      while (text[offset] !== ']') {
        value(depth + 1);
        space();
        if (text[offset] !== ',') break;
        offset++;
      }
      offset++;
    } else if (start === '"') string();
    else while (offset < text.length && !/[\s,}\]]/.test(text[offset] ?? '')) offset++;
  };
  value(0);
  return parsed;
}

export function assessFindingsRegistry(
  text: string,
  scope: RegistryScope,
  authority?: RegistryAuthority
): RegistryAssessment {
  const digest = createHash('sha256').update(text).digest('hex');
  let registry: FindingsRegistry;
  try {
    registry = findingsRegistrySchema.parse(parseUniqueJson(text));
  } catch {
    return {
      status: 'FAIL',
      diagnostics: ['REGISTRY_MALFORMED'],
      content_sha256: digest,
      findings: []
    };
  }
  const diagnostics: string[] = [];
  const problem = (message: string) => {
    diagnostics.push(message);
  };
  const unique = (values: readonly string[]) => new Set(values).size === values.length;
  if (
    !unique(registry.sources.map((s) => s.source_id)) ||
    !unique(registry.evidence.map((e) => e.evidence_id)) ||
    !unique(registry.findings.map((f) => f.finding_id))
  )
    problem('DUPLICATE_ID');
  if (
    scope.repository !== registry.repository ||
    scope.phase !== registry.phase ||
    scope.evaluated_commit !== registry.evaluated_commit
  )
    problem('SCOPE_MISMATCH');
  if (
    registry.completeness !== 'complete' ||
    registry.sources.some((s) => s.coverage !== 'complete')
  )
    problem('SOURCE_COVERAGE_INCOMPLETE');
  if (registry.review_state !== 'reviewed') problem('REGISTRY_UNREVIEWED');
  const sourceIds = new Set(registry.sources.map((s) => s.source_id));
  const evidence = new Map(registry.evidence.map((e) => [e.evidence_id, e]));
  if (registry.evidence.some((e) => !sourceIds.has(e.source_id)))
    problem('BROKEN_SOURCE_REFERENCE');
  if (!authority) problem('INDEPENDENT_AUTHORITY_UNCONFIGURED');
  const authorize = (
    purpose: 'inventory' | 'classification' | 'closure',
    finding?: FindingsRegistry['findings'][number]
  ) => {
    if (!authority) return false;
    try {
      return (
        authority.verifyCurrent(
          Object.freeze({
            purpose,
            content_sha256: digest,
            scope: Object.freeze({ ...scope }),
            registry_id: registry.registry_id,
            registry_revision: registry.revision,
            finding_id: finding?.finding_id ?? null,
            finding_revision: finding?.revision ?? null,
            registry_json: JSON.stringify(registry)
          })
        ) === true
      );
    } catch {
      return false;
    }
  };
  if (!authorize('inventory')) problem('INVENTORY_NOT_AUTHENTICATED');
  const findings: Finding[] = [];
  for (const finding of registry.findings) {
    const tag = (code: string) => {
      problem(`${code}:${finding.finding_id}`);
    };
    if (finding.severity === 'unknown') tag('UNKNOWN_SEVERITY');
    if (finding.status === 'unreviewed') tag('FINDING_UNREVIEWED');
    if (finding.source_refs.some((ref) => !sourceIds.has(ref)) || !unique(finding.source_refs))
      tag('BROKEN_SOURCE_REFERENCE');
    for (const list of [
      finding.evidence_refs,
      finding.remediation_refs,
      finding.verification_refs
    ]) {
      if (
        !unique(list) ||
        list.some((ref) => {
          const item = evidence.get(ref);
          return !item || !finding.source_refs.includes(item.source_id);
        })
      )
        tag('BROKEN_EVIDENCE_REFERENCE');
    }
    const remediated = ['remediation_claimed', 'verification_pending', 'verified_closed'].includes(
      finding.status
    );
    const closed = finding.status === 'verified_closed';
    if (
      (remediated && finding.remediation_refs.length === 0) ||
      (!remediated && finding.remediation_refs.length > 0) ||
      closed !== finding.verification_refs.length > 0 ||
      finding.verification_refs.some((ref) => finding.remediation_refs.includes(ref))
    )
      tag('CONTRADICTORY_STATE');
    if (!authorize('classification', finding)) tag('CLASSIFICATION_NOT_AUTHENTICATED');
    const closureAuthorized = closed && authorize('closure', finding);
    if (closed && !closureAuthorized) tag('CLOSURE_NOT_AUTHENTICATED');
    if (finding.severity !== 'unknown')
      findings.push({
        finding_id: finding.finding_id,
        severity: finding.severity,
        status: closureAuthorized ? 'resolved' : 'unresolved'
      });
  }
  // No closure projection survives a structurally invalid or unauthenticated registry.
  const assessedFindings = diagnostics.length
    ? findings.map((finding) => ({ ...finding, status: 'unresolved' as const }))
    : findings;
  return {
    status: diagnostics.length ? 'FAIL' : 'PASS',
    diagnostics,
    content_sha256: digest,
    findings: assessedFindings
  };
}

export function readFindingsRegistry(path: string, scope: RegistryScope): RegistryAssessment {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return {
      status: 'FAIL',
      diagnostics: ['REGISTRY_UNREADABLE'],
      content_sha256: null,
      findings: []
    };
  }
  // Production deliberately has no authority argument; fixtures cannot be selected here.
  return assessFindingsRegistry(text, scope);
}
