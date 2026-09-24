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
  'apikey',
  'token',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'bearertoken',
  'clientsecret',
  'authorization',
  'authorizationheader',
  'cookie',
  'cookieheader',
  'setcookie',
  'credential',
  'credentials',
  'privatekey',
  'prompt',
  'rawprompt',
  'prompttext',
  'response',
  'rawresponse',
  'modelresponse',
  'retrievedcontent',
  'documentcontent',
  'content',
  'toolpayload',
  'toolinput',
  'tooloutput',
  'payload',
  'chainofthought',
  'confidentialreasoning',
  'reasoning'
]);

export function canonicalizeTelemetryKey(key: string): string {
  return key
    .normalize('NFKC')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

export function isSensitiveTelemetryKey(key: string): boolean {
  return sensitiveTelemetryKeys.has(canonicalizeTelemetryKey(key));
}

export function sanitizeTelemetryValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeTelemetryValue);
  if (!value || typeof value !== 'object' || value instanceof Date || Buffer.isBuffer(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      isSensitiveTelemetryKey(key) ? '[REDACTED]' : sanitizeTelemetryValue(child)
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
