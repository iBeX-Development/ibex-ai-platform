import type { TrustedRequestContext } from '../../security/src/index.js';
import type {
  ActionExecutionReceipt,
  ApprovalActionDefinition,
  ApprovalDecisionEvidence,
  ApprovalRecord,
  TargetStateEvidence
} from './contracts.js';

/** Production implementations must provide tenant-safe durable compare-and-set storage. */
export interface ApprovalRecordStore {
  get(approvalId: string): Promise<ApprovalRecord | undefined>;
  save(record: ApprovalRecord, expectedRevision: number | null): Promise<boolean>;
}

/**
 * Server-side Core/workflow authority. Callers and models cannot submit a decision through the
 * Approval Runtime request contract.
 */
export interface ApprovalDecisionSource {
  readonly mode: 'deterministic_test' | 'live_core';
  getDecision(
    input: Readonly<{
      context: TrustedRequestContext;
      approval: ApprovalRecord;
    }>
  ): Promise<unknown>;
}

/** Approved Core/API state resolver. It must not read the Core database directly. */
export interface ApprovalTargetStateResolver {
  readonly mode: 'deterministic_test' | 'live_core';
  resolve(
    input: Readonly<{
      context: TrustedRequestContext;
      target: Readonly<{ type: string; id: string }>;
      action: ApprovalActionDefinition;
    }>
  ): Promise<unknown>;
}

/** Controlled execution boundary; concrete live endpoints and credentials are intentionally absent. */
export interface ApprovalExecutionAdapter {
  readonly action_type: string;
  readonly action_version: string;
  readonly mode: 'deterministic_test' | 'live_core';
  execute(
    input: Readonly<{
      context: TrustedRequestContext;
      approval: ApprovalRecord;
      action: ApprovalActionDefinition;
      idempotency_key: string;
    }>
  ): Promise<unknown>;
}

export type ValidatedApprovalDecision = ApprovalDecisionEvidence;
export type ValidatedTargetState = TargetStateEvidence;
export type ValidatedExecutionReceipt = ActionExecutionReceipt;
