import { trace } from '@opentelemetry/api';
import pino, { type DestinationStream, type Logger } from 'pino';
import type { AppConfig } from '../../configuration/src/index.js';
import type { TrustedRequestContext } from '../../security/src/index.js';

const redactPaths = [
  'password',
  '*.password',
  'secret',
  '*.secret',
  'api_key',
  '*.api_key',
  'apiKey',
  '*.apiKey',
  'token',
  '*.token',
  'access_token',
  '*.access_token',
  'authorization',
  '*.authorization',
  'headers.authorization',
  'headers.cookie'
];

export function createLogger(config: AppConfig, destination?: DestinationStream): Logger {
  return pino(
    {
      level: config.logging.level,
      base: { service: config.runtime.serviceName, environment: config.environment },
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: { paths: redactPaths, censor: '[REDACTED]' }
    },
    destination
  );
}

export function withRequestContext(logger: Logger, context: TrustedRequestContext): Logger {
  return logger.child({
    request_id: context.request_id,
    correlation_id: context.correlation_id,
    tenant_id: context.tenant_id,
    user_id: context.user_id
  });
}

export const tracer = trace.getTracer('ibex-ai-platform');
