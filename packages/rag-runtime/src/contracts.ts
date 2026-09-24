import { z } from 'zod';
import type { TrustedRequestContext } from '../../security/src/index.js';

const nonEmpty = z.string().trim().min(1);
const nonEmptyList = z.array(nonEmpty).min(1).readonly();
const sha256 = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export const knowledgeSourceTypeSchema = z.enum([
  'ibex_handbook',
  'approved_procedure',
  'approved_manual',
  'standard',
  'technical_document',
  'approved_knowledge_base',
  'tenant_approved_document'
]);

export const knowledgeApprovalStatusSchema = z.enum([
  'draft',
  'review',
  'approved',
  'deprecated',
  'archived',
  'rejected',
  'revoked'
]);

export const knowledgeAccessScopeSchema = z
  .object({
    required_permissions: z.array(nonEmpty).readonly(),
    required_entitlements: z.array(nonEmpty).readonly(),
    allowed_roles: z.array(nonEmpty).readonly()
  })
  .strict()
  .readonly();

export const knowledgeMetadataSchema = z
  .object({
    document_id: nonEmpty,
    document_version: nonEmpty,
    title: nonEmpty,
    source_type: knowledgeSourceTypeSchema,
    source_owner: nonEmpty,
    tenant_scope: z.enum(['global_approved', 'domain_approved', 'tenant_private']),
    tenant_id: nonEmpty.optional(),
    domains: nonEmptyList,
    knowledge_scopes: nonEmptyList,
    allowed_agents: nonEmptyList,
    classification: z.enum(['public', 'internal', 'tenant_confidential', 'restricted']),
    approval_status: knowledgeApprovalStatusSchema,
    effective_date: z.string().datetime(),
    expiry_date: z.string().datetime().optional(),
    language: nonEmpty,
    source_uri: nonEmpty,
    checksum: sha256,
    access_scope: knowledgeAccessScopeSchema,
    created_at: z.string().datetime(),
    updated_at: z.string().datetime()
  })
  .strict()
  .readonly()
  .superRefine((value, context) => {
    if (value.tenant_scope === 'tenant_private' && !value.tenant_id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['tenant_id'],
        message: 'Tenant-private knowledge requires an explicit tenant identifier'
      });
    }
    if (value.tenant_scope !== 'tenant_private' && value.tenant_id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['tenant_id'],
        message: 'Shared knowledge cannot carry a tenant identifier'
      });
    }
    if (
      value.expiry_date !== undefined &&
      Date.parse(value.expiry_date) <= Date.parse(value.effective_date)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expiry_date'],
        message: 'Knowledge expiry must follow its effective date'
      });
    }
    if (Date.parse(value.updated_at) < Date.parse(value.created_at)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['updated_at'],
        message: 'Knowledge update time cannot precede creation time'
      });
    }
  });

export type KnowledgeMetadata = Readonly<z.infer<typeof knowledgeMetadataSchema>>;

export const sourceLocationSchema = z
  .object({
    section: nonEmpty,
    reference: nonEmpty,
    page: z.number().int().positive().optional(),
    ordinal: z.number().int().nonnegative()
  })
  .strict()
  .readonly();

export const parsedDocumentSectionSchema = z
  .object({
    location: sourceLocationSchema,
    content: nonEmpty
  })
  .strict()
  .readonly();

export const knowledgeDocumentSchema = z
  .object({
    metadata: knowledgeMetadataSchema,
    sections: z.array(parsedDocumentSectionSchema).min(1).readonly()
  })
  .strict()
  .readonly()
  .superRefine((value, context) => {
    const locations = value.sections.map(({ location }) =>
      JSON.stringify([
        location.ordinal,
        location.section,
        location.reference,
        location.page ?? null
      ])
    );
    if (new Set(locations).size !== locations.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sections'],
        message: 'Knowledge sections require unique stable source locations'
      });
    }
  });

export type KnowledgeDocument = Readonly<z.infer<typeof knowledgeDocumentSchema>>;

export const embeddingEvidenceSchema = z
  .object({
    model_id: nonEmpty,
    model_version: nonEmpty,
    vector: z.array(z.number().finite()).min(1).readonly()
  })
  .strict()
  .readonly();

export type EmbeddingEvidence = Readonly<z.infer<typeof embeddingEvidenceSchema>>;

export const knowledgeChunkSchema = z
  .object({
    chunk_id: sha256,
    document_id: nonEmpty,
    document_version: nonEmpty,
    title: nonEmpty,
    document_updated_at: z.string().datetime(),
    tenant_scope: z.enum(['global_approved', 'domain_approved', 'tenant_private']),
    tenant_id: nonEmpty.optional(),
    domains: nonEmptyList,
    knowledge_scopes: nonEmptyList,
    allowed_agents: nonEmptyList,
    classification: z.enum(['public', 'internal', 'tenant_confidential', 'restricted']),
    approval_status: knowledgeApprovalStatusSchema,
    effective_date: z.string().datetime(),
    expiry_date: z.string().datetime().optional(),
    access_scope: knowledgeAccessScopeSchema,
    source_type: knowledgeSourceTypeSchema,
    source_uri: nonEmpty,
    source_location: sourceLocationSchema,
    language: nonEmpty,
    content: nonEmpty,
    content_hash: sha256,
    document_checksum: sha256,
    citation_evidence_hash: sha256,
    embedding: embeddingEvidenceSchema
  })
  .strict()
  .readonly();

