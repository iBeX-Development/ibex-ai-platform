import { describe, expect, it, vi } from 'vitest';
import {
  AuditTelemetryPipeline,
  InMemoryAuditEvidenceStore,
  assertEndToEndAuditTrace,
  createGatewaySecurityAuditEvent,
  createModelGatewayAuditEvent,
  createOrchestratorAuditEvent,
  createRagRuntimeAuditEvent,
  createToolRuntimeAuditEvent,
  normalizeAuditEvent,
  reconstructAuditInteraction,
  type AuditRecord
} from '../../packages/audit/src/index.js';
import { createTrustedRequestContext } from '../../packages/security/src/index.js';

const now = new Date('2026-09-24T01:00:00.000Z');
const context = createTrustedRequestContext({
  tenant_id: 'tenant-a',
  user_id: 'user-a',
  role: 'operator',
  permissions: ['asset:read', 'tool:read'],
  entitlements: ['ai:general', 'model:use', 'rag:read'],
  session_id: 'session-a',
  request_id: 'request-a',
  correlation_id: 'correlation-a',
  channel: 'web',
  locale: 'mn'
});
const traceId = 'trace-phase-7';

function chain(): readonly AuditRecord[] {
  const common = { traceId, timestamp: now, context } as const;
  return [
    createGatewaySecurityAuditEvent({
      ...common,
      service: 'ai-gateway',
      environment: 'test',
      outcome: 'accepted',
      stage: 'authorization'
    }),
    createOrchestratorAuditEvent({
      ...common,
      service: 'orchestrator',
      environment: 'test',
      outcome: 'routed',
      stage: 'agent_selection',
      intent: 'asset.lookup',
      domain: 'asset',
      selectedAgent: 'asset-agent',
      agentVersion: '1.0',
      promptHierarchy: {
        master_policy: {
          prompt_id: 'master-policy',
          prompt_version: '1.0',
          content_hash: 'sha256:master'
        },
        orchestrator_prompt: {
          prompt_id: 'orchestrator',
          prompt_version: '1.0',
          content_hash: 'sha256:orchestrator'
        },
        domain_prompt: {
          prompt_id: 'asset-agent',
          prompt_version: '1.0',
          content_hash: 'sha256:asset'
        }
      }
    }),
    createToolRuntimeAuditEvent({
      ...common,
      service: 'tool-runtime',
      environment: 'test',
      outcome: 'succeeded',
      stage: 'response_schema',
      toolId: 'asset.lookup',
      toolVersion: '1.0',
      actionClass: 'read',
      requestedOperation: 'read',
      permissionDecision: 'allowed',
      approvalState: 'not_required'
    }),
    createRagRuntimeAuditEvent({
      ...common,
      service: 'rag-runtime',
      environment: 'test',
      operation: 'retrieve',
      outcome: 'succeeded',
      stage: 'result_validation',
      agentId: 'asset-agent',
      domain: 'asset',
      knowledgeScopes: ['asset:manuals'],
      queryHash: 'sha256:query',
      documentIds: ['document-a'],
      documentVersions: ['1.0'],
      resultCount: 1,
      retrievalVersion: '1.0'
    }),
    createModelGatewayAuditEvent({
      ...common,
      service: 'model-gateway',
      environment: 'test',
      outcome: 'succeeded',
      stage: 'metrics',
      agentId: 'asset-agent',
      capability: 'answer',
      promptVersion: 'asset-prompt-v1',
      policyVersion: 'model-policy-v1',
      providerId: 'deterministic-test',
      modelId: 'test-model',
      modelVersion: '1.0',
      inputTokens: 8,
      outputTokens: 4,
      estimatedCost: 0,
      latencyMs: 2,
      fallbackUsed: false
    }),
    createGatewaySecurityAuditEvent({
      ...common,
      service: 'ai-gateway',
      environment: 'test',
      outcome: 'accepted',
      stage: 'response',
      agent: 'asset-agent',
      sourcesUsed: [{ source_id: 'document-a', version: '1.0' }],
      toolsUsed: [{ tool_id: 'asset.lookup', version: '1.0' }],
      approvalState: 'not_required',
      responseStatus: 'success',
      latencyMs: 12
    })
  ];
}

