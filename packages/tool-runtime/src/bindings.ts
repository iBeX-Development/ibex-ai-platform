import { z } from 'zod';
import { PlatformError } from '../../errors/src/index.js';
import type { ToolRegistry } from './registry.js';

const exact = z
  .string()
  .min(1)
  .max(256)
  .refine(
    (s) =>
      s.trim() === s &&
      !s.includes('*') &&
      Array.from({ length: s.length }, (_, i) => s.charCodeAt(i)).every(
        (code) => code > 31 && code !== 127
      )
  );
const revision = z.string().regex(/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/);
export const toolBindingScopeSchema = z
  .object({
    agent_id: exact,
    agent_version: revision,
    domain: exact,
    intent: exact,
    conceptual_capability: exact
  })
  .strict()
  .readonly();
export type ToolBindingScope = z.infer<typeof toolBindingScopeSchema>;
export const toolBindingDescriptorSchema = z
  .object({
    ...toolBindingScopeSchema.unwrap().shape,
    binding_id: exact,
    binding_version: revision,
    mode: z.enum(['inactive', 'deterministic_test']),
    concrete_tool: z
      .object({
        tool_id: exact,
        tool_version: revision,
        input_schema_id: exact,
        output_schema_id: exact
      })
      .strict()
      .readonly()
  })
  .strict()
  .readonly();
export type ToolBindingDescriptor = z.infer<typeof toolBindingDescriptorSchema>;

function key(scope: ToolBindingScope): string {
  return JSON.stringify([
    scope.agent_id,
    scope.agent_version,
    scope.domain,
    scope.intent,
    scope.conceptual_capability
  ]);
}

/** Server configuration only. Empty by default; mappings confer no execution authority. */
export class ToolBindingCatalog {
  readonly #entries = new Map<string, ToolBindingDescriptor>();
  constructor(
    private readonly registry: ToolRegistry,
    descriptors: readonly unknown[] = []
  ) {
    const revisions = new Set<string>();
    for (const raw of descriptors) {
      const parsed = toolBindingDescriptorSchema.safeParse(raw);
      if (!parsed.success)
        throw new PlatformError('CONFIGURATION_ERROR', 'Tool binding is invalid', 500);
      const binding = parsed.data;
      const revisionKey = JSON.stringify([binding.binding_id, binding.binding_version]);
      if (
        this.#entries.has(key(binding)) ||
        revisions.has(revisionKey) ||
        !this.matchesRegistration(binding)
      )
        throw new PlatformError('CONFIGURATION_ERROR', 'Tool binding is ambiguous or stale', 500);
      revisions.add(revisionKey);
      this.#entries.set(key(binding), binding);
    }
    Object.freeze(this);
  }

  private matchesRegistration(binding: ToolBindingDescriptor): boolean {
    const tool = binding.concrete_tool;
    const metadata = this.registry.resolve(tool.tool_id, tool.tool_version)?.metadata;
    return (
      !!metadata &&
      metadata.domain === binding.domain &&
      metadata.input_schema_id === tool.input_schema_id &&
      metadata.output_schema_id === tool.output_schema_id &&
      metadata.read_write_class === 'read' &&
      !metadata.proposal_only &&
      metadata.approval_policy === 'none' &&
      metadata.ownership_validation === 'resource' &&
      metadata.execution_mode === 'deterministic_test' &&
      metadata.environments.length === 1 &&
      metadata.environments[0] === 'test'
    );
  }

  resolve(scope: ToolBindingScope): ToolBindingDescriptor | undefined {
    const parsed = toolBindingScopeSchema.safeParse(scope);
    if (!parsed.success) return undefined;
    const binding = this.#entries.get(key(parsed.data));
    return binding &&
      this.matchesRegistration(binding) &&
      this.registry.resolve(binding.concrete_tool.tool_id, binding.concrete_tool.tool_version)
        ?.metadata.enabled
      ? binding
      : undefined;
  }
}
