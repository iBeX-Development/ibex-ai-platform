import { PlatformError } from '../../errors/src/index.js';
import { approvalActionDefinitionSchema, type ApprovalActionDefinition } from './contracts.js';

export class ApprovalActionRegistry {
  private readonly definitions = new Map<string, ApprovalActionDefinition>();

  constructor(definitions: readonly unknown[]) {
    for (const raw of definitions) {
      const definition = approvalActionDefinitionSchema.parse(raw);
      const key = this.key(definition.action_type, definition.action_version);
      if (this.definitions.has(key)) throw new Error('Duplicate approval action definition');
      this.definitions.set(key, Object.freeze({ ...definition }));
    }
  }

  require(actionType: string, actionVersion: string): ApprovalActionDefinition {
    const definition = this.definitions.get(this.key(actionType, actionVersion));
    if (!definition)
      throw new PlatformError('TOOL_NOT_ALLOWED', 'Requested action is unavailable', 403);
    return definition;
  }

  private key(actionType: string, actionVersion: string): string {
    return JSON.stringify([actionType, actionVersion]);
  }
}
