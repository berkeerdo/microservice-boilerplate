/**
 * DLQ Monitor Service
 *
 * Monitors Dead Letter Queue depths for all consumers.
 * Provides health check data and logs warnings when DLQ depth exceeds threshold.
 * Uses DlqManager from amqp-resilient for queue inspection and management.
 */
import { DlqManager, type DlqDepthInfo, type ConnectionManager } from 'amqp-resilient';
import config from '../../config/env.js';
import logger from '../logger/logger.js';
import type { ComponentHealth } from './HealthService.js';

class DlqMonitorServiceClass {
  private dlqManager: DlqManager | null = null;
  private lastCheck: DlqDepthInfo[] = [];
  private lastCheckTime = 0;
  private readonly checkIntervalMs = 30_000; // Cache for 30 seconds

  /**
   * Set the AMQP connection manager (called during app startup)
   * Creates a DlqManager instance for queue management operations
   */
  setConnection(connection: ConnectionManager): void {
    this.dlqManager = new DlqManager(connection);
  }

  /**
   * Get the DlqManager instance for external use (gRPC handlers, etc.)
   */
  getDlqManager(): DlqManager | null {
    return this.dlqManager;
  }

  /**
   * Check all DLQ depths. Returns cached result if recent.
   */
  async checkAllDlqDepths(): Promise<DlqDepthInfo[]> {
    const now = Date.now();
    if (now - this.lastCheckTime < this.checkIntervalMs && this.lastCheck.length > 0) {
      return this.lastCheck;
    }

    if (!this.dlqManager) {
      return [];
    }

    try {
      const results = await this.dlqManager.checkAllDepths();

      // Log warnings for DLQs above threshold
      const threshold = config.DLQ_DEPTH_WARNING_THRESHOLD;
      for (const info of results) {
        if (info.depth >= threshold) {
          logger.warn(
            { dlqName: info.dlqName, depth: info.depth, threshold },
            `DLQ depth above threshold: ${info.dlqName} has ${info.depth} messages`
          );
        }
      }

      this.lastCheck = results;
      this.lastCheckTime = now;
      return results;
    } catch (error) {
      logger.error({ err: error }, 'Failed to check DLQ depths');
      return this.lastCheck;
    }
  }

  /**
   * Get DLQ health status for the health endpoint.
   * Returns 'healthy' if no DLQs above threshold,
   * 'degraded' if any DLQ above threshold,
   * 'not_configured' if no connection.
   */
  async checkHealth(): Promise<ComponentHealth> {
    if (!this.dlqManager) {
      return { status: 'not_configured' };
    }

    const depths = await this.checkAllDlqDepths();
    if (depths.length === 0) {
      return { status: 'healthy', message: 'No DLQs found (consumers may not have started)' };
    }

    const threshold = config.DLQ_DEPTH_WARNING_THRESHOLD;
    const aboveThreshold = depths.filter((d) => d.depth >= threshold);
    const totalDlqMessages = depths.reduce((sum, d) => sum + d.depth, 0);

    if (aboveThreshold.length > 0) {
      return {
        status: 'degraded',
        message: `${aboveThreshold.length} DLQ(s) above threshold (${threshold})`,
        details: {
          totalDlqMessages,
          queuesAboveThreshold: aboveThreshold.map((d) => ({
            queue: d.dlqName,
            depth: d.depth,
          })),
        },
      };
    }

    return {
      status: 'healthy',
      message: `All DLQs healthy (${totalDlqMessages} total messages)`,
      details: { totalDlqMessages },
    };
  }
}

export const DlqMonitorService = new DlqMonitorServiceClass();
