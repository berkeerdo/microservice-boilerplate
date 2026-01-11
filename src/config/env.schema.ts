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
  GRPC_ENABLED: z.boolean().default(false),
  GRPC_PORT: z.number().int().positive().default(50051),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  SERVICE_NAME: z.string().min(1).default('microservice'),
  SERVICE_VERSION: z.string().min(1), // Read from package.json

  // ============================================
  // SECURITY
  // ============================================
  // CORS
  CORS_ORIGINS: z.string().optional().default(''),

  // JWT (OWASP: minimum 256-bit = 64 hex characters for HS256)
  // For services that handle JWT (auth, gateway), set JWT_REQUIRED=true
  JWT_SECRET: z
    .string()
    .min(64, 'JWT_SECRET must be at least 64 characters (256-bit) for OWASP compliance')
    .optional(),
  JWT_REFRESH_SECRET: z
    .string()
    .min(64, 'JWT_REFRESH_SECRET must be at least 64 characters (256-bit) for OWASP compliance')
    .optional(),
  JWT_EXPIRES_IN: z.string().default('1h'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  JWT_ISSUER: z.string().default('lobsterlead'),

  // Encryption (for sensitive data encryption)
  ENCRYPTION_KEY: z.string().min(32, 'ENCRYPTION_KEY must be at least 32 characters').optional(),

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
  DB_QUEUE_LIMIT: z.number().int().min(0).default(1000), // 0 = unlimited (dangerous!)
  DB_CONNECT_TIMEOUT: z.number().int().positive().default(10000),
  DB_QUERY_TIMEOUT: z.number().int().positive().default(30000), // 30 seconds default
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
  // Queue naming: {SERVICE_NAME}_{NODE_ENV}_{DEVICE_ID}_{queue_type}
  // ============================================
  RABBITMQ_ENABLED: z.boolean().default(false),
  RABBITMQ_HOST: z.string().default('localhost'),
  RABBITMQ_PORT: z.number().int().positive().default(5672),
  RABBITMQ_USERNAME: z.string().default('guest'),
  RABBITMQ_PASSWORD: z.string().default('guest'),
  RABBITMQ_VHOST: z.string().default('/'),
  RABBITMQ_DEVICE_ID: z.string().default('local'), // For queue isolation: macbook1, server1, ci-runner
  RABBITMQ_PREFETCH: z.number().int().positive().default(10),

  // ============================================
  // OBSERVABILITY
  // ============================================
  // OpenTelemetry
  OTEL_ENABLED: z.boolean().default(false),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.url().optional(),
  OTEL_EXPORTER_OTLP_HEADERS: z.string().optional(), // "key=value,key2=value2"

  // Sentry
  SENTRY_DSN: z.url().optional(),
  SENTRY_ENVIRONMENT: z.string().optional(),
  // SENTRY_TRACES_SAMPLE_RATE: Optional - auto-configured based on NODE_ENV if not set
  // development: 1.0, staging: 0.2, production: 0.05
  SENTRY_TRACES_SAMPLE_RATE: z.number().min(0).max(1).optional(),

  // ============================================
  // MISC
  // ============================================
  TIMEZONE: z.string().default('+00:00'),

  // Graceful Shutdown
  SHUTDOWN_TIMEOUT_MS: z.number().int().positive().default(30000),

  // ============================================
  // BACKPRESSURE
  // ============================================
  BACKPRESSURE_ENABLED: z.boolean().default(true),
  BACKPRESSURE_MAX_EVENT_LOOP_DELAY: z.number().int().positive().default(1000), // ms
  BACKPRESSURE_MAX_HEAP_USED_BYTES: z.number().int().positive().default(0), // 0 = disabled
  BACKPRESSURE_MAX_RSS_BYTES: z.number().int().positive().default(0), // 0 = disabled
  BACKPRESSURE_RETRY_AFTER: z.number().int().positive().default(10), // seconds
});

/**
 * Type definition for the validated environment configuration
 */
export type EnvConfig = z.infer<typeof envSchema>;