describe('Gate P7 request trace', () => {
  it.each([0, 4, 5])('rejects an environment mismatch at boundary index %s', (changedIndex) => {
    const events = chain().map((event, index) =>
      normalizeAuditEvent(
        index === changedIndex ? { ...event, environment: 'production' } : event,
        `environment-event-${String(index)}`
      )
    );
    expect(() => {
      assertEndToEndAuditTrace(events);
    }).toThrow('Audit trace context binding mismatch');
    expect(() => reconstructAuditInteraction(events)).toThrow(
      'Audit trace context binding mismatch'
    );
  });

  it.each(['test', 'staging', 'production'])(
    'reconstructs a consistently bound %s trace',
    (environment) => {
      const events = chain().map((event, index) =>
        normalizeAuditEvent({ ...event, environment }, `environment-event-${String(index)}`)
      );
      expect(() => {
        assertEndToEndAuditTrace(events);
      }).not.toThrow();
      expect(reconstructAuditInteraction(events)).toMatchObject({
        tenant_id: context.tenant_id,
        trace_id: traceId,
        response_status: 'success'
      });
    }
  );

  it.each([
    { document_ids: undefined, document_versions: ['1.0'] },
    { document_ids: ['document-a'], document_versions: undefined },
    { document_ids: ['document-a'], document_versions: [] },
    { document_ids: [''], document_versions: ['1.0'] },
    { document_ids: ['document-a'], document_versions: ['  '] }
  ])('rejects incomplete RAG source evidence: %j', (evidence) => {
    const events = chain()
      .map(normalizeForTest)
      .map((event) =>
        event.event_type === 'rag_runtime.operation.outcome'
          ? { ...event, evidence: { ...event.evidence, ...evidence } }
          : event
      );
    expect(() => reconstructAuditInteraction(events)).toThrow(
      'Audit interaction source evidence is invalid'
    );
  });

  it.each([1, 2])('rejects retrieval count %i with empty source evidence', (resultCount) => {
    const events = chain()
      .map(normalizeForTest)
      .map((event) =>
        event.event_type === 'rag_runtime.operation.outcome'
          ? {
              ...event,
              evidence: {
                ...event.evidence,
                document_ids: [],
                document_versions: [],
                result_count: resultCount
              }
            }
          : event
      );
    expect(() => reconstructAuditInteraction(events)).toThrow(
      'Audit interaction source evidence is invalid'
    );
  });

  it('does not equate ranked result count with selected source count', () => {
    const events = chain()
      .map(normalizeForTest)
      .map((event) =>
        event.event_type === 'rag_runtime.operation.outcome'
          ? { ...event, evidence: { ...event.evidence, result_count: 2 } }
          : event
      );
    expect(reconstructAuditInteraction(events).sources_used).toEqual([
      { source_id: 'document-a', version: '1.0' }
    ]);
  });

  it('preserves a genuinely empty retrieval as empty source evidence', () => {
    const events = chain()
      .map(normalizeForTest)
      .map((event) =>
        event.event_type === 'rag_runtime.operation.outcome'
          ? {
              ...event,
              evidence: {
                ...event.evidence,
                document_ids: [],
                document_versions: [],
                result_count: 0
              }
            }
          : event
      );
    expect(reconstructAuditInteraction(events).sources_used).toEqual([]);
  });

  it('reconstructs one request from Gateway through Agent, Tool/RAG, Model, and Response', async () => {
    const store = new InMemoryAuditEvidenceStore();
    let eventId = 0;
    const pipeline = new AuditTelemetryPipeline({
      evidenceStore: store,
      auditExporter: { export: vi.fn(() => Promise.resolve()) },
      securityExporter: { export: vi.fn(() => Promise.resolve()) },
      metricsExporter: { export: vi.fn(() => Promise.resolve()) },
      healthExporter: { export: vi.fn(() => Promise.resolve()) },
      metricLabelPolicy: {
        services: ['ai-gateway', 'orchestrator', 'tool-runtime', 'rag-runtime', 'model-gateway'],
        environments: ['test']
      },
      environment: 'test',
      eventIdFactory: () => `event-${String(++eventId)}`
    });
    for (const event of chain()) await pipeline.emit(event);
    expect(() => {
      assertEndToEndAuditTrace(store.audits);
    }).not.toThrow();
    expect(store.audits).toHaveLength(6);
    expect(new Set(store.audits.map((event) => event.trace_id))).toEqual(new Set([traceId]));
    expect(reconstructAuditInteraction(store.audits)).toMatchObject({
      request_id: 'request-a',
      tenant_id: 'tenant-a',
      agent: 'asset-agent',
      agent_version: '1.0',
      model_provider: 'deterministic-test',
      model: 'test-model',
      model_version: '1.0',
      tools_used: [{ tool_id: 'asset.lookup', version: '1.0' }],
      sources_used: [{ source_id: 'document-a', version: '1.0' }],
      approval_state: 'not_required',
      response_status: 'success',
      latency_ms: 12,
      token_usage: { input: 8, output: 4, total: 12 },
      estimated_cost: 0,
      errors: []
    });
    expect(reconstructAuditInteraction(store.audits).prompt_references).toHaveLength(3);
  });

  it('rejects a cross-tenant correlation mismatch during trace reconstruction', () => {
    const events = chain().map((event, index) =>
      normalizeForTest(
        index === 2
          ? createToolRuntimeAuditEvent({
              traceId,
              timestamp: now,
              context: createTrustedRequestContext({ ...context, tenant_id: 'tenant-b' }),
              service: 'tool-runtime',
              environment: 'test',
              outcome: 'succeeded',
              stage: 'response_schema'
            })
          : event,
        index
      )
    );
    expect(() => {
      assertEndToEndAuditTrace(events);
    }).toThrow('context binding mismatch');
  });

  it('rejects an unavailable event that spoofs a required boundary', () => {
    const events = chain().map((event, index) => {
      if (index !== 2) return normalizeForTest(event, index);
      return normalizeForTest(
        {
          schema_version: '1.0',
          event_type: 'tool_runtime.execution.outcome',
          timestamp: now.toISOString(),
          trace_id: traceId,
          service: 'tool-runtime',
          environment: 'test',
          context_status: 'unavailable',
          outcome: 'succeeded',
          stage: 'response_schema'
        } as unknown as AuditRecord,
        index
      );
    });

    expect(() => {
      assertEndToEndAuditTrace(events);
    }).toThrow('context binding is unavailable');
    expect(() => reconstructAuditInteraction(events)).toThrow('context binding is unavailable');
  });

  it('rejects a required boundary with missing request binding', () => {
    const events = chain().map(normalizeForTest);
    const unbound = events.map((event, index) =>
      index === 4 ? ({ ...event, request_id: undefined } as unknown as typeof event) : event
    );

    expect(() => {
      assertEndToEndAuditTrace(unbound);
    }).toThrow('context binding is unavailable');
  });
});

function normalizeForTest(event: AuditRecord, index: number) {
  return normalizeAuditEvent(event, `event-${String(index)}`);
}
