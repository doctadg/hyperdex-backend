import { PositionService, Position } from '../database/positionService';
import { logger } from '@/utils/logger';
import { retry, CircuitBreaker } from '@/utils/retry';

const AVANTIS_API_URL = 'https://fapi-base.avantisfi.com';

interface AvantisPosition {
  symbol: string;
  positionAmt: string;
  entryPrice: string;
  markPrice: string;
  unRealizedProfit: string;
  liquidationPrice: string;
  leverage: string;
  marginType: string;
  isolatedMargin: string;
  positionSide: string;
  notional: string;
  isolatedWallet: string;
  updateTime: number;
}

/**
 * Service for syncing positions from Avantis exchange
 *
 * Avantis is live on Base L2. This service syncs user positions by:
 * 1. Querying Avantis REST API (requires authentication) or reading from Base smart contracts
 * 2. Syncing position data to the database
 * 3. Handling position lifecycle (open/update/close)
 *
 * Note: Implementation requires Avantis contract ABIs and addresses from https://sdk.avantisfi.com/
 */
export class AvantisPositionSync {
  private circuitBreaker: CircuitBreaker;

  constructor() {
    this.circuitBreaker = new CircuitBreaker('avantis-position-sync', {
      failureThreshold: 3,
      successThreshold: 2,
      resetTimeoutMs: 60000,
      timeout: 10000,
    });
  }

  /**
   * Sync positions for a specific wallet address
   */
  async syncPositions(walletAddress: string): Promise<{
    synced: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let synced = 0;

    try {
      logger.info(`Syncing Avantis positions for ${walletAddress}`);

      // TODO: Implement Avantis position fetching
      // Avantis is live on Base - implementation requires contract ABIs
      logger.debug(`Avantis position sync requires contract ABIs from https://sdk.avantisfi.com/`);

      return { synced: 0, errors: [] };

      // When implemented, uncomment and adapt the following:
      /*
      const positions = await this.circuitBreaker.execute(() =>
        this.fetchPositions(walletAddress)
      );

      if (!positions || positions.length === 0) {
        logger.warn(`No positions found for ${walletAddress} on Avantis`);
        return { synced: 0, errors };
      }

      // Process each position
      for (const avantisPosition of positions) {
        try {
          // Skip zero-size positions
          const size = parseFloat(avantisPosition.positionAmt);
          if (size === 0) {
            continue;
          }

          const position = this.mapAvantisPosition(walletAddress, avantisPosition);
          await PositionService.upsertPosition(position);
          synced++;

          logger.debug(`Synced Avantis position: ${position.symbol} ${position.side} ${position.size}`);
        } catch (error) {
          const errorMsg = `Failed to sync position ${avantisPosition.symbol}: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(errorMsg);
          logger.error(errorMsg, error);
        }
      }

      // Close positions that are no longer on the exchange
      await this.closeRemovedPositions(walletAddress, positions);

      logger.info(`Synced ${synced} Avantis positions for ${walletAddress}`);

      return { synced, errors };
      */
    } catch (error) {
      const errorMsg = `Failed to sync Avantis positions for ${walletAddress}: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
      logger.error(errorMsg, error);
      return { synced, errors };
    }
  }

  /**
   * Fetch positions from Avantis API (Coming Soon)
   *
   * Avantis uses Binance Futures-compatible API format.
   * Endpoint: GET /fapi/v2/positionRisk
   * Requires: API Key authentication (X-MBX-APIKEY header + signature)
   */
  private async fetchPositions(walletAddress: string): Promise<AvantisPosition[]> {
    // TODO: Implement Avantis API authentication
    // Unlike Hyperliquid (which is permissionless), Avantis requires API keys
    // This will need to:
    // 1. Get user's API key from secure storage
    // 2. Generate signature for the request
    // 3. Make authenticated request to Avantis API

    throw new Error('Avantis position fetching not yet implemented');

    /*
    return retry(
      async () => {
        // Will need API key + signature
        const timestamp = Date.now();
        const queryString = `timestamp=${timestamp}`;
        const signature = await this.generateSignature(queryString, apiSecret);

        const response = await fetch(`${AVANTIS_API_URL}/fapi/v2/positionRisk?${queryString}&signature=${signature}`, {
          method: 'GET',
          headers: {
            'X-MBX-APIKEY': apiKey,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`Avantis API error: ${response.status} ${response.statusText}`);
        }

        return response.json();
      },
      {
        maxRetries: 3,
        initialDelayMs: 1000,
        backoffMultiplier: 2,
      }
    );
    */
  }

  /**
   * Map Avantis position format to our Position interface
   */
  private mapAvantisPosition(
    walletAddress: string,
    avantisPosition: AvantisPosition
  ): Omit<Position, 'id' | 'createdAt' | 'lastUpdatedAt'> {
    const size = parseFloat(avantisPosition.positionAmt);
    const side: 'long' | 'short' = size > 0 ? 'long' : 'short';
    const absoluteSize = Math.abs(size);

    // Avantis uses CROSSED for cross margin (similar to Aster)
    const marginMode: 'cross' | 'isolated' =
      avantisPosition.marginType === 'isolated' ? 'isolated' : 'cross';

    return {
      walletAddress,
      platform: 'avantis',
      symbol: avantisPosition.symbol.replace('USDT', ''), // Remove USDT suffix
      side,
      size: absoluteSize.toString(),
      entryPrice: avantisPosition.entryPrice,
      markPrice: avantisPosition.markPrice,
      leverage: parseFloat(avantisPosition.leverage),
      marginMode,
      marginUsed: avantisPosition.isolatedMargin || '0',
      unrealizedPnl: avantisPosition.unRealizedProfit,
      realizedPnl: '0', // Not provided in position data
      liquidationPrice: avantisPosition.liquidationPrice || undefined,
      stopLossPrice: undefined,
      takeProfitPrice: undefined,
      platformPositionId: `${walletAddress}-${avantisPosition.symbol}`,
      platformData: {
        notional: avantisPosition.notional,
        positionSide: avantisPosition.positionSide,
        isolatedWallet: avantisPosition.isolatedWallet,
        updateTime: avantisPosition.updateTime,
      },
      status: 'open',
      openedAt: avantisPosition.updateTime,
    };
  }

  /**
   * Close positions that no longer exist on the exchange
   */
  private async closeRemovedPositions(
    walletAddress: string,
    currentPositions: AvantisPosition[]
  ): Promise<void> {
    try {
      // Get all open positions from our database for this wallet on Avantis
      const dbPositions = await PositionService.getUserPositions(walletAddress, 'avantis');

      // Get symbols that still exist on the exchange
      const exchangeSymbols = new Set(
        currentPositions
          .filter((pos) => Math.abs(parseFloat(pos.positionAmt)) > 0)
          .map((pos) => pos.symbol.replace('USDT', ''))
      );

      // Close positions that are no longer on the exchange
      for (const dbPosition of dbPositions) {
        if (!exchangeSymbols.has(dbPosition.symbol) && dbPosition.status === 'open') {
          await PositionService.closePosition(
            walletAddress,
            'avantis',
            dbPosition.symbol,
            dbPosition.unrealizedPnl
          );
          logger.info(`Closed removed Avantis position: ${dbPosition.symbol}`);
        }
      }
    } catch (error) {
      logger.error('Failed to close removed Avantis positions:', error);
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
    logger.info('Avantis position sync circuit breaker reset');
  }
}

// Export singleton instance
export const avantisPositionSync = new AvantisPositionSync();
