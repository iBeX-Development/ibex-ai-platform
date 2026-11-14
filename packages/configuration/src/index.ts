import { exactUrlSchema } from '../../contracts/src/validation.js';
import { z } from 'zod';
import { ConfigurationError } from '../../errors/src/index.js';
import { featureControls } from './feature-controls.js';

export * from './feature-controls.js';

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
    IBEX_SECRET_MANAGER_ENDPOINT: exactUrlSchema.optional(),
    IBEX_REQUEST_TIMEOUT_MS: z.coerce
      .number()
      .refine(Number.isInteger, 'Expected integer')
      .positive()
      .default(30_000),
    IBEX_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
    IBEX_RATE_LIMIT_PER_MINUTE: z.coerce
      .number()
      .refine(Number.isInteger, 'Expected integer')
      .positive()
      .default(60),
    IBEX_GATEWAY_MAX_PAYLOAD_BYTES: z.coerce
      .number()
      .refine(Number.isInteger, 'Expected integer')
      .positive()
      .default(1_048_576),
    IBEX_AI_GATEWAY_BASE_URL: exactUrlSchema.optional(),
    IBEX_MODEL_GATEWAY_BASE_URL: exactUrlSchema.optional(),
    IBEX_RAG_SERVICE_BASE_URL: exactUrlSchema.optional(),
    IBEX_TOOL_SERVICE_BASE_URL: exactUrlSchema.optional(),
    IBEX_AUDIT_ENDPOINT: exactUrlSchema.optional(),
    IBEX_OTEL_EXPORTER_ENDPOINT: exactUrlSchema.optional(),
    IBEX_AI_PLATFORM_ENABLED: booleanString.prefault('false'),
    IBEX_FEATURE_AGENTS_ENABLED: booleanString.prefault('false'),
    IBEX_GENERAL_AGENT_ENABLED: booleanString.prefault('false'),
    IBEX_MAINTENANCE_AGENT_ENABLED: booleanString.prefault('false'),
    IBEX_ASSET_AGENT_ENABLED: booleanString.prefault('false'),
    IBEX_WAREHOUSE_AGENT_ENABLED: booleanString.prefault('false'),
    IBEX_FEATURE_RAG_ENABLED: booleanString.prefault('false'),
    IBEX_FEATURE_TOOLS_ENABLED: booleanString.prefault('false'),
    IBEX_ACTION_TOOLS_ENABLED: booleanString.prefault('false'),
    IBEX_FEATURE_MODEL_GATEWAY_ENABLED: booleanString.prefault('false'),
    IBEX_MODEL_FALLBACK_ENABLED: booleanString.prefault('false')
  })
  .superRefine((value, context) => {
    if (
      ['staging', 'production'].includes(value.IBEX_ENVIRONMENT) &&
      value.IBEX_SECRET_SOURCE !== 'external'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['IBEX_SECRET_SOURCE'],
        message: 'staging and production require an external secret source'
      });
    }
    if (value.IBEX_SECRET_SOURCE === 'external' && !value.IBEX_SECRET_MANAGER_ENDPOINT) {
      context.addIssue({
        code: 'custom',
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
    aiGateway: Object.freeze({
      baseUrl: env.IBEX_AI_GATEWAY_BASE_URL,
      maximumPayloadBytes: env.IBEX_GATEWAY_MAX_PAYLOAD_BYTES
    }),
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
    features: featureControls({
      aiPlatform: env.IBEX_AI_PLATFORM_ENABLED,
      agents: env.IBEX_FEATURE_AGENTS_ENABLED,
      generalAgent: env.IBEX_GENERAL_AGENT_ENABLED,
      maintenanceAgent: env.IBEX_MAINTENANCE_AGENT_ENABLED,
      assetAgent: env.IBEX_ASSET_AGENT_ENABLED,
      warehouseAgent: env.IBEX_WAREHOUSE_AGENT_ENABLED,
      rag: env.IBEX_FEATURE_RAG_ENABLED,
      tools: env.IBEX_FEATURE_TOOLS_ENABLED,
      actionTools: env.IBEX_ACTION_TOOLS_ENABLED,
      modelGateway: env.IBEX_FEATURE_MODEL_GATEWAY_ENABLED,
      modelFallback: env.IBEX_MODEL_FALLBACK_ENABLED
    })
  });
}

export function loadConfig(source: NodeJS.ProcessEnv): AppConfig {
  const result = envSchema.safeParse(source);
  if (!result.success)
    throw new ConfigurationError(
      'Invalid application configuration',
      z.flattenError(result.error).fieldErrors
    );
  return toConfig(result.data);
}
