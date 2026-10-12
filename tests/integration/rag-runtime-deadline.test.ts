import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SpanStatusCode, type Span, type SpanStatus } from '@opentelemetry/api';
import type { AuditRecord } from '../../packages/audit/src/index.js';
import { toErrorEnvelope } from '../../packages/errors/src/index.js';
import { tracer } from '../../packages/observability/src/index.js';
import type { KnowledgeChunk } from '../../packages/rag-runtime/src/index.js';
import {
  approvedGovernance,
  approvedRetrievalScope,
  createRagRuntime,
  deterministicEmbeddings,
  deterministicRanker,
  indexedChunk,
  ingestionRequest,
  ragValidationTime,
  retrievalRequest
} from '../testing/rag-runtime-fixtures.js';

type Mode = 'retrieve' | 'empty' | 'ingest';
type Step =
  | 'authorization'
  | 'scope'
  | 'governance'
  | 'start_audit'
  | 'filter'
  | 'embedding'
  | 'ranking'
  | 'upsert'
  | 'success_audit';
const sequences: Record<Mode, readonly Step[]> = {
  retrieve: [
    'authorization',
    'scope',
    'start_audit',
    'filter',
    'embedding',
    'ranking',
    'success_audit'
  ],
  empty: ['authorization', 'scope', 'start_audit', 'filter', 'success_audit'],
  ingest: ['authorization', 'governance', 'start_audit', 'embedding', 'upsert', 'success_audit']
};
const cases = (Object.keys(sequences) as Mode[]).flatMap((mode) =>
  sequences[mode].map((step) => ({ mode, step }))
);
const timeoutMs = 100;
let chunk: KnowledgeChunk;

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function recordingSpan() {
  const state: { status: SpanStatus; statusCalls: SpanStatusCode[]; endCount: number } = {
    status: { code: SpanStatusCode.UNSET },
    statusCalls: [],
    endCount: 0
  };
  const span: Span = {
    spanContext: () => ({ traceId: '1'.repeat(32), spanId: '2'.repeat(16), traceFlags: 1 }),
    setAttribute: () => span,
    setAttributes: () => span,
    addEvent: () => span,
    addLink: () => span,
    addLinks: () => span,
    updateName: () => span,
    isRecording: () => state.endCount === 0,
    recordException: () => undefined,
    setStatus: (status) => {
      state.statusCalls.push(status.code);
      // OpenTelemetry precedence is OK > ERROR > UNSET, not enum numeric order.
      // A later ERROR cannot repair a prematurely committed OK.
      if (
        state.endCount === 0 &&
        state.status.code !== SpanStatusCode.OK &&
        status.code !== SpanStatusCode.UNSET
      ) {
        state.status = { ...status };
      }
      return span;
    },
    end: () => {
      state.endCount += 1;
    }
  };
  vi.spyOn(tracer, 'startActiveSpan').mockImplementation((...args) => {
    const callback = args.at(-1) as (activeSpan: Span) => unknown;
    return callback(span);
  });
  return state;
}

