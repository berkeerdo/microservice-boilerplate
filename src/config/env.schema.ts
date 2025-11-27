import { z } from 'zod';

/**
 * Environment variable validation schema using Zod
 * All configuration is validated at startup - fail fast on misconfiguration
 */
export const envSchema = z.object({
  // ============================================
  // APPLICATION
  // ============================================
  NODE_ENV: z.enum(['development', 'production', 'staging', 'test']).default('development'),
  PORT: z.number().int().positive().default(3000),
  GRPC_PORT: z.number().int().positive().default(50051),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  SERVICE_NAME: z.string().min(1).default('microservice'),
  SERVICE_VERSION: z.string().default('1.0.0'),

  // ============================================
  // SECURITY
  // ============================================
  // CORS
  CORS_ORIGINS: z.string().optional().default(''),

  // JWT
  JWT_SECRET: z.string().min(32).optional(),
  JWT_EXPIRES_IN: z.string().default('1h'),
  JWT_ISSUER: z.string().default('my-app'),

  // Rate Limiting
  RATE_LIMIT_MAX: z.number().int().positive().default(100),
  RATE_LIMIT_WINDOW_MS: z.number().int().positive().default(60000), // 1 minute

  // ============================================
  // DATABASE
  // ============================================
  DB_HOST: z.string().min(1).default('localhost'),
  DB_PORT: z.number().int().positive().default(3306),
  DB_USERNAME: z.string().min(1).default('root'),
  DB_PASSWORD: z.string().default(''),
  DB_NAME: z.string().min(1),
  DB_CONNECTION_LIMIT: z.number().int().positive().default(100),
  DB_QUEUE_LIMIT: z.number().int().min(0).default(0),
  DB_CONNECT_TIMEOUT: z.number().int().positive().default(10000),
  DB_MULTIPLE_STATEMENTS: z.boolean().default(true),

  // ============================================
  // REDIS
  // ============================================
  REDIS_SERVER: z.string().min(1).default('localhost'),
  REDIS_PORT: z.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional().default(''),
  REDIS_VHOST: z.string().min(1).default('cache'),
  REDIS_ENABLED: z.boolean().default(true),

  // Smart Features (node-caching-mysql-connector-with-redis)
  CORE_AUTO_FEATURES: z.boolean().default(true),

  // ============================================
  // RABBITMQ
  // ============================================
  RABBITMQ_URL: z.string().url().optional(),
  RABBITMQ_QUEUE_NAME: z.string().optional(),
  RABBITMQ_PREFETCH: z.number().int().positive().default(10),

  // ============================================
  // OBSERVABILITY
  // ============================================
  // OpenTelemetry
  OTEL_ENABLED: z.boolean().default(false),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  OTEL_EXPORTER_OTLP_HEADERS: z.string().optional(), // "key=value,key2=value2"

  // Sentry
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_ENVIRONMENT: z.string().optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.number().min(0).max(1).default(0.1),

  // ============================================
  // MISC
  // ============================================
  TIMEZONE: z.string().default('+00:00'),

  // Graceful Shutdown
  SHUTDOWN_TIMEOUT_MS: z.number().int().positive().default(30000),
});

/**
 * Type definition for the validated environment configuration
 */
export type EnvConfig = z.infer<typeof envSchema>;
