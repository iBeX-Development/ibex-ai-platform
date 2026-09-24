import { randomUUID } from 'node:crypto';
import { SpanStatusCode, type Span } from '@opentelemetry/api';
import { z } from 'zod';
import {
  createRagRuntimeAuditEvent,
  type AuditEventSink,
  type RagRuntimeAuditStage
} from '../../audit/src/index.js';
import { PlatformError } from '../../errors/src/index.js';
import { tracer } from '../../observability/src/index.js';
import {
  createTrustedRequestContext,
  enforceAuthorization,
  type ServerAuthorizationPolicy,
  type TrustedRequestContext
} from '../../security/src/index.js';
import { matchesRagSecurityFilter } from './access.js';
import {
  approvedRagRetrievalScopeSchema,
  embeddingEvidenceSchema,
  knowledgeChunkSchema,
  ragIngestionRequestSchema,
  ragIngestionResponseSchema,
  ragRetrievalRequestSchema,
  ragRetrievalScopeDecisionSchema,
  ragRetrievalResponseSchema,
  ragSecurityFilterSchema,
  rankedChunkReferenceSchema,
  type ApprovedRagRetrievalScope,
  type EmbeddingEvidence,
  type KnowledgeChunk,
  type KnowledgeDocument,
  type RagExecutionOptions,
  type RagIngestionRequest,
  type RagIngestionResponse,
  type RagRetrievalRequest,
  type RagRetrievalResponse,
  type RagSecurityFilter,
  type RankedChunkReference
} from './contracts.js';
import {
  calculateDocumentChecksum,
  citationEvidenceHash,
  citationEvidenceHashForStoredChunk,
  sha256Evidence,
  stableChunkId,
  stableChunkIdForStoredChunk
} from './integrity.js';
import type {
  EmbeddingPort,
  KnowledgeGovernancePort,
  KnowledgeStorePort,
  RagRetrievalScopePort,
  RetrievalRankerPort
} from './ports.js';

const governanceDecisionSchema = z.discriminatedUnion('allowed', [
  z.object({ allowed: z.literal(true), decision_id: z.string().trim().min(1) }).strict(),
  z
    .object({
      allowed: z.literal(false),
      reason: z.string().trim().min(1),
      decision_id: z.string().trim().min(1).optional()
    })
    .strict()
]);

const chunkListSchema = z.array(knowledgeChunkSchema).readonly();
const rankedListSchema = z.array(rankedChunkReferenceSchema).readonly();

export interface RagRuntimePolicy {
  readonly ingestion_permissions: readonly string[];
  readonly ingestion_entitlements: readonly string[];
  readonly retrieval_permissions: readonly string[];
  readonly retrieval_entitlements: readonly string[];
  readonly timeout_ms: number;
  readonly retrieval_version: string;
}

export interface RagRuntimeDependencies {
  readonly authorization: ServerAuthorizationPolicy;
  readonly retrievalScope: RagRetrievalScopePort;
  readonly governance: KnowledgeGovernancePort;
  readonly embeddings: EmbeddingPort;
  readonly store: KnowledgeStorePort;
  readonly ranker: RetrievalRankerPort;
  readonly audit: AuditEventSink;
  readonly policy: RagRuntimePolicy;
  readonly service: string;
  readonly environment: string;
  readonly traceIdFactory?: () => string;
  readonly clock?: () => number;
}

function readField(value: unknown, field: string): unknown {
  if (typeof value !== 'object' || value === null || !(field in value)) return undefined;
  return (value as Record<string, unknown>)[field];
}

function validatedTraceId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const traceId = value.trim();
  if (!traceId || traceId.length > 256) return undefined;
  for (let index = 0; index < traceId.length; index += 1) {
    const codeUnit = traceId.charCodeAt(index);
    if (codeUnit <= 31 || codeUnit === 127) return undefined;
  }
  return traceId;
}

function generatedTraceId(factory: () => string): string {
  try {
    return validatedTraceId(factory()) ?? randomUUID();
  } catch {
    return randomUUID();
  }
}

function correlated(error: unknown, traceId: string, requestId?: string): PlatformError {
  const source =
    error instanceof PlatformError
      ? error
      : new PlatformError('INTERNAL_ERROR', 'An internal error occurred', 500);
  return new PlatformError(
    source.code,
    source.publicMessage,
    source.statusCode,
    source.diagnostics,
    traceId,
    requestId
  );
}

