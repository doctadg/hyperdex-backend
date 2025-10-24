import { hyperliquidPositionSync } from './hyperliquidPositionSync';
import { asterPositionSync } from './asterPositionSync';
import { avantisPositionSync } from './avantisPositionSync';
import { logger } from '@/utils/logger';
import { database } from '@/config/database';

export type Platform = 'hyperliquid' | 'aster' | 'avantis' | 'all';

export interface SyncResult {
  platform: string;
  success: boolean;
  synced: number;
  errors: string[];
  duration: number;
}

export interface OrchestratorSyncResult {
  walletAddress: string;
  results: SyncResult[];
  totalSynced: number;
  totalErrors: number;
  duration: number;
}

/**
 * Orchestrates position syncing across multiple exchanges
 */
export class PositionSyncOrchestrator {
  /**
   * Sync positions for a wallet across specified platforms
   */
  async syncPositions(
    walletAddress: string,
    platforms: Platform = 'all'
  ): Promise<OrchestratorSyncResult> {
    const startTime = Date.now();
    const results: SyncResult[] = [];

    logger.info(`Starting position sync for ${walletAddress} on ${platforms}`);

    // Determine which platforms to sync
    const platformsToSync: Array<'hyperliquid' | 'aster' | 'avantis'> = platforms === 'all'
      ? ['hyperliquid', 'aster', 'avantis']
      : [platforms as 'hyperliquid' | 'aster' | 'avantis'];

    // Sync all platforms in parallel
    const syncPromises = platformsToSync.map((platform) =>
      this.syncSinglePlatform(walletAddress, platform)
    );

    const platformResults = await Promise.allSettled(syncPromises);

    // Collect results
    for (let i = 0; i < platformResults.length; i++) {
      const result = platformResults[i];
      const platform = platformsToSync[i];

      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        results.push({
          platform,
          success: false,
          synced: 0,
          errors: [result.reason?.message || 'Unknown error'],
          duration: 0,
        });
      }
    }

    const totalSynced = results.reduce((sum, r) => sum + r.synced, 0);
    const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
    const duration = Date.now() - startTime;

    logger.info(
      `Position sync complete for ${walletAddress}: ${totalSynced} positions synced, ${totalErrors} errors in ${duration}ms`
    );

    return {
      walletAddress,
      results,
      totalSynced,
      totalErrors,
      duration,
    };
  }

  /**
   * Sync positions for a single platform
   */
  private async syncSinglePlatform(
    walletAddress: string,
    platform: 'hyperliquid' | 'aster' | 'avantis'
  ): Promise<SyncResult> {
    const startTime = Date.now();

    try {
      let syncResult: { synced: number; errors: string[] };

      if (platform === 'hyperliquid') {
        syncResult = await hyperliquidPositionSync.syncPositions(walletAddress);
      } else if (platform === 'aster') {
        // Try to get API credentials for Aster
        const credentials = await this.getAsterCredentials(walletAddress);

        if (credentials) {
          syncResult = await asterPositionSync.syncPositionsWithApiKeys(
            walletAddress,
            credentials.apiKey,
            credentials.apiSecret
          );
        } else {
          // Fallback to local position tracking
          logger.warn(`No Aster API credentials for ${walletAddress}, using local tracking only`);
          syncResult = await asterPositionSync.syncLocalPositions(walletAddress);
        }
      } else if (platform === 'avantis') {
        // Avantis uses direct contract queries (no API keys needed)
        syncResult = await avantisPositionSync.syncPositions(walletAddress);
      } else {
        throw new Error(`Unknown platform: ${platform}`);
      }

      return {
        platform,
        success: syncResult.errors.length === 0,
        synced: syncResult.synced,
        errors: syncResult.errors,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        platform,
        success: false,
        synced: 0,
        errors: [error instanceof Error ? error.message : String(error)],
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Get Aster API credentials for a wallet from user_accounts table
   */
  private async getAsterCredentials(
    walletAddress: string
  ): Promise<{ apiKey: string; apiSecret: string } | null> {
    try {
      const query = `
        SELECT aster_api_key_encrypted, aster_api_secret_encrypted
        FROM user_accounts
        WHERE wallet_address = $1 AND is_active = true
      `;

      const result = await database.query<{
        aster_api_key_encrypted: string | null;
        aster_api_secret_encrypted: string | null;
      }>(query, [walletAddress]);

      if (result.rows.length === 0 || !result.rows[0].aster_api_key_encrypted) {
        return null;
      }

      // TODO: Decrypt credentials (currently stored as encrypted)
      // For now, assume they're stored in plain text (in production, use proper encryption)
      return {
        apiKey: result.rows[0].aster_api_key_encrypted,
        apiSecret: result.rows[0].aster_api_secret_encrypted || '',
      };
    } catch (error) {
      logger.error(`Failed to fetch Aster credentials for ${walletAddress}:`, error);
      return null;
    }
  }

  /**
   * Get sync status for all platforms
   */
  getStatus(): Record<string, { state: string; healthy: boolean }> {
    return {
      hyperliquid: hyperliquidPositionSync.getStatus(),
      aster: asterPositionSync.getStatus(),
      avantis: avantisPositionSync.getStatus(),
    };
  }

  /**
   * Reset all circuit breakers
   */
  resetCircuitBreakers(): void {
    hyperliquidPositionSync.reset();
    asterPositionSync.reset();
    avantisPositionSync.reset();
    logger.info('All position sync circuit breakers reset');
  }

  /**
   * Batch sync positions for multiple wallets
   * Useful for background jobs
   */
  async batchSyncPositions(
    walletAddresses: string[],
    platforms: Platform = 'all',
    concurrency: number = 5
  ): Promise<OrchestratorSyncResult[]> {
    logger.info(`Starting batch sync for ${walletAddresses.length} wallets on ${platforms}`);

    const results: OrchestratorSyncResult[] = [];

    // Process in batches to avoid overwhelming the APIs
    for (let i = 0; i < walletAddresses.length; i += concurrency) {
      const batch = walletAddresses.slice(i, i + concurrency);
      const batchResults = await Promise.allSettled(
        batch.map((address) => this.syncPositions(address, platforms))
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        }
      }

      // Add small delay between batches to be nice to the APIs
      if (i + concurrency < walletAddresses.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    const totalSynced = results.reduce((sum, r) => sum + r.totalSynced, 0);
    const totalErrors = results.reduce((sum, r) => sum + r.totalErrors, 0);

    logger.info(
      `Batch sync complete: ${totalSynced} positions synced for ${walletAddresses.length} wallets, ${totalErrors} errors`
    );

    return results;
  }
}

// Export singleton instance
export const positionSyncOrchestrator = new PositionSyncOrchestrator();
