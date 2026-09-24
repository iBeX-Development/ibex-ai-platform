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

const sensitiveTelemetryKeys = new Set([
  'password',
  'secret',
  'api_key',
  'apikey',
  'token',
  'access_token',
  'authorization',
  'authorization_header',
  'cookie',
  'credential',
  'credentials',
  'private_key',
  'prompt',
  'raw_prompt',
  'response',
  'retrieved_content',
  'content',
  'tool_payload',
  'payload',
  'chain_of_thought',
  'reasoning'
]);

export function sanitizeTelemetryValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeTelemetryValue);
  if (!value || typeof value !== 'object' || value instanceof Date || Buffer.isBuffer(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      sensitiveTelemetryKeys.has(key.toLowerCase()) ? '[REDACTED]' : sanitizeTelemetryValue(child)
    ])
  );
}

export function createLogger(config: AppConfig, destination?: DestinationStream): Logger {
  return pino(
    {
      level: config.logging.level,
      base: { service: config.runtime.serviceName, environment: config.environment },
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: { paths: redactPaths, censor: '[REDACTED]' },
      hooks: {
        logMethod(args, method) {
          method.apply(
            this,
            args.map(sanitizeTelemetryValue) as [unknown, string | undefined, ...unknown[]]
          );
        }
      }
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
