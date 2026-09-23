import { PlatformError } from '../../errors/src/index.js';
import {
  promptHierarchySchema,
  promptRecordSchema,
  type AgentDefinition,
  type PromptHierarchy,
  type PromptRecord
} from './contracts.js';

export interface PromptHierarchyConfiguration {
  readonly master: Readonly<{ prompt_id: string; prompt_version: string }>;
  readonly orchestrator: Readonly<{ prompt_id: string; prompt_version: string }>;
}

function key(promptId: string, promptVersion: string): string {
  return JSON.stringify([promptId, promptVersion]);
}

function reference(record: PromptRecord) {
  return Object.freeze({
    prompt_id: record.prompt_id,
    prompt_version: record.prompt_version,
    agent_id: record.agent_id,
    layer: record.layer,
    content_hash: record.content_hash
  });
}

export class PromptRegistry {
  private readonly records: ReadonlyMap<string, PromptRecord>;

  constructor(records: readonly unknown[]) {
    const parsed = records.map((record) => Object.freeze(promptRecordSchema.parse(record)));
    const entries = parsed.map(
      (record) => [key(record.prompt_id, record.prompt_version), record] as const
    );
    if (new Set(entries.map(([entryKey]) => entryKey)).size !== entries.length) {
      throw new PlatformError(
        'CONFIGURATION_ERROR',
        'Prompt registry configuration is invalid',
        500
      );
    }
    this.records = new Map(entries);
  }

  resolveHierarchy(
    agent: AgentDefinition,
    configuration: PromptHierarchyConfiguration,
    now: Date = new Date()
  ): PromptHierarchy {
    const master = this.approved(configuration.master, 'master', undefined, now);
    const orchestrator = this.approved(configuration.orchestrator, 'orchestrator', undefined, now);
    const domainCandidates = [...this.records.values()].filter(
      (record) =>
        record.layer === 'domain' &&
        record.agent_id === agent.agent_id &&
        record.prompt_version === agent.prompt_version
    );
    const domainCandidate = domainCandidates[0];
    if (domainCandidates.length !== 1 || !domainCandidate) {
      throw new PlatformError('CONFIGURATION_ERROR', 'Prompt hierarchy is unavailable', 500);
    }
    const domain = this.requireApproved(domainCandidate, now);
    const hierarchy = promptHierarchySchema.parse({
      layers: [reference(master), reference(orchestrator), reference(domain)]
    });
    return Object.freeze({ layers: Object.freeze([...hierarchy.layers]) }) as PromptHierarchy;
  }

  private approved(
    lookup: Readonly<{ prompt_id: string; prompt_version: string }>,
    layer: PromptRecord['layer'],
    agentId: string | undefined,
    now: Date
  ): PromptRecord {
    const record = this.records.get(key(lookup.prompt_id, lookup.prompt_version));
    if (!record || record.layer !== layer || (agentId && record.agent_id !== agentId)) {
      throw new PlatformError('CONFIGURATION_ERROR', 'Prompt hierarchy is unavailable', 500);
    }
    return this.requireApproved(record, now);
  }

  private requireApproved(record: PromptRecord, now: Date): PromptRecord {
    if (
      record.status !== 'approved' ||
      !record.approved_by ||
      Date.parse(record.effective_date) > now.getTime()
    ) {
      throw new PlatformError('CONFIGURATION_ERROR', 'Prompt hierarchy is unavailable', 500);
    }
    return record;
  }
}
