import { PlatformError } from '../../errors/src/index.js';
import { toolMetadataSchema, type ToolMetadata, type ToolRegistration } from './contracts.js';

export function toolKey(toolId: string, version: string): string {
  return JSON.stringify([toolId, version]);
}

function isRuntimeSchema(value: unknown): value is ToolRegistration['input_schema'] {
  return (
    typeof value === 'object' &&
    value !== null &&
    'safeParse' in value &&
    typeof (value as { safeParse?: unknown }).safeParse === 'function'
  );
}

function freezeMetadata(metadata: ToolMetadata): ToolMetadata {
  return Object.freeze({
    ...metadata,
    required_permissions: Object.freeze([...metadata.required_permissions]),
    required_entitlements: Object.freeze([...metadata.required_entitlements]),
    timeout_policy: Object.freeze({ ...metadata.timeout_policy }),
    retry_policy: Object.freeze({ ...metadata.retry_policy }),
    environments: Object.freeze([...metadata.environments])
  });
}

export class ToolRegistry {
  private readonly registrations: ReadonlyMap<string, ToolRegistration>;

  constructor(records: readonly ToolRegistration[]) {
    const entries = records.map((record): readonly [string, ToolRegistration] => {
      const parsed = toolMetadataSchema.safeParse(record.metadata);
      if (
        !parsed.success ||
        !isRuntimeSchema(record.input_schema) ||
        !isRuntimeSchema(record.output_schema) ||
        (parsed.data.ownership_validation === 'resource' && !record.resource_reference)
      ) {
        throw new PlatformError(
          'CONFIGURATION_ERROR',
          'Tool registry configuration is invalid',
          500
        );
      }
      const registration: ToolRegistration = Object.freeze({
        metadata: freezeMetadata(parsed.data),
        input_schema: record.input_schema,
        output_schema: record.output_schema,
        ...(record.resource_reference ? { resource_reference: record.resource_reference } : {})
      });
      return [toolKey(parsed.data.tool_id, parsed.data.version), registration] as const;
    });
    if (new Set(entries.map(([key]) => key)).size !== entries.length) {
      throw new PlatformError('CONFIGURATION_ERROR', 'Tool registry configuration is invalid', 500);
    }
    this.registrations = new Map(entries);
  }

  resolve(toolId: string, version: string): ToolRegistration | undefined {
    return this.registrations.get(toolKey(toolId, version));
  }

  list(): readonly ToolMetadata[] {
    return Object.freeze([...this.registrations.values()].map(({ metadata }) => metadata));
  }
}
