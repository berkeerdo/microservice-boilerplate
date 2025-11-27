import pino, { Logger as PinoLogger } from 'pino';
import config from '../../config/env.js';

export type Logger = PinoLogger;

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
