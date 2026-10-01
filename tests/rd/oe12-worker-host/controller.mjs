// R&D ONLY / NOT AUTHORIZED FOR EXECUTION. Authoritative controller and result fence.
import { spawn } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline';
import { openSync, writeSync, closeSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { executionGate } from './guard.mjs';
import { AuthorityFence, elapsedMs, safeError, sha256, utc } from './protocol.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const tick = () => process.hrtime.bigint();
function send(child, message) { child.stdin.write(JSON.stringify(message) + '\n'); }

async function independentIdentity(config, pid, token, a) {
  const child = spawn(config.environment.powershellExecutable,
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', resolve(here, 'identity.ps1'),
      '-TargetPid', String(pid), '-RunToken', token,
      '-Mode', a.get('--mode'), '-RunId', a.get('--run-id'),
      '-GenerationId', a.get('--generation-id'), '-CaseId', a.get('--case'),
      '-ConfigPath', a.get('--config'), '-ManifestPath', a.get('--manifest'),
      '-ManifestSha256', a.get('--manifest-sha256'),
      '-AuthorizationPath', a.get('--execution-authorization'),
      '-AuthorizationSha256', a.get('--execution-authorization-sha256')],
    { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.setEncoding('utf8'); child.stdout.on('data', (x) => { output += x.slice(0, 4096); });
  const result = await Promise.race([
    new Promise((ok) => child.once('close', (code) => ok({ code }))),
    new Promise((ok) => setTimeout(() => ok({ timeout: true }), config.boundsMs.ownershipFreshness))
  ]);
  if (result.timeout) {
    child.unref(); child.stdout.destroy(); child.stderr.destroy();
    throw new Error('STOP — independent identity observer timeout; helper unresolved');
  }
  if (result.code !== 0) throw new Error('STOP — independent identity observation failed');
  const identity = JSON.parse(output);
  if (!identity.runTokenPresent) throw new Error('STOP — run token mismatch');
  return identity;
}
function matchingReceipt(receipt, observed, runId, generationId, token) {
  const keys = ['pid', 'imagePath', 'parentPid', 'creationTime'];
  return receipt.runId === runId && receipt.generationId === generationId &&
    receipt.runTokenSha256 === sha256(token) &&
    keys.every((key) => String(receipt[key]) === String(observed[key])) &&
    receipt.creationAssignmentEvent?.pid === receipt.pid &&
    receipt.producerIdentity?.pid !== receipt.pid;
}

async function main() {
  const { a, config, auth } = await executionGate(process.argv.slice(2));
  const evidenceDir = a.get('--evidence-dir');
  if (!evidenceDir || resolve(evidenceDir) !== auth.evidenceDir)
    throw new Error('STOP — approved evidence location missing/mismatch');
  // wx gives one-use files; no overwrite or silent retry. Future governance must approve location.
  const auditPath = resolve(evidenceDir, 'audit-' + a.get('--run-id') + '-' + a.get('--generation-id') + '.jsonl');
  const fd = openSync(auditPath, 'wx');
  const audit = (event) => writeSync(fd, JSON.stringify({ ...event, utc: utc() }) + '\n');
  const runStart = tick();
  const fence = new AuthorityFence(a.get('--run-id'), a.get('--generation-id'), audit);
  let supervisor = null; let providerTimer = null; let totalTimer = null;
  let receipt = null; let receiptAnchor = null; let workerDisposed = false;
  const anchorKey = randomBytes(32); // Controller memory only; never passed to worker/supervisor.
  const close = (terminal, reason) => {
    if (!fence.open) return;
    const closureTrigger = tick();
    fence.close(terminal, reason, closureTrigger, config.boundsMs.authoritativeClosure);
    audit({ event: 'ResultAuthorityRevoked', runId: fence.runId, generationId: fence.generationId });
    if (providerTimer) clearTimeout(providerTimer);
    if (supervisor && !workerDisposed) send(supervisor, { type: 'CANCEL', runId: fence.runId, generationId: fence.generationId });
  };
  try {
    totalTimer = setTimeout(() => close('Timeout', 'T_total 45 s expired'), config.boundsMs.totalRun);
    supervisor = spawn(process.execPath, [resolve(here, 'supervisor.mjs'), ...process.argv.slice(2)],
      { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    audit({ event: 'SupervisorCreated', pid: supervisor.pid, sourceSha256: sha256(readFileSync(resolve(here, 'supervisor.mjs'))) });
    supervisor.stderr.setEncoding('utf8');
    supervisor.stderr.on('data', (x) => audit({ event: 'SupervisorStderr', digest: sha256(x), length: x.length }));
    const lines = createInterface({ input: supervisor.stdout });
    for await (const line of lines) {
      let event;
      try { event = JSON.parse(line); } catch { audit({ event: 'MalformedSupervisorEvent', digest: sha256(line) }); close('Fail', 'bad channel frame'); continue; }
      audit({ event: 'SupervisorEvent', type: event.type, digest: sha256(line) });
      if (event.type === 'Receipt') {
        receipt = event.receipt;
        receiptAnchor = createHmac('sha256', anchorKey).update(JSON.stringify(receipt)).digest('hex');
        audit({ event: 'ReceiptAnchoredBeforeARM', receiptSha256: event.receiptSha256,
          anchor: receiptAnchor, producerPid: receipt.producerIdentity?.pid });
        // Complete membership is mandatory. Current candidate cannot establish it: fail closed.
        if (event.membership !== 'COMPLETE_INDEPENDENTLY_VERIFIED') {
          close('Fail', 'STOP — complete worker/helper membership not proven'); continue;
        }
        const observed = await independentIdentity(config, receipt.pid, a.get('--run-token'), a);
        if (!matchingReceipt(receipt, observed, fence.runId, fence.generationId, a.get('--run-token'))) {
          close('Fail', 'STOP — Ownership Revalidation Failed'); continue;
        }
        audit({ event: 'PreARMOwnershipValidated', pid: receipt.pid, observedUtc: observed.observedUtc });
      } else if (event.type === 'WorkerReady' && receipt && receiptAnchor && fence.open) {
        // This branch cannot be reached by the current UNPROVEN membership/readiness configuration.
        fence.arm();
        send(supervisor, { type: 'ARM', runId: fence.runId, generationId: fence.generationId,
          receiptSha256: sha256(JSON.stringify(receipt)) });
        const providerStart = tick();
        audit({ event: 'ProviderObservationTimerStarted', limitMs: config.boundsMs.providerObservation });
        providerTimer = setTimeout(() => {
          audit({ event: 'ProviderObservationExpired', durationMs: elapsedMs(providerStart) });
          close('Timeout', 'T_provider 10 s expired');
        }, config.boundsMs.providerObservation);
      } else if (event.type === 'CandidateResult') {
        fence.receive(event.candidate);
      } else if (event.type === 'WorkerExit') {
        workerDisposed = true;
        if (fence.open) close(event.code === 0 && fence.accepted.length ? 'Success' : 'Fail', 'worker exited');
        send(supervisor, { type: 'FINISH', runId: fence.runId, generationId: fence.generationId });
      } else if (event.type === 'SupervisorStop' || event.type === 'PreflightStop') {
        close('Fail', event.type);
      } else if (event.type === 'SupervisorFinally') {
        workerDisposed = event.workerDisposed === true;
        audit({ event: 'WorkerDisposal', result: event.disposalResult, withinBound: event.withinFiveSeconds });
      }
    }
    if (fence.open) close('Fail', 'supervisor early exit / partial channel');
  } catch (error) {
    audit({ event: 'ControllerException', error: safeError(error) });
    if (fence.open) close('Fail', 'controller exception');
  } finally {
    if (providerTimer) clearTimeout(providerTimer);
    if (totalTimer) clearTimeout(totalTimer);
    const finalHash = fence.finalize();
    audit({ event: 'ControllerFinally', finalHash, workerDisposed,
      totalDurationMs: elapsedMs(runStart), totalWithinBound: elapsedMs(runStart) <= config.boundsMs.totalRun,
      workerDisposalProven: workerDisposed, unresolvedWorker: !workerDisposed });
    anchorKey.fill(0);
    closeSync(fd);
    const manifestPath = auditPath + '.sha256';
    const evidenceHash = sha256(readFileSync(auditPath));
    const seal = openSync(manifestPath, 'wx');
    try { writeSync(seal, evidenceHash + '  ' + auditPath + '\n'); } finally { closeSync(seal); }
    // Closing the result channel is not worker disposal; unresolved worker remains a failed case.
    if (supervisor && !workerDisposed) { supervisor.unref(); supervisor.stdout.destroy(); supervisor.stderr.destroy(); }
  }
}
main().catch((error) => { process.stderr.write(JSON.stringify({ type: 'PreflightStop', error: safeError(error) }) + '\n'); process.exitCode = 24; });
