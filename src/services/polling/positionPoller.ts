import { PositionService } from '../database/positionService';
import { positionSyncOrchestrator } from '../sync/positionSyncOrchestrator';
import { logger } from '@/utils/logger';

/**
 * Service for polling and updating open positions
 */
export class PositionPoller {
  private intervalId: NodeJS.Timeout | null = null;
  private isPolling = false;
  private pollInterval: number;

  constructor(pollIntervalMs: number = 60000) {
    this.pollInterval = pollIntervalMs;
  }

  /**
   * Start polling positions
   */
  start(): void {
    if (this.isPolling) {
      logger.warn('Position poller already running');
      return;
    }

    this.isPolling = true;
    logger.info(`Starting position poller with interval ${this.pollInterval}ms`);

    // Run immediately on start
    this.pollPositions();

    // Then poll at regular intervals
    this.intervalId = setInterval(() => {
      this.pollPositions();
    }, this.pollInterval);
  }

  /**
   * Stop polling positions
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isPolling = false;
    logger.info('Position poller stopped');
  }

  /**
   * Poll and update positions for active wallets
   */
  private async pollPositions(): Promise<void> {
    try {
      logger.debug('Polling positions for active wallets');

      // Get all unique wallet addresses with open positions
      const wallets = await this.getActiveWallets();

      if (wallets.length === 0) {
        logger.debug('No active wallets with open positions');
        return;
      }

      logger.info(`Polling positions for ${wallets.length} active wallets`);

      // Sync positions for all active wallets
      // Use batch processing to avoid overwhelming APIs
      const results = await positionSyncOrchestrator.batchSyncPositions(
        wallets,
        'all',
        5 // Process 5 wallets concurrently
      );

      const totalSynced = results.reduce((sum, r) => sum + r.totalSynced, 0);
      const totalErrors = results.reduce((sum, r) => sum + r.totalErrors, 0);

      logger.info(
        `Position polling complete: ${totalSynced} positions synced for ${wallets.length} wallets, ${totalErrors} errors`
      );
    } catch (error) {
      logger.error('Position polling failed:', error);
    }
  }

  /**
   * Get all wallet addresses with open positions
   */
  private async getActiveWallets(): Promise<string[]> {
    try {
      const query = `
        SELECT DISTINCT wallet_address
        FROM positions
        WHERE status = 'open'
        ORDER BY last_updated_at DESC
        LIMIT 1000
      `;

      const { database } = await import('@/config/database');
      const results = await database.query<{ wallet_address: string }>(query);

      return results.rows.map((r) => r.wallet_address);
    } catch (error) {
      logger.error('Failed to get active wallets:', error);
      return [];
    }
  }

  /**
   * Get poller status
   */
  getStatus(): {
    isRunning: boolean;
    pollInterval: number;
  } {
    return {
      isRunning: this.isPolling,
      pollInterval: this.pollInterval,
    };
  }

  /**
   * Update poll interval
   */
  setPollInterval(intervalMs: number): void {
    this.pollInterval = intervalMs;

    if (this.isPolling) {
      // Restart with new interval
      this.stop();
      this.start();
    }

    logger.info(`Position poller interval updated to ${intervalMs}ms`);
  }
}

// Export singleton instance
export const positionPoller = new PositionPoller(60000); // Poll every minute
