import { z } from 'zod';
import { trustedRequestContextSchema } from '../../packages/security/src/index.js';
import {
  ToolAdapterError,
  type ToolAdapter,
  type ToolAdapterRequest,
  type ToolRegistration
} from '../../packages/tool-runtime/src/index.js';
import { readToolMetadata } from './tool-runtime-fixtures.js';

// Offline test support only: tsconfig.build.json excludes this entire directory.
// Guard before Zod parsing so even an own __proto__ key or accessor is rejected.
const exactShape = z.unknown().refine((value) => {
  try {
    if (typeof value !== 'object' || value === null) return false;
    const prototype: unknown = Object.getPrototypeOf(value);
    const keys = Reflect.ownKeys(value);
    const descriptor = Object.getOwnPropertyDescriptor(value, 'asset_id');
    return (
      (prototype === Object.prototype || prototype === null) &&
      keys.length === 1 &&
      keys[0] === 'asset_id' &&
      descriptor !== undefined &&
      'value' in descriptor
    );
  } catch {
    return false;
  }
});

export const offlineAssetSchema = exactShape.pipe(
  z
    .object({
      asset_id: z
        .string()
        .min(1)
        .max(128)
        .regex(/^[A-Za-z0-9_-]+(?![\s\S])/)
    })
    .strict()
    .readonly()
);

export const offlineAssetRegistration: ToolRegistration = {
  metadata: {
    ...readToolMetadata,
    version: '0.1.0-proposed',
    description: 'Synthetic offline Asset ID prototype; not approved for live composition',
    input_schema_id: 'offline.asset.id.input.v0.1-proposed',
    output_schema_id: 'offline.asset.id.output.v0.1-proposed',
    retry_policy: { max_attempts: 1, backoff_ms: 0 },
    // Fixture policy only; not the proposed Core deadline policy or a real permission mapping.
    enabled: false,
    environments: ['test'],
    ownership_validation: 'resource',
    execution_mode: 'deterministic_test'
  },
  input_schema: offlineAssetSchema,
  output_schema: offlineAssetSchema,
  resource_reference: (input) => ({ type: 'asset', id: offlineAssetSchema.parse(input).asset_id })
};

export type OfflineAssetRead = (
  request: Readonly<{
    context: ToolAdapterRequest['context'];
    input: Readonly<{ asset_id: string }>;
    signal: AbortSignal;
  }>
) => Promise<string>;

function rejectAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new ToolAdapterError('timeout');
}

/** Inject synthetic JSON only. This is not an HTTP client or an authentication boundary. */
export function createOfflineAssetAdapter(
  read: OfflineAssetRead,
  receiptTime: () => Date
): ToolAdapter {
  return {
    tool_id: offlineAssetRegistration.metadata.tool_id,
    tool_version: offlineAssetRegistration.metadata.version,
    execution_mode: 'deterministic_test',
    invoke: async ({ context, input, signal }) => {
      const caller = trustedRequestContextSchema.safeParse(context);
      const parsedInput = offlineAssetSchema.safeParse(input);
      if (!caller.success || !parsedInput.success) throw new ToolAdapterError('permanent');
      rejectAborted(signal);
      const body = await read(
        Object.freeze({ context: caller.data, input: parsedInput.data, signal })
      );
      rejectAborted(signal);
      try {
        if (typeof body !== 'string' || Buffer.byteLength(body, 'utf8') > 16 * 1024)
          throw new ToolAdapterError('invalid_response');
        const decoded: unknown = JSON.parse(body);
        const output = offlineAssetSchema.parse(decoded);
        if (output.asset_id !== parsedInput.data.asset_id)
          throw new ToolAdapterError('invalid_response');
        return {
          output,
          source: {
            system: 'offline-synthetic-asset-prototype',
            reference: `synthetic:${output.asset_id}`
          },
          observed_at: receiptTime().toISOString()
        };
      } catch {
        throw new ToolAdapterError('invalid_response');
      }
    }
  };
}
