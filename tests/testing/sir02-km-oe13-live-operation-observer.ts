import childProcess from 'node:child_process';
import dgram from 'node:dgram';
import dns from 'node:dns';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net';
import tls from 'node:tls';
import workerThreads from 'node:worker_threads';

/** The boundary is the synchronous, isolated OE-13 scenario invocation only. */
export const LIVE_OPERATION_CATEGORIES = [
  'liveIngestion',
  'liveParsingChunking',
  'liveEmbedding',
  'liveIndexing',
  'liveVectorStoreWritePopulation',
  'liveRetrievalPreparation',
  'liveProductionStorage',
  'deploymentActions',
  'configurationMutations',
  'credentialOperations',
  'secretOperations',
  'trafficNetworkActions'
] as const;

export type LiveOperationCategory = (typeof LIVE_OPERATION_CATEGORIES)[number];
export type LiveOperationCounters = Record<LiveOperationCategory, number> & {
  unknownProhibitedActions: number;
};

export interface ScenarioObservationSnapshot {
  scenarioId: string;
  phase: 'Before Fixture Cleanup';
  initialCounters: LiveOperationCounters;
  counters: LiveOperationCounters;
  blockedAudit: Array<{
    reason: 'PROHIBITED_OPERATION_BLOCKED';
    category: LiveOperationCategory | 'unknownProhibitedActions';
  }>;
  environmentUnchanged: boolean;
}

const processingOperationCategories = {
  parsingChunking: 'liveParsingChunking',
  embedding: 'liveEmbedding',
  indexing: 'liveIndexing',
  vectorStorage: 'liveVectorStoreWritePopulation',
  retrievalPreparation: 'liveRetrievalPreparation',
  otherKnowledgeProcessing: 'unknownProhibitedActions'
} as const;
const requiredProcessingPorts = Object.keys(processingOperationCategories).sort();
const environmentSnapshot = (): string =>
  JSON.stringify(Object.entries(process.env).sort(([left], [right]) => left.localeCompare(right)));

export class BlockedLiveOperation extends Error {
  observation?: ScenarioObservationSnapshot;
  constructor(readonly category: LiveOperationCategory | 'unknownProhibitedActions') {
    super(`OE13_LIVE_OPERATION_BLOCKED:${category}`);
    this.name = 'BlockedLiveOperation';
  }
}

const emptyCounters = (): LiveOperationCounters => ({
  liveIngestion: 0,
  liveParsingChunking: 0,
  liveEmbedding: 0,
  liveIndexing: 0,
  liveVectorStoreWritePopulation: 0,
  liveRetrievalPreparation: 0,
  liveProductionStorage: 0,
  deploymentActions: 0,
  configurationMutations: 0,
  credentialOperations: 0,
  secretOperations: 0,
  trafficNetworkActions: 0,
  unknownProhibitedActions: 0
});

const allZero = (snapshot: LiveOperationCounters): boolean =>
  Object.values(snapshot).every((count) => count === 0);

/**
 * Guard test-worker I/O entry points, and expose explicit blocked ports for
 * semantic operations that have no production adapter in this fixture.
 * This does not claim to observe other processes or the historical formal run.
 */
export class LiveOperationObserver {
  private counters = emptyCounters();
  private restorers: Array<() => void> = [];
  private armed = false;
  private readonly guardedSurfaces = new Set<string>();
  private scenarioId: string | null = null;
  private initialEnvironment: string | null = null;
  private initialCounters: LiveOperationCounters | null = null;
  private processingPortsBound = false;
  private captured: ScenarioObservationSnapshot | null = null;
  private blockedAudit: ScenarioObservationSnapshot['blockedAudit'] = [];

  readonly ports: Record<LiveOperationCategory, () => never> = Object.fromEntries(
    LIVE_OPERATION_CATEGORIES.map((category) => [category, () => this.block(category)])
  ) as Record<LiveOperationCategory, () => never>;

  block(category: LiveOperationCategory): never {
    if (!this.armed) throw new Error('OE13_OBSERVER_NOT_ARMED');
    this.counters[category] += 1;
    this.blockedAudit.push({ reason: 'PROHIBITED_OPERATION_BLOCKED', category });
    throw new BlockedLiveOperation(category);
  }

