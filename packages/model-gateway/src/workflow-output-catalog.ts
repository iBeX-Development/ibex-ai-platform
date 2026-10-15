import { z } from 'zod';
import { PlatformError } from '../../errors/src/index.js';
import {
  modelPayloadSchemaReferenceSchema,
  type ModelPayloadSchemaReference
} from './contracts.js';
import { LocalModelSchemaCatalog } from './schema-catalog.js';

const wireId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const bindingSchema = z
  .object({
    output_schema_id: wireId,
    reference: modelPayloadSchemaReferenceSchema
  })
  .strict();

export interface WorkflowOutputBinding {
  readonly output_schema_id: string;
  readonly reference: ModelPayloadSchemaReference;
  readonly validate: (output: unknown) => void;
}

function configurationError(): PlatformError {
  return new PlatformError('CONFIGURATION_ERROR', 'Workflow output configuration is invalid', 500);
}

/** Exact server-owned bindings; no parsing of ID suffixes, fetching, or code loading.
 * Predicates are captured at construction. As with local model schemas, their
 * closures must be reviewed synchronous/deterministic code; this is not a sandbox.
 */
export class WorkflowOutputCatalog {
  readonly #bindings: ReadonlyMap<string, WorkflowOutputBinding>;

  constructor(records: readonly unknown[], schemas: LocalModelSchemaCatalog) {
    try {
      if (!(schemas instanceof LocalModelSchemaCatalog)) throw configurationError();
      const bindings = new Map<string, WorkflowOutputBinding>();
      for (const entry of z.array(bindingSchema).parse(records)) {
        if (bindings.has(entry.output_schema_id)) throw configurationError();
        const predicate = schemas.resolve(entry.reference).validate;
        if (typeof predicate !== 'function') throw configurationError();
        bindings.set(
          entry.output_schema_id,
          Object.freeze({
            output_schema_id: entry.output_schema_id,
            reference: Object.freeze({ ...entry.reference }),
            validate: (output: unknown): void => {
              if (output === undefined || output === null) {
                throw new PlatformError(
                  'INVALID_RESPONSE',
                  'Model provider response is invalid',
                  502
                );
              }
              let accepted: unknown;
              try {
                accepted = predicate(output);
                if (accepted !== true && accepted !== false) {
                  // Observe rejected/late promises without awaiting or accepting them.
                  void Promise.resolve(accepted).catch(() => undefined);
                  throw configurationError();
                }
              } catch {
                throw configurationError();
              }
              if (!accepted) {
                throw new PlatformError(
                  'INVALID_RESPONSE',
                  'Model provider response is invalid',
                  502
                );
              }
            }
          })
        );
      }
      this.#bindings = bindings;
      Object.freeze(this);
    } catch {
      throw configurationError();
    }
  }

  resolve(outputSchemaId: unknown): WorkflowOutputBinding {
    const parsed = wireId.safeParse(outputSchemaId);
    const binding = parsed.success ? this.#bindings.get(parsed.data) : undefined;
    if (!binding) {
      throw new PlatformError('VALIDATION_ERROR', 'Workflow output binding is unavailable', 400);
    }
    return binding;
  }
}