export type KnowledgeChunk = Readonly<z.infer<typeof knowledgeChunkSchema>>;

export const ragSecurityFilterSchema = z
  .object({
    tenant_id: nonEmpty,
    user_id: nonEmpty,
    role: nonEmpty,
    permissions: z.array(nonEmpty).readonly(),
    entitlements: z.array(nonEmpty).readonly(),
    agent_id: nonEmpty,
    domain: nonEmpty,
    knowledge_scopes: nonEmptyList,
    approval_status: z.literal('approved'),
    effective_at: z.string().datetime(),
    latest_approved_only: z.literal(true)
  })
  .strict()
  .readonly();

export type RagSecurityFilter = Readonly<z.infer<typeof ragSecurityFilterSchema>>;

export const approvedRagRetrievalScopeSchema = z
  .object({
    routing_decision_id: nonEmpty,
    tenant_id: nonEmpty,
    user_id: nonEmpty,
    request_id: nonEmpty,
    correlation_id: nonEmpty,
    agent_id: nonEmpty,
    agent_version: nonEmpty,
    domain: nonEmpty,
    knowledge_scopes: nonEmptyList
  })
  .strict()
  .readonly();

export type ApprovedRagRetrievalScope = Readonly<z.infer<typeof approvedRagRetrievalScopeSchema>>;

export const ragRetrievalScopeDecisionSchema = z.discriminatedUnion('allowed', [
  z
    .object({
      allowed: z.literal(true),
      decision_id: nonEmpty,
      scope: approvedRagRetrievalScopeSchema
    })
    .strict(),
  z
    .object({
      allowed: z.literal(false),
      reason: nonEmpty,
      decision_id: nonEmpty.optional()
    })
    .strict()
]);

export const ragIngestionRequestSchema = z
  .object({
    context: z.unknown(),
    trace_id: nonEmpty.max(256),
    agent_id: nonEmpty,
    document: knowledgeDocumentSchema
  })
  .strict()
  .readonly();

export interface RagIngestionRequest {
  readonly context: TrustedRequestContext;
  readonly trace_id: string;
  readonly agent_id: string;
  readonly document: KnowledgeDocument;
}

export const ragRetrievalRequestSchema = z
  .object({
    context: z.unknown(),
    trace_id: nonEmpty.max(256),
    routing_decision_id: nonEmpty,
    query: nonEmpty.max(4_000),
    top_k: z.number().int().min(1).max(20)
  })
  .strict()
  .readonly();

export interface RagRetrievalRequest {
  readonly context: TrustedRequestContext;
  readonly trace_id: string;
  readonly routing_decision_id: string;
  readonly query: string;
  readonly top_k: number;
}

export const rankedChunkReferenceSchema = z
  .object({
    chunk_id: sha256,
    score: z.number().finite().min(0).max(1),
    semantic_score: z.number().finite().min(0).max(1),
    keyword_score: z.number().finite().min(0).max(1)
  })
  .strict()
  .readonly();

export type RankedChunkReference = Readonly<z.infer<typeof rankedChunkReferenceSchema>>;

const citationSchema = z
  .object({
    document_id: nonEmpty,
    document_version: nonEmpty,
    title: nonEmpty,
    chunk_id: sha256,
    source_uri: nonEmpty,
    source_location: sourceLocationSchema,
    content_hash: sha256,
    document_checksum: sha256,
    citation_evidence_hash: sha256
  })
  .strict()
  .readonly();

const retrievalResultSchema = z
  .object({
    content: nonEmpty,
    content_trust: z.literal('untrusted_retrieved_content'),
    instruction_authority: z.literal('none'),
    score: z.number().finite().min(0).max(1),
    semantic_score: z.number().finite().min(0).max(1),
    keyword_score: z.number().finite().min(0).max(1),
    citation: citationSchema
  })
  .strict()
  .readonly();

export const ragIngestionResponseSchema = z
  .object({
    contract_version: z.literal('1.0'),
    status: z.literal('indexed'),
    request_id: nonEmpty,
    correlation_id: nonEmpty,
    trace_id: nonEmpty,
    document_id: nonEmpty,
    document_version: nonEmpty,
    document_checksum: sha256,
    chunk_ids: z.array(sha256).min(1).readonly()
  })
  .strict()
  .readonly();

export type RagIngestionResponse = Readonly<z.infer<typeof ragIngestionResponseSchema>>;

export const ragRetrievalResponseSchema = z
  .object({
    contract_version: z.literal('1.0'),
    status: z.literal('success'),
    request_id: nonEmpty,
    correlation_id: nonEmpty,
    trace_id: nonEmpty,
    retrieval_version: nonEmpty,
    results: z.array(retrievalResultSchema).readonly()
  })
  .strict()
  .readonly();

export type RagRetrievalResponse = Readonly<z.infer<typeof ragRetrievalResponseSchema>>;

export interface RagExecutionOptions {
  readonly signal?: AbortSignal;
}
