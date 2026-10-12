import type { ServerResponse } from 'node:http';
import { PlatformError, toErrorEnvelope } from '../../../packages/errors/src/index.js';

/** Never throw from terminal cleanup or emit the private failure on the socket. */
export function closeResponse(response: ServerResponse): void {
  try {
    if (!response.destroyed) response.destroy();
  } catch {
    // A broken transport cannot carry a replacement response. Do not retry writes.
  }
}

function canSendJson(response: ServerResponse): boolean {
  if (response.destroyed || response.writableEnded) return false;
  if (response.headersSent) {
    closeResponse(response);
    return false;
  }
  return true;
}

export function sendJson(response: ServerResponse, statusCode: number, value: unknown): void {
  if (!canSendJson(response)) return;
  // Serialization can fail (or invoke toJSON); it must precede header commitment.
  const body = JSON.stringify(value) as string | undefined;
  if (body === undefined) throw new TypeError('Response is not JSON serializable');
  if (!canSendJson(response)) return;
  response.writeHead(statusCode, { 'content-type': 'application/json' });
  response.end(body);
}

/** Synchronous, non-throwing terminal handler: its use in .catch cannot reject again. */
export function sendHttpError(response: ServerResponse, error: unknown, unexpected = false): void {
  try {
    const failure = unexpected
      ? new PlatformError(
          'INTERNAL_ERROR',
          'An internal error occurred',
          500,
          undefined,
          error instanceof PlatformError ? error.traceId : undefined,
          error instanceof PlatformError ? error.trustedRequestId : undefined
        )
      : error;
    const status = failure instanceof PlatformError ? failure.statusCode : 500;
    sendJson(response, status, toErrorEnvelope(failure));
  } catch {
    closeResponse(response);
  }
}