function harness(
  mode: Mode,
  blocked?: Step,
  jumpClock = false,
  failureAuditHangs = false,
  requestTimeoutMs = timeoutMs,
  timing: { clock?: () => number; onSuccessAuditAcknowledged?: () => void } = {}
) {
  const release = deferred();
  const entered = deferred();
  const calls: string[] = [];
  const audits: AuditRecord[] = [];
  const writes: KnowledgeChunk[] = [];
  const scope = approvedRetrievalScope();
  const invoke = <T>(step: string, value: T): Promise<T> => {
    calls.push(step);
    if (step === blocked) {
      entered.resolve();
      if (jumpClock) {
        vi.setSystemTime(ragValidationTime.getTime() + timeoutMs);
        return Promise.resolve(value);
      }
      return release.promise.then(() => value);
    }
    if (step === 'failure_audit' && failureAuditHangs) return new Promise<T>(() => undefined);
    return Promise.resolve(value);
  };
  const runtime = createRagRuntime(audits, {
    clock: timing.clock ?? Date.now,
    policy: {
      ingestion_permissions: ['rag:publish'],
      ingestion_entitlements: ['rag-runtime'],
      retrieval_permissions: ['rag:read'],
      retrieval_entitlements: ['rag-runtime'],
      timeout_ms: requestTimeoutMs,
      retrieval_version: 'rag-retrieval-1.0'
    },
    authorization: {
      authorize: () => invoke('authorization', { allowed: true, decision_id: 'auth-deadline-test' })
    },
    retrievalScope: {
      resolve: async (...args) => invoke('scope', await scope.resolve(...args))
    },
    governance: {
      authorizeIngestion: async (...args) =>
        invoke('governance', await approvedGovernance.authorizeIngestion(...args))
    },
    embeddings: {
      embed: async (request) => invoke('embedding', await deterministicEmbeddings.embed(request))
    },
    store: {
      filter: () => invoke('filter', mode === 'empty' ? [] : [chunk]),
      upsert: async (chunks) => {
        await invoke('upsert', undefined);
        writes.push(...chunks);
      }
    },
    ranker: {
      rank: async (request) => invoke('ranking', await deterministicRanker.rank(request))
    },
    audit: {
      emit: async (event) => {
        const outcome = 'outcome' in event ? event.outcome : undefined;
        const step =
          outcome === 'started'
            ? 'start_audit'
            : outcome === 'succeeded'
              ? 'success_audit'
              : 'failure_audit';
        await invoke(step, undefined);
        audits.push(event);
        if (step === 'success_audit') timing.onSuccessAuditAcknowledged?.();
      }
    }
  });
  const start = (signal?: AbortSignal) => {
    const options = signal ? { signal } : {};
    const promise =
      mode === 'ingest'
        ? runtime.ingest(ingestionRequest(), options, ragValidationTime)
        : runtime.retrieve(retrievalRequest(), options, ragValidationTime);
    const observed: { state: 'pending' | 'success' | 'failure'; error?: unknown } = {
      state: 'pending'
    };
    // Attach both outcomes immediately, including on the original broken runtime.
    const finished = promise.then(
      () => {
        observed.state = 'success';
      },
      (error: unknown) => {
        observed.state = 'failure';
        observed.error = error;
      }
    );
    return { observed, finished };
  };
  return { start, calls, audits, writes, release, entered };
}

function assertFailure(observed: { state: string; error?: unknown }, mode: Mode) {
  expect(observed.state).toBe('failure');
  expect(toErrorEnvelope(observed.error)).toMatchObject({
    error: {
      code: 'TIMEOUT_ERROR',
      request_id: 'request-rag-1',
      trace_id: mode === 'ingest' ? 'rag-trace-1' : 'rag-trace-2'
    }
  });
  const publicError = JSON.stringify(toErrorEnvelope(observed.error));
  expect(publicError).not.toContain('private dependency failure');
  expect(publicError).not.toContain(chunk.content);
  expect(publicError).not.toContain('bearing vibration lubrication');
}

