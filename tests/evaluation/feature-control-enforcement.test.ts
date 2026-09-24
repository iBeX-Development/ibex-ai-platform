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
});