function freezeChunk(chunk: KnowledgeChunk): KnowledgeChunk {
  return Object.freeze({
    ...chunk,
    domains: Object.freeze([...chunk.domains]),
    knowledge_scopes: Object.freeze([...chunk.knowledge_scopes]),
    allowed_agents: Object.freeze([...chunk.allowed_agents]),
    access_scope: Object.freeze({
      required_permissions: Object.freeze([...chunk.access_scope.required_permissions]),
      required_entitlements: Object.freeze([...chunk.access_scope.required_entitlements]),
      allowed_roles: Object.freeze([...chunk.access_scope.allowed_roles])
    }),
    source_location: Object.freeze({ ...chunk.source_location }),
    embedding: Object.freeze({
      ...chunk.embedding,
      vector: Object.freeze([...chunk.embedding.vector])
    })
  });
}

function assertDocumentActive(document: KnowledgeDocument, now: Date): void {
  const metadata = document.metadata;
  if (
    metadata.approval_status !== 'approved' ||
    Date.parse(metadata.effective_date) > now.getTime() ||
    (metadata.expiry_date !== undefined && Date.parse(metadata.expiry_date) <= now.getTime())
  ) {
    throw new PlatformError('POLICY_DENIED', 'Knowledge source is not approved for use', 403);
  }
}

function assertTenantBinding(document: KnowledgeDocument, context: TrustedRequestContext): void {
  if (
    document.metadata.tenant_scope === 'tenant_private' &&
    document.metadata.tenant_id !== context.tenant_id
  ) {
    throw new PlatformError(
      'TENANT_SCOPE_VIOLATION',
      'Knowledge source is unavailable within the current authorized scope',
      403
    );
  }
}

function newController(
  externalSignal: AbortSignal | undefined,
  timeoutMs: number
): {
  readonly controller: AbortController;
  readonly cleanup: () => void;
} {
  const controller = new AbortController();
  const cancel = () => {
    controller.abort();
  };
  if (externalSignal?.aborted) controller.abort();
  else externalSignal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, timeoutMs);
  return {
    controller,
    cleanup: () => {
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', cancel);
    }
  };
}

function assertNotAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new PlatformError('TIMEOUT_ERROR', 'RAG request was cancelled', 408);
}

export class RagRuntimeService {
  private readonly clock: () => number;

  constructor(private readonly dependencies: RagRuntimeDependencies) {
    if (
      !dependencies.service.trim() ||
      !dependencies.environment.trim() ||
      !dependencies.policy.retrieval_version.trim() ||
      !Number.isInteger(dependencies.policy.timeout_ms) ||
      dependencies.policy.timeout_ms <= 0
    ) {
      throw new PlatformError('CONFIGURATION_ERROR', 'RAG Runtime configuration is invalid', 500);
    }
    this.clock = dependencies.clock ?? Date.now;
  }