describe('RAG request deadline and late-result admission', () => {
  beforeAll(async () => {
    chunk = await indexedChunk();
  });
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(ragValidationTime);
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it.each(['ingest', 'retrieve', 'empty'] as const)(
    'records ERROR when %s expires after the final audit acknowledgement at response admission',
    async (mode) => {
      const span = recordingSpan();
      let acknowledged = false;
      let postAuditReads = 0;
      // The first clock read admits the acknowledged audit result. Empty retrieval
      // also checks inside its helper; expire only when control returns to its caller.
      const admissionRead = mode === 'empty' ? 3 : 2;
      const h = harness(mode, undefined, false, false, timeoutMs, {
        onSuccessAuditAcknowledged: () => {
          acknowledged = true;
        },
        clock: () => {
          if (acknowledged) postAuditReads += 1;
          return ragValidationTime.getTime() + (postAuditReads >= admissionRead ? timeoutMs : 0);
        }
      });
      const { observed, finished } = h.start();
      await finished;
      assertFailure(observed, mode);
      expect(acknowledged).toBe(true);
      expect(h.audits.map((event) => ('outcome' in event ? event.outcome : undefined))).toEqual([
        'started',
        'succeeded',
        'rejected'
      ]);
      expect(h.audits.at(-1)).toMatchObject({
        request_id: 'request-rag-1',
        correlation_id: 'correlation-rag-1',
        error_code: 'TIMEOUT_ERROR'
      });
      expect(span.status.code).toBe(SpanStatusCode.ERROR);
      expect(span.statusCalls).toEqual([SpanStatusCode.ERROR]);
      expect(span.endCount).toBe(1);
      expect(h.calls).toEqual([...sequences[mode], 'failure_audit']);
      await vi.advanceTimersByTimeAsync(0);
      assertFailure(observed, mode);
      expect(h.calls).toEqual([...sequences[mode], 'failure_audit']);
      expect(span.endCount).toBe(1);
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it.each(['ingest', 'retrieve', 'empty'] as const)(
    'commits terminal OK exactly once after successful %s admission',
    async (mode) => {
      const span = recordingSpan();
      const h = harness(mode);
      const { observed, finished } = h.start();
      await finished;
      expect(observed.state).toBe('success');
      expect(span.status.code).toBe(SpanStatusCode.OK);
      expect(span.statusCalls).toEqual([SpanStatusCode.OK]);
      expect(span.endCount).toBe(1);
      expect(h.calls).toEqual(sequences[mode]);
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it.each(cases)(
    'bounds a never-settling $mode/$step wait and rejects its late result',
    async ({ mode, step }) => {
      const h = harness(mode, step);
      const { observed, finished } = h.start();
      await h.entered.promise;
      await vi.advanceTimersByTimeAsync(timeoutMs);
      assertFailure(observed, mode);
      expect(h.calls.filter((call) => call !== 'failure_audit')).toEqual(
        sequences[mode].slice(0, sequences[mode].indexOf(step) + 1)
      );
      expect(h.audits.at(-1)).toMatchObject({
        request_id: 'request-rag-1',
        correlation_id: 'correlation-rag-1',
        error_code: 'TIMEOUT_ERROR'
      });
      h.release.resolve();
      await vi.advanceTimersByTimeAsync(0);
      await finished;
      assertFailure(observed, mode);
      expect(h.calls.filter((call) => call !== 'failure_audit')).toEqual(
        sequences[mode].slice(0, sequences[mode].indexOf(step) + 1)
      );
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it.each(cases)(
    'fences cancellation during $mode/$step without downstream calls',
    async ({ mode, step }) => {
      const h = harness(mode, step);
      const controller = new AbortController();
      const add = vi.spyOn(controller.signal, 'addEventListener');
      const remove = vi.spyOn(controller.signal, 'removeEventListener');
      const { observed, finished } = h.start(controller.signal);
      await h.entered.promise;
      controller.abort();
      await vi.advanceTimersByTimeAsync(0);
      assertFailure(observed, mode);
      h.release.resolve();
      await vi.advanceTimersByTimeAsync(0);
      await finished;
      expect(remove).toHaveBeenCalledWith('abort', add.mock.calls[0]?.[1]);
      expect(h.calls.filter((call) => call !== 'failure_audit')).toEqual(
        sequences[mode].slice(0, sequences[mode].indexOf(step) + 1)
      );
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it.each(cases)(
    'checks elapsed time after $mode/$step even before the timeout callback runs',
    async ({ mode, step }) => {
      const h = harness(mode, step, true);
      const { observed, finished } = h.start();
      await finished;
      assertFailure(observed, mode);
      expect(h.calls.filter((call) => call !== 'failure_audit')).toEqual(
        sequences[mode].slice(0, sequences[mode].indexOf(step) + 1)
      );
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it.each(['retrieve', 'empty', 'ingest'] as const)(
    'rejects already-aborted %s requests without a data-port call',
    async (mode) => {
      const h = harness(mode);
      const controller = new AbortController();
      controller.abort();
      const { observed, finished } = h.start(controller.signal);
      await finished;
      assertFailure(observed, mode);
      expect(h.calls).toEqual(['failure_audit']);
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it.each(cases)(
    'checks the deadline on rejection of $mode/$step before the timer callback',
    async ({ mode, step }) => {
      const h = harness(mode, step);
      const { observed, finished } = h.start();
      await h.entered.promise;
      vi.setSystemTime(ragValidationTime.getTime() + timeoutMs);
      h.release.reject(new Error('private dependency failure'));
      await finished;
      assertFailure(observed, mode);
      expect(h.calls.filter((call) => call !== 'failure_audit')).toEqual(
        sequences[mode].slice(0, sequences[mode].indexOf(step) + 1)
      );
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it.each(['retrieve', 'empty', 'ingest'] as const)(
    'cleans deadline timers and external listeners after successful %s',
    async (mode) => {
      const h = harness(mode);
      const controller = new AbortController();
      const add = vi.spyOn(controller.signal, 'addEventListener');
      const remove = vi.spyOn(controller.signal, 'removeEventListener');
      const { observed, finished } = h.start(controller.signal);
      await finished;
      expect(observed.state).toBe('success');
      expect(h.calls).toEqual(sequences[mode]);
      expect(remove).toHaveBeenCalledWith('abort', add.mock.calls[0]?.[1]);
      expect(vi.getTimerCount()).toBe(0);
      controller.abort();
      expect(observed.state).toBe('success');
    }
  );

  it('does not reset the request deadline after each completed wait', async () => {
    const h = harness('retrieve', 'scope');
    const { observed, finished } = h.start();
    await h.entered.promise;
    await vi.advanceTimersByTimeAsync(60);
    h.release.resolve();
    // A later audit is still subject to the original 100 ms request deadline.
    vi.setSystemTime(ragValidationTime.getTime() + timeoutMs);
    await finished;
    assertFailure(observed, 'retrieve');
    expect(h.calls).not.toContain('filter');
  });

  it.each(['retrieve', 'ingest'] as const)(
    'bounds failed-audit delivery separately for timed-out %s',
    async (mode) => {
      const h = harness(mode, 'authorization', false, true);
      const { observed } = h.start();
      await h.entered.promise;
      await vi.advanceTimersByTimeAsync(timeoutMs);
      expect(observed.state).toBe('pending');
      await vi.advanceTimersByTimeAsync(timeoutMs);
      assertFailure(observed, mode);
      expect(h.calls).toEqual(['authorization', 'failure_audit']);
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it('handles a dependency rejection arriving after timeout without changing the public failure', async () => {
    const h = harness('retrieve', 'filter');
    const { observed, finished } = h.start();
    await h.entered.promise;
    await vi.advanceTimersByTimeAsync(timeoutMs);
    assertFailure(observed, 'retrieve');
    h.release.reject(new Error('private dependency failure'));
    await vi.advanceTimersByTimeAsync(0);
    await finished;
    assertFailure(observed, 'retrieve');
    expect(h.calls).not.toContain('embedding');
  });

  it('caps failed-audit delivery at one second even with a longer request timeout', async () => {
    const h = harness('retrieve', 'authorization', false, true, 2_000);
    const { observed, finished } = h.start();
    await h.entered.promise;
    h.release.reject(new Error('private dependency failure'));
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(999);
    expect(observed.state).toBe('pending');
    await vi.advanceTimersByTimeAsync(1);
    await finished;
    expect(observed.state).toBe('failure');
    expect(toErrorEnvelope(observed.error)).toEqual({
      error: {
        code: 'AUTHORIZATION_ERROR',
        message: 'Authorization could not be verified',
        request_id: 'request-rag-1',
        trace_id: 'rag-trace-2'
      }
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reports an already-dispatched write as unconfirmed rather than stopped or rolled back', async () => {
    const h = harness('ingest', 'upsert');
    const { observed, finished } = h.start();
    await h.entered.promise;
    await vi.advanceTimersByTimeAsync(timeoutMs);
    assertFailure(observed, 'ingest');
    expect(toErrorEnvelope(observed.error).error.message).toContain(
      'update outcome is unconfirmed'
    );
    expect(h.calls.filter((call) => call === 'upsert')).toHaveLength(1);
    expect(h.writes).toEqual([]);
    h.release.resolve();
    await vi.advanceTimersByTimeAsync(0);
    await finished;
    expect(observed.state).toBe('failure');
    expect(h.writes).toHaveLength(1);
    expect(h.calls).not.toContain('success_audit');
  });

  it('does not claim rollback of a completed write when its final audit times out', async () => {
    const h = harness('ingest', 'success_audit');
    const { observed, finished } = h.start();
    await h.entered.promise;
    expect(h.writes).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(timeoutMs);
    await finished;
    assertFailure(observed, 'ingest');
    expect(toErrorEnvelope(observed.error).error.message).toContain(
      'knowledge store update completed'
    );
    expect(h.calls.filter((call) => call === 'upsert')).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects a timeout that would overflow the platform timer', () => {
    expect(() => harness('retrieve', undefined, false, false, 2_147_483_648)).toThrow(
      'RAG Runtime configuration is invalid'
    );
    expect(vi.getTimerCount()).toBe(0);
  });
});
