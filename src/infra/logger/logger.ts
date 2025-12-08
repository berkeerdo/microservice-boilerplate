import type { Logger as PinoLogger } from 'pino';
import pino from 'pino';
import config from '../../config/env.js';

export type Logger = PinoLogger;

/**
 * Sensitive data paths to redact from logs
 * Prevents accidental logging of passwords, tokens, PII, etc.
 * OWASP compliant - covers authentication, PII, financial, and system secrets
 */
const REDACT_PATHS = [
  // Authentication & Tokens
  'password',
  'newPassword',
  'oldPassword',
  'currentPassword',
  'token',
  'accessToken',
  'refreshToken',
  'apiKey',
  'secret',
  'authorization',
  'jti',
  'resetToken',
  'verificationToken',

  // PII (Personally Identifiable Information) - GDPR/CCPA compliance
  'email',
  'phone',
  'phoneNumber',
  'mobileNumber',
  'address',
  'dateOfBirth',
  'dob',
  'socialSecurityNumber',
  'nationalId',
  'passportNumber',

  // Request headers (security-sensitive)
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'req.headers["x-forwarded-for"]',

  // Body fields (common sensitive data)
  'body.password',
  'body.email',
  'body.token',
  'body.creditCard',
  'body.cardNumber',
  'body.cvv',
  'body.ssn',
  'body.phone',

  // OAuth & Social Login
  'oauthToken',
  'oauthSecret',
  'accessTokenSecret',
  'code',
  'state',

  // Database & Infrastructure secrets
  'connectionString',
  'DB_PASSWORD',
  'REDIS_PASSWORD',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'ENCRYPTION_KEY',
];

/**
 * Singleton Logger Factory
 * Creates a single logger instance for the entire application
 */
class LoggerFactory {
  private static instance: Logger | null = null;

  static getInstance(): Logger {
    if (!this.instance) {
      this.instance = this.createLogger();
    }
    return this.instance;
  }

  private static createLogger(): Logger {
    const isDevelopment = config.NODE_ENV === 'development';
    const isTest = config.NODE_ENV === 'test';

    if (isTest) {
      return pino({ level: 'silent' });
    }

    if (isDevelopment) {
      return pino({
        level: config.LOG_LEVEL,
        redact: {
          paths: REDACT_PATHS,
          censor: '[REDACTED]',
        },
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
            singleLine: false,
          },
        },
      });
    }

    // Production logger
    return pino({
      level: config.LOG_LEVEL,
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: {
        paths: REDACT_PATHS,
        censor: '[REDACTED]',
      },
      serializers: {
        error: pino.stdSerializers.err,
        req: pino.stdSerializers.req,
        res: pino.stdSerializers.res,
      },
      formatters: {
        level: (label) => ({ level: label }),
      },
      base: {
        service: config.SERVICE_NAME,
        env: config.NODE_ENV,
      },
    });
  }

  /**
   * Create a child logger with additional context
   */
  static createChild(bindings: Record<string, unknown>): Logger {
    return this.getInstance().child(bindings);
  }

  /**
   * Create a request-scoped logger
   */
  static createRequestLogger(requestId: string): Logger {
    return this.createChild({ requestId });
  }

  /**
   * Reset the logger instance (useful for testing)
   */
  static reset(): void {
    this.instance = null;
  }
}

const logger = LoggerFactory.getInstance();

export default logger;
export { LoggerFactory };
