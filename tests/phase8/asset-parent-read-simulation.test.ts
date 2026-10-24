import { describe, expect, it, vi } from 'vitest';
import { createAssetParentSimulation, fixtureRequest, type SimulationOptions } from '../testing/asset-parent-read-simulation.js';

const child = { id: 'child', company: 'company-a', parent: 'parent' };
const parent = { id: 'parent', company: 'company-a', parent: null };
const base = { contract_id: 'asset-parent-read', contract_version: '0.1.0',
  operation: 'asset.parent.read', correlation_id: 'request-1' };
const unavailable = { status: 404, body: { ...base, outcome: 'unavailable' } };
const run = (options: SimulationOptions = {}) => {
  const simulation = createAssetParentSimulation(options);
  return { simulation, result: simulation.request(fixtureRequest(), simulation.session) };
};

describe('Asset Parent Read v0.1 synthetic contract only', () => {
  it('returns just the immediate parent through every required hop without source writes', () => {
    const simulation = createAssetParentSimulation();
    const before = simulation.inspectSource();
    expect(simulation.request(fixtureRequest(), simulation.session)).toEqual({ status: 200,
      body: { ...base, outcome: 'known', parent_id: 'parent' } });
    expect(simulation.inspectTrace()).toEqual([
      'Core-facing request->Gateway', 'Gateway->Platform orchestration', 'Platform->ToolRuntime',
      'ToolRuntime->gateway-only adapter', 'gateway-only adapter->Gateway',
      'Gateway->syntheticCoreAPI', 'syntheticCoreAPI->Gateway', 'Gateway->Platform',
      'Platform->Gateway final', 'Gateway->Core-facing response',
    ]);
    expect(simulation.inspectSource()).toEqual(before);
  });
  it.each([
    ['missing child', { rows: [parent] }, 'child_not_found'],
    ['denied child', { readable: ['parent'] }, 'child_denied'],
    ['hidden parent', { readable: ['child'] }, 'parent_denied'],
    ['wrong child company', { company: 'company-b' }, 'child_not_found'],
    ['wrong parent company', { rows: [child, { ...parent, company: 'company-b' }] }, 'parent_not_found'],
    ['missing parent', { rows: [child] }, 'parent_not_found'],
    ['hidden unknown', { rows: [{ ...child, parent: null }], nullMeansUnknown: true }, 'unknown_disclosure_denied'],
  ] satisfies [string, SimulationOptions, string][])('%s has the identical outward unavailable envelope', (_name, options, diagnostic) => {
    const { simulation, result } = run(options);
    expect(result).toEqual(unavailable);
    expect(simulation.inspectModelContext()).toEqual([unavailable]);
    expect(simulation.inspectRestrictedAudit()).toEqual([diagnostic]);
    expect(JSON.stringify(result)).not.toContain(diagnostic);
  });
  it('only discloses unknown under both synthetic mapping and disclosure permission', () => {
    expect(run({ rows: [{ ...child, parent: null }], nullMeansUnknown: true, discloseUnknown: true }).result)
      .toEqual({ status: 200, body: { ...base, outcome: 'unknown' } });
  });
  it.each([
    ['unmapped null', { rows: [{ ...child, parent: null }], discloseUnknown: true }],
    ['missing parent field', { rows: [{ id: 'child', company: 'company-a' }] }],
    ['duplicate child', { rows: [child, child, parent] }],
    ['duplicate parent', { rows: [child, parent, parent] }],
    ['self parent', { rows: [{ ...child, parent: 'child' }] }],
    ['invalid parent type', { rows: [{ ...child, parent: 42 }] }],
    ['source outage', { coreReadDown: true }],
  ] satisfies [string, SimulationOptions][])('%s fails with bounded error', (_name, options) => {
    expect(run(options).result).toEqual({ status: 503, body: { ...base, outcome: 'error' } });
  });
  it.each([
    { operation: 'asset.write' }, { contract_version: '0.2.0' }, { contract_id: 'other' },
    { selectors: ['root'] }, { selectors: ['parent', 'children'] }, { company: 'company-b' },
    { identity: 'admin' }, { endpoint: 'direct-core' }, { subject: { asset_id: ' child' } },
    { correlation_id: '' },
  ])('rejects invalid binding or business input %j before orchestration', mutation => {
    const simulation = createAssetParentSimulation();
    const response = simulation.request({ ...fixtureRequest(), ...mutation }, simulation.session);
    expect(response).toEqual({ status: 503, body: { ...base, correlation_id: 'invalid-request', outcome: 'error' } });
    expect(simulation.inspectTrace()).toEqual(['Core-facing request->Gateway']);
    expect(simulation.inspectModelContext()).toEqual([]);
  });
  it('does not trust a forged session with identical fields', () => {
    const simulation = createAssetParentSimulation();
    expect(simulation.request(fixtureRequest(), { ...simulation.session })).toEqual(unavailable);
    expect(simulation.inspectModelContext()).toEqual([]);
    expect(simulation.inspectTrace()).toEqual(['Core-facing request->Gateway']);
  });
  it('binds the source lookup to the requested subject without default substitution', () => {
    const simulation = createAssetParentSimulation({ readable: ['other'],
      trustedBinding: { subject_id: 'other', correlation_id: 'request-1' } });
    expect(simulation.request({ ...fixtureRequest(), subject: { asset_id: 'other' } }, simulation.session)).toEqual(unavailable);
    expect(simulation.inspectRestrictedAudit()).toEqual(['child_not_found']);
  });
  it.each([
    ['gateway', { gatewayDownAt: 'ingress' }], ['platform', { platformDown: true }],
    ['both', { gatewayDownAt: 'ingress', platformDown: true }],
    ['tool gateway', { gatewayDownAt: 'tool' }], ['final gateway', { gatewayDownAt: 'final' }],
  ] satisfies [string, SimulationOptions][])('%s outage leaves independent Core stubs available without fallback', (_name, options) => {
    const core = vi.fn();
    const simulation = createAssetParentSimulation({ ...options, observeCoreCall: core });
    for (const operation of ['startup', 'login', 'business', 'background'] as const) {
      expect(simulation.coreOperation(operation)).toEqual({ operation, available: true });
    }
    expect(simulation.request(fixtureRequest(), simulation.session)).toEqual({ status: 503, body: { ...base, outcome: 'error' } });
    const reads = simulation.inspectTrace().filter(hop => hop === 'Gateway->syntheticCoreAPI');
    expect(reads).toHaveLength('gatewayDownAt' in options && options.gatewayDownAt === 'final' ? 1 : 0);
    expect(core).toHaveBeenCalledTimes('gatewayDownAt' in options && options.gatewayDownAt === 'final' ? 1 : 0);
    for (const operation of ['startup', 'login', 'business', 'background'] as const) {
      expect(simulation.coreOperation(operation).available).toBe(true);
    }
  });

  it.each([{ correlation_id: 'valid-but-wrong' }, { subject: { asset_id: 'other' } }])(
    'rejects a syntactically valid request that differs from authenticated binding %j', mutation => {
      const core = vi.fn();
      const simulation = createAssetParentSimulation({ observeCoreCall: core });
      expect(simulation.request({ ...fixtureRequest(), ...mutation }, simulation.session).body.outcome).toBe('error');
      expect(simulation.inspectRestrictedAudit()).toEqual(['request_binding_invalid']);
      expect(simulation.inspectModelContext()).toEqual([]);
      expect(simulation.inspectTrace()).toEqual(['Core-facing request->Gateway']);
      expect(core).not.toHaveBeenCalled();
    });
  // Independently authored wire fixtures: do not mutate or derive expected fields
  // from the implementation's reply constructor.
  it.each([
    ['valid', 'child', 'asset.parent.read', 'request-1', true],
    ['operation', 'child', 'asset.write', 'request-1', false],
    ['subject', 'other', 'asset.parent.read', 'request-1', false],
    ['correlation', 'child', 'asset.parent.read', 'other-request', false],
  ] as const)('validates independently injected %s response before model/public context', (_name, subject, operation, correlation, valid) => {
    const simulation = createAssetParentSimulation({ corruptCoreReply: () => ({
      subject_id: subject, wire: { status: 200, body: {
        contract_id: 'asset-parent-read', contract_version: '0.1.0', operation,
        correlation_id: correlation, outcome: 'known', parent_id: 'parent',
      } },
    }) });
    const response = simulation.request(fixtureRequest(), simulation.session);
    expect(response.body.outcome).toBe(valid ? 'known' : 'error');
    expect(simulation.inspectModelContext()).toEqual(valid ? [response] : []);
    if (!valid) expect(simulation.inspectRestrictedAudit()).toContain('response_invalid');
  });
  it('never invokes an ingress getter', () => {
    const getter = vi.fn(() => 'asset.parent.read');
    const input = Object.defineProperty(fixtureRequest(), 'operation', { enumerable: true, get: getter });
    const simulation = createAssetParentSimulation();
    expect(simulation.request(input, simulation.session).body.outcome).toBe('error');
    expect(getter).not.toHaveBeenCalled();
    expect(simulation.inspectTrace()).toEqual(['Core-facing request->Gateway']);
  });
  it.each([
    ['prototype', () => Object.assign(Object.create({ inherited: true }) as object, fixtureRequest())],
    ['nested duplicate', () => Buffer.from(JSON.stringify(fixtureRequest()).replace('"asset_id":"child"', '"asset_id":"child","asset_id":"other"'))],
    ['malformed UTF8', () => new Uint8Array([0xc3, 0x28])],
    ['synthetic byte limit', () => Buffer.from(' '.repeat(4097))],
    ['synthetic structured size limit', () => ({ ...fixtureRequest(), correlation_id: 'a'.repeat(4097) })],
    ['synthetic depth limit', () => Buffer.from('['.repeat(10) + '0' + ']'.repeat(10))],
  ] satisfies [string, () => unknown][])('rejects %s before orchestration', (_name, make) => {
    const core = vi.fn();
    const simulation = createAssetParentSimulation({ observeCoreCall: core });
    expect(simulation.request(make(), simulation.session).body.outcome).toBe('error');
    expect(simulation.inspectTrace()).toEqual(['Core-facing request->Gateway']);
    expect(core).not.toHaveBeenCalled();
  });
  it('accepts a valid raw JSON control', () => {
    const simulation = createAssetParentSimulation();
    expect(simulation.request(Buffer.from(JSON.stringify(fixtureRequest())), simulation.session).body.outcome).toBe('known');
  });
  it.each([
    { rows: [] }, { rows: [{ ...child, company: 'foreign' }] },
    { rows: [{ ...child, company: 'foreign' }, { ...child, company: 'foreign' }] },
    { rows: [{ id: 'child', company: 'foreign', parent: 42 }] },
  ])('conceals absent/single/duplicate/malformed foreign child rows %#', options => {
    expect(run(options).result).toEqual(unavailable);
  });
  it.each([
    { rows: [] }, { rows: [{ ...parent, company: 'foreign' }] },
    { rows: [{ ...parent, company: 'foreign' }, { ...parent, company: 'foreign' }] },
    { rows: [{ id: 'parent', company: 'foreign', parent: 42 }] },
  ])('conceals absent/single/duplicate/malformed foreign parent rows %#', options => {
    expect(run({ rows: [child, ...options.rows] }).result).toEqual(unavailable);
  });
  it('ignores inaccessible malformed unrelated rows for an authorized result', () => {
    const options = { rows: [child, parent, { id: 'other', company: 'foreign', parent: {} }, null] };
    expect(run(options).result).toEqual(run().result);
  });
  it.each([
    { featureEnabled: false }, { profileEnabled: false }, { registered: false }, { invalidGatewayAuthority: true },
  ])('rejects dispatch/capability gate %j before the observed Core boundary', options => {
    const core = vi.fn();
    const simulation = createAssetParentSimulation({ ...options, observeCoreCall: core });
    expect(simulation.request(fixtureRequest(), simulation.session).body.outcome).toBe('error');
    expect(core).not.toHaveBeenCalled();
  });
  it('observes the valid Core boundary control exactly once', () => {
    const core = vi.fn();
    expect(run({ observeCoreCall: core }).result.body.outcome).toBe('known');
    expect(core).toHaveBeenCalledTimes(1);
  });
  it('rejects a subject corrupted at the actual Core return boundary without public/model leakage', () => {
    const core = vi.fn();
    const corrupt = vi.fn((reply: unknown) => {
      expect(reply).toEqual({ subject_id: 'child', wire: unavailable });
      // Preserve the actual returned wire; corrupt only its producer subject binding.
      if (typeof reply !== 'object' || reply === null) throw new Error('missing reply');
      return { ...reply, subject_id: 'wrong-subject' };
    });
    const simulation = createAssetParentSimulation({ readable: ['child'],
      observeCoreCall: core, corruptCoreReply: corrupt });
    expect(simulation.request(fixtureRequest(), simulation.session)).toEqual({ status: 503,
      body: { ...base, outcome: 'error' } });
    expect(core).toHaveBeenCalledTimes(1);
    expect(corrupt).toHaveBeenCalledTimes(1);
    expect(simulation.inspectModelContext()).toEqual([]);
    expect(simulation.inspectRestrictedAudit()).toEqual(['parent_denied', 'response_invalid']);
  });
  // No-fallback evidence is inspected absence of a fallback implementation plus
  // the independently observed Core-call counts above, not a dormant-hook assertion.
});
