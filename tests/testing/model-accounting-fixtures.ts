import {
  accountingError,
  accountingHash,
  assertAccountingActive,
  budgetDenied,
  freezeAccounting,
  parseBudgetPolicy,
  quoteCost,
  type AccountingReceipt,
  type AccountingReservationCommand,
  type AccountingScope,
  type AccountingSettlementCommand,
  type ModelAccountingPort,
  type ModelBudgetPolicy,
  type ModelProviderAdapter
} from '../../packages/model-gateway/src/index.js';

// SYNTHETIC ONLY. No production currency, calendar, authority, tariffs or caps.
const syntheticLimit = {
  tokens: 1_000_000,
  cost_units: 1_000_000,
  attempts: 1_000,
  warning_cost_units: 900_000
};
export const syntheticBudgetPolicy = parseBudgetPolicy({
  version: 'synthetic-budget-1',
  authority_ref: 'fixture-only',
  pricing_version: 'synthetic-price-1',
  cost_unit: 'synthetic-unit',
  units_per_cost: 100_000,
  valid_from_ms: 0,
  valid_until_ms: 10_000_000_000_000,
  operation_timeout_ms: 100,
  period: {
    id: 'synthetic-month-1',
    kind: 'month',
    timezone: 'fixture-calendar',
    starts_at_ms: 0,
    ends_at_ms: 10_000_000_000_000
  },
  request_counting: 'provider_attempt',
  period_assignment: 'reservation',
  uncertain_usage: 'retain_bound',
  warning_basis: 'settled_and_reserved',
  request: {
    input_tokens: 128,
    output_tokens: 64,
    tokens: 10_000,
    cost_units: 10_000,
    attempts: 10
  },
  limits: {
    global: syntheticLimit,
    tenant: syntheticLimit,
    agent: syntheticLimit,
    provider: syntheticLimit,
    model: syntheticLimit,
    environment: syntheticLimit
  },
  pricing: [
    ['provider-primary', 'general-primary', '2026-09'],
    ['provider-fallback', 'general-fallback', '2026-08'],
    ['approved-live-provider', 'general-primary', '2026-09']
  ].map(([provider_id, model_id, model_version]) => ({
    provider_id,
    model_id,
    model_version,
    input_units_per_token: 1,
    output_units_per_token: 2
  }))
});

export function syntheticBoundedAdapter(adapter: ModelProviderAdapter): ModelProviderAdapter {
  // Explicit undefined tests unsupported guarantees; no production auto-certification exists.
  if ('tokenBounds' in adapter) return adapter;
  return {
    ...adapter,
    tokenBounds: {
      version: 'synthetic-counter-1',
      enforces_input_bound: true,
      enforces_output_limit: true,
      countInputTokens: () => Promise.resolve(32)
    }
  };
}

type Row = {
  command: AccountingReservationCommand;
  receipt: AccountingReceipt;
  settlement?: AccountingSettlementCommand;
};
/** Single-process, synchronous atomic test model. NOT a durable/distributed adapter. */
export class SyntheticAccountingPort implements ModelAccountingPort {
  readonly rows = new Map<string, Row>();
  readonly warningOutbox: { attempt_id: string; scope: AccountingScope }[] = [];
  constructor(
    public authority: ModelBudgetPolicy = syntheticBudgetPolicy,
    private readonly clock: () => number = () => 100
  ) {}

  reserve(command: AccountingReservationCommand): Promise<AccountingReceipt> {
    return Promise.resolve().then(() => this.reserveAtomic(command));
  }