  /** Every fixture processing port must enter this active, blocking scope. */
  bindProcessingPorts(names: string[]): void {
    if (!this.armed) throw new Error('OE13_OBSERVER_NOT_ARMED');
    if (JSON.stringify([...names].sort()) !== JSON.stringify(requiredProcessingPorts))
      throw new Error('OE13_OBSERVER_PROCESSING_PORT_COVERAGE_UNAVAILABLE');
    this.processingPortsBound = true;
  }

  attemptOperation(name: string): never {
    if (!this.armed) throw new Error('OE13_OBSERVER_NOT_ARMED');
    const category = Object.hasOwn(processingOperationCategories, name)
      ? processingOperationCategories[name as keyof typeof processingOperationCategories]
      : LIVE_OPERATION_CATEGORIES.includes(name as LiveOperationCategory)
        ? (name as LiveOperationCategory)
        : 'unknownProhibitedActions';
    this.counters[category] += 1;
    this.blockedAudit.push({ reason: 'PROHIBITED_OPERATION_BLOCKED', category });
    throw new BlockedLiveOperation(category);
  }

  assertActive(scenarioId: string): void {
    if (!this.armed || this.scenarioId !== scenarioId)
      throw new Error('OE13_OBSERVER_SCENARIO_SCOPE_MISSING');
  }

  captureBeforeFixtureCleanup(scenarioId: string): ScenarioObservationSnapshot {
    this.assertActive(scenarioId);
    if (!this.processingPortsBound || !this.initialCounters || this.captured)
      throw new Error('OE13_OBSERVER_COVERAGE_INCOMPLETE');
    const snapshot: ScenarioObservationSnapshot = {
      scenarioId,
      phase: 'Before Fixture Cleanup',
      initialCounters: { ...this.initialCounters },
      counters: { ...this.counters },
      blockedAudit: this.blockedAudit.map((entry) => ({ ...entry })),
      environmentUnchanged: this.initialEnvironment === environmentSnapshot()
    };
    this.captured = snapshot;
    return snapshot;
  }

  capturedSnapshot(): ScenarioObservationSnapshot | null {
    return this.captured;
  }

  private patch(target: object, name: string, category: LiveOperationCategory): void {
    const original = Object.getOwnPropertyDescriptor(target, name);
    if (
      !original ||
      typeof original.value !== 'function' ||
      (!original.writable && !original.configurable)
    )
      throw new Error(`OE13_OBSERVER_COVERAGE_UNAVAILABLE:${name}`);
    const blocked = (): never => this.block(category);
    Object.defineProperty(target, name, {
      ...original,
      value: function blockedOperation(): never {
        return blocked();
      }
    });
    this.guardedSurfaces.add(name);
    this.restorers.push(() => Object.defineProperty(target, name, original));
  }

