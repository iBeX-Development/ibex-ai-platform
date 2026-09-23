import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http';
import { PlatformError, toErrorEnvelope } from '../../../packages/errors/src/index.js';
import type { AiGatewayService, GatewayEndpoint } from '../../../packages/gateway/src/index.js';

const routes = new Map<string, GatewayEndpoint>([
  ['/chat', 'chat'],
  ['/agents', 'agents'],
  ['/query', 'query'],
  ['/tools', 'tools'],
  ['/approvals', 'approvals'],
  ['/feedback', 'feedback']
]);

function normalizeHeaders(
  headers: IncomingHttpHeaders
): Readonly<Record<string, string | readonly string[] | undefined>> {
  return Object.freeze({ ...headers });
}

async function readJsonBody(request: IncomingMessage, maximumPayloadBytes: number) {
  const declaredLength = Number(request.headers['content-length']);
  if (Number.isFinite(declaredLength) && declaredLength > maximumPayloadBytes) {
    throw new PlatformError('VALIDATION_ERROR', 'Request payload is invalid', 413);
  }

  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    bytes += buffer.byteLength;
    if (bytes > maximumPayloadBytes) {
      throw new PlatformError('VALIDATION_ERROR', 'Request payload is invalid', 413);
    }
    chunks.push(buffer);
  }

  try {
    return { envelope: JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown, bytes };
  } catch {
    throw new PlatformError('VALIDATION_ERROR', 'Request payload is invalid', 400);
  }
}

function sendJson(response: ServerResponse, statusCode: number, value: unknown): void {
  response.writeHead(statusCode, { 'content-type': 'application/json' });
  response.end(JSON.stringify(value));
}

export function createGatewayHttpHandler(service: AiGatewayService, maximumPayloadBytes: number) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<boolean> => {
    const pathname = new URL(request.url ?? '/', 'http://gateway.invalid').pathname;
    const endpoint = routes.get(pathname);
    if (!endpoint) return false;

    if (request.method !== 'POST') {
      sendJson(
        response,
        405,
        toErrorEnvelope(new PlatformError('VALIDATION_ERROR', 'Method not allowed', 405))
      );
      return true;
    }

    try {
      const body = await readJsonBody(request, maximumPayloadBytes);
      const result = await service.execute({
        endpoint,
        payload_bytes: body.bytes,
        headers: normalizeHeaders(request.headers),
        envelope: body.envelope
      });
      sendJson(response, result.status === 'rejected' ? 403 : 200, result);
    } catch (error) {
      const statusCode = error instanceof PlatformError ? error.statusCode : 500;
      sendJson(response, statusCode, toErrorEnvelope(error));
    }
    return true;
  };
}

export const gatewayRoutePaths = Object.freeze([...routes.keys()]);