  async ingest(
    inbound: unknown,
    options: RagExecutionOptions = {},
    now: Date = new Date()
  ): Promise<RagIngestionResponse> {
    const traceId =
      validatedTraceId(readField(inbound, 'trace_id')) ??
      generatedTraceId(this.dependencies.traceIdFactory ?? randomUUID);

    return tracer.startActiveSpan('rag_runtime.ingest', async (span) => {
      let stage: RagRuntimeAuditStage = 'boundary_context';
      let context: TrustedRequestContext | undefined;
      let request: RagIngestionRequest | undefined;
      let chunkIds: readonly string[] | undefined;
      let embedding: EmbeddingEvidence | undefined;
      const startedAt = this.clock();
      const operation = newController(options.signal, this.dependencies.policy.timeout_ms);
      span.setAttribute('ibex.rag.trace_id', traceId);

      try {
        if (typeof inbound !== 'object' || inbound === null) {
          throw new PlatformError('VALIDATION_ERROR', 'RAG ingestion request is invalid', 400);
        }
        context = createTrustedRequestContext(readField(inbound, 'context'));
        span.setAttributes({
          'ibex.request_id': context.request_id,
          'ibex.correlation_id': context.correlation_id,
          'ibex.tenant_id': context.tenant_id,
          'ibex.user_id': context.user_id
        });

        stage = 'boundary_trace';
        if (!validatedTraceId(readField(inbound, 'trace_id'))) {
          throw new PlatformError('VALIDATION_ERROR', 'RAG ingestion request is invalid', 400);
        }

        stage = 'request_validation';
        const parsed = ragIngestionRequestSchema.safeParse({ ...inbound, context });
        if (!parsed.success) {
          throw new PlatformError('INVALID_INPUT', 'Knowledge document is invalid', 400);
        }
        request = Object.freeze({ ...parsed.data, context });
        assertNotAborted(operation.controller.signal);

        stage = 'authorization';
        await enforceAuthorization(this.dependencies.authorization, context, {
          capability: 'rag:ingest',
          action: 'publish',
          required_permissions: this.dependencies.policy.ingestion_permissions,
          required_entitlements: this.dependencies.policy.ingestion_entitlements
        });

        stage = 'governance';
        let governanceRaw: unknown;
        try {
          governanceRaw = await this.dependencies.governance.authorizeIngestion(
            context,
            request.document.metadata
          );
        } catch {
          throw new PlatformError(
            'AUTHORIZATION_ERROR',
            'Knowledge governance could not be verified',
            403
          );
        }
        const governance = governanceDecisionSchema.safeParse(governanceRaw);
        if (!governance.success) {
          throw new PlatformError(
            'AUTHORIZATION_ERROR',
            'Knowledge governance could not be verified',
            403
          );
        }
        if (!governance.data.allowed) {
          throw new PlatformError('PERMISSION_DENIED', 'Knowledge publication denied', 403);
        }
        assertTenantBinding(request.document, context);
        assertDocumentActive(request.document, now);

        stage = 'integrity';
        const calculatedChecksum = calculateDocumentChecksum(request.document);
        if (calculatedChecksum !== request.document.metadata.checksum) {
          throw new PlatformError(
            'INVALID_INPUT',
            'Knowledge document integrity check failed',
            400
          );
        }

        stage = 'audit';
        await this.emitAudit({
          traceId,
          context,
          operation: 'ingest',
          outcome: 'started',
          stage: 'embedding',
          timestamp: now,
          agentId: request.agent_id,
          documentIds: [request.document.metadata.document_id],
          documentVersions: [request.document.metadata.document_version]
        });

        stage = 'embedding';
        const chunks: KnowledgeChunk[] = [];
        for (const section of request.document.sections) {
          assertNotAborted(operation.controller.signal);
          let rawEmbedding: unknown;
          try {
            rawEmbedding = await this.dependencies.embeddings.embed({
              context,
              purpose: 'document',
              content: section.content,
              signal: operation.controller.signal
            });
          } catch {
            assertNotAborted(operation.controller.signal);
            throw new PlatformError('DEPENDENCY_ERROR', 'Embedding dependency failed', 502);
          }
          const parsedEmbedding = embeddingEvidenceSchema.safeParse(rawEmbedding);
          if (!parsedEmbedding.success) {
            throw new PlatformError('INVALID_RESPONSE', 'Embedding response is invalid', 502);
          }
          if (
            embedding &&
            (embedding.model_id !== parsedEmbedding.data.model_id ||
              embedding.model_version !== parsedEmbedding.data.model_version ||
              embedding.vector.length !== parsedEmbedding.data.vector.length)
          ) {
            throw new PlatformError('INVALID_RESPONSE', 'Embedding response is inconsistent', 502);
          }
          embedding = parsedEmbedding.data;
          const contentHash = sha256Evidence(section.content);
          const metadata = request.document.metadata;
          chunks.push(
            freezeChunk(
              knowledgeChunkSchema.parse({
                chunk_id: stableChunkId({
                  document_id: metadata.document_id,
                  document_version: metadata.document_version,
                  tenant_scope: metadata.tenant_scope,
                  ...(metadata.tenant_id ? { tenant_id: metadata.tenant_id } : {}),
                  section: section.location.section,
                  reference: section.location.reference,
                  ...(section.location.page !== undefined ? { page: section.location.page } : {}),
                  ordinal: section.location.ordinal,
                  content_hash: contentHash
                }),
                document_id: metadata.document_id,
                document_version: metadata.document_version,
                title: metadata.title,
                document_updated_at: metadata.updated_at,
                tenant_scope: metadata.tenant_scope,
                ...(metadata.tenant_id ? { tenant_id: metadata.tenant_id } : {}),
                domains: metadata.domains,
                knowledge_scopes: metadata.knowledge_scopes,
                allowed_agents: metadata.allowed_agents,
                classification: metadata.classification,
                approval_status: metadata.approval_status,
                effective_date: metadata.effective_date,
                ...(metadata.expiry_date ? { expiry_date: metadata.expiry_date } : {}),
                access_scope: metadata.access_scope,
                source_type: metadata.source_type,
                source_uri: metadata.source_uri,
                source_location: section.location,
                language: metadata.language,
                content: section.content,
                content_hash: contentHash,
                document_checksum: metadata.checksum,
                citation_evidence_hash: citationEvidenceHash({
                  document_id: metadata.document_id,
                  document_version: metadata.document_version,
                  tenant_scope: metadata.tenant_scope,
                  ...(metadata.tenant_id ? { tenant_id: metadata.tenant_id } : {}),
                  section: section.location.section,
                  reference: section.location.reference,
                  ...(section.location.page !== undefined ? { page: section.location.page } : {}),
                  ordinal: section.location.ordinal,
                  content_hash: contentHash,
                  source_uri: metadata.source_uri,
                  title: metadata.title,
                  document_checksum: metadata.checksum
                }),
                embedding: parsedEmbedding.data
              })
            )
          );
        }
        chunkIds = Object.freeze(chunks.map(({ chunk_id }) => chunk_id));

        stage = 'indexing';
        try {
          await this.dependencies.store.upsert(Object.freeze(chunks), operation.controller.signal);
        } catch {
          assertNotAborted(operation.controller.signal);
          throw new PlatformError('DEPENDENCY_ERROR', 'Knowledge store update failed', 502);
        }

        const response = ragIngestionResponseSchema.parse({
          contract_version: '1.0',
          status: 'indexed',
          request_id: context.request_id,
          correlation_id: context.correlation_id,
          trace_id: traceId,
          document_id: request.document.metadata.document_id,
          document_version: request.document.metadata.document_version,
          document_checksum: request.document.metadata.checksum,
          chunk_ids: chunkIds
        });
        stage = 'audit';
        await this.emitAudit({
          traceId,
          context,
          operation: 'ingest',
          outcome: 'succeeded',
          stage,
          timestamp: now,
          agentId: request.agent_id,
          documentIds: [request.document.metadata.document_id],
          documentVersions: [request.document.metadata.document_version],
          chunkIds,
          ...(embedding
            ? {
                embeddingModel: embedding.model_id,
                embeddingModelVersion: embedding.model_version
              }
            : {}),
          latencyMs: this.clock() - startedAt
        });
        span.setStatus({ code: SpanStatusCode.OK });
        return Object.freeze(response);
      } catch (error) {
        const safeError = correlated(error, traceId, context?.request_id);
        this.recordFailure(span, safeError);
        await this.safeFailureAudit({
          traceId,
          operation: 'ingest',
          stage,
          timestamp: now,
          ...(context ? { context } : {}),
          ...(request ? { agentId: request.agent_id } : {}),
          ...(request
            ? {
                documentIds: [request.document.metadata.document_id],
                documentVersions: [request.document.metadata.document_version]
              }
            : {}),
          ...(chunkIds ? { chunkIds } : {}),
          latencyMs: this.clock() - startedAt,
          errorCode: safeError.code,
          statusCode: safeError.statusCode
        });
        throw safeError;
      } finally {
        operation.cleanup();
        span.end();
      }
    });
  }

