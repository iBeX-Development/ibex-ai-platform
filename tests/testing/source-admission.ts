// Disabled-by-default local admission projection, not a production lifecycle registry.
import { z } from 'zod';
import { PlatformError } from '../../packages/errors/src/index.js';
import { createTrustedRequestContext, type TrustedRequestContext } from '../../packages/security/src/index.js';
import { knowledgeChunkSchema, type RagRuntimeDependencies, type RagRuntimeService, type RagSecurityFilter } from '../../packages/rag-runtime/src/index.js';
import { structuredSnapshot } from './scoped-factual-grounding-ingress.js';

// Synthetic canonical opaque tokens: no trimming, wildcards or implicit aliases.
const token = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
export const admissionIdentitySchema = z.object({ source_id: token, source_version: token,
  checksum_representation: z.literal('ibex-rag-canonical-document-content-v1'),
  checksum: digest, document_id: token, document_version: token }).strict().readonly();
export type AdmissionIdentity = z.infer<typeof admissionIdentitySchema>;
export const syntheticAdmissionSchema = z.object({
  identity: admissionIdentitySchema,
  issuer: z.literal('synthetic-admission-authority'), decision_id: token,
  revision: z.number().int().positive(),
  tenant_id: token, source_owner: token, source_uri: z.string().min(1),
  ownership_verified: z.boolean(), ownership_evidence: token,
  human_approval: z.boolean(), human_approval_evidence: token,
  // References stand for synthetic full lifecycle records, not real authority.
  lifecycle_evidence: token, conditions_satisfied: z.boolean(),
  state: z.enum(['active', 'withdrawn', 'unknown', 'superseded', 'quarantined', 'expired']),
}).strict().readonly();
export type SyntheticAdmission = z.infer<typeof syntheticAdmissionSchema>;
const deny = () => new PlatformError('PERMISSION_DENIED', 'Source admission unavailable', 403);
const snapshot = (value: unknown) => structuredSnapshot(value, { bytes: 65536, depth: 24 });
const identityKey = (value: AdmissionIdentity) => JSON.stringify([
  value.source_id, value.source_version, value.checksum_representation, value.checksum, value.document_id, value.document_version,
]);

export class SyntheticAdmissionAuthority {
  private record: SyntheticAdmission | undefined;
  private epoch = 0;
  private readonly leases = new Set<AbortController>();
  constructor(raw: unknown) {
    const parsed = syntheticAdmissionSchema.safeParse(snapshot(raw));
    this.record = parsed.success ? parsed.data : undefined;
  }
  // Test authority control only. No retrieval caller can approve or reactivate.
  withdraw(): void {
    this.epoch++;
    if (this.record) this.record = Object.freeze({ ...this.record, state: 'withdrawn', revision: this.record.revision + 1 });
    for (const controller of this.leases) controller.abort();
  }
  admit(rawIdentity: unknown, rawContext: unknown) {
    const identity = admissionIdentitySchema.parse(snapshot(rawIdentity));
    const context = createTrustedRequestContext(snapshot(rawContext));
    const r = this.record;
    if (!r || r.state !== 'active' || !r.ownership_verified || !r.human_approval || !r.conditions_satisfied ||
      r.tenant_id !== context.tenant_id || identityKey(r.identity) !== identityKey(identity)) throw deny();
    const epoch = this.epoch;
    const controller = new AbortController();
    this.leases.add(controller);
    const evidence = Object.freeze({ identity: r.identity, issuer: r.issuer, decision_id: r.decision_id,
      revision: r.revision, context, source_owner: r.source_owner, source_uri: r.source_uri });
    return Object.freeze({ evidence, signal: controller.signal,
      assert: () => {
        if (this.epoch !== epoch || this.record !== r || controller.signal.aborted) throw deny();
      },
      release: () => { this.leases.delete(controller); },
    });
  }
}

export function createAdmittedRetrieval(options: {
  enabled?: boolean;
  environment: string;
  authority: SyntheticAdmissionAuthority;
  identity: unknown;
  context: TrustedRequestContext;
  dependencies: Pick<RagRuntimeDependencies, 'embeddings' | 'ranker'> & {
    store: { readExact(identity: AdmissionIdentity,
      evidence: ReturnType<SyntheticAdmissionAuthority['admit']>['evidence'],
      filter: RagSecurityFilter, signal: AbortSignal): Promise<unknown> };
  };
  build: (dependencies: Pick<RagRuntimeDependencies, 'store' | 'embeddings' | 'ranker'>) => RagRuntimeService;
}) {
  const identity = admissionIdentitySchema.parse(snapshot(options.identity));
  const context = createTrustedRequestContext(snapshot(options.context));
  const originalContext = JSON.stringify(context);
  // Snapshot server-owned dependency references; request arguments cannot select them.
  const { authority, dependencies, build, enabled, environment } = options;
  return Object.freeze({
    async retrieve(raw: Record<string, unknown>, now: Date) {
      if (!enabled || environment !== 'test') throw deny();
      const request = snapshot(raw);
      if (typeof request !== 'object' || request === null || !('context' in request) ||
        JSON.stringify(createTrustedRequestContext(request.context)) !== originalContext) throw deny();
      // Synchronous admission and invocation of guarded store are ordered in one JS agent.
      const lease = authority.admit(identity, context);
      const wrapped: Pick<RagRuntimeDependencies, 'store' | 'embeddings' | 'ranker'> = {
        store: {
          upsert: () => Promise.reject(deny()),
          filter: async (filter, signal) => {
            lease.assert();
            if (filter.tenant_id !== context.tenant_id || filter.user_id !== context.user_id) throw deny();
            // Local exact-read port: the admitted tuple and issuer/revision/context
            // accompany the security filter before any store call begins.
            const result = await dependencies.store.readExact(identity, lease.evidence, filter, signal);
            lease.assert();
            const rawChunks = snapshot(result);
            if (!Array.isArray(rawChunks)) throw deny();
            // Compare guarded raw values before the shared schema can trim aliases.
            for (const rawChunk of rawChunks) {
              if (typeof rawChunk !== 'object' || rawChunk === null || Array.isArray(rawChunk)) throw deny();
              const chunk = rawChunk as Record<string, unknown>;
              if (chunk.document_id !== identity.document_id || chunk.document_version !== identity.document_version ||
                chunk.document_checksum !== identity.checksum || chunk.tenant_scope !== 'tenant_private' ||
                chunk.tenant_id !== context.tenant_id || chunk.source_owner !== lease.evidence.source_owner ||
                chunk.source_uri !== lease.evidence.source_uri) throw deny();
            }
            return z.array(knowledgeChunkSchema).parse(rawChunks);
          },
        },
        embeddings: { embed: async input => { lease.assert(); const output = await dependencies.embeddings.embed(input); lease.assert(); return output; } },
        ranker: { rank: async input => { lease.assert(); const output = await dependencies.ranker.rank(input); lease.assert(); return output; } },
      };
      try {
        lease.assert();
        const response = await build(wrapped).retrieve(request, { signal: lease.signal }, now);
        lease.assert();
        return response;
      } finally { lease.release(); }
    },
  });
}
