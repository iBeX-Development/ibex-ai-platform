import type { TrustedRequestContext } from '../../security/src/index.js';
import type {
  EmbeddingEvidence,
  KnowledgeChunk,
  KnowledgeMetadata,
  RagSecurityFilter
} from './contracts.js';

export interface EmbeddingPort {
  embed(
    request: Readonly<{
      context: TrustedRequestContext;
      purpose: 'document' | 'query';
      content: string;
      signal: AbortSignal;
    }>
  ): Promise<unknown>;
}

/**
 * The store must apply every supplied metadata filter before returning chunks.
 * Concrete vector-store technology requires a separately approved adapter.
 */
export interface KnowledgeStorePort {
  upsert(chunks: readonly KnowledgeChunk[], signal: AbortSignal): Promise<void>;
  filter(filter: RagSecurityFilter, signal: AbortSignal): Promise<unknown>;
}

/** Ranking receives only chunks that already passed the security filter. */
export interface RetrievalRankerPort {
  rank(
    request: Readonly<{
      query: string;
      query_embedding: EmbeddingEvidence;
      candidates: readonly KnowledgeChunk[];
      top_k: number;
      signal: AbortSignal;
    }>
  ): Promise<unknown>;
}

export type KnowledgeGovernanceDecision =
  | Readonly<{ allowed: true; decision_id: string }>
  | Readonly<{ allowed: false; reason: string; decision_id?: string }>;

/** Approval and publishing authority remain server-side and outside document content. */
export interface KnowledgeGovernancePort {
  authorizeIngestion(
    context: TrustedRequestContext,
    metadata: KnowledgeMetadata
  ): Promise<KnowledgeGovernanceDecision>;
}