  async retrieve(
    inbound: unknown,
    options: RagExecutionOptions = {},
    now: Date = new Date()
  ): Promise<RagRetrievalResponse> {
    const traceId =
      validatedTraceId(readField(inbound, 'trace_id')) ??
      generatedTraceId(this.dependencies.traceIdFactory ?? randomUUID);

    return tracer.startActiveSpan('rag_runtime.retrieve', async (span) => {
      let stage: RagRuntimeAuditStage = 'boundary_context';
      let context: TrustedRequestContext | undefined;
      let request: RagRetrievalRequest | undefined;
      let approvedScope: ApprovedRagRetrievalScope | undefined;
      let queryHash: string | undefined;
      let embedding: EmbeddingEvidence | undefined;
      let selectedChunks: readonly KnowledgeChunk[] = [];
      const startedAt = this.clock();
      const operation = newController(options.signal, this.dependencies.policy.timeout_ms);
      span.setAttribute('ibex.rag.trace_id', traceId);

      try {
        if (typeof inbound !== 'object' || inbound === null) {
          throw new PlatformError('VALIDATION_ERROR', 'RAG retrieval request is invalid', 400);
        }
        context = createTrustedRequestContext(readField(inbound, 'context'));
        span.setAttributes({
          'ibex.request_id': context.request_id,
          'ibex.correlation_id': context.correlation_id,
          'ibex.tenant_id': context.tenant_id,
          'ibex.user_id': context.user_id
        });

        stage = 'boundary_trace';
        if (!validatedTraceId(readField(inbound, 'trace_id'))) {
          throw new PlatformError('VALIDATION_ERROR', 'RAG retrieval request is invalid', 400);
        }

        stage = 'request_validation';
        const parsed = ragRetrievalRequestSchema.safeParse({ ...inbound, context });
        if (!parsed.success) {
          throw new PlatformError('INVALID_INPUT', 'RAG retrieval request is invalid', 400);
        }
        request = Object.freeze({ ...parsed.data, context });
        queryHash = sha256Evidence(request.query);
        assertNotAborted(operation.controller.signal);

        stage = 'authorization';
        await enforceAuthorization(this.dependencies.authorization, context, {
          capability: 'rag:retrieve',
          action: 'read',
          required_permissions: this.dependencies.policy.retrieval_permissions,
          required_entitlements: this.dependencies.policy.retrieval_entitlements
        });

        stage = 'scope_resolution';
        let rawScopeDecision: unknown;
        try {
          rawScopeDecision = await this.dependencies.retrievalScope.resolve(
            context,
            request.routing_decision_id
          );
        } catch {
          throw new PlatformError(
            'AUTHORIZATION_ERROR',
            'RAG retrieval scope could not be verified',
            403
          );
        }
        const scopeDecision = ragRetrievalScopeDecisionSchema.safeParse(rawScopeDecision);
        if (!scopeDecision.success) {
          throw new PlatformError(
            'AUTHORIZATION_ERROR',
            'RAG retrieval scope could not be verified',
            403
          );
        }
        if (!scopeDecision.data.allowed) {
          throw new PlatformError('PERMISSION_DENIED', 'RAG retrieval scope denied', 403);
        }
        const parsedScope = approvedRagRetrievalScopeSchema.parse(scopeDecision.data.scope);
        if (
          parsedScope.routing_decision_id !== request.routing_decision_id ||
          parsedScope.tenant_id !== context.tenant_id ||
          parsedScope.user_id !== context.user_id ||
          parsedScope.request_id !== context.request_id ||
          parsedScope.correlation_id !== context.correlation_id
        ) {
          throw new PlatformError(
            'TENANT_SCOPE_VIOLATION',
            'RAG retrieval scope conflicts with trusted request context',
            403
          );
        }
        approvedScope = Object.freeze({
          ...parsedScope,
          knowledge_scopes: Object.freeze([...parsedScope.knowledge_scopes])
        });

        const filter: RagSecurityFilter = Object.freeze(
          ragSecurityFilterSchema.parse({
            tenant_id: context.tenant_id,
            user_id: context.user_id,
            role: context.role,
            permissions: context.permissions,
            entitlements: context.entitlements,
            agent_id: approvedScope.agent_id,
            domain: approvedScope.domain,
            knowledge_scopes: approvedScope.knowledge_scopes,
            approval_status: 'approved',
            effective_at: now.toISOString(),
            latest_approved_only: true
          })
        );

        stage = 'audit';
        await this.emitAudit({
          traceId,
          context,
          operation: 'retrieve',
          outcome: 'started',
          stage: 'security_filter',
          timestamp: now,
          agentId: approvedScope.agent_id,
          domain: approvedScope.domain,
          knowledgeScopes: approvedScope.knowledge_scopes,
          queryHash,
          retrievalVersion: this.dependencies.policy.retrieval_version
        });

        stage = 'security_filter';
        let rawCandidates: unknown;
        try {
          rawCandidates = await this.dependencies.store.filter(filter, operation.controller.signal);
        } catch {
          assertNotAborted(operation.controller.signal);
          throw new PlatformError('DEPENDENCY_ERROR', 'Knowledge store query failed', 502);
        }
        const parsedCandidates = chunkListSchema.safeParse(rawCandidates);
        if (!parsedCandidates.success) {
          throw new PlatformError('INVALID_RESPONSE', 'Knowledge store response is invalid', 502);
        }
        if (
          parsedCandidates.data.some(
            (chunk) =>
              sha256Evidence(chunk.content) !== chunk.content_hash ||
              stableChunkIdForStoredChunk(chunk) !== chunk.chunk_id ||
              citationEvidenceHashForStoredChunk(chunk) !== chunk.citation_evidence_hash
          )
        ) {
          throw new PlatformError(
            'INVALID_RESPONSE',
            'Knowledge chunk integrity check failed',
            502
          );
        }
        if (parsedCandidates.data.some((chunk) => !matchesRagSecurityFilter(chunk, filter))) {
          throw new PlatformError(
            'TENANT_SCOPE_VIOLATION',
            'Knowledge retrieval violated the authorized scope',
            403
          );
        }
        const candidateMap = new Map(
          parsedCandidates.data.map((chunk) => [chunk.chunk_id, freezeChunk(chunk)] as const)
        );
        if (candidateMap.size !== parsedCandidates.data.length) {
          throw new PlatformError('INVALID_RESPONSE', 'Knowledge store response is invalid', 502);
        }
        if (candidateMap.size === 0) {
          return await this.finishEmptyRetrieval({
            traceId,
            context,
            approvedScope,
            queryHash,
            now,
            startedAt,
            span
          });
        }

        stage = 'embedding';
        let rawEmbedding: unknown;
        try {
          rawEmbedding = await this.dependencies.embeddings.embed({
            context,
            purpose: 'query',
            content: request.query,
            signal: operation.controller.signal
          });
        } catch {
          assertNotAborted(operation.controller.signal);
          throw new PlatformError('DEPENDENCY_ERROR', 'Embedding dependency failed', 502);
        }
        const parsedEmbedding = embeddingEvidenceSchema.safeParse(rawEmbedding);
        if (!parsedEmbedding.success) {
          throw new PlatformError('INVALID_RESPONSE', 'Embedding response is invalid', 502);
        }
        embedding = parsedEmbedding.data;

        stage = 'semantic_search';
        let rawRanked: unknown;
        try {
          rawRanked = await this.dependencies.ranker.rank({
            query: request.query,
            query_embedding: embedding,
            candidates: Object.freeze([...candidateMap.values()]),
            top_k: request.top_k,
            signal: operation.controller.signal
          });
        } catch {
          assertNotAborted(operation.controller.signal);
          throw new PlatformError('DEPENDENCY_ERROR', 'RAG ranking dependency failed', 502);
        }

        stage = 'result_validation';
        const ranked = rankedListSchema.safeParse(rawRanked);
        if (!ranked.success || ranked.data.length > request.top_k) {
          throw new PlatformError('INVALID_RESPONSE', 'RAG ranking response is invalid', 502);
        }
        const rankedIds = new Set(ranked.data.map(({ chunk_id }) => chunk_id));
        if (
          rankedIds.size !== ranked.data.length ||
          ranked.data.some(({ chunk_id }) => !candidateMap.has(chunk_id))
        ) {
          throw new PlatformError('INVALID_RESPONSE', 'RAG ranking response is invalid', 502);
        }
        selectedChunks = Object.freeze(
          ranked.data.map(({ chunk_id }) => candidateMap.get(chunk_id) as KnowledgeChunk)
        );
        if (selectedChunks.some((chunk) => !matchesRagSecurityFilter(chunk, filter))) {
          throw new PlatformError(
            'TENANT_SCOPE_VIOLATION',
            'Knowledge retrieval violated the authorized scope',
            403
          );
        }

        const response = this.createRetrievalResponse(context, traceId, ranked.data, candidateMap);
        stage = 'audit';
        await this.emitAudit({
          traceId,
          context,
          operation: 'retrieve',
          outcome: 'succeeded',
          stage,
          timestamp: now,
          agentId: approvedScope.agent_id,
          domain: approvedScope.domain,
          knowledgeScopes: approvedScope.knowledge_scopes,
          queryHash,
          documentIds: selectedChunks.map(({ document_id }) => document_id),
          documentVersions: selectedChunks.map(({ document_version }) => document_version),
          chunkIds: selectedChunks.map(({ chunk_id }) => chunk_id),
          retrievalScores: ranked.data,
          retrievalResults: ranked.data.map((ranking) => {
            const chunk = candidateMap.get(ranking.chunk_id);
            if (!chunk) {
              throw new PlatformError('INVALID_RESPONSE', 'RAG ranking response is invalid', 502);
            }
            return {
              document_id: chunk.document_id,
              document_version: chunk.document_version,
              chunk_id: chunk.chunk_id,
              citation_evidence_hash: chunk.citation_evidence_hash,
              source_location: chunk.source_location,
              score: ranking.score,
              semantic_score: ranking.semantic_score,
              keyword_score: ranking.keyword_score
            };
          }),
          embeddingModel: embedding.model_id,
          embeddingModelVersion: embedding.model_version,
          retrievalVersion: this.dependencies.policy.retrieval_version,
          resultCount: response.results.length,
          latencyMs: this.clock() - startedAt
        });
        span.setStatus({ code: SpanStatusCode.OK });
        return Object.freeze(response);
      } catch (error) {
        const safeError = correlated(error, traceId, context?.request_id);
        this.recordFailure(span, safeError);
        await this.safeFailureAudit({
          traceId,
          operation: 'retrieve',
          stage,
          timestamp: now,
          ...(context ? { context } : {}),
          ...(approvedScope
            ? {
                agentId: approvedScope.agent_id,
                domain: approvedScope.domain,
                knowledgeScopes: approvedScope.knowledge_scopes
              }
            : {}),
          ...(queryHash ? { queryHash } : {}),
          documentIds: selectedChunks.map(({ document_id }) => document_id),
          documentVersions: selectedChunks.map(({ document_version }) => document_version),
          chunkIds: selectedChunks.map(({ chunk_id }) => chunk_id),
          ...(embedding
            ? {
                embeddingModel: embedding.model_id,
                embeddingModelVersion: embedding.model_version
              }
            : {}),
          retrievalVersion: this.dependencies.policy.retrieval_version,
          latencyMs: this.clock() - startedAt,
          errorCode: safeError.code,
          statusCode: safeError.statusCode
        });
        throw safeError;
      } finally {
        operation.cleanup();
        span.end();
      }
    });
  }

