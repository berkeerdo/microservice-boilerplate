import dotenv from 'dotenv';
import { envSchema } from './env.schema.js';
import type { EnvConfig } from './env.schema.js';

dotenv.config();

/**
 * Parse boolean from string
 */
function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true';
}

/**
 * Parse integer from string
 */
function parseInt(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/**
 * Parse float from string
 */
function parseFloat(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

let config: EnvConfig;

try {
  config = envSchema.parse({
    // Application
    NODE_ENV: process.env.NODE_ENV,
    PORT: parseInt(process.env.PORT),
    GRPC_PORT: parseInt(process.env.GRPC_PORT),
    LOG_LEVEL: process.env.LOG_LEVEL,
    SERVICE_NAME: process.env.SERVICE_NAME,
    SERVICE_VERSION: process.env.SERVICE_VERSION,

    // Security - CORS
    CORS_ORIGINS: process.env.CORS_ORIGINS,

    // Security - JWT
    JWT_SECRET: process.env.JWT_SECRET,
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN,
    JWT_ISSUER: process.env.JWT_ISSUER,

    // Security - Rate Limiting
    RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX),
    RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS),

    // Database
    DB_HOST: process.env.DB_HOST,
    DB_PORT: parseInt(process.env.DB_PORT),
    DB_USERNAME: process.env.DB_USERNAME,
    DB_PASSWORD: process.env.DB_PASSWORD,
    DB_NAME: process.env.DB_NAME,
    DB_CONNECTION_LIMIT: parseInt(process.env.DB_CONNECTION_LIMIT),
    DB_QUEUE_LIMIT: parseInt(process.env.DB_QUEUE_LIMIT),
    DB_CONNECT_TIMEOUT: parseInt(process.env.DB_CONNECT_TIMEOUT),
    DB_MULTIPLE_STATEMENTS: parseBoolean(process.env.DB_MULTIPLE_STATEMENTS, true),

    // Redis
    REDIS_SERVER: process.env.REDIS_SERVER,
    REDIS_PORT: parseInt(process.env.REDIS_PORT),
    REDIS_PASSWORD: process.env.REDIS_PASSWORD,
    REDIS_VHOST: process.env.REDIS_VHOST,
    REDIS_ENABLED: parseBoolean(process.env.REDIS_ENABLED, true),
    CORE_AUTO_FEATURES: parseBoolean(process.env.CORE_AUTO_FEATURES, true),

    // RabbitMQ
    RABBITMQ_URL: process.env.RABBITMQ_URL,
    RABBITMQ_QUEUE_NAME: process.env.RABBITMQ_QUEUE_NAME,
    RABBITMQ_PREFETCH: parseInt(process.env.RABBITMQ_PREFETCH),

    // Observability - OpenTelemetry
    OTEL_ENABLED: parseBoolean(process.env.OTEL_ENABLED, false),
    OTEL_EXPORTER_OTLP_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    OTEL_EXPORTER_OTLP_HEADERS: process.env.OTEL_EXPORTER_OTLP_HEADERS,

    // Observability - Sentry
    SENTRY_DSN: process.env.SENTRY_DSN,
    SENTRY_ENVIRONMENT: process.env.SENTRY_ENVIRONMENT,
    SENTRY_TRACES_SAMPLE_RATE: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE),

    // Misc
    TIMEZONE: process.env.TIMEZONE,
    SHUTDOWN_TIMEOUT_MS: parseInt(process.env.SHUTDOWN_TIMEOUT_MS),
  });
} catch (error) {
  // eslint-disable-next-line no-console
  console.error('❌ Environment validation failed:', error);
  process.exit(1);
}

export default config;
export type { EnvConfig };
