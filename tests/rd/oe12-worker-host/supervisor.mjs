// R&D ONLY / NOT AUTHORIZED FOR EXECUTION. Independent worker creator/receipt producer.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { executionGate } from './guard.mjs';
import { elapsedMs, safeError, sha256, utc } from './protocol.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const emit = (event) => process.stdout.write(JSON.stringify({ ...event, utc: utc() }) + '\n');

export async function observeIdentity(powerShell, pid, token, timeoutMs, authorizationArgs) {
  const started = process.hrtime.bigint();
  const child = spawn(powerShell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-File',
    resolve(here, 'identity.ps1'), '-TargetPid', String(pid), '-RunToken', token, ...authorizationArgs],
  { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; let error = '';
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stdout.on('data', (x) => { output += x.slice(0, 4096); });
  child.stderr.on('data', (x) => { error += x.slice(0, 1024); });
  const outcome = await Promise.race([
    new Promise((ok) => child.once('close', (code) => ok({ code }))),
    new Promise((ok) => setTimeout(() => ok({ timeout: true }), timeoutMs))
  ]);
  if (outcome.timeout) {
    // No unverified observer PID termination. Its unresolved state is a STOP finding.
    child.unref(); child.stdout.destroy(); child.stderr.destroy();
    throw new Error('STOP — identity observer timed out; helper disposal unproven');
  }
  if (outcome.code !== 0) throw new Error('STOP — identity observer failed: ' + error.slice(0, 80));
  const identity = JSON.parse(output);
  if (identity.pid !== pid || !identity.runTokenPresent || !identity.imagePath ||
      !identity.parentPid || !identity.creationTime)
    throw new Error('STOP — ownership observation incomplete');
  return { identity, observerPid: child.pid, durationMs: elapsedMs(started) };
}

function verifyFresh(receipt, observed, maxAgeMs) {
  const x = observed.identity;
  const tuple = ['pid', 'imagePath', 'parentPid', 'creationTime'];
  if (tuple.some((key) => String(receipt[key]) !== String(x[key])) ||
      !x.runTokenPresent || observed.durationMs > maxAgeMs ||
      receipt.creationAssignmentEvent?.pid !== x.pid ||
      receipt.runTokenSha256 === undefined)
    throw new Error('STOP — Ownership Revalidation Failed');
  return { tupleMatch: true, ageMs: observed.durationMs, observedUtc: x.observedUtc };
}

async function main() {
  const { a, config } = await executionGate(process.argv.slice(2));
  const start = process.hrtime.bigint();
  let worker = null; let receipt = null; let ready = false; let disposed = false;
  let caseId = a.get('--case');
  const powerShell = config.environment.powershellExecutable;
  const authorizationArgs = ['-Mode', a.get('--mode'), '-RunId', a.get('--run-id'),
    '-GenerationId', a.get('--generation-id'), '-CaseId', a.get('--case'),
    '-ConfigPath', a.get('--config'), '-ManifestPath', a.get('--manifest'),
    '-ManifestSha256', a.get('--manifest-sha256'),
    '-AuthorizationPath', a.get('--execution-authorization'),
    '-AuthorizationSha256', a.get('--execution-authorization-sha256')];
  const nonce = sha256(a.get('--run-token') + ':' + a.get('--generation-id') + ':' + utc());
  try {
    if (caseId === 'WH-03' || caseId === 'WH-09')
      throw new Error('STOP — Safe Hang-Path Disposal Unproven');
    const createdUtc = utc();
    worker = spawn(powerShell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-File',
      resolve(here, 'worker.ps1'), '-Mode', a.get('--mode'), '-RunId', a.get('--run-id'),
      '-GenerationId', a.get('--generation-id'), '-RunToken', a.get('--run-token'),
      '-ArmNonce', nonce, '-CaseId', caseId,
      '-ConfigPath', a.get('--config'), '-ManifestPath', a.get('--manifest'),
      '-ManifestSha256', a.get('--manifest-sha256'),
      '-AuthorizationPath', a.get('--execution-authorization'),
      '-AuthorizationSha256', a.get('--execution-authorization-sha256')],
    { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    emit({ type: 'WorkerCreated', pid: worker.pid, createdUtc, supervisorPid: process.pid,
      handleRetained: true, session: 'non-interactive pipe', boundary: 'dedicated worker process' });
    const startupTick = process.hrtime.bigint();
    const observed = await observeIdentity(powerShell, worker.pid, a.get('--run-token'),
      config.boundsMs.workerStartup, authorizationArgs);
    receipt = Object.freeze({ runId: a.get('--run-id'), generationId: a.get('--generation-id'),
      pid: observed.identity.pid, imagePath: observed.identity.imagePath,
      parentPid: observed.identity.parentPid, creationTime: observed.identity.creationTime,
      runTokenSha256: sha256(a.get('--run-token')),
      creationAssignmentEvent: { kind: 'Node spawn', pid: worker.pid, createdUtc },
      producerIdentity: { pid: process.pid, imagePath: process.execPath },
      retainedHandle: 'Node ChildProcess object for PID ' + worker.pid,
      session: 'non-interactive pipe', boundary: 'dedicated worker process',
      receiptUtc: utc(), observerPid: observed.observerPid });
    if (elapsedMs(startupTick) > config.boundsMs.workerStartup)
      throw new Error('STOP — worker startup bound exceeded');
    emit({ type: 'Receipt', receipt, receiptSha256: sha256(JSON.stringify(receipt)),
      membership: 'UNPROVEN — no independent complete-member enumeration' });
    worker.stdout.setEncoding('utf8');
    createInterface({ input: worker.stdout }).on('line', (line) => {
      try {
        const event = JSON.parse(line);
        if (event.type === 'READY') { ready = true; emit({ type: 'WorkerReady', pid: worker.pid }); }
        else emit({ type: 'CandidateResult', candidate: event });
      } catch (error) { emit({ type: 'MalformedWorkerOutput', error: safeError(error) }); }
    });
    worker.stderr.setEncoding('utf8');
    createInterface({ input: worker.stderr }).on('line', (line) => {
      emit({ type: 'WorkerStderr', digest: sha256(line), length: line.length });
    });
    worker.once('exit', (code) => { disposed = true; emit({ type: 'WorkerExit', pid: worker.pid, code }); });
    const control = createInterface({ input: process.stdin });
    for await (const line of control) {
      let command;
      try { command = JSON.parse(line); } catch { throw new Error('STOP — malformed control message'); }
      if (!['ARM', 'CANCEL', 'FINISH'].includes(command.type) ||
          command.runId !== a.get('--run-id') || command.generationId !== a.get('--generation-id'))
        throw new Error('STOP — control identity mismatch');
      if (command.type === 'FINISH') break;
      if (!receipt || !worker || disposed)
        throw new Error('STOP — worker not eligible for process-affecting action');
      const fresh = await observeIdentity(powerShell, worker.pid, a.get('--run-token'),
        config.boundsMs.ownershipFreshness, authorizationArgs);
      emit({ type: 'FreshOwnership', action: command.type,
        check: verifyFresh(receipt, fresh, config.boundsMs.ownershipFreshness) });
      if (caseId === 'WH-07') throw new Error('STOP — Ownership Revalidation Failed: synthetic mismatch');
      if (caseId === 'WH-08') throw new Error('STOP — unexpected synthetic member');
      if (command.type === 'ARM') {
        if (!ready) throw new Error('STOP — worker not ready for ARM');
        if (command.receiptSha256 !== sha256(JSON.stringify(receipt)))
          throw new Error('STOP — receipt anchor mismatch');
        worker.stdin.write(JSON.stringify({ type: 'ARM', runId: a.get('--run-id'),
          generationId: a.get('--generation-id'), nonce }) + '\n');
        emit({ type: 'WorkerArmed', pid: worker.pid });
      } else {
        // Cooperative request only; no TerminateProcess/Job/Stop-Process/taskkill fallback.
        worker.stdin.end(); emit({ type: 'CancelRequested', pid: worker.pid });
        const disposalStart = process.hrtime.bigint();
        await Promise.race([new Promise((ok) => worker.once('exit', ok)),
          new Promise((ok) => setTimeout(ok, config.boundsMs.cooperativeCancellationGrace))]);
        if (!disposed) emit({ type: 'WorkerUnresponsive', pid: worker.pid,
          graceMs: config.boundsMs.cooperativeCancellationGrace });
        const remainingMs = Math.max(0, config.boundsMs.disposalOrSafeIsolation - elapsedMs(disposalStart));
        if (!disposed) await Promise.race([new Promise((ok) => worker.once('exit', ok)),
          new Promise((ok) => setTimeout(ok, remainingMs))]);
        emit({ type: 'DisposalObservation', pid: worker.pid, disposed,
          durationMs: elapsedMs(disposalStart), withinBound: elapsedMs(disposalStart) <= config.boundsMs.disposalOrSafeIsolation });
        if (!disposed) throw new Error('STOP — Safe Hang-Path Disposal Unproven');
      }
    }
  } catch (error) { emit({ type: 'SupervisorStop', error: safeError(error), workerPid: worker?.pid ?? null }); }
  finally {
    // WH-10: owned streams only. This is not proof of worker/provider disposal.
    const disposalTick = process.hrtime.bigint();
    if (worker && !disposed && receipt && !worker.stdin.destroyed) {
      try {
        const fresh = await observeIdentity(powerShell, worker.pid, a.get('--run-token'),
          config.boundsMs.ownershipFreshness, authorizationArgs);
        emit({ type: 'FreshOwnership', action: 'FINALLY_COOPERATIVE_CLOSE',
          check: verifyFresh(receipt, fresh, config.boundsMs.ownershipFreshness) });
        worker.stdin.end();
        await Promise.race([new Promise((ok) => worker.once('exit', ok)),
          new Promise((ok) => setTimeout(ok, config.boundsMs.disposalOrSafeIsolation))]);
      } catch (error) { emit({ type: 'FinallyCleanupStop', error: safeError(error) }); }
    }
    if (worker && !disposed) {
      emit({ type: 'DisposalPending', pid: worker.pid, ownershipCheck: 'Required before any further process action' });
      // No unknown-member or unverified-PID termination. Leave unresolved and fail the case.
      worker.unref(); worker.stdout.destroy(); worker.stderr.destroy();
    }
    emit({ type: 'SupervisorFinally', workerDisposed: disposed,
      disposalResult: disposed ? 'Disposed' : 'DisposalFailed / Safe Isolation Not Proven',
      durationMs: elapsedMs(disposalTick), withinFiveSeconds: elapsedMs(disposalTick) <= config.boundsMs.disposalOrSafeIsolation,
      totalMs: elapsedMs(start), withinTotal: elapsedMs(start) <= config.boundsMs.totalRun });
  }
}
main().catch((error) => { emit({ type: 'PreflightStop', error: safeError(error) }); process.exitCode = 23; });