  private async finishEmptyRetrieval(input: {
    readonly traceId: string;
    readonly context: TrustedRequestContext;
    readonly approvedScope: ApprovedRagRetrievalScope;
    readonly queryHash: string;
    readonly now: Date;
    readonly startedAt: number;
    readonly span: Span;
  }): Promise<RagRetrievalResponse> {
    const response = ragRetrievalResponseSchema.parse({
      contract_version: '1.0',
      status: 'success',
      request_id: input.context.request_id,
      correlation_id: input.context.correlation_id,
      trace_id: input.traceId,
      retrieval_version: this.dependencies.policy.retrieval_version,
      results: []
    });
    await this.emitAudit({
      traceId: input.traceId,
      context: input.context,
      operation: 'retrieve',
      outcome: 'succeeded',
      stage: 'audit',
      timestamp: input.now,
      agentId: input.approvedScope.agent_id,
      domain: input.approvedScope.domain,
      knowledgeScopes: input.approvedScope.knowledge_scopes,
      queryHash: input.queryHash,
      documentIds: [],
      documentVersions: [],
      chunkIds: [],
      retrievalScores: [],
      retrievalResults: [],
      retrievalVersion: this.dependencies.policy.retrieval_version,
      resultCount: 0,
      latencyMs: this.clock() - input.startedAt
    });
    input.span.setStatus({ code: SpanStatusCode.OK });
    return Object.freeze(response);
  }

