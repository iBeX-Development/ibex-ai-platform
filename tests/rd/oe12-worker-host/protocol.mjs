// R&D ONLY / NOT AUTHORIZED FOR EXECUTION. Pure protocol and state functions.
import { createHash, timingSafeEqual } from 'node:crypto';

export const TERMINAL = Object.freeze(['Success', 'Timeout', 'Fail', 'Cancelled']);
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');
export const utc = () => new Date().toISOString();
export const elapsedMs = (start) => Number(process.hrtime.bigint() - start) / 1e6;
export const safeError = (error) => ({
  name: String(error?.name ?? 'Error').slice(0, 80),
  code: String(error?.code ?? 'UNSPECIFIED').slice(0, 80),
  message: String(error?.message ?? error ?? 'unknown').replace(/[\r\n]/g, ' ').slice(0, 240)
});
export function sameString(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = Buffer.from(a); const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export class AuthorityFence {
  constructor(runId, generationId, audit) {
    if (!runId || !generationId) throw new Error('STOP — missing run/generation');
    this.runId = runId; this.generationId = generationId; this.audit = audit;
    this.open = true; this.armed = false; this.lastSequence = 0;
    this.accepted = []; this.terminal = null; this.cutoff = null;
    this.closureHash = null; this.postClosureMutationCount = 0;
  }
  arm() {
    if (!this.open || this.armed) throw new Error('STOP — invalid ARM transition');
    this.armed = true; this.audit({ event: 'ARM', runId: this.runId, generationId: this.generationId });
  }
  receive(message) {
    const reason = !this.open ? 'Late / Rejected'
      : message?.runId !== this.runId || message?.generationId !== this.generationId ? 'Stale / Rejected'
      : !this.armed ? 'Pre-ARM / Rejected'
      : !Number.isSafeInteger(message?.sequence) || message.sequence <= this.lastSequence ? 'Replay / Rejected'
      : null;
    if (reason) { this.audit({ event: reason, sequence: message?.sequence ?? null }); return false; }
    this.lastSequence = message.sequence;
    this.accepted.push({ sequence: message.sequence, digest: sha256(JSON.stringify(message.payload ?? null)) });
    this.audit({ event: 'ResultAccepted', sequence: message.sequence });
    return true;
  }
  close(terminal, reason, triggerTick, maxCloseMs) {
    if (!TERMINAL.includes(terminal) || !this.open) throw new Error('STOP — invalid terminal transition');
    this.open = false; this.armed = false; // revoke result authority before disposal
    this.terminal = terminal;
    this.cutoff = Object.freeze({ runId: this.runId, generationId: this.generationId,
      sequence: this.lastSequence, acceptedCount: this.accepted.length, closedUtc: utc(), reason });
    this.closureHash = sha256(JSON.stringify(this.snapshot()));
    const durationMs = elapsedMs(triggerTick);
    this.audit({ event: 'BoundaryClosed', terminal, cutoff: this.cutoff,
      closureHash: this.closureHash, durationMs, withinBound: durationMs <= maxCloseMs });
    if (durationMs > maxCloseMs) throw new Error('STOP — authoritative closure bound exceeded');
  }
  snapshot() {
    return { runId: this.runId, generationId: this.generationId, terminal: this.terminal,
      cutoff: this.cutoff, accepted: this.accepted };
  }
  finalize() {
    const finalHash = sha256(JSON.stringify(this.snapshot()));
    const equal = this.closureHash === finalHash && this.postClosureMutationCount === 0;
    this.audit({ event: 'StateFinal', closureHash: this.closureHash, finalHash,
      acceptedPostClosureMutations: this.postClosureMutationCount, equal });
    if (!equal) throw new Error('STOP — post-closure authoritative mutation');
    return finalHash;
  }
}
