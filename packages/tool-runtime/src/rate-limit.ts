import { z } from 'zod';
import { PlatformError } from '../../errors/src/index.js';

const exactToken = z
  .string()
  .min(1)
  .max(128)
  // The final negative lookahead requires true end-of-input, including no final newline.
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*(?![\s\S])/);

export const toolRateLimitReferenceSchema = z
  .object({ policy_id: exactToken, version: exactToken })
  .strict()
  .readonly();

export type ToolRateLimitReference = z.infer<typeof toolRateLimitReferenceSchema>;

// Representation bounds, not production quota recommendations. No defaults.
const policySchema = z
  .object({
    reference: toolRateLimitReferenceSchema,
    limit: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    window_ms: z.number().int().positive().max(2_147_483_647)
  })
  .strict()
  .readonly();

export type ToolRateLimitPolicy = z.infer<typeof policySchema>;

function isAborted(signal: AbortSignal): boolean {
  return signal.aborted;
}

function configurationError(): PlatformError {
  return new PlatformError('CONFIGURATION_ERROR', 'Tool rate policy is not configured', 500);
}

export class ToolRateLimitCatalog {
  readonly #policies = new Map<string, ToolRateLimitPolicy>();

  constructor(policies: readonly ToolRateLimitPolicy[]) {
    try {
      for (const policy of policies) {
        const parsed = policySchema.parse(policy);
        const key = JSON.stringify([parsed.reference.policy_id, parsed.reference.version]);
        if (this.#policies.has(key)) throw configurationError();
        this.#policies.set(key, parsed);
      }
      Object.freeze(this);
    } catch {
      throw configurationError();
    }
  }

  resolve(reference: ToolRateLimitReference): ToolRateLimitPolicy {
    try {
      const parsed = toolRateLimitReferenceSchema.parse(reference);
      const policy = this.#policies.get(JSON.stringify([parsed.policy_id, parsed.version]));
      if (policy) return policy;
    } catch {
      // Do not expose configuration values or getters.
    }
    throw configurationError();
  }
}

export interface ToolRateLimitAdmission {
  readonly tenant_id: string;
  readonly tool_id: string;
  readonly tool_version: string;
  readonly environment: string;
  readonly policy: ToolRateLimitPolicy;
  readonly signal: AbortSignal;
}

export interface ToolRateLimiter {
  // Exactly one atomic check-and-consume. Unknown outcomes must never be retried/refunded.
  consume(admission: ToolRateLimitAdmission): Promise<Readonly<{ allowed: boolean }>>;
}

/** Nonproduction only: one instance, one JS isolate, no persistence or distributed guarantees. */
export class InMemoryToolRateLimiter implements ToolRateLimiter {
  readonly #buckets = new Map<string, { started: number; used: number }>();
  readonly #clock: () => number;
  #lastTime: number | undefined;

  constructor(clock: () => number) {
    this.#clock = clock;
  }

  consume(admission: ToolRateLimitAdmission): Promise<Readonly<{ allowed: boolean }>> {
    // No await between checking and consuming: concurrent calls in this isolate serialize.
    try {
      const policy = policySchema.parse(admission.policy);
      const scope = [
        admission.tenant_id,
        admission.tool_id,
        admission.tool_version,
        admission.environment
      ];
      if (
        isAborted(admission.signal) ||
        scope.some((part) => typeof part !== 'string' || !part.trim())
      )
        throw new Error('Invalid admission');
      const now = this.#clock();
      if (
        !Number.isFinite(now) ||
        now < 0 ||
        now > Number.MAX_SAFE_INTEGER ||
        (this.#lastTime !== undefined && now < this.#lastTime)
      )
        throw new Error('Invalid clock');
      this.#lastTime = now;
      const key = JSON.stringify([
        ...scope,
        policy.reference.policy_id,
        policy.reference.version,
        policy.limit,
        policy.window_ms
      ]);
      const existing = this.#buckets.get(key);
      const bucket =
        existing && now - existing.started < policy.window_ms
          ? existing
          : { started: now, used: 0 };
      if (bucket.used >= policy.limit) return Promise.resolve(Object.freeze({ allowed: false }));
      // Recheck after the injected clock; cancellation before consumption is not charged.
      if (isAborted(admission.signal)) throw new Error('Cancelled admission');
      bucket.used += 1;
      this.#buckets.set(key, bucket);
      return Promise.resolve(Object.freeze({ allowed: true }));
    } catch {
      return Promise.reject(
        new PlatformError('SERVICE_UNAVAILABLE', 'Tool admission is unavailable', 503)
      );
    }
  }
}
