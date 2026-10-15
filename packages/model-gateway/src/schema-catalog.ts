import { z } from 'zod';
import { PlatformError } from '../../errors/src/index.js';
import {
  modelPayloadSchemaReferenceSchema,
  type ModelPayloadSchemaReference
} from './contracts.js';

export type ModelPayloadValidator = (payload: unknown) => boolean;
export interface LocalModelSchemaEntry extends ModelPayloadSchemaReference {
  readonly validate: ModelPayloadValidator;
}

const entrySchema = z
  .object({
    reference: modelPayloadSchemaReferenceSchema,
    validate: z.custom<ModelPayloadValidator>((value) => typeof value === 'function')
  })
  .strict();

// Tuple encoding prevents collisions even when either identifier contains a delimiter.
function key(reference: ModelPayloadSchemaReference): string {
  return JSON.stringify([reference.schema_id, reference.schema_version]);
}

/** Server-owned, explicitly constructed local catalog; never fetches or loads schema code.
 * Entries are copied and frozen. Validator functions retain their own closure state.
 * Registration checks function shape only; payload validation at dispatch is out of scope.
 */
export class LocalModelSchemaCatalog {
  readonly #entries: ReadonlyMap<string, LocalModelSchemaEntry>;

  constructor(records: readonly unknown[]) {
    const entries = z.array(entrySchema).min(1).parse(records);
    const owned = new Map<string, LocalModelSchemaEntry>();
    for (const entry of entries) {
      const identity = key(entry.reference);
      if (owned.has(identity)) {
        throw new PlatformError('CONFIGURATION_ERROR', 'Duplicate local model schema', 500);
      }
      owned.set(identity, Object.freeze({ ...entry.reference, validate: entry.validate }));
    }
    this.#entries = owned;
    Object.freeze(this);
  }

  resolve(reference: ModelPayloadSchemaReference): LocalModelSchemaEntry {
    const entry = this.#entries.get(key(modelPayloadSchemaReferenceSchema.parse(reference)));
    if (!entry) {
      throw new PlatformError('CONFIGURATION_ERROR', 'Unknown local model schema version', 500);
    }
    return entry;
  }
}
