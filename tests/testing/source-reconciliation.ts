// Disabled local inventory contract. Synthetic manifests are not authenticated authority.
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { admissionIdentitySchema, syntheticAdmissionSchema } from './source-admission.js';
import { structuredSnapshot } from './scoped-factual-grounding-ingress.js';

const token = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const kind = z.enum(['document', 'chunk', 'embedding', 'index', 'vector', 'cache', 'retrieval-preparation']);
const artifact = z.object({ artifact_id: token, kind }).strict();
const source = z.object({ admission: syntheticAdmissionSchema,
  expected: z.array(artifact).min(1).max(100) }).strict();
const derived = artifact.extend({ tenant_id: token, identity: admissionIdentitySchema,
  state: z.enum(['active', 'stale', 'superseded', 'withdrawn']) }).strict();
const inventory = z.object({ sources: z.array(source).min(1).max(100),
  derived: z.array(derived).max(1000) }).strict();
type Inventory = z.infer<typeof inventory>;
type Code = 'invalid-inventory' | 'cross-tenant' | 'orphan' | 'duplicate' | 'missing' |
  'stale' | 'superseded' | 'withdrawn' | 'checksum-mismatch' | 'conflict' | 'ineligible';
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const key = (value: z.infer<typeof admissionIdentitySchema>) => JSON.stringify([
  value.source_id, value.source_version, value.document_id, value.document_version, value.checksum_representation,
]);
const artifactKey = (value: z.infer<typeof artifact>) => JSON.stringify([value.artifact_id, value.kind]);
const sourceKey = (value: z.infer<typeof syntheticAdmissionSchema>) => JSON.stringify([
  value.tenant_id, value.identity.source_id, value.identity.source_version,
]);

export function createSyntheticReconciler(options: { enabled?: boolean; environment: string; tenant: string }) {
  // Tenant is configured by the test-owned boundary, never selected by inventory content.
  const tenant = token.parse(options.tenant);
  const enabled = options.enabled === true && options.environment === 'test';
  return Object.freeze({
    reconcile(raw: unknown) {
      const report = (codes: Set<Code>, counts = { sources: 0, expected: 0, derived: 0, matched: 0 }, inputHash: string | null = null) => {
        const result = { synthetic: true as const, tenant, allowed: codes.size === 0,
          disposition: codes.size === 0 ? 'eligible' as const : 'quarantined' as const,
          discrepancies: [...codes].sort(), counts, inputHash };
        return Object.freeze({ ...result, discrepancies: Object.freeze(result.discrepancies),
          counts: Object.freeze(counts), reportHash: hash(result) });
      };
      if (!enabled) return report(new Set(['ineligible']));
      let data: Inventory;
      try {
        data = inventory.parse(structuredSnapshot(raw, { bytes: 262144, depth: 24 }));
      } catch { return report(new Set(['invalid-inventory'])); }
      // No foreign identifiers, counts or hashes escape a contaminated partition.
      if (data.sources.some(s => s.admission.tenant_id !== tenant) || data.derived.some(d => d.tenant_id !== tenant))
        return report(new Set(['cross-tenant']));
      const codes = new Set<Code>();
      const sources = new Map<string, Inventory['sources'][number]>();
      const expected = new Map<string, { source: Inventory['sources'][number]; artifact: z.infer<typeof artifact> }>();
      const ambiguousSources = new Set<string>(); const ambiguousArtifacts = new Set<string>();
      // Ownership belongs to the source/version, independently of its document mapping.
      const sourceOwners = new Map<string, string>(); const conflictingOwners = new Set<string>();
      for (const { admission: a } of data.sources) {
        const k = sourceKey(a); const owner = sourceOwners.get(k);
        if (owner !== undefined && owner !== a.source_owner) { conflictingOwners.add(k); codes.add('conflict'); }
        else sourceOwners.set(k, a.source_owner);
      }
      let expectedCount = 0;
      for (const s of data.sources) {
        const a = s.admission; const k = key(a.identity);
        if (sources.has(k)) {
          codes.add('duplicate');
          ambiguousSources.add(k);
          if (JSON.stringify(sources.get(k)?.admission) !== JSON.stringify(a)) codes.add('conflict');
        }
        else sources.set(k, s);
        if (!a.ownership_verified || !a.human_approval || !a.conditions_satisfied) codes.add('ineligible');
        if (a.state === 'expired') codes.add('stale');
        else if (a.state === 'superseded' || a.state === 'withdrawn') codes.add(a.state);
        else if (a.state !== 'active') codes.add('ineligible');
        for (const item of s.expected) {
          expectedCount++;
          // Artifact IDs are unique within this synthetic tenant inventory, across kinds/sources.
          if (expected.has(item.artifact_id)) { codes.add('duplicate'); ambiguousArtifacts.add(item.artifact_id); }
          else expected.set(item.artifact_id, { source: s, artifact: item });
        }
      }
      const seen = new Set<string>(); const matched = new Set<string>();
      for (const d of data.derived) {
        if (seen.has(d.artifact_id)) codes.add('duplicate');
        seen.add(d.artifact_id);
        if (d.state !== 'active') codes.add(d.state);
        const s = sources.get(key(d.identity)); const e = expected.get(d.artifact_id);
        if (!s || !e) { codes.add('orphan'); continue; }
        if (ambiguousSources.has(key(d.identity)) || ambiguousArtifacts.has(d.artifact_id) ||
          conflictingOwners.has(sourceKey(s.admission))) continue;
        if (key(e.source.admission.identity) !== key(d.identity) || artifactKey(e.artifact) !== artifactKey(d)) {
          codes.add('conflict'); continue;
        }
        if (s.admission.identity.checksum !== d.identity.checksum) { codes.add('checksum-mismatch'); continue; }
        if (d.state === 'active' && s.admission.state === 'active') matched.add(d.artifact_id);
      }
      for (const id of expected.keys()) if (!matched.has(id)) codes.add('missing');
      // Sorting whole canonical rows preserves duplicate multiplicity and makes order irrelevant.
      const canonical = { sources: data.sources.map(s => ({ admission: s.admission,
        expected: s.expected.map(artifactKey).sort() }))
        .map(s => JSON.stringify(s)).sort(), derived: data.derived.map(d => JSON.stringify(d)).sort() };
      return report(codes, { sources: data.sources.length, expected: expectedCount,
        derived: data.derived.length, matched: matched.size }, hash(canonical));
    },
  });
}
