import { describe, expect, it, vi } from 'vitest';
import type { AuditRecord } from '../../packages/audit/src/index.js';
import {
  ModelRegistry,
  ProviderAdapterError,
  type LiveProviderAccess,
  type ModelProviderAdapter,
  type ModelUsageMetric,
  type ProviderResult,
  type ProviderInvocationRequest
} from '../../packages/model-gateway/src/index.js';
import {
  modelSchemaCatalog,
  createModelGateway,
  fallbackModel,
  fallbackProvider,
  modelContext,
  modelGatewayRequest,
  modelGatewayValidationTime,
  primaryModel,
  primaryProvider,
  successfulAdapter
} from '../testing/model-gateway-fixtures.js';

describe('Gate P4 Model Gateway', () => {
  it('forwards an explicitly bound workflow ID independently of registration payload schemas', async () => {
    const adapter = successfulAdapter(primaryProvider.adapter_id);
    const invoke = vi.fn((request: ProviderInvocationRequest) => adapter.invoke(request));
    const gateway = createModelGateway([], [], {
      adapters: [{ adapter_id: primaryProvider.adapter_id, invoke }]
    });
    await gateway.invoke(
      modelGatewayRequest({
        requires_structured_output: true,
        output_schema_id: 'synthetic.workflow.message'
      }),
      {},
      modelGatewayValidationTime
    );
    expect(invoke).toHaveBeenCalledOnce();
    expect(invoke.mock.calls[0]?.[0]).toMatchObject({
      output_schema_id: 'synthetic.workflow.message',
      requires_structured_output: true,
      requires_tool_use: false,
      model: { output_type: primaryModel.output_type }
    });
  });

  it('returns a provider-neutral response with complete audit and usage metrics', async () => {
    const auditEvents: AuditRecord[] = [];
    const metrics: ModelUsageMetric[] = [];
    const gateway = createModelGateway(auditEvents, metrics);

    const response = await gateway.invoke(modelGatewayRequest(), {}, modelGatewayValidationTime);

    expect(response).toMatchObject({
      request_id: 'request-model-1',
      correlation_id: 'correlation-model-1',
      trace_id: 'model-trace-1',
      provider_id: 'provider-primary',
      model_id: 'general-primary',
      model_version: '2026-09',
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        total_tokens: 15,
        estimated_cost: 0.0002
      },
      fallback_used: false
    });
    expect(metrics).toEqual([
      expect.objectContaining({
        event_type: 'model_gateway.usage',
        tenant_id: 'tenant-a',
        agent_id: 'general',
        estimated_cost: 0.0002,
        latency_ms: 0
      })
    ]);
    expect(auditEvents).toEqual([
      expect.objectContaining({
        event_type: 'model_gateway.invocation.outcome',
        context_status: 'trusted',
        request_id: 'request-model-1',
        tenant_id: 'tenant-a',
        user_id: 'user-1',
        role: 'operator',
        session_id: 'session-1',
        permission_refs: ['ai:model:invoke'],
        entitlement_refs: ['ai:model-general'],
        capability: 'MG-GENERAL',
        confidentiality_class: 'TENANT_CONFIDENTIAL',
        prompt_version: 'general-1.0',
        policy_version: 'model-policy-1.0',
        provider_id: 'provider-primary',
        model_id: 'general-primary',
        model_version: '2026-09',
        input_tokens: 10,
        output_tokens: 5,
        estimated_cost: 0.0002,
        latency_ms: 0,
        outcome: 'succeeded'
      })
    ]);
    expect(JSON.stringify(auditEvents)).not.toContain('summarize approved information');
  });

  it('switches provider configuration without changing the agent request contract', async () => {
    const request = modelGatewayRequest();
    const firstAudits: AuditRecord[] = [];
    const first = createModelGateway(firstAudits, []);
    const firstResponse = await first.invoke(request, {}, modelGatewayValidationTime);

    const secondAudits: AuditRecord[] = [];
    const second = createModelGateway(secondAudits, [], {
      registry: new ModelRegistry(
        [
          { ...primaryProvider, fallback_priority: 1 },
          { ...fallbackProvider, fallback_priority: 0 }
        ],
        [primaryModel, fallbackModel],
        modelSchemaCatalog
      )
    });
    const secondResponse = await second.invoke(request, {}, modelGatewayValidationTime);

    expect(firstResponse.provider_id).toBe('provider-primary');
    expect(secondResponse.provider_id).toBe('provider-fallback');
    expect(secondResponse.request_id).toBe(firstResponse.request_id);
    expect(secondResponse.result).toEqual(firstResponse.result);
  });

  it('uses only an approved policy-compatible fallback after a provider failure', async () => {
    const auditEvents: AuditRecord[] = [];
    const metrics: ModelUsageMetric[] = [];
    const primaryInvoke = vi.fn(() => Promise.reject(new ProviderAdapterError('unavailable')));
    const fallbackInvoke = vi.fn(() =>
      Promise.resolve({
        result: { message: 'fallback result' },
        input_tokens: 12,
        output_tokens: 4,
        finish_reason: 'stop',
        policy_flags: ['fallback']
      })
    );
    const gateway = createModelGateway(auditEvents, metrics, {
      adapters: [
        { adapter_id: 'adapter-primary', invoke: primaryInvoke },
        { adapter_id: 'adapter-fallback', invoke: fallbackInvoke }
      ]
    });

    const response = await gateway.invoke(modelGatewayRequest(), {}, modelGatewayValidationTime);

    expect(primaryInvoke).toHaveBeenCalledOnce();
    expect(fallbackInvoke).toHaveBeenCalledOnce();
    expect(response).toMatchObject({
      provider_id: 'provider-fallback',
      model_id: 'general-fallback',
      fallback_used: true
    });
    expect(auditEvents).toEqual([
      expect.objectContaining({
        provider_id: 'provider-primary',
        outcome: 'error',
        error_code: 'MODEL_UNAVAILABLE'
      }),
      expect.objectContaining({
        provider_id: 'provider-fallback',
        outcome: 'succeeded',
        fallback_used: true
      })
    ]);
  });

  it('terminates on a malformed provider envelope without retry or fallback', async () => {
    const auditEvents: AuditRecord[] = [];
    const invalidInvoke = vi.fn(() =>
      Promise.resolve({ result: { unsafe: true }, input_tokens: -1 } as unknown as ProviderResult)
    );
    const fallbackInvoke = vi.fn(() =>
      Promise.resolve({
        result: { message: 'unused fallback' },
        input_tokens: 1,
        output_tokens: 1,
        finish_reason: 'stop',
        policy_flags: []
      })
    );
    const gateway = createModelGateway(auditEvents, [], {
      adapters: [
        { adapter_id: 'adapter-primary', invoke: invalidInvoke },
        { adapter_id: 'adapter-fallback', invoke: fallbackInvoke }
      ]
    });

    await expect(
      gateway.invoke(modelGatewayRequest(), {}, modelGatewayValidationTime)
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    expect(invalidInvoke).toHaveBeenCalledOnce();
    expect(fallbackInvoke).not.toHaveBeenCalled();
    expect(auditEvents[0]).toEqual(
      expect.objectContaining({ error_code: 'INVALID_RESPONSE', outcome: 'error' })
    );
  });

  it('never falls back across confidentiality or entitlement policy', async () => {
    const auditEvents: AuditRecord[] = [];
    const primaryInvoke = vi.fn(() => Promise.reject(new ProviderAdapterError('unavailable')));
    const fallbackInvoke = vi.fn();
    const gateway = createModelGateway(auditEvents, [], {
      registry: new ModelRegistry(
        [primaryProvider, { ...fallbackProvider, maximum_confidentiality: 'INTERNAL' }],
        [primaryModel, { ...fallbackModel, maximum_confidentiality: 'INTERNAL' }],
        modelSchemaCatalog
      ),
      adapters: [
        { adapter_id: 'adapter-primary', invoke: primaryInvoke },
        { adapter_id: 'adapter-fallback', invoke: fallbackInvoke }
      ]
    });

    await expect(
      gateway.invoke(modelGatewayRequest(), {}, modelGatewayValidationTime)
    ).rejects.toMatchObject({ code: 'MODEL_UNAVAILABLE' });
    expect(primaryInvoke).toHaveBeenCalledOnce();
    expect(fallbackInvoke).not.toHaveBeenCalled();
  });

  it('rejects missing entitlements before any adapter invocation', async () => {
    const auditEvents: AuditRecord[] = [];
    const invoke = vi.fn();
    const gateway = createModelGateway(auditEvents, [], {
      adapters: [{ adapter_id: 'adapter-primary', invoke }, successfulAdapter('adapter-fallback')]
    });

    await expect(
      gateway.invoke(
        modelGatewayRequest({ context: { ...modelContext, entitlements: [] } }),
        {},
        modelGatewayValidationTime
      )
    ).rejects.toMatchObject({
      code: 'MODEL_NOT_ALLOWED',
      publicMessage: 'Model policy denied the request'
    });
    expect(invoke).not.toHaveBeenCalled();
    expect(auditEvents.at(-1)).toEqual(
      expect.objectContaining({
        stage: 'policy',
        outcome: 'rejected',
        error_code: 'MODEL_NOT_ALLOWED'
      })
    );
  });

  it.each([
    ['unapproved policy version', modelGatewayRequest({ policy_version: 'unapproved-policy' })],
    ['unregistered agent capability', modelGatewayRequest({ agent_id: 'unknown-agent' })],
    [
      'missing invoke permission',
      modelGatewayRequest({ context: { ...modelContext, permissions: [] } })
    ]
  ])('denies %s before invoking a provider', async (_name, request) => {
    const invoke = vi.fn();
    const gateway = createModelGateway([], [], {
      adapters: [{ adapter_id: 'adapter-primary', invoke }, successfulAdapter('adapter-fallback')]
    });

    await expect(gateway.invoke(request, {}, modelGatewayValidationTime)).rejects.toMatchObject({
      code: 'POLICY_DENIED',
      publicMessage: 'Model policy denied the request'
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('enforces the input budget before provider invocation', async () => {
    const invoke = vi.fn();
    const gateway = createModelGateway([], [], {
      adapters: [{ adapter_id: 'adapter-primary', invoke }, successfulAdapter('adapter-fallback')],
      policy: {
        version: 'model-policy-1.0',
        required_permission: 'ai:model:invoke',
        agent_capabilities: { general: ['MG-GENERAL'] },
        timeout_ms: 1_000,
        max_retries: 0,
        fallback_enabled: true,
        maximum_input_bytes: 8
      }
    });

    await expect(gateway.invoke(modelGatewayRequest())).rejects.toMatchObject({
      code: 'CONTEXT_TOO_LARGE',
      publicMessage: 'Model context limit exceeded'
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('normalizes provider timeout without replaying an uncertain accounting liability', async () => {
    const invoke = vi.fn(() => Promise.reject(new ProviderAdapterError('timeout')));
    const gateway = createModelGateway([], [], {
      registry: new ModelRegistry([primaryProvider], [primaryModel], modelSchemaCatalog),
      adapters: [{ adapter_id: 'adapter-primary', invoke }],
      policy: {
        version: 'model-policy-1.0',
        required_permission: 'ai:model:invoke',
        agent_capabilities: { general: ['MG-GENERAL'] },
        timeout_ms: 1_000,
        max_retries: 1,
        fallback_enabled: false,
        maximum_input_bytes: 16_384
      }
    });

    await expect(gateway.invoke(modelGatewayRequest())).rejects.toMatchObject({
      code: 'PROVIDER_TIMEOUT',
      publicMessage: 'Model provider timed out'
    });
    expect(invoke).toHaveBeenCalledOnce();
  });

  it('enforces the configured provider invocation timeout', async () => {
    const invoke = vi.fn(() => new Promise<ProviderResult>(() => undefined));
    const gateway = createModelGateway([], [], {
      registry: new ModelRegistry([primaryProvider], [primaryModel], modelSchemaCatalog),
      adapters: [{ adapter_id: 'adapter-primary', invoke }],
      policy: {
        version: 'model-policy-1.0',
        required_permission: 'ai:model:invoke',
        agent_capabilities: { general: ['MG-GENERAL'] },
        timeout_ms: 5,
        max_retries: 0,
        fallback_enabled: false,
        maximum_input_bytes: 16_384
      }
    });

    await expect(gateway.invoke(modelGatewayRequest())).rejects.toMatchObject({
      code: 'PROVIDER_TIMEOUT',
      publicMessage: 'Model provider timed out'
    });
    expect(invoke).toHaveBeenCalledOnce();
  });

  it.each([
    [
      'malformed context',
      modelGatewayRequest({ context: { ...modelContext, tenant_id: '' } }),
      'boundary_context',
      'model-trace-1'
    ],
    [
      'invalid trace',
      modelGatewayRequest({ trace_id: 'trace\nsecret' }),
      'boundary_trace',
      'generated-model-trace-1'
    ]
  ])(
    'audits %s rejection with safe correlation',
    async (_name, request, expectedStage, expectedTrace) => {
      const auditEvents: AuditRecord[] = [];
      const gateway = createModelGateway(auditEvents, []);

      await expect(gateway.invoke(request, {}, modelGatewayValidationTime)).rejects.toMatchObject({
        traceId: expectedTrace
      });
      expect(auditEvents).toEqual([
        expect.objectContaining({
          event_type: 'model_gateway.invocation.outcome',
          stage: expectedStage,
          trace_id: expectedTrace,
          outcome: 'rejected'
        })
      ]);
      expect(JSON.stringify(auditEvents)).not.toContain('trace\nsecret');
    }
  );

  it('activates a live adapter only through approved configuration and secret injection', async () => {
    const auditEvents: AuditRecord[] = [];
    const injectedSecret = 'injected-provider-credential';
    let receivedAccess: LiveProviderAccess | undefined;
    let receivedRequest: ProviderInvocationRequest | undefined;
    const adapter: ModelProviderAdapter = {
      adapter_id: 'live-adapter',
      invoke: (request, access) => {
        receivedRequest = request;
        receivedAccess = access;
        return Promise.resolve({
          result: { message: 'live adapter result' },
          input_tokens: 3,
          output_tokens: 2,
          finish_reason: 'stop',
          policy_flags: []
        });
      }
    };
    const liveProvider = {
      ...primaryProvider,
      provider_id: 'approved-live-provider',
      adapter_id: 'live-adapter',
      mode: 'live' as const,
      endpoint: 'https://models.example.invalid/v1',
      credential_reference: 'MODEL_PROVIDER_KEY'
    };
    const gateway = createModelGateway(auditEvents, [], {
      registry: new ModelRegistry(
        [liveProvider],
        [{ ...primaryModel, provider_id: liveProvider.provider_id }],
        modelSchemaCatalog
      ),
      adapters: [adapter],
      secretProvider: { getSecret: () => Promise.resolve(injectedSecret) }
    });

    await gateway.invoke(modelGatewayRequest(), {}, modelGatewayValidationTime);

    expect(receivedAccess).toEqual({
      endpoint: 'https://models.example.invalid/v1',
      credential: injectedSecret
    });
    expect(receivedRequest).not.toHaveProperty('context');
    expect(receivedRequest).not.toHaveProperty('tenant_id');
    expect(JSON.stringify(auditEvents)).not.toContain(injectedSecret);
    expect(JSON.stringify(auditEvents)).not.toContain('summarize approved information');
  });

  it('fails closed before live invocation when secret injection is unavailable', async () => {
    const invoke = vi.fn();
    const liveProvider = {
      ...primaryProvider,
      provider_id: 'approved-live-provider',
      adapter_id: 'live-adapter',
      mode: 'live' as const,
      endpoint: 'https://models.example.invalid/v1',
      credential_reference: 'MODEL_PROVIDER_KEY'
    };
    const gateway = createModelGateway([], [], {
      registry: new ModelRegistry(
        [liveProvider],
        [{ ...primaryModel, provider_id: liveProvider.provider_id }],
        modelSchemaCatalog
      ),
      adapters: [{ adapter_id: 'live-adapter', invoke }]
    });

    await expect(gateway.invoke(modelGatewayRequest())).rejects.toMatchObject({
      code: 'CONFIGURATION_ERROR',
      publicMessage: 'Live model provider is not configured'
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('does not repeat model invocation when metrics emission fails', async () => {
    const invoke = vi.fn(() =>
      Promise.resolve({
        result: { message: 'result' },
        input_tokens: 2,
        output_tokens: 1,
        finish_reason: 'stop',
        policy_flags: []
      })
    );
    const gateway = createModelGateway([], [], {
      adapters: [{ adapter_id: 'adapter-primary', invoke }, successfulAdapter('adapter-fallback')],
      metrics: { emit: () => Promise.reject(new Error('metrics unavailable')) },
      policy: {
        version: 'model-policy-1.0',
        required_permission: 'ai:model:invoke',
        agent_capabilities: { general: ['MG-GENERAL'] },
        timeout_ms: 1_000,
        max_retries: 2,
        fallback_enabled: true,
        maximum_input_bytes: 16_384
      }
    });

    await expect(gateway.invoke(modelGatewayRequest())).rejects.toMatchObject({
      code: 'GATEWAY_ERROR',
      publicMessage: 'Model Gateway telemetry failed'
    });
    expect(invoke).toHaveBeenCalledOnce();
  });
});
