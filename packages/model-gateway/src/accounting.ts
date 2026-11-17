import { createHash } from 'node:crypto';
import { z } from 'zod';
import { PlatformError } from '../../errors/src/index.js';

const identity = z.string().trim().min(1).max(256);
const count = z.number().int().nonnegative().int();
const positive = count.positive();
export const accountingScopes = [
  'global',
  'tenant',
  'agent',
  'provider',
  'model',
  'environment'
] as const;
export type AccountingScope = (typeof accountingScopes)[number];
const limit = z
  .object({
    tokens: positive,
    cost_units: positive,
    attempts: positive,
    warning_cost_units: positive
  })
  .strict()
  .superRefine((value, context) => {
    if (value.warning_cost_units > value.cost_units)
      context.addIssue({ code: 'custom', message: 'Warning exceeds hard limit' });
  });

/** Server-injected authority. No production values or unbounded/default policy exist. */
export const modelBudgetPolicySchema = z
  .object({
    version: identity,
    authority_ref: identity,
    pricing_version: identity,
    cost_unit: identity,
    units_per_cost: positive,
    valid_from_ms: count,
    valid_until_ms: positive,
    operation_timeout_ms: positive.max(2_147_483_647),
    // The authority supplies exact monthly boundaries; this library does not select a timezone.
    period: z
      .object({
        id: identity,
        kind: z.literal('month'),
        timezone: identity,
        starts_at_ms: count,
        ends_at_ms: positive
      })
      .strict(),
    request_counting: z.literal('provider_attempt'),
    period_assignment: z.literal('reservation'),
    uncertain_usage: z.literal('retain_bound'),
    warning_basis: z.literal('settled_and_reserved'),
    request: z
      .object({
        input_tokens: positive,
        output_tokens: positive,
        tokens: positive,
        cost_units: positive,
        attempts: positive
      })
      .strict(),
    limits: z
      .object({
        global: limit,
        tenant: limit.optional(),
        agent: limit.optional(),
        provider: limit.optional(),
        model: limit.optional(),
        environment: limit.optional()
      })
      .strict(),
    pricing: z
      .array(
        z
          .object({
            provider_id: identity,
            model_id: identity,
            model_version: identity,
            input_units_per_token: count,
            output_units_per_token: count
          })
          .strict()
      )
      .min(1)
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.valid_from_ms >= value.valid_until_ms ||
      value.period.starts_at_ms >= value.period.ends_at_ms
    )
      context.addIssue({ code: 'custom', message: 'Invalid policy interval' });
    const keys = value.pricing.map((p) =>
      JSON.stringify([p.provider_id, p.model_id, p.model_version])
    );
    if (new Set(keys).size !== keys.length)
      context.addIssue({ code: 'custom', message: 'Duplicate tariff' });
  });
export type ModelBudgetPolicy = Readonly<z.infer<typeof modelBudgetPolicySchema>>;
export interface ModelAccountingPolicyInput {
  readonly policy: unknown;
  readonly port: ModelAccountingPort;
}

export interface AccountingAttempt {
  readonly invocation_id: string;
  readonly attempt_id: string;
  readonly request_id: string;
  readonly correlation_id: string;
  readonly trace_id: string;
  readonly tenant_id: string;
  readonly agent_id: string;
  readonly provider_id: string;
  readonly model_id: string;
  readonly model_version: string;
  readonly environment: string;
  readonly bounds_version: string;
  readonly input_digest: string;
  readonly input_tokens: number;
  readonly output_tokens: number;
  readonly cost_units: number;
}
export interface AccountingReservationCommand {
  readonly command_hash: string;
  readonly policy: ModelBudgetPolicy;
  readonly attempt: AccountingAttempt;
}
export interface AccountingSettlementCommand {
  readonly command_hash: string;
  readonly reservation: AccountingReservationCommand;
  readonly usage: Readonly<{ input_tokens: number; output_tokens: number; cost_units: number }>;
}
export interface AccountingReceipt {
  readonly command_hash: string;
  readonly attempt_id: string;
  readonly policy_version: string;
  readonly period_id: string;
  readonly state: 'unresolved' | 'settled';
  readonly warnings: readonly AccountingScope[];
}

