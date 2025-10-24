import { PositionService, Position } from '../database/positionService';
import { logger } from '@/utils/logger';
import { retry, CircuitBreaker } from '@/utils/retry';

const ASTER_API_URL = 'https://fapi.asterdex.com';

interface AsterPosition {
  symbol: string;
  positionAmt: string;
  entryPrice: string;
  markPrice: string;
  unRealizedProfit: string;
  liquidationPrice: string;
  leverage: string;
  marginType: 'cross' | 'isolated';
  isolatedMargin: string;
  positionSide: 'BOTH' | 'LONG' | 'SHORT';
  notional: string;
  isolatedWallet: string;
  updateTime: number;
}

/**
 * Service for syncing positions from Aster DEX
 *
 * NOTE: This service requires users to have stored API credentials.
 * For users without API keys, positions will only be tracked locally
 * after order placement through smart contracts.
 */
export class AsterPositionSync {
  private circuitBreaker: CircuitBreaker;

  constructor() {
    this.circuitBreaker = new CircuitBreaker('aster-position-sync', {
      failureThreshold: 3,
      successThreshold: 2,
      resetTimeoutMs: 60000,
      timeout: 10000,
    });
  }

  /**
   * Sync positions for a wallet with API credentials
   */
  async syncPositionsWithApiKeys(
    walletAddress: string,
    apiKey: string,
    apiSecret: string
  ): Promise<{
    synced: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let synced = 0;

    try {
      logger.info(`Syncing Aster positions for ${walletAddress} via API`);

      const positions = await this.circuitBreaker.execute(() =>
        this.fetchPositions(apiKey, apiSecret)
      );

      if (!positions || positions.length === 0) {
        logger.warn(`No positions found for ${walletAddress} on Aster`);
        return { synced: 0, errors };
      }

      // Process each position
      for (const asterPosition of positions) {
        try {
          // Skip zero-size positions
          const positionAmt = parseFloat(asterPosition.positionAmt);
          if (positionAmt === 0) {
            continue;
          }

          const position = this.mapAsterPosition(walletAddress, asterPosition);
          await PositionService.upsertPosition(position);
          synced++;

          logger.debug(`Synced Aster position: ${position.symbol} ${position.side} ${position.size}`);
        } catch (error) {
          const errorMsg = `Failed to sync position ${asterPosition.symbol}: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(errorMsg);
          logger.error(errorMsg, error);
        }
      }

      // Close positions that are no longer on the exchange
      await this.closeRemovedPositions(walletAddress, positions);

      logger.info(`Synced ${synced} Aster positions for ${walletAddress}`);
      return { synced, errors };
    } catch (error) {
      const errorMsg = `Failed to sync Aster positions for ${walletAddress}: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
      logger.error(errorMsg, error);
      return { synced, errors };
    }
  }

  /**
   * Sync positions without API keys (only locally tracked positions)
   * This is useful for users who trade via smart contracts without API credentials
   */
  async syncLocalPositions(walletAddress: string): Promise<{
    synced: number;
    errors: string[];
  }> {
    logger.info(`Syncing local Aster positions for ${walletAddress} (no API keys)`);

    // Without API access, we can only maintain positions that were created locally
    // through order placement. Mark stale positions as potentially closed.
    // Users should add API keys for accurate position tracking.

    const errors: string[] = [];
    try {
      const positions = await PositionService.getUserPositions(walletAddress, 'aster');

      // Mark positions older than 24 hours as potentially stale
      const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
      let synced = 0;

      for (const position of positions) {
        if (position.openedAt < oneDayAgo && position.status === 'open') {
          logger.warn(`Stale Aster position detected for ${walletAddress}: ${position.symbol} (opened ${new Date(position.openedAt).toISOString()}). Consider adding API keys for accurate tracking.`);
        }
        synced++;
      }

      return { synced, errors };
    } catch (error) {
      const errorMsg = `Failed to sync local Aster positions: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
      logger.error(errorMsg, error);
      return { synced: 0, errors };
    }
  }

  /**
   * Fetch positions from Aster API
   */
  private async fetchPositions(
    apiKey: string,
    apiSecret: string
  ): Promise<AsterPosition[]> {
    return retry(
      async () => {
        const timestamp = Date.now().toString();
        const signature = await this.createSignature({ timestamp }, apiSecret);

        const queryString = new URLSearchParams({
          timestamp,
          signature,
        }).toString();

        const response = await fetch(`${ASTER_API_URL}/fapi/v2/positionRisk?${queryString}`, {
          method: 'GET',
          headers: {
            'X-MBX-APIKEY': apiKey,
          },
        });

        if (!response.ok) {
          throw new Error(`Aster API error: ${response.status} ${response.statusText}`);
        }

        return response.json() as Promise<AsterPosition[]>;
      },
      {
        maxRetries: 3,
        initialDelayMs: 1000,
        backoffMultiplier: 2,
      }
    );
  }

  /**
   * Create HMAC SHA256 signature for Aster API
   */
  private async createSignature(params: Record<string, string>, secret: string): Promise<string> {
    const queryString = new URLSearchParams(params).toString();

    // Use Node.js crypto for server-side signing
    const crypto = await import('crypto');
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(queryString);
    return hmac.digest('hex');
  }

  /**
   * Map Aster position format to our Position interface
   */
  private mapAsterPosition(
    walletAddress: string,
    asterPosition: AsterPosition
  ): Omit<Position, 'id' | 'createdAt' | 'lastUpdatedAt'> {
    const positionAmt = parseFloat(asterPosition.positionAmt);
    const side: 'long' | 'short' = positionAmt >= 0 ? 'long' : 'short';
    const absoluteSize = Math.abs(positionAmt);

    return {
      walletAddress,
      platform: 'aster',
      symbol: asterPosition.symbol,
      side,
      size: absoluteSize.toString(),
      entryPrice: asterPosition.entryPrice,
      markPrice: asterPosition.markPrice,
      leverage: parseInt(asterPosition.leverage),
      marginMode: asterPosition.marginType,
      marginUsed: asterPosition.isolatedMargin || asterPosition.isolatedWallet,
      unrealizedPnl: asterPosition.unRealizedProfit,
      realizedPnl: '0', // Aster doesn't provide this in position data
      liquidationPrice: asterPosition.liquidationPrice,
      stopLossPrice: undefined, // Not provided in position risk endpoint
      takeProfitPrice: undefined, // Not provided in position risk endpoint
      platformPositionId: `${walletAddress}-${asterPosition.symbol}`,
      platformData: {
        positionSide: asterPosition.positionSide,
        notional: asterPosition.notional,
        updateTime: asterPosition.updateTime,
      },
      status: 'open',
      openedAt: asterPosition.updateTime || Date.now(),
    };
  }

  /**
   * Close positions that no longer exist on the exchange
   */
  private async closeRemovedPositions(
    walletAddress: string,
    currentPositions: AsterPosition[]
  ): Promise<void> {
    try {
      // Get all open positions from our database for this wallet on Aster
      const dbPositions = await PositionService.getUserPositions(walletAddress, 'aster');

      // Get symbols that still exist on the exchange
      const exchangeSymbols = new Set(
        currentPositions
          .filter((pos) => parseFloat(pos.positionAmt) !== 0)
          .map((pos) => pos.symbol)
      );

      // Close positions that are no longer on the exchange
      for (const dbPosition of dbPositions) {
        if (!exchangeSymbols.has(dbPosition.symbol) && dbPosition.status === 'open') {
          await PositionService.closePosition(
            walletAddress,
            'aster',
            dbPosition.symbol,
            dbPosition.unrealizedPnl // Use last known unrealized PnL as realized
          );
          logger.info(`Closed removed Aster position: ${dbPosition.symbol}`);
        }
      }
    } catch (error) {
      logger.error('Failed to close removed Aster positions:', error);
    }
  }

  /**
   * Get circuit breaker status
   */
  getStatus(): {
    state: string;
    healthy: boolean;
  } {
    const state = this.circuitBreaker.getState();
    return {
      state,
      healthy: state === 'CLOSED',
    };
  }

  /**
   * Reset circuit breaker
   */
  reset(): void {
    this.circuitBreaker.reset();
    logger.info('Aster position sync circuit breaker reset');
  }
}

// Export singleton instance
export const asterPositionSync = new AsterPositionSync();
