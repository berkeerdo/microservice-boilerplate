/**
 * Queue Connection Status Enum
 */
export enum QueueConnectionStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  DEAD = 'dead',
}

/**
 * QueueHealthService - Singleton for tracking queue connection health
 * Provides global status monitoring for all queue connections
 */
class QueueHealthServiceClass {
  private connectionStatuses: Map<string, QueueConnectionStatus> = new Map();

  /**
   * Register or update a connection's status
   */
  registerStatus(connectionName: string, status: QueueConnectionStatus): void {
    this.connectionStatuses.set(connectionName, status);
  }

  /**
   * Get status of a specific connection
   */
  getStatus(connectionName: string): QueueConnectionStatus | undefined {
    return this.connectionStatuses.get(connectionName);
  }

  /**
   * Get all connection statuses
   */
  getAllStatuses(): Record<string, string> {
    const result: Record<string, string> = {};
    this.connectionStatuses.forEach((status, name) => {
      result[name] = status;
    });
    return result;
  }

  /**
   * Check if any connections are dead
   */
  hasDeadConnections(): boolean {
    for (const status of this.connectionStatuses.values()) {
      if (status === QueueConnectionStatus.DEAD) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if all connections are healthy
   */
  isHealthy(): boolean {
    if (this.connectionStatuses.size === 0) {
      return true; // No connections configured
    }

    for (const status of this.connectionStatuses.values()) {
      if (status === QueueConnectionStatus.DEAD || status === QueueConnectionStatus.DISCONNECTED) {
        return false;
      }
    }
    return true;
  }

  /**
   * Get overall status for health endpoint
   */
  getOverallStatus(): 'healthy' | 'degraded' | 'dead' | 'not_configured' {
    if (this.connectionStatuses.size === 0) {
      return 'not_configured';
    }

    if (this.hasDeadConnections()) {
      return 'dead';
    }

    for (const status of this.connectionStatuses.values()) {
      if (status === QueueConnectionStatus.DISCONNECTED) {
        return 'degraded';
      }
    }

    return 'healthy';
  }

  /**
   * Unregister a connection
   */
  unregisterConnection(connectionName: string): void {
    this.connectionStatuses.delete(connectionName);
  }

  /**
   * Clear all connections (useful for testing)
   */
  clear(): void {
    this.connectionStatuses.clear();
  }
}

export const QueueHealthService = new QueueHealthServiceClass();
