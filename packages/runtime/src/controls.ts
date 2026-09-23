import { PlatformError } from '../../errors/src/index.js';
import { runtimeControlPolicySchema, type RuntimeControlPolicy } from './contracts.js';

export function createRuntimeControlPolicy(input: unknown): RuntimeControlPolicy {
  const parsed = runtimeControlPolicySchema.parse(input);
  return Object.freeze({
    ...parsed,
    retry_policy: Object.freeze({ ...parsed.retry_policy })
  });
}

export function assertContextBudget(input: unknown, policy: RuntimeControlPolicy): void {
  let serialized: string;
  try {
    serialized = JSON.stringify(input);
  } catch {
    throw new PlatformError('VALIDATION_ERROR', 'Runtime input is invalid', 400);
  }
  if (Buffer.byteLength(serialized, 'utf8') > policy.max_context_bytes) {
    throw new PlatformError('VALIDATION_ERROR', 'Runtime context limit exceeded', 413);
  }
}

export async function runWithRuntimeDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  policy: RuntimeControlPolicy,
  externalSignal?: AbortSignal
): Promise<T> {
  if (externalSignal?.aborted) {
    throw new PlatformError('TIMEOUT_ERROR', 'Request was cancelled', 408);
  }

  const controller = new AbortController();
  const cancel = () => {
    controller.abort();
  };
  externalSignal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => {
    controller.abort();
  }, policy.timeout_ms);

  try {
    const result = await Promise.race([
      operation(controller.signal),
      new Promise<never>((_resolve, reject) => {
        controller.signal.addEventListener(
          'abort',
          () => {
            reject(
              new PlatformError(
                'TIMEOUT_ERROR',
                externalSignal?.aborted ? 'Request was cancelled' : 'Runtime request timed out',
                externalSignal?.aborted ? 408 : 504
              )
            );
          },
          { once: true }
        );
      })
    ]);
    return result;
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', cancel);
  }
}

export function throwIfCancelled(signal: AbortSignal): void {
  if (signal.aborted) throw new PlatformError('TIMEOUT_ERROR', 'Request was cancelled', 408);
}