/**
 * Trusted shared backend contract, NOT an implementation of distributed accounting.
 * reserve atomically validates current authority/pricing/period, all scoped/request caps,
 * and records an unresolved liability and threshold outbox entry before acknowledging.
 * Same command is idempotent; a changed command for an existing attempt is rejected.
 * Holds never expire/release merely because admission expired, a caller cancelled or died.
 * settle atomically replaces that hold with known usage exactly once, preserving attribution.
 * Lost acknowledgements require independent reconciliation, never a provider replay.
 */
export interface ModelAccountingPort {
  reserve(command: AccountingReservationCommand): Promise<AccountingReceipt>;
  settle(command: AccountingSettlementCommand): Promise<AccountingReceipt>;
}
export class UnconfiguredModelAccountingPort implements ModelAccountingPort {
  reserve(): Promise<AccountingReceipt> {
    return Promise.reject(accountingError());
  }
  settle(): Promise<AccountingReceipt> {
    return Promise.reject(accountingError());
  }
}

export function accountingError(): PlatformError {
  return new PlatformError('DEPENDENCY_ERROR', 'Model accounting is unavailable or uncertain', 503);
}
export function budgetDenied(): PlatformError {
  return new PlatformError('BUDGET_EXCEEDED', 'Model budget denied the request', 429);
}
export function accountingHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
export function freezeAccounting<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeAccounting(child);
    Object.freeze(value);
  }
  return value;
}
export function parseBudgetPolicy(value: unknown): ModelBudgetPolicy {
  const parsed = modelBudgetPolicySchema.safeParse(value);
  if (!parsed.success)
    throw new PlatformError(
      'CONFIGURATION_ERROR',
      'Model accounting policy is not configured',
      500
    );
  return freezeAccounting(parsed.data);
}
export function assertAccountingActive(policy: ModelBudgetPolicy, now: number): void {
  if (
    !Number.isSafeInteger(now) ||
    now < policy.valid_from_ms ||
    now >= policy.valid_until_ms ||
    now < policy.period.starts_at_ms ||
    now >= policy.period.ends_at_ms
  )
    throw accountingError();
}
export function quoteCost(
  policy: ModelBudgetPolicy,
  attempt: Pick<AccountingAttempt, 'provider_id' | 'model_id' | 'model_version'>,
  input: number,
  output: number
): number {
  if (!Number.isSafeInteger(input) || input < 0 || !Number.isSafeInteger(output) || output < 0)
    throw accountingError();
  const price = policy.pricing.find(
    (p) =>
      p.provider_id === attempt.provider_id &&
      p.model_id === attempt.model_id &&
      p.model_version === attempt.model_version
  );
  if (!price) throw accountingError();
  const amount =
    BigInt(input) * BigInt(price.input_units_per_token) +
    BigInt(output) * BigInt(price.output_units_per_token);
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) throw accountingError();
  return Number(amount);
}
const receiptSchema = z
  .object({
    command_hash: z.string(),
    attempt_id: identity,
    policy_version: identity,
    period_id: identity,
    state: z.enum(['unresolved', 'settled']),
    warnings: z.array(z.enum(accountingScopes))
  })
  .strict();

/** Snapshot only validated metadata; never forward an adapter's extra fields to telemetry. */
export function snapshotAccountingReceipt(
  receipt: unknown,
  command: AccountingReservationCommand | AccountingSettlementCommand,
  state: AccountingReceipt['state']
): AccountingReceipt {
  const reservation = 'reservation' in command ? command.reservation : command;
  const parsed = receiptSchema.safeParse(receipt);
  if (!parsed.success) throw accountingError();
  const value = parsed.data;
  if (
    value.command_hash !== command.command_hash ||
    value.state !== state ||
    value.attempt_id !== reservation.attempt.attempt_id ||
    value.policy_version !== reservation.policy.version ||
    value.period_id !== reservation.policy.period.id ||
    new Set(value.warnings).size !== value.warnings.length
  )
    throw accountingError();
  return freezeAccounting(value);
}
