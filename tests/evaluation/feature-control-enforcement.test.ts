import { describe, expect, it, vi } from 'vitest';
import { featureControls } from '../../packages/configuration/src/index.js';
import { ProviderAdapterError } from '../../packages/model-gateway/src/index.js';
import { enabledTestFeatureControls } from '../../packages/testing/src/index.js';
import {
  createModelGateway,
  modelGatewayRequest,
  modelGatewayValidationTime
} from '../testing/model-gateway-fixtures.js';
import {
  createToolRuntime,
  proposalToolMetadata,
  toolRequest,
  toolValidationTime
} from '../testing/tool-runtime-fixtures.js';
import {
  createRagRuntime,
  retrievalRequest,
  ragValidationTime
} from '../testing/rag-runtime-fixtures.js';
import {
  approvalContext,
  approvalValidationTime,
  createApprovalHarness
} from '../testing/approval-runtime-fixtures.js';

describe('Phase 10 runtime feature controls', () => {
  it('blocks Model Gateway before provider invocation when disabled', async () => {
    const invoke = vi.fn();
    const gateway = createModelGateway([], [], {
      featureControls: featureControls({
        ...enabledTestFeatureControls,
        modelGateway: false
      }),
      adapters: [{ adapter_id: 'adapter-primary', invoke }]
    });
    await expect(
      gateway.invoke(modelGatewayRequest(), {}, modelGatewayValidationTime)
    ).rejects.toMatchObject({ code: 'MODEL_UNAVAILABLE' });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('blocks provider fallback when its rollout control is disabled', async () => {
    const primaryInvoke = vi.fn(() => Promise.reject(new ProviderAdapterError('unavailable')));
    const fallbackInvoke = vi.fn();
    const gateway = createModelGateway([], [], {
      featureControls: featureControls({
        ...enabledTestFeatureControls,
        modelFallback: false
      }),
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

  it('blocks Tool Runtime and Action Tool boundaries before adapter or proposal execution', async () => {
    const disabledTools = createToolRuntime([], {
      featureControls: featureControls({ ...enabledTestFeatureControls, tools: false })
    });
    await expect(
      disabledTools.execute(toolRequest(), {}, toolValidationTime)
    ).rejects.toMatchObject({
      code: 'TOOL_DISABLED'
    });

    const disabledActions = createToolRuntime([], {
      featureControls: featureControls({ ...enabledTestFeatureControls, actionTools: false })
    });
    await expect(
      disabledActions.execute(
        toolRequest({
          tool_id: proposalToolMetadata.tool_id,
          tool_version: proposalToolMetadata.version,
          input: { asset_id: 'asset-1', summary: 'test-only draft' }
        }),
        {},
        toolValidationTime
      )
    ).rejects.toMatchObject({ code: 'TOOL_DISABLED' });
  });

  it('blocks direct RAG Runtime invocation when platform or RAG controls are disabled', async () => {
    for (const controls of [
      featureControls({ ...enabledTestFeatureControls, aiPlatform: false }),
      featureControls({ ...enabledTestFeatureControls, rag: false })
    ]) {
      const audits: Parameters<typeof createRagRuntime>[0] = [];
      const runtime = createRagRuntime(audits, { featureControls: controls });
      await expect(
        runtime.retrieve(retrievalRequest(), {}, ragValidationTime)
      ).rejects.toMatchObject({
        code: 'SERVICE_UNAVAILABLE'
      });
      expect(audits).toEqual([
        expect.objectContaining({ outcome: 'error', error_code: 'SERVICE_UNAVAILABLE' })
      ]);
    }
  });

  it('blocks direct protected approval execution before state or adapter access', async () => {
    for (const controls of [
      featureControls({ ...enabledTestFeatureControls, aiPlatform: false }),
      featureControls({ ...enabledTestFeatureControls, actionTools: false })
    ]) {
      const harness = createApprovalHarness({ featureControls: controls });
      await expect(
        harness.runtime.execute(
          {
            context: approvalContext(),
            trace_id: 'trace-p10-disabled-execution',
            approval_id: 'approval-does-not-need-to-exist'
          },
          approvalValidationTime
        )
      ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
      expect(harness.adapter.calls).toBe(0);
      expect(harness.audits).toEqual([
        expect.objectContaining({
          outcome: 'error',
          error_code: 'SERVICE_UNAVAILABLE',
          request_id: approvalContext().request_id,
          correlation_id: approvalContext().correlation_id,
          trace_id: 'trace-p10-disabled-execution'
        })
      ]);
    }
  });
});