  private createRetrievalResponse(
    context: TrustedRequestContext,
    traceId: string,
    ranked: readonly RankedChunkReference[],
    candidates: ReadonlyMap<string, KnowledgeChunk>
  ): RagRetrievalResponse {
    return ragRetrievalResponseSchema.parse({
      contract_version: '1.0',
      status: 'success',
      request_id: context.request_id,
      correlation_id: context.correlation_id,
      trace_id: traceId,
      retrieval_version: this.dependencies.policy.retrieval_version,
      results: ranked.map((ranking) => {
        const chunk = candidates.get(ranking.chunk_id);
        if (!chunk) {
          throw new PlatformError('INVALID_RESPONSE', 'RAG ranking response is invalid', 502);
        }
        return {
          content: chunk.content,
          content_trust: 'untrusted_retrieved_content',
          instruction_authority: 'none',
          score: ranking.score,
          semantic_score: ranking.semantic_score,
          keyword_score: ranking.keyword_score,
          citation: {
            document_id: chunk.document_id,
            document_version: chunk.document_version,
            title: chunk.title,
            chunk_id: chunk.chunk_id,
            source_uri: chunk.source_uri,
            source_location: chunk.source_location,
            content_hash: chunk.content_hash,
            document_checksum: chunk.document_checksum,
            citation_evidence_hash: chunk.citation_evidence_hash
          }
        };
      })
    });
  }

