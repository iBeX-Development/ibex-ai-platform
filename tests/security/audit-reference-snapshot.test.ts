import assert from 'node:assert/strict';
import { it } from 'vitest';
import {
  AuditTelemetryPipeline,
  createGatewaySecurityAuditEvent,
  type CanonicalAuditEvent
} from '../../packages/audit/src/index.js';
import { PlatformError } from '../../packages/errors/src/index.js';
import { toolContext, toolValidationTime } from '../testing/tool-runtime-fixtures.js';

function baseEvent() {
  return createGatewaySecurityAuditEvent({
    context: toolContext,
    traceId: 'reference-trace',
    timestamp: toolValidationTime,
    service: 'reference-test',
    environment: 'test',
    outcome: 'accepted',
    stage: 'authorization'
  });
}

function harness(afterPersist: () => void = () => {}) {
  const persisted: CanonicalAuditEvent[] = [];
  const exported: CanonicalAuditEvent[] = [];
  const pipeline = new AuditTelemetryPipeline({
    evidenceStore: {
      persistAudit: (event) => {
        persisted.push(event);
        afterPersist();
        return Promise.resolve();
      },
      persistHealth: () => Promise.resolve()
    },
    auditExporter: {
      export: (event) => {
        exported.push(event);
        return Promise.resolve();
      }
    },
    securityExporter: { export: () => Promise.resolve() },
    metricsExporter: { export: () => Promise.resolve() },
    healthExporter: { export: () => Promise.resolve() },
    metricLabelPolicy: { services: ['reference-test'], environments: ['test'] },
    environment: 'test',
    eventIdFactory: () => 'reference-event'
  });
  return { pipeline, persisted, exported };
}

