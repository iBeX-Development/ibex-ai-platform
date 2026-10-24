import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { PlatformError, toErrorEnvelope } from '../../packages/errors/src/index.js';
import { ToolRegistry } from '../../packages/tool-runtime/src/index.js';
import {
  proposalToolMetadata,
  proposalToolRegistration,
  readToolMetadata,
  readToolRegistration
} from '../testing/tool-runtime-fixtures.js';

describe('Phase 5 Tool Registry', () => {
  it('registers immutable versioned metadata and schemas', () => {
    const registry = new ToolRegistry([readToolRegistration]);
    const registration = registry.resolve(readToolMetadata.tool_id, readToolMetadata.version);

    expect(registration?.metadata).toMatchObject({
      registration_version: '3.0',
      error_model: 'ibex.tool-error.v1',
      tool_id: 'asset.asset.get.v1',
      version: '1.0',
      tenant_scope: 'tenant',
      audit_policy: 'required'
    });
    expect(Object.isFrozen(registration?.metadata)).toBe(true);
    expect(Object.isFrozen(registration?.metadata.required_permissions)).toBe(true);
  });

  it.each([readToolRegistration, proposalToolRegistration])(
    'preserves immutable format and error model through resolve/list for $metadata.read_write_class',
    (source) => {
      const metadata = { ...source.metadata };
      const registry = new ToolRegistry([{ ...source, metadata }]);
      const registration = registry.resolve(metadata.tool_id, metadata.version);
      const listed = registry.list();
      expect(listed).toEqual([registration?.metadata]);
      expect(listed[0]).toBe(registration?.metadata);
      expect(Object.isFrozen(listed)).toBe(true);
      expect(Object.isFrozen(registration)).toBe(true);
      expect(Object.isFrozen(listed[0])).toBe(true);
      const listedMetadata = listed[0];
      if (!listedMetadata) throw new Error('Expected registered metadata');
      expect(Reflect.set(listedMetadata, 'error_model', 'private-invalid-model')).toBe(false);
      expect(Reflect.set(listedMetadata, 'registration_version', '1.0')).toBe(false);
      Object.assign(metadata, {
        registration_version: '1.0',
        error_model: 'private-invalid-model'
      });
      expect(
        registry.resolve(source.metadata.tool_id, source.metadata.version)?.metadata
      ).toMatchObject({
        registration_version: '3.0',
        error_model: 'ibex.tool-error.v1',
        version: '1.0'
      });
    }
  );

  const invalidValues: readonly (readonly [string, unknown])[] = [
    ['missing', undefined],
    ['undefined', undefined],
    ['null', null],
    ['empty', ''],
    ['whitespace', ' \t '],
    ['legacy major', '1.0'],
    ['previous major', '2.0'],
    ['unsupported minor', '2.1'],
    ['unsupported major', '4.0'],
    ['unsupported error model', 'ibex.tool-error.v2'],
    ['padded registration version', ' 2.0 '],
    ['padded error model', ' ibex.tool-error.v1 '],
    ['number', 2],
    ['boolean', true],
    ['object', { private: 'private-invalid-model' }],
    ['array', ['ibex.tool-error.v1']]
  ];
  it.each(
    [readToolRegistration, proposalToolRegistration].flatMap((source) =>
      (['registration_version', 'error_model'] as const).flatMap((field) =>
        invalidValues.map(([label, value]) => ({
          source,
          kind: source.metadata.read_write_class,
          field,
          label,
          value
        }))
      )
    )
  )(
    'rejects $kind $field $label with a sanitized configuration error',
    ({ source, field, label, value }) => {
      const metadata: Record<string, unknown> = { ...source.metadata, [field]: value };
      if (label === 'missing') Reflect.deleteProperty(metadata, field);
      let error: unknown;
      try {
        new ToolRegistry([{ ...source, metadata } as unknown as typeof source]);
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(PlatformError);
      expect(error).toMatchObject({ statusCode: 500, diagnostics: undefined });
      expect(toErrorEnvelope(error)).toEqual({
        error: { code: 'CONFIGURATION_ERROR', message: 'Tool registry configuration is invalid' }
      });
    }
  );

  it('rejects the legacy unversioned registration shape without a fallback', () => {
    const metadata: Record<string, unknown> = { ...readToolMetadata };
    delete metadata.registration_version;
    delete metadata.error_model;
    expect(
      () =>
        new ToolRegistry([
          { ...readToolRegistration, metadata } as unknown as typeof readToolRegistration
        ])
    ).toThrow(
      expect.objectContaining({
        code: 'CONFIGURATION_ERROR',
        publicMessage: 'Tool registry configuration is invalid',
        statusCode: 500
      })
    );
  });

  it('rejects duplicate tool id and version records', () => {
    expect(() => new ToolRegistry([readToolRegistration, readToolRegistration])).toThrow(
      expect.objectContaining({ code: 'CONFIGURATION_ERROR' })
    );
  });

  it('uses collision-safe keys even when identifiers contain separator characters', () => {
    const first = {
      ...readToolRegistration,
      metadata: { ...readToolMetadata, tool_id: 'asset:part', version: 'v1' }
    };
    const second = {
      ...readToolRegistration,
      metadata: { ...readToolMetadata, tool_id: 'asset', version: 'part:v1' }
    };
    const registry = new ToolRegistry([first, second]);

    expect(registry.resolve('asset:part', 'v1')?.metadata.tool_id).toBe('asset:part');
    expect(registry.resolve('asset', 'part:v1')?.metadata.tool_id).toBe('asset');
  });

  it('rejects resource-scoped registrations without a trusted resource selector', () => {
    expect(
      () =>
        new ToolRegistry([
          {
            ...readToolRegistration,
            resource_reference: undefined
          } as unknown as typeof readToolRegistration
        ])
    ).toThrow(expect.objectContaining({ code: 'CONFIGURATION_ERROR' }));
  });

  it('rejects retries for non-idempotent reads', () => {
    expect(
      () =>
        new ToolRegistry([
          {
            ...readToolRegistration,
            metadata: {
              ...readToolMetadata,
              safe_idempotent: false,
              retry_policy: { max_attempts: 2, backoff_ms: 0 }
            }
          }
        ])
    ).toThrow(expect.objectContaining({ code: 'CONFIGURATION_ERROR' }));
  });

  it('rejects action tools that are executable or retryable', () => {
    expect(
      () =>
        new ToolRegistry([
          {
            metadata: {
              ...proposalToolMetadata,
              proposal_only: false,
              retry_policy: { max_attempts: 2, backoff_ms: 0 }
            },
            input_schema: z.object({ asset_id: z.string() }),
            output_schema: z.never(),
            resource_reference: () => ({ type: 'asset', id: 'asset-1' })
          }
        ])
    ).toThrow(expect.objectContaining({ code: 'CONFIGURATION_ERROR' }));
  });
});
