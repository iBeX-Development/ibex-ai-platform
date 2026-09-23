import { createServer } from 'node:http';
import { loadConfig } from '../../../packages/configuration/src/index.js';
import { createLogger } from '../../../packages/observability/src/index.js';

export function startApi(env: NodeJS.ProcessEnv = process.env) {
  const config = loadConfig(env);
  const logger = createLogger(config);
  const server = createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/health') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok', service: config.runtime.serviceName }));
      return;
    }
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Route not found' } }));
  });
  server.listen(config.runtime.port, config.runtime.host, () => {
    logger.info({ event_type: 'service.started' }, 'AI runtime foundation started');
  });
  return server;
}

if (process.env['NODE_ENV'] !== 'test') startApi();
