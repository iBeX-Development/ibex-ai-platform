import { z } from 'zod';
import { ConfigurationError } from '../../errors/src/index.js';

const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true');
const environmentSchema = z.enum(['local', 'development', 'test', 'staging', 'production']);
const envSchema = z
  .object({
    IBEX_CONFIG_VERSION: z.literal('1'),
    IBEX_ENVIRONMENT: environmentSchema,
    IBEX_SERVICE_NAME: z.string().trim().min(1),
    IBEX_HOST: z.string().trim().min(1).default('0.0.0.0'),
    IBEX_PORT: z.coerce.number().int().min(1).max(65535),
    IBEX_LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    IBEX_SECRET_SOURCE: z.enum(['environment', 'external']),
    IBEX_SECRET_MANAGER_ENDPOINT: z.string().url().optional(),
    IBEX_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
    IBEX_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
    IBEX_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(60),
    IBEX_AI_GATEWAY_BASE_URL: z.string().url().optional(),
    IBEX_MODEL_GATEWAY_BASE_URL: z.string().url().optional(),
    IBEX_RAG_SERVICE_BASE_URL: z.string().url().optional(),
    IBEX_TOOL_SERVICE_BASE_URL: z.string().url().optional(),
    IBEX_AUDIT_ENDPOINT: z.string().url().optional(),
    IBEX_OTEL_EXPORTER_ENDPOINT: z.string().url().optional(),
    IBEX_FEATURE_AGENTS_ENABLED: booleanString.default('false'),
    IBEX_FEATURE_RAG_ENABLED: booleanString.default('false'),
    IBEX_FEATURE_TOOLS_ENABLED: booleanString.default('false'),
    IBEX_FEATURE_MODEL_GATEWAY_ENABLED: booleanString.default('false')
  })
  .superRefine((value, context) => {
    if (
      ['staging', 'production'].includes(value.IBEX_ENVIRONMENT) &&
      value.IBEX_SECRET_SOURCE !== 'external'
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['IBEX_SECRET_SOURCE'],
        message: 'staging and production require an external secret source'
      });
    }
    if (value.IBEX_SECRET_SOURCE === 'external' && !value.IBEX_SECRET_MANAGER_ENDPOINT) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['IBEX_SECRET_MANAGER_ENDPOINT'],
        message: 'external secret source requires an endpoint'
      });
    }
  });

export type Environment = z.infer<typeof environmentSchema>;
export type AppConfig = Readonly<ReturnType<typeof toConfig>>;

function toConfig(env: z.infer<typeof envSchema>) {
  return Object.freeze({
    version: env.IBEX_CONFIG_VERSION,
    environment: env.IBEX_ENVIRONMENT,
    runtime: Object.freeze({
      serviceName: env.IBEX_SERVICE_NAME,
      host: env.IBEX_HOST,
      port: env.IBEX_PORT
    }),
    logging: Object.freeze({ level: env.IBEX_LOG_LEVEL }),
    aiGateway: Object.freeze({ baseUrl: env.IBEX_AI_GATEWAY_BASE_URL }),
    tenantSecurity: Object.freeze({ requireTrustedContext: true, crossTenantDefaultDeny: true }),
    modelGateway: Object.freeze({ baseUrl: env.IBEX_MODEL_GATEWAY_BASE_URL }),
    rag: Object.freeze({ baseUrl: env.IBEX_RAG_SERVICE_BASE_URL }),
    tools: Object.freeze({ baseUrl: env.IBEX_TOOL_SERVICE_BASE_URL }),
    audit: Object.freeze({ endpoint: env.IBEX_AUDIT_ENDPOINT }),
    observability: Object.freeze({ otelExporterEndpoint: env.IBEX_OTEL_EXPORTER_ENDPOINT }),
    secrets: Object.freeze({
      source: env.IBEX_SECRET_SOURCE,
      externalEndpoint: env.IBEX_SECRET_MANAGER_ENDPOINT
    }),
    resilience: Object.freeze({
      requestTimeoutMs: env.IBEX_REQUEST_TIMEOUT_MS,
      maxRetries: env.IBEX_MAX_RETRIES
    }),
    rateLimits: Object.freeze({ requestsPerMinute: env.IBEX_RATE_LIMIT_PER_MINUTE }),
    features: Object.freeze({
      agents: env.IBEX_FEATURE_AGENTS_ENABLED,
      rag: env.IBEX_FEATURE_RAG_ENABLED,
      tools: env.IBEX_FEATURE_TOOLS_ENABLED,
      modelGateway: env.IBEX_FEATURE_MODEL_GATEWAY_ENABLED
    })
  });
}

export function loadConfig(source: NodeJS.ProcessEnv): AppConfig {
  const result = envSchema.safeParse(source);
  if (!result.success)
    throw new ConfigurationError(
      'Invalid application configuration',
      result.error.flatten().fieldErrors
    );
  return toConfig(result.data);
}
