import { createServer } from 'node:http';
import { loadConfig, type AppConfig } from '../../../packages/configuration/src/index.js';
import { createLogger } from '../../../packages/observability/src/index.js';
import type { createGatewayHttpHandler } from './gateway.js';
import { closeResponse, sendHttpError, sendJson } from './http-response.js';

type GatewayHttpHandler = ReturnType<typeof createGatewayHttpHandler>;

export function runtimeHealth(config: AppConfig) {
  return Object.freeze({
    status: config.features.aiPlatform ? ('ok' as const) : ('disabled' as const),
    service: config.runtime.serviceName,
    ai_platform_enabled: config.features.aiPlatform
  });
}

export function startApi(
  env: NodeJS.ProcessEnv = process.env,
  gatewayHandler?: GatewayHttpHandler
) {
  const config = loadConfig(env);
  const logger = createLogger(config);
  const handleRequest = async (
    request: Parameters<GatewayHttpHandler>[0],
    response: Parameters<GatewayHttpHandler>[1]
  ) => {
    if (request.method === 'GET' && request.url === '/health') {
      sendJson(response, 200, runtimeHealth(config));
      return;
    }
    if (gatewayHandler && (await gatewayHandler(request, response))) return;
    sendJson(response, 404, { error: { code: 'NOT_FOUND', message: 'Route not found' } });
  };
  const server = createServer((request, response) => {
    // Transport failures can arrive after end() returns; never attempt another body.
    response.on('error', () => {
      closeResponse(response);
    });
    void handleRequest(request, response).catch((error: unknown) => {
      sendHttpError(response, error, true);
    });
  });
  server.listen(config.runtime.port, config.runtime.host, () => {
    logger.info({ event_type: 'service.started' }, 'AI runtime foundation started');
  });
  return server;
}

if (process.env['NODE_ENV'] !== 'test') startApi();
