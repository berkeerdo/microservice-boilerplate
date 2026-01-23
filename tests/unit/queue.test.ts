import { describe, it, expect, beforeEach } from 'vitest';
import { HealthService, ConnectionStatus } from 'amqp-resilient';

// Re-export with old names for test compatibility
const QueueHealthService = HealthService;
const QueueConnectionStatus = ConnectionStatus;

describe('QueueHealthService', () => {
  beforeEach(() => {
    QueueHealthService.clear();
  });

  describe('registerStatus', () => {
    it('should register a new connection status', () => {
      QueueHealthService.registerStatus('main', QueueConnectionStatus.CONNECTED);

      expect(QueueHealthService.getStatus('main')).toBe(QueueConnectionStatus.CONNECTED);
    });

    it('should update existing connection status', () => {
      QueueHealthService.registerStatus('main', QueueConnectionStatus.CONNECTING);
      QueueHealthService.registerStatus('main', QueueConnectionStatus.CONNECTED);

      expect(QueueHealthService.getStatus('main')).toBe(QueueConnectionStatus.CONNECTED);
    });
  });

  describe('getAllStatuses', () => {
    it('should return all connection statuses', () => {
      QueueHealthService.registerStatus('main', QueueConnectionStatus.CONNECTED);
      QueueHealthService.registerStatus('secondary', QueueConnectionStatus.DISCONNECTED);

      const statuses = QueueHealthService.getAllStatuses();

      expect(statuses).toEqual({
        main: 'connected',
        secondary: 'disconnected',
      });
    });

    it('should return empty object when no connections', () => {
      expect(QueueHealthService.getAllStatuses()).toEqual({});
    });
  });

  describe('hasDeadConnections', () => {
    it('should return true when there is a dead connection', () => {
      QueueHealthService.registerStatus('main', QueueConnectionStatus.CONNECTED);
      QueueHealthService.registerStatus('dead-one', QueueConnectionStatus.DEAD);

      expect(QueueHealthService.hasDeadConnections()).toBe(true);
    });

    it('should return false when no dead connections', () => {
      QueueHealthService.registerStatus('main', QueueConnectionStatus.CONNECTED);
      QueueHealthService.registerStatus('connecting', QueueConnectionStatus.CONNECTING);

      expect(QueueHealthService.hasDeadConnections()).toBe(false);
    });
  });

  describe('isHealthy', () => {
    it('should return true when no connections configured', () => {
      expect(QueueHealthService.isHealthy()).toBe(true);
    });

    it('should return true when all connections are healthy', () => {
      QueueHealthService.registerStatus('main', QueueConnectionStatus.CONNECTED);
      QueueHealthService.registerStatus('secondary', QueueConnectionStatus.RECONNECTING);

      expect(QueueHealthService.isHealthy()).toBe(true);
    });

    it('should return false when a connection is dead', () => {
      QueueHealthService.registerStatus('main', QueueConnectionStatus.DEAD);

      expect(QueueHealthService.isHealthy()).toBe(false);
    });

    it('should return false when a connection is disconnected', () => {
      QueueHealthService.registerStatus('main', QueueConnectionStatus.DISCONNECTED);

      expect(QueueHealthService.isHealthy()).toBe(false);
    });
  });

  describe('getOverallStatus', () => {
    it('should return not_configured when no connections', () => {
      expect(QueueHealthService.getOverallStatus()).toBe('not_configured');
    });

    it('should return healthy when all connected', () => {
      QueueHealthService.registerStatus('main', QueueConnectionStatus.CONNECTED);

      expect(QueueHealthService.getOverallStatus()).toBe('healthy');
    });

    it('should return dead when any connection is dead', () => {
      QueueHealthService.registerStatus('main', QueueConnectionStatus.CONNECTED);
      QueueHealthService.registerStatus('secondary', QueueConnectionStatus.DEAD);

      expect(QueueHealthService.getOverallStatus()).toBe('dead');
    });

    it('should return degraded when any connection is disconnected', () => {
      QueueHealthService.registerStatus('main', QueueConnectionStatus.CONNECTED);
      QueueHealthService.registerStatus('secondary', QueueConnectionStatus.DISCONNECTED);

      expect(QueueHealthService.getOverallStatus()).toBe('degraded');
    });
  });

  describe('unregisterConnection', () => {
    it('should remove a connection', () => {
      QueueHealthService.registerStatus('main', QueueConnectionStatus.CONNECTED);
      QueueHealthService.unregisterConnection('main');

      expect(QueueHealthService.getStatus('main')).toBeUndefined();
    });
  });

  describe('clear', () => {
    it('should remove all connections', () => {
      QueueHealthService.registerStatus('main', QueueConnectionStatus.CONNECTED);
      QueueHealthService.registerStatus('secondary', QueueConnectionStatus.CONNECTED);
      QueueHealthService.clear();

      expect(QueueHealthService.getAllStatuses()).toEqual({});
    });
  });
});

describe('QueueConnectionStatus Enum', () => {
  it('should have all expected statuses', () => {
    expect(QueueConnectionStatus.DISCONNECTED).toBe('disconnected');
    expect(QueueConnectionStatus.CONNECTING).toBe('connecting');
    expect(QueueConnectionStatus.CONNECTED).toBe('connected');
    expect(QueueConnectionStatus.RECONNECTING).toBe('reconnecting');
    expect(QueueConnectionStatus.DEAD).toBe('dead');
  });
});