for (const field of ['permission_refs', 'entitlement_refs'] as const) {
  for (const kind of ['sparse', 'inherited', 'accessor', 'null', 'blank', 'proxy'] as const) {
    it(`rejects ${kind} ${field} before persistence/export`, async () => {
      let reads = 0;
      let refs: unknown;
      if (kind === 'sparse') refs = new Array<unknown>(1);
      if (kind === 'inherited') {
        refs = new Array<unknown>(1);
        Object.setPrototypeOf(refs, { 0: 'inherited-reference' });
      }
      if (kind === 'accessor') {
        refs = ['initial'];
        Object.defineProperty(refs, '0', {
          get: () => {
            reads += 1;
            throw new Error('private-reference-canary');
          }
        });
      }
      if (kind === 'null') refs = [null];
      if (kind === 'blank') refs = [' '];
      if (kind === 'proxy') {
        refs = new Proxy(['reference'], {
          getOwnPropertyDescriptor: () => {
            reads += 1;
            throw new Error('private-reference-canary');
          }
        });
      }
      const { pipeline, persisted, exported } = harness();
      await assert.rejects(
        pipeline.emit({ ...baseEvent(), [field]: refs }),
        (error: unknown) =>
          error instanceof PlatformError &&
          error.code === 'VALIDATION_ERROR' &&
          error.publicMessage ===
            `Audit ${field === 'permission_refs' ? 'permission' : 'entitlement'} references is invalid`
      );
      assert.equal(reads, 0);
      assert.equal(persisted.length, 0);
      assert.equal(exported.length, 0);
    });
  }

  it(`rejects a root ${field} accessor without invoking it`, async () => {
    let reads = 0;
    const event = { ...baseEvent() };
    Object.defineProperty(event, field, {
      get: () => {
        reads += 1;
        return ['substituted'];
      }
    });
    const { pipeline, persisted, exported } = harness();
    await assert.rejects(pipeline.emit(event), { code: 'VALIDATION_ERROR' });
    assert.equal(reads, 0);
    assert.equal(persisted.length, 0);
    assert.equal(exported.length, 0);
  });

  for (const refs of [[], ['reference-a', 'reference-a', ' reference-b ']]) {
    it(`preserves ${String(refs.length)} dense ${field} values exactly`, async () => {
      const { pipeline, persisted, exported } = harness();
      await pipeline.emit({ ...baseEvent(), [field]: refs });
      assert.equal(persisted.length, 1);
      assert.equal(exported.length, 1);
      for (const event of [persisted[0], exported[0]]) {
        assert.ok(event);
        assert.deepEqual(event.context[field], refs);
        assert.deepEqual(event.evidence[field], refs);
        assert.equal(event.context.tenant_id, 'tenant-a');
        assert.ok(Object.isFrozen(event.context[field]));
        assert.ok(Object.isFrozen(event.evidence[field]));
      }
      assert.ok(!Object.isFrozen(refs));
    });
  }

  it(`ignores caller iteration hooks and detaches ${field} before delivery awaits`, async () => {
    let reads = 0;
    const refs = ['reference-a'];
    for (const key of [Symbol.iterator, 'entries', 'every']) {
      Object.defineProperty(refs, key, {
        get: () => {
          reads += 1;
          throw new Error('private-iteration-canary');
        }
      });
    }
    const event = { ...baseEvent(), [field]: refs };
    const { pipeline, persisted, exported } = harness(() => {
      refs[0] = 'foreign-reference';
      event[field] = ['replacement'];
    });
    await pipeline.emit(event);
    assert.equal(reads, 0);
    assert.equal(persisted.length, 1);
    assert.equal(exported.length, 1);
    const exportedEvent = exported[0];
    assert.ok(exportedEvent);
    assert.deepEqual(exportedEvent.context[field], ['reference-a']);
    assert.deepEqual(exportedEvent.evidence[field], ['reference-a']);
    assert.deepEqual(persisted[0]?.context[field], ['reference-a']);
    assert.equal(refs[0], 'foreign-reference');
    assert.equal(JSON.stringify(exportedEvent.context[field]), '["reference-a"]');
  });

  it(`does not use a substituting ${field} iterator`, async () => {
    let calls = 0;
    const refs = ['reference-a'];
    Object.defineProperty(refs, Symbol.iterator, {
      value: function* () {
        calls += 1;
        yield undefined;
      }
    });
    const { pipeline, exported } = harness();
    await pipeline.emit({ ...baseEvent(), [field]: refs });
    assert.equal(calls, 0);
    const exportedEvent = exported[0];
    assert.ok(exportedEvent);
    assert.deepEqual(exportedEvent.context[field], ['reference-a']);
    assert.deepEqual(exportedEvent.evidence[field], ['reference-a']);
  });

  it(`rejects revoked proxy ${field} with the fixed validation error`, async () => {
    const { proxy, revoke } = Proxy.revocable(['reference-a'], {});
    revoke();
    const { pipeline, persisted, exported } = harness();
    await assert.rejects(pipeline.emit({ ...baseEvent(), [field]: proxy }), {
      code: 'VALIDATION_ERROR'
    });
    assert.equal(persisted.length, 0);
    assert.equal(exported.length, 0);
  });

  it(`captures ${field} before other evidence reads can mutate the caller array`, async () => {
    const refs = ['reference-a'];
    const event = { ...baseEvent(), [field]: refs };
    Object.defineProperty(event, 'benign_evidence', {
      enumerable: true,
      get: () => {
        refs[0] = 'substituted-reference';
        return 'benign';
      }
    });
    const { pipeline, exported } = harness();
    await pipeline.emit(event);
    const exportedEvent = exported[0];
    assert.ok(exportedEvent);
    assert.deepEqual(exportedEvent.context[field], ['reference-a']);
    assert.deepEqual(exportedEvent.evidence[field], ['reference-a']);
    assert.equal(refs[0], 'substituted-reference');
  });
}

it('preserves unavailable-context handling without requiring reference arrays', async () => {
  const event = { ...baseEvent(), context_status: 'unavailable' as const };
  Reflect.deleteProperty(event, 'permission_refs');
  Reflect.deleteProperty(event, 'entitlement_refs');
  const { pipeline, exported } = harness();
  await pipeline.emit(event);
  const exportedEvent = exported[0];
  assert.ok(exportedEvent);
  assert.equal(exportedEvent.context.status, 'unavailable');
  assert.deepEqual(exportedEvent.context.permission_refs, []);
  assert.deepEqual(exportedEvent.context.entitlement_refs, []);
  assert.equal(exportedEvent.context.tenant_id, undefined);
});
