import { pilotAgentResponseSchema } from '../../packages/pilot-agents/src/index.js';
import { localAssetOutput } from '../testing/local-location-adapter.js';
import { expect, it } from 'vitest';
import { assetAgentProfile } from '../../agents/asset/src/index.js';
import { createAssetComponentChain, chainIdentity } from '../testing/local-location-chain.js';
const base = { id: 'asset-a', name: 'Synthetic pump', asset_code: 'SYN-001' };
it.each([
  ['expanded', { ...base, location: { name: 'Synthetic room' } }],
  ['explicit null', { ...base, location: null }],
  ['omitted', { ...base }]
] as const)('preserves %s location in local-only Asset protocol', async (_mode, record) => {
  const before = JSON.stringify(record);
  const h = createAssetComponentChain({ record });
  const identity = chainIdentity('a');
  const response = await h.execute(identity, { asset_id: 'asset-a' });
  expect(response.status).toBe('success');
  expect(response.response).toMatchObject({
    response_type: 'operational',
    evidence_status: 'sufficient',
    request_id: identity.request_id,
    correlation_id: identity.correlation_id
  });
  const answer = pilotAgentResponseSchema.parse(response.response);
  expect(JSON.parse(answer.answer)).toEqual(record);
  expect(h.actualToolResponses).toHaveLength(1);
  const toolResponse = h.actualToolResponses[0];
  if (!toolResponse || toolResponse.status !== 'success')
    throw new Error('Expected successful Tool response');
  const output = localAssetOutput.parse(toolResponse.output);
  expect(output).toEqual(record);
  expect(Object.keys(output).sort()).toEqual(Object.keys(record).sort());
  expect(Object.hasOwn(output, 'location')).toBe(Object.hasOwn(record, 'location'));
  for (const call of [h.forward, h.route, h.toolExecute, h.invoke, h.transport])
    expect(call).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(record)).toBe(before);
  expect(assetAgentProfile.live_capabilities_enabled).toBe(false);
});

it('refuses a benign extra field under the strict expanded-location output schema', async () => {
  const h = createAssetComponentChain({
    record: {
      ...base,
      location: { name: 'Synthetic room' },
      display_hint: 'BENIGN_UNDECLARED_HINT'
    }
  });
  const response = await h.execute(chainIdentity('a'), { asset_id: 'asset-a' });
  expect(response).toMatchObject({
    status: 'partial',
    response: { response_type: 'abstain', evidence_status: 'insufficient', citations: [] },
    tools_used: []
  });
  expect(h.invoke).toHaveBeenCalledTimes(1);
  expect(h.transport).toHaveBeenCalledTimes(1);
  expect(h.actualToolResponses).toEqual([]);
  expect(JSON.stringify({ response, audits: h.audits })).not.toContain('BENIGN_UNDECLARED_HINT');
  expect(h.audits).toEqual(
    expect.arrayContaining([expect.objectContaining({ error_code: 'INVALID_RESPONSE' })])
  );
});
