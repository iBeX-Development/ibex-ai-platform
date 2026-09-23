import { describe, expect, it, vi } from 'vitest';
import type { AuditRecord } from '../../packages/audit/src/index.js';
import { AgentRegistry, PromptRegistry } from '../../packages/runtime/src/index.js';
import type { IntentClassificationRequest } from '../../packages/runtime/src/index.js';
import {
  approvedPrompts,
  createRuntime,
  maintenanceAgent,
  runtimeContext,
  runtimeDependencies,
  runtimeRequest,
  runtimeValidationTime
} from '../testing/runtime-fixtures.js';

describe('Gate P3 shared agent runtime', () => {
  it('routes a classified request to one authorized domain agent', async () => {
    const auditEvents: AuditRecord[] = [];
    const dependencies = runtimeDependencies(auditEvents);
    const runtime = createRuntime(auditEvents, dependencies);

    const result = await runtime.route(runtimeRequest(), runtimeValidationTime);

    expect(result).toMatchObject({
      status: 'routed',
      decision: {
        intent: 'maintenance_lookup',
        domain: 'maintenance',
        selected_agent: 'maintenance',
        required_capabilities: ['maintenance:read'],
        rag_required: true,
        rag_scopes: ['maintenance-approved'],
        tool_candidates: ['asset.get'],
        model_policy: 'balanced',
        request_id: 'request-1',
        correlation_id: 'correlation-1',
        trace_id: 'trace-1'
      }
    });
    if (result.status !== 'routed') throw new Error('Expected a routed result');
    expect(result.decision.prompt_hierarchy.layers.map((layer) => layer.layer)).toEqual([
      'master',
      'orchestrator',
      'domain'
    ]);
    expect(Object.isFrozen(result.decision)).toBe(true);
    expect(auditEvents).toEqual([
      expect.objectContaining({
        event_type: 'orchestrator.routing.outcome',
        tenant_id: 'tenant-a',
        request_id: 'request-1',
        trace_id: 'trace-1',
        outcome: 'routed',
        selected_agent: 'maintenance',
        prompt_versions: ['1.0', '1.0', '1.0']
      })
    ]);
  });

  it('never routes an agent when required permissions are absent', async () => {
    const auditEvents: AuditRecord[] = [];
    const ragPlan = vi.fn(() => Promise.resolve({ required: false, scopes: [] }));
    const runtime = createRuntime(auditEvents, {
      ragPlanning: { plan: ragPlan }
    });

    await expect(
      runtime.route(
        runtimeRequest({ context: { ...runtimeContext, permissions: [] } }),
        runtimeValidationTime
      )
    ).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
      publicMessage: 'Access denied',
      traceId: 'trace-1',
      trustedRequestId: 'request-1'
    });
    expect(ragPlan).not.toHaveBeenCalled();
    expect(auditEvents).toEqual([
      expect.objectContaining({
        outcome: 'rejected',
        stage: 'authorization',
        error_code: 'PERMISSION_DENIED',
        tenant_id: 'tenant-a'
      })
    ]);
  });

  it('revalidates and freezes trusted context before invoking runtime ports', async () => {
    const auditEvents: AuditRecord[] = [];
    let classifiedRequest: IntentClassificationRequest | undefined;
    const classify = vi.fn((request: IntentClassificationRequest) => {
      classifiedRequest = request;
      return Promise.resolve({
        status: 'classified',
        intent: 'maintenance_lookup',
        domain: 'maintenance',
        required_capabilities: ['maintenance:read']
      });
    });
    const mutableContext = {
      ...runtimeContext,
      permissions: [...runtimeContext.permissions],
      entitlements: [...runtimeContext.entitlements]
    };
    const runtime = createRuntime(auditEvents, { classifier: { classify } });

    await runtime.route(runtimeRequest({ context: mutableContext }), runtimeValidationTime);

    expect(classifiedRequest?.context).not.toBe(mutableContext);
    expect(Object.isFrozen(classifiedRequest?.context)).toBe(true);
    expect(Object.isFrozen(classifiedRequest?.context.permissions)).toBe(true);
    expect(classifiedRequest?.context.tenant_id).toBe('tenant-a');
  });

  it('uses a safe fallback for unknown intent without planning later capabilities', async () => {
    const auditEvents: AuditRecord[] = [];
    const ragPlan = vi.fn();
    const toolPlan = vi.fn();
    const modelPolicy = vi.fn();
    const runtime = createRuntime(auditEvents, {
      classifier: { classify: () => Promise.resolve({ status: 'unknown' }) },
      ragPlanning: { plan: ragPlan },
      toolPlanning: { plan: toolPlan },
      modelPolicy: { select: modelPolicy }
    });

    await expect(runtime.route(runtimeRequest(), runtimeValidationTime)).resolves.toEqual({
      status: 'fallback',
      reason: 'unknown_intent',
      message: 'Unable to route this request safely',
      request_id: 'request-1',
      correlation_id: 'correlation-1',
      trace_id: 'trace-1'
    });
    expect(ragPlan).not.toHaveBeenCalled();
    expect(toolPlan).not.toHaveBeenCalled();
    expect(modelPolicy).not.toHaveBeenCalled();
    expect(auditEvents).toEqual([
      expect.objectContaining({ outcome: 'fallback', tenant_id: 'tenant-a' })
    ]);
  });

  it('denies an explicit agent that does not match the classified route', async () => {
    const auditEvents: AuditRecord[] = [];
    const runtime = createRuntime(auditEvents);

    await expect(
      runtime.route(runtimeRequest({ requested_agent: 'warehouse' }), runtimeValidationTime)
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED', publicMessage: 'Access denied' });
    expect(auditEvents).toEqual([
      expect.objectContaining({
        outcome: 'rejected',
        stage: 'agent_selection',
        error_code: 'PERMISSION_DENIED'
      })
    ]);
  });

  it.each([
    [
      'RAG',
      {
        ragPlanning: {
          plan: () => Promise.resolve({ required: true, scopes: ['cross-tenant-scope'] })
        }
      }
    ],
    [
      'Tool',
      {
        toolPlanning: {
          plan: () =>
            Promise.resolve({
              candidates: ['unapproved.write'],
              action_class: 'proposed_action',
              risk_class: 'high',
              approval_required: true
            })
        }
      }
    ],
    [
      'Model policy',
      {
        modelPolicy: {
          select: () => Promise.resolve({ policy_id: 'provider-specific-model', fallback: false })
        }
      }
    ]
  ])('fails closed when a %s planning port exceeds the agent registry', async (_name, override) => {
    const auditEvents: AuditRecord[] = [];
    const runtime = createRuntime(auditEvents, override);

    await expect(runtime.route(runtimeRequest(), runtimeValidationTime)).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
      publicMessage: 'Access denied'
    });
  });

  it('rejects an unapproved domain prompt before any planning port runs', async () => {
    const auditEvents: AuditRecord[] = [];
    const ragPlan = vi.fn();
    const prompts = approvedPrompts.map((prompt) =>
      prompt.layer === 'domain' ? { ...prompt, status: 'testing' as const } : prompt
    );
    const runtime = createRuntime(auditEvents, {
      prompts: new PromptRegistry(prompts),
      ragPlanning: { plan: ragPlan }
    });

    await expect(runtime.route(runtimeRequest(), runtimeValidationTime)).rejects.toMatchObject({
      code: 'CONFIGURATION_ERROR',
      publicMessage: 'Prompt hierarchy is unavailable'
    });
    expect(ragPlan).not.toHaveBeenCalled();
  });

  it('fails closed when the request is cancelled', async () => {
    const auditEvents: AuditRecord[] = [];
    const controller = new AbortController();
    controller.abort();
    const runtime = createRuntime(auditEvents);

    await expect(
      runtime.route(runtimeRequest({ signal: controller.signal }), runtimeValidationTime)
    ).rejects.toMatchObject({ code: 'TIMEOUT_ERROR', publicMessage: 'Request was cancelled' });
    expect(auditEvents).toEqual([
      expect.objectContaining({
        outcome: 'rejected',
        stage: 'input_budget',
        error_code: 'TIMEOUT_ERROR'
      })
    ]);
  });

  it('fails closed when registry routing is ambiguous', async () => {
    const auditEvents: AuditRecord[] = [];
    const runtime = createRuntime(auditEvents, {
      agents: new AgentRegistry([
        maintenanceAgent,
        { ...maintenanceAgent, agent_id: 'maintenance-secondary' }
      ])
    });

    await expect(runtime.route(runtimeRequest(), runtimeValidationTime)).rejects.toMatchObject({
      code: 'CONFIGURATION_ERROR',
      publicMessage: 'Agent routing is ambiguous'
    });
  });
});