  arm(scenarioId = 'synthetic-observer-probe'): void {
    if (this.armed) throw new Error('OE13_OBSERVER_ALREADY_ARMED');
    this.counters = emptyCounters();
    this.guardedSurfaces.clear();
    this.scenarioId = scenarioId;
    this.initialEnvironment = environmentSnapshot();
    this.initialCounters = { ...this.counters };
    this.processingPortsBound = false;
    this.captured = null;
    this.blockedAudit = [];
    this.armed = true;
    try {
      this.patch(globalThis, 'fetch', 'trafficNetworkActions');
      if (typeof globalThis.WebSocket === 'function')
        this.patch(globalThis, 'WebSocket', 'trafficNetworkActions');
      for (const name of ['request', 'get']) {
        this.patch(http, name, 'trafficNetworkActions');
        this.patch(https, name, 'trafficNetworkActions');
      }
      for (const name of ['connect', 'createConnection'])
        this.patch(net, name, 'trafficNetworkActions');
      this.patch(net.Socket.prototype, 'connect', 'trafficNetworkActions');
      this.patch(tls, 'connect', 'trafficNetworkActions');
      this.patch(dgram, 'createSocket', 'trafficNetworkActions');
      this.patch(dgram.Socket.prototype, 'send', 'trafficNetworkActions');
      for (const name of ['lookup', 'resolve', 'resolve4', 'resolve6'])
        this.patch(dns, name, 'trafficNetworkActions');
      for (const name of ['lookup', 'resolve', 'resolve4', 'resolve6'])
        this.patch(dns.promises, name, 'trafficNetworkActions');
      this.patch(workerThreads, 'Worker', 'deploymentActions');
      for (const name of [
        'exec',
        'execFile',
        'spawn',
        'fork',
        'execSync',
        'execFileSync',
        'spawnSync'
      ])
        this.patch(childProcess, name, 'deploymentActions');
      for (const name of [
        'writeFile',
        'writeFileSync',
        'open',
        'openSync',
        'appendFile',
        'appendFileSync',
        'createWriteStream',
        'copyFile',
        'copyFileSync',
        'rename',
        'renameSync',
        'rm',
        'rmSync',
        'unlink',
        'unlinkSync',
        'mkdir',
        'mkdirSync',
        'truncate',
        'truncateSync'
      ])
        this.patch(fs, name, 'liveProductionStorage');
      for (const name of [
        'writeFile',
        'open',
        'appendFile',
        'copyFile',
        'rename',
        'rm',
        'unlink',
        'mkdir',
        'truncate'
      ])
        this.patch(fs.promises, name, 'liveProductionStorage');
      const originalEnv = process.env;
      process.env = new Proxy(originalEnv, {
        set: () => this.block('configurationMutations'),
        deleteProperty: () => this.block('configurationMutations'),
        defineProperty: () => this.block('configurationMutations')
      });
      this.restorers.push(() => {
        process.env = originalEnv;
      });
      for (const name of ['chdir', 'umask']) this.patch(process, name, 'configurationMutations');
      syncBuiltinESMExports();
      if (this.guardedSurfaces.size === 0) throw new Error('OE13_OBSERVER_COVERAGE_UNAVAILABLE');
    } catch (error) {
      try {
        this.disarm();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], 'OE13_OBSERVER_INSTALL_AND_CLEANUP_FAILED');
      }
      if (error instanceof Error) throw error;
      throw new Error('OE13_OBSERVER_INSTALL_FAILED', { cause: error });
    }
  }

  snapshot(): LiveOperationCounters {
    if (!this.armed) throw new Error('OE13_OBSERVER_NOT_ARMED');
    return { ...this.counters };
  }

  assertMeasuredZero(): LiveOperationCounters {
    const snapshot = this.snapshot();
    if (!allZero(snapshot)) throw new Error('OE13_OBSERVER_NONZERO_LIVE_OPERATION');
    return snapshot;
  }

  disarm(): void {
    const errors: unknown[] = [];
    for (const restore of this.restorers.reverse()) {
      try {
        restore();
      } catch (error) {
        errors.push(error);
      }
    }
    this.restorers = [];
    this.armed = false;
    this.counters = emptyCounters();
    this.scenarioId = null;
    this.initialEnvironment = null;
    this.initialCounters = null;
    this.processingPortsBound = false;
    this.captured = null;
    this.blockedAudit = [];
    syncBuiltinESMExports();
    if (errors.length) throw new AggregateError(errors, 'OE13_OBSERVER_CLEANUP_FAILED');
  }

  isClean(): boolean {
    return (
      !this.armed &&
      this.restorers.length === 0 &&
      allZero(this.counters) &&
      this.scenarioId === null &&
      this.initialEnvironment === null &&
      this.initialCounters === null &&
      !this.processingPortsBound &&
      this.captured === null &&
      this.blockedAudit.length === 0
    );
  }
}

export interface ObservedScenario<T> {
  result: T;
  liveOperationCounters: LiveOperationCounters;
  observation: ScenarioObservationSnapshot;
  observerCleanup: 'Passed';
}

export function observeScenario<T>(
  scenarioId: string,
  run: (observer: LiveOperationObserver) => T
): ObservedScenario<T> {
  const observer = new LiveOperationObserver();
  let result: T | undefined;
  let counters: LiveOperationCounters | undefined;
  let observation: ScenarioObservationSnapshot | null = null;
  let primaryError: unknown;
  let cleanupError: unknown;
  observer.arm(scenarioId);
  try {
    result = run(observer);
    observation = observer.capturedSnapshot();
    if (!observation || observation.scenarioId !== scenarioId || !observation.environmentUnchanged)
      throw new Error('OE13_OBSERVER_COVERAGE_INCOMPLETE');
    counters = observation.counters;
    if (!allZero(counters)) throw new Error('OE13_OBSERVER_NONZERO_LIVE_OPERATION');
  } catch (error) {
    primaryError = error;
    observation = observer.capturedSnapshot();
    if (error instanceof BlockedLiveOperation && observation) error.observation = observation;
  } finally {
    try {
      observer.disarm();
    } catch (error) {
      cleanupError = error;
    }
  }
  if (cleanupError !== undefined)
    throw new AggregateError(
      primaryError === undefined ? [cleanupError] : [primaryError, cleanupError],
      'OE13_OBSERVER_CLEANUP_FAILED'
    );
  if (primaryError instanceof Error) throw primaryError;
  if (primaryError !== undefined)
    throw new Error('OE13_OBSERVER_PRIMARY_FAILURE', { cause: primaryError });
  if (!counters || !observation || result === undefined || !observer.isClean())
    throw new Error('OE13_OBSERVER_INCOMPLETE');
  return { result, liveOperationCounters: counters, observation, observerCleanup: 'Passed' };
}