  private reserveAtomic(command: AccountingReservationCommand): AccountingReceipt {
    const { policy, attempt } = command;
    if (
      accountingHash({ policy, attempt }) !== command.command_hash ||
      accountingHash(policy) !== accountingHash(this.authority)
    )
      throw accountingError();
    const existing = this.rows.get(attempt.attempt_id);
    if (existing) {
      if (existing.command.command_hash !== command.command_hash) throw accountingError();
      // Duplicate reserve cannot authorize a second dispatch (service never retries reserve).
      return existing.receipt;
    }
    assertAccountingActive(this.authority, this.clock());
    const cost = quoteCost(policy, attempt, attempt.input_tokens, attempt.output_tokens);
    if (
      cost !== attempt.cost_units ||
      attempt.input_tokens > policy.request.input_tokens ||
      attempt.output_tokens > policy.request.output_tokens
    )
      throw accountingError();
    const scoped = [...this.rows.values()].filter(
      (row) => row.command.policy.period.id === policy.period.id
    );
    const usage = (row: Row) =>
      row.settlement?.usage ?? {
        input_tokens: row.command.attempt.input_tokens,
        output_tokens: row.command.attempt.output_tokens,
        cost_units: row.command.attempt.cost_units
      };
    const totals = (rows: Row[]) =>
      rows.reduce(
        (sum, row) => {
          const u = usage(row);
          return {
            tokens: sum.tokens + BigInt(u.input_tokens) + BigInt(u.output_tokens),
            cost: sum.cost + BigInt(u.cost_units),
            attempts: sum.attempts + 1
          };
        },
        {
          tokens: BigInt(attempt.input_tokens) + BigInt(attempt.output_tokens),
          cost: BigInt(cost),
          attempts: 1
        }
      );
    const request = totals(
      scoped.filter(
        (r) =>
          r.command.attempt.invocation_id === attempt.invocation_id &&
          r.command.attempt.tenant_id === attempt.tenant_id
      )
    );
    if (
      request.tokens > BigInt(policy.request.tokens) ||
      request.cost > BigInt(policy.request.cost_units) ||
      request.attempts > policy.request.attempts
    )
      throw budgetDenied();
    const same = (row: Row, scope: AccountingScope) => {
      const a = row.command.attempt;
      switch (scope) {
        case 'global':
          return true;
        case 'tenant':
          return a.tenant_id === attempt.tenant_id;
        case 'agent':
          return a.tenant_id === attempt.tenant_id && a.agent_id === attempt.agent_id;
        case 'provider':
          return a.provider_id === attempt.provider_id;
        case 'model':
          return (
            a.provider_id === attempt.provider_id &&
            a.model_id === attempt.model_id &&
            a.model_version === attempt.model_version
          );
        case 'environment':
          return a.environment === attempt.environment;
      }
    };
    const warnings: AccountingScope[] = [];
    for (const scope of Object.keys(policy.limits) as AccountingScope[]) {
      const limit = policy.limits[scope];
      if (!limit) continue;
      const total = totals(scoped.filter((row) => same(row, scope)));
      if (
        total.tokens > BigInt(limit.tokens) ||
        total.cost > BigInt(limit.cost_units) ||
        total.attempts > limit.attempts
      )
        throw budgetDenied();
      if (total.cost >= BigInt(limit.warning_cost_units)) warnings.push(scope);
    }
    const receipt = freezeAccounting({
      command_hash: command.command_hash,
      attempt_id: attempt.attempt_id,
      policy_version: policy.version,
      period_id: policy.period.id,
      state: 'unresolved' as const,
      warnings
    });
    this.rows.set(attempt.attempt_id, { command, receipt });
    for (const scope of warnings)
      this.warningOutbox.push({ attempt_id: attempt.attempt_id, scope });
    return receipt;
  }

  settle(command: AccountingSettlementCommand): Promise<AccountingReceipt> {
    return Promise.resolve().then(() => this.settleAtomic(command));
  }

  private settleAtomic(command: AccountingSettlementCommand): AccountingReceipt {
    const { reservation, usage } = command;
    if (accountingHash({ reservation, usage }) !== command.command_hash) throw accountingError();
    const row = this.rows.get(reservation.attempt.attempt_id);
    if (!row || row.command.command_hash !== reservation.command_hash) throw accountingError();
    if (row.settlement) {
      if (row.settlement.command_hash !== command.command_hash) throw accountingError();
      return row.receipt;
    }
    if (
      usage.input_tokens > reservation.attempt.input_tokens ||
      usage.output_tokens > reservation.attempt.output_tokens ||
      quoteCost(
        reservation.policy,
        reservation.attempt,
        usage.input_tokens,
        usage.output_tokens
      ) !== usage.cost_units
    )
      throw accountingError();
    row.settlement = command;
    row.receipt = freezeAccounting({
      ...row.receipt,
      command_hash: command.command_hash,
      state: 'settled'
    });
    return row.receipt;
  }
}