  private recordFailure(span: Span, error: PlatformError): void {
    span.setAttributes({
      'ibex.rag.outcome': error.statusCode >= 500 ? 'error' : 'rejected',
      'ibex.rag.error_code': error.code
    });
    span.recordException(new Error('RAG Runtime request failed'));
    span.setStatus({ code: SpanStatusCode.ERROR });
  }

  private safeFailureAudit(
    input: Omit<Parameters<RagRuntimeService['emitAudit']>[0], 'outcome'> & {
      readonly statusCode: number;
    }
  ): Promise<void> {
    const { statusCode, ...auditInput } = input;
    return this.emitAudit({
      ...auditInput,
      outcome: statusCode >= 500 ? 'error' : 'rejected'
    }).catch(() => undefined);
  }

  private emitAudit(input: {
    readonly traceId: string;
    readonly context?: TrustedRequestContext;
    readonly operation: 'ingest' | 'retrieve';
    readonly outcome: 'started' | 'succeeded' | 'rejected' | 'error';
    readonly stage: RagRuntimeAuditStage;
    readonly timestamp: Date;
    readonly agentId?: string;
    readonly domain?: string;
    readonly knowledgeScopes?: readonly string[];
    readonly queryHash?: string;
    readonly documentIds?: readonly string[];
    readonly documentVersions?: readonly string[];
    readonly chunkIds?: readonly string[];
    readonly retrievalScores?: readonly RankedChunkReference[];
    readonly retrievalResults?: readonly {
      readonly document_id: string;
      readonly document_version: string;
      readonly chunk_id: string;
      readonly citation_evidence_hash: string;
      readonly source_location: KnowledgeChunk['source_location'];
      readonly score: number;
      readonly semantic_score: number;
      readonly keyword_score: number;
    }[];
    readonly embeddingModel?: string;
    readonly embeddingModelVersion?: string;
    readonly retrievalVersion?: string;
    readonly resultCount?: number;
    readonly latencyMs?: number;
    readonly errorCode?: string;
  }): Promise<void> {
    return this.dependencies.audit.emit(
      createRagRuntimeAuditEvent({
        traceId: input.traceId,
        service: this.dependencies.service,
        environment: this.dependencies.environment,
        operation: input.operation,
        outcome: input.outcome,
        stage: input.stage,
        timestamp: input.timestamp,
        ...(input.context ? { context: input.context } : {}),
        ...(input.agentId ? { agentId: input.agentId } : {}),
        ...(input.domain ? { domain: input.domain } : {}),
        ...(input.knowledgeScopes ? { knowledgeScopes: input.knowledgeScopes } : {}),
        ...(input.queryHash ? { queryHash: input.queryHash } : {}),
        ...(input.documentIds ? { documentIds: input.documentIds } : {}),
        ...(input.documentVersions ? { documentVersions: input.documentVersions } : {}),
        ...(input.chunkIds ? { chunkIds: input.chunkIds } : {}),
        ...(input.retrievalScores ? { retrievalScores: input.retrievalScores } : {}),
        ...(input.retrievalResults ? { retrievalResults: input.retrievalResults } : {}),
        ...(input.embeddingModel ? { embeddingModel: input.embeddingModel } : {}),
        ...(input.embeddingModelVersion
          ? { embeddingModelVersion: input.embeddingModelVersion }
          : {}),
        ...(input.retrievalVersion ? { retrievalVersion: input.retrievalVersion } : {}),
        ...(input.resultCount !== undefined ? { resultCount: input.resultCount } : {}),
        ...(input.latencyMs !== undefined ? { latencyMs: input.latencyMs } : {}),
        ...(input.errorCode ? { errorCode: input.errorCode } : {})
      })
    );
  }
}