/** No real service is reached: each probe enters the same blocked port as a guarded call. */
export function verifySyntheticBlockedProbes(): Record<LiveOperationCategory, boolean> {
  const verified = {} as Record<LiveOperationCategory, boolean>;
  for (const category of LIVE_OPERATION_CATEGORIES) {
    const observer = new LiveOperationObserver();
    observer.arm();
    try {
      let blocked = false;
      try {
        observer.ports[category]();
      } catch (error) {
        if (!(error instanceof BlockedLiveOperation) || error.category !== category) throw error;
        blocked = true;
      }
      const snapshot = observer.snapshot();
      if (
        !blocked ||
        snapshot[category] !== 1 ||
        Object.values(snapshot).reduce((a, b) => a + b, 0) !== 1
      )
        throw new Error(`OE13_OBSERVER_PROBE_FAILED:${category}`);
      verified[category] = true;
    } finally {
      observer.disarm();
    }
    if (!observer.isClean()) throw new Error(`OE13_OBSERVER_PROBE_LEAK:${category}`);
  }
  return verified;
}

/** Exercise guarded Node entry points with values that can never reach an OS action. */
export function verifyGuardedEntryPointProbes(): Record<string, boolean> {
  const originalProbeValue = process.env.SIR02_SYNTHETIC_BLOCKED_PROBE;
  const probes: Array<{
    id: string;
    category: LiveOperationCategory;
    invoke: () => void;
  }> = [
    {
      id: 'fetch',
      category: 'trafficNetworkActions',
      invoke: () => {
        void globalThis.fetch('https://sir02.invalid/blocked-probe');
      }
    },
    {
      id: 'http',
      category: 'trafficNetworkActions',
      invoke: () => {
        void http.request('http://sir02.invalid/blocked-probe');
      }
    },
    {
      id: 'net',
      category: 'trafficNetworkActions',
      invoke: () => {
        void net.connect(9, 'sir02.invalid');
      }
    },
    {
      id: 'filesystem-write',
      category: 'liveProductionStorage',
      invoke: () => {
        fs.writeFileSync('sir02-synthetic-probe-must-not-exist', 'blocked');
      }
    },
    {
      id: 'child-process',
      category: 'deploymentActions',
      invoke: () => {
        void childProcess.spawn('sir02-synthetic-probe-must-not-exist');
      }
    },
    {
      id: 'process-environment',
      category: 'configurationMutations',
      invoke: () => {
        process.env.SIR02_SYNTHETIC_BLOCKED_PROBE = 'blocked';
      }
    }
  ];
  const verified: Record<string, boolean> = {};
  for (const probe of probes) {
    const observer = new LiveOperationObserver();
    observer.arm();
    try {
      let blocked = false;
      try {
        probe.invoke();
      } catch (error) {
        if (!(error instanceof BlockedLiveOperation) || error.category !== probe.category)
          throw error;
        blocked = true;
      }
      const snapshot = observer.snapshot();
      if (
        !blocked ||
        snapshot[probe.category] !== 1 ||
        Object.values(snapshot).reduce((total, count) => total + count, 0) !== 1
      )
        throw new Error(`OE13_GUARDED_ENTRY_POINT_PROBE_FAILED:${probe.id}`);
      verified[probe.id] = true;
    } finally {
      observer.disarm();
    }
    if (!observer.isClean()) throw new Error(`OE13_GUARDED_ENTRY_POINT_PROBE_LEAK:${probe.id}`);
  }
  if (process.env.SIR02_SYNTHETIC_BLOCKED_PROBE !== originalProbeValue)
    throw new Error('OE13_GUARDED_ENTRY_POINT_MUTATED_ENVIRONMENT');
  return verified;
}
