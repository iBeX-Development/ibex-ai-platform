import { assetAgentProfile, assetPrompt } from './asset/src/index.js';
import { generalAgentProfile, generalPrompt } from './general/src/index.js';
import { maintenanceAgentProfile, maintenancePrompt } from './maintenance/src/index.js';
import { warehouseAgentProfile, warehousePrompt } from './warehouse/src/index.js';
import type {
  PilotAgentProfile,
  VersionedDomainPrompt
} from '../packages/pilot-agents/src/index.js';
import type { AgentDefinition, PromptRecord } from '../packages/runtime/src/index.js';

export const pilotAgentProfiles = Object.freeze([
  generalAgentProfile,
  maintenanceAgentProfile,
  assetAgentProfile,
  warehouseAgentProfile
]);

export const pilotDomainPrompts = Object.freeze([
  generalPrompt,
  maintenancePrompt,
  assetPrompt,
  warehousePrompt
]);

function definitionFor(profile: PilotAgentProfile): AgentDefinition {
  return Object.freeze({
    agent_id: profile.agent_id,
    version: profile.versions.agent,
    domain: profile.domain,
    supported_intents: Object.freeze(profile.intents.map((policy) => policy.intent)),
    capabilities: Object.freeze(profile.intents.map((policy) => `intent:${policy.intent}`)),
    prompt_version: profile.versions.prompt,
    // Phase 8 has no approved runtime Tool IDs. Conceptual capability classes stay in the profile.
    allowed_tools: Object.freeze([]),
    allowed_rag_scopes: Object.freeze([...profile.rag_scopes]),
    required_permissions: Object.freeze([
      ...new Set(profile.intents.flatMap((policy) => policy.required_permissions))
    ]),
    required_entitlements: Object.freeze([
      ...new Set(profile.intents.flatMap((policy) => policy.required_entitlements))
    ]),
    model_policy: Object.freeze({
      default_policy: profile.model_policy,
      fallback_policies: Object.freeze([])
    }),
    evaluation_profile: `${profile.agent_id}-evaluation-${profile.versions.evaluation_dataset}`,
    // Pilot definitions remain unavailable until every required authorization mapping is approved.
    status: profile.intents.every((policy) => policy.authorization_status === 'approved')
      ? 'active'
      : 'disabled'
  });
}

function promptRecordFor(profile: PilotAgentProfile, prompt: VersionedDomainPrompt): PromptRecord {
  return Object.freeze({
    prompt_id: prompt.prompt_id,
    prompt_version: prompt.prompt_version,
    agent_id: profile.agent_id,
    layer: 'domain',
    status: 'approved',
    effective_date: '2026-09-24T00:00:00.000Z',
    content_hash: prompt.content_hash,
    created_by: 'pilot-domain-implementation',
    approved_by: 'approved-agent-specification-v1.0',
    change_reason: `Phase 8 evaluation baseline for ${profile.specification}`
  });
}

export const pilotAgentDefinitions = Object.freeze(pilotAgentProfiles.map(definitionFor));
export const pilotDomainPromptRecords = Object.freeze(
  pilotAgentProfiles.map((profile, index) => {
    const prompt = pilotDomainPrompts[index];
    if (!prompt) throw new Error('Pilot domain prompt configuration is incomplete');
    return promptRecordFor(profile, prompt);
  })
);
