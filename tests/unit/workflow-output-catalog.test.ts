import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LocalModelSchemaCatalog,
  WorkflowOutputCatalog
} from '../../packages/model-gateway/src/index.js';

const reference = { schema_id: 'synthetic.workflow', schema_version: '2' };
const wire = 'opaque.workflow.v17';
afterEach(() => vi.restoreAllMocks());

describe('Server-owned workflow output bindings', () => {
  it('captures an exact explicit schema version, copies records and never re-resolves predicates', () => {
    const validate = vi.fn(() => true);
    const other = vi.fn(() => false);
    const entries = [
      { reference: { ...reference }, validate },
      { reference: { ...reference, schema_version: '17' }, validate: other }
    ];
    const schemas = new LocalModelSchemaCatalog(entries);
    const records = [{ output_schema_id: wire, reference: { ...reference } }];
    const catalog = new WorkflowOutputCatalog(records, schemas);
    const firstRecord = records[0];
    const firstEntry = entries[0];
    if (!firstRecord || !firstEntry) throw new Error('Missing synthetic entry');
    firstRecord.reference.schema_version = '17';
    firstRecord.output_schema_id = 'changed';
    firstEntry.validate = other;
    const resolve = vi
      .spyOn(LocalModelSchemaCatalog.prototype, 'resolve')
      .mockImplementation(() => {
        throw new Error('private-schema-marker');
      });
    const binding = catalog.resolve(wire);
    expect(binding.reference).toEqual(reference);
    expect(Object.isFrozen(catalog)).toBe(true);
    expect(Object.isFrozen(binding)).toBe(true);
    expect(Object.isFrozen(binding.reference)).toBe(true);
    binding.validate({ synthetic: true });
    expect(validate).toHaveBeenCalledOnce();
    expect(other).not.toHaveBeenCalled();
    expect(resolve).not.toHaveBeenCalled();
    for (const id of [
      'changed',
      'opaque.workflow.v2',
      'opaque.workflow',
      ` ${wire}`,
      `${wire} `,
      wire.toUpperCase(),
      undefined
    ]) {
      expect(() => catalog.resolve(id)).toThrow(
        expect.objectContaining({ code: 'VALIDATION_ERROR' })
      );
    }
  });

  it.each([
    null,
    {},
    [null],
    [{ output_schema_id: ' ', reference }],
    [{ output_schema_id: 'https://private-schema-marker', reference }],
    [{ output_schema_id: wire, reference, extra: 'private-schema-marker' }],
    [{ output_schema_id: wire, reference: { schema_id: 'synthetic.workflow' } }],
    [{ output_schema_id: wire, reference: { ...reference, schema_version: 'missing' } }],
    [
      { output_schema_id: wire, reference },
      { output_schema_id: wire, reference }
    ]
  ])('sanitizes malformed, duplicate and unresolved configuration %j', (records) => {
    const schemas = new LocalModelSchemaCatalog([{ reference, validate: () => true }]);
    let error: unknown;
    try {
      new WorkflowOutputCatalog(records as readonly unknown[], schemas);
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({
      code: 'CONFIGURATION_ERROR',
      publicMessage: 'Workflow output configuration is invalid'
    });
    expect(JSON.stringify(error)).not.toContain('private-schema-marker');
  });

  it('sanitizes accessor and resolver failures at configuration time', () => {
    const schemas = new LocalModelSchemaCatalog([{ reference, validate: () => true }]);
    expect(
      () =>
        new WorkflowOutputCatalog(
          [
            {
              get output_schema_id() {
                throw new Error('private-schema-marker');
              },
              reference
            }
          ],
          schemas
        )
    ).toThrow('Workflow output configuration is invalid');
    vi.spyOn(LocalModelSchemaCatalog.prototype, 'resolve').mockImplementation(() => {
      throw new Error('private-schema-marker');
    });
    expect(
      () => new WorkflowOutputCatalog([{ output_schema_id: wire, reference }], schemas)
    ).toThrow('Workflow output configuration is invalid');
  });
});
