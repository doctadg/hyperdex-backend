import { PositionService, Position } from '../database/positionService';
import { logger } from '@/utils/logger';
import { retry, CircuitBreaker } from '@/utils/retry';

const HYPERLIQUID_INFO_URL = 'https://api.hyperliquid.xyz/info';

interface HyperliquidPosition {
  coin: string;
  szi: string; // Signed size (positive for long, negative for short)
  entryPx: string;
  positionValue: string;
  unrealizedPnl: string;
  returnOnEquity: string;
  leverage: {
    value: number;
    type: 'cross' | 'isolated';
  };
  liquidationPx: string | null;
  marginUsed: string;
  cumFunding?: {
    allTime: string;
    sinceChange: string;
    sinceOpen: string;
  };
  maxLeverage?: number;
}

interface HyperliquidUserState {
  assetPositions: Array<{
    position: HyperliquidPosition;
    type: 'oneWay' | 'hedge';
  }>;
  marginSummary: {
    accountValue: string;
    totalMarginUsed: string;
    totalNtlPos: string;
    totalRawUsd: string;
  };
  crossMaintenanceMarginUsed: string;
  withdrawable: string;
}

/**
 * Service for syncing positions from Hyperliquid exchange
 */
export class HyperliquidPositionSync {
  private circuitBreaker: CircuitBreaker;

  constructor() {
    this.circuitBreaker = new CircuitBreaker('hyperliquid-position-sync', {
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
      logger.info(`Syncing Hyperliquid positions for ${walletAddress}`);

      const userState = await this.circuitBreaker.execute(() =>
        this.fetchUserState(walletAddress)
      );

      if (!userState || !userState.assetPositions) {
        logger.warn(`No positions found for ${walletAddress} on Hyperliquid`);
        return { synced: 0, errors };
      }

      // Process each position
      for (const assetPosition of userState.assetPositions) {
        try {
          const hlPosition = assetPosition.position;

          // Skip zero-size positions
          const size = parseFloat(hlPosition.szi);
          if (size === 0) {
            continue;
          }

          const position = this.mapHyperliquidPosition(walletAddress, hlPosition);
          await PositionService.upsertPosition(position);
          synced++;

          logger.debug(`Synced Hyperliquid position: ${position.symbol} ${position.side} ${position.size}`);
        } catch (error) {
          const errorMsg = `Failed to sync position ${assetPosition.position.coin}: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(errorMsg);
          logger.error(errorMsg, error);
        }
      }

      // Close positions that are no longer on the exchange
      await this.closeRemovedPositions(walletAddress, userState.assetPositions);

      logger.info(`Synced ${synced} Hyperliquid positions for ${walletAddress}`);
      return { synced, errors };
    } catch (error) {
      const errorMsg = `Failed to sync Hyperliquid positions for ${walletAddress}: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
      logger.error(errorMsg, error);
      return { synced, errors };
    }
  }

  /**
   * Fetch user state from Hyperliquid API
   */
  private async fetchUserState(walletAddress: string): Promise<HyperliquidUserState> {
    return retry(
      async () => {
        const response = await fetch(HYPERLIQUID_INFO_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'clearinghouseState',
            user: walletAddress,
          }),
        });

        if (!response.ok) {
          throw new Error(`Hyperliquid API error: ${response.status} ${response.statusText}`);
        }

        return response.json() as Promise<HyperliquidUserState>;
      },
      {
        maxRetries: 3,
        initialDelayMs: 1000,
        backoffMultiplier: 2,
      }
    );
  }

  /**
   * Map Hyperliquid position format to our Position interface
   */
  private mapHyperliquidPosition(
    walletAddress: string,
    hlPosition: HyperliquidPosition
  ): Omit<Position, 'id' | 'createdAt' | 'lastUpdatedAt'> {
    const size = parseFloat(hlPosition.szi);
    const side: 'long' | 'short' = size > 0 ? 'long' : 'short';
    const absoluteSize = Math.abs(size);

    // Get current mark price from position value
    const positionValue = parseFloat(hlPosition.positionValue);
    const markPrice = absoluteSize > 0 ? Math.abs(positionValue) / absoluteSize : parseFloat(hlPosition.entryPx);

    return {
      walletAddress,
      platform: 'hyperliquid',
      symbol: hlPosition.coin,
      side,
      size: absoluteSize.toString(),
      entryPrice: hlPosition.entryPx,
      markPrice: markPrice.toString(),
      leverage: hlPosition.leverage.value,
      marginMode: hlPosition.leverage.type,
      marginUsed: hlPosition.marginUsed,
      unrealizedPnl: hlPosition.unrealizedPnl,
      realizedPnl: '0', // Hyperliquid doesn't provide this in position data
      liquidationPrice: hlPosition.liquidationPx || undefined,
      stopLossPrice: undefined, // Not provided in clearinghouse state
      takeProfitPrice: undefined, // Not provided in clearinghouse state
      platformPositionId: `${walletAddress}-${hlPosition.coin}`,
      platformData: {
        returnOnEquity: hlPosition.returnOnEquity,
        cumFunding: hlPosition.cumFunding,
        maxLeverage: hlPosition.maxLeverage,
        positionValue: hlPosition.positionValue,
      },
      status: 'open',
      openedAt: Date.now(), // Hyperliquid doesn't provide this, use current time for existing positions
    };
  }

  /**
   * Close positions that no longer exist on the exchange
   */
  private async closeRemovedPositions(
    walletAddress: string,
    currentPositions: Array<{ position: HyperliquidPosition }>
  ): Promise<void> {
    try {
      // Get all open positions from our database for this wallet on Hyperliquid
      const dbPositions = await PositionService.getUserPositions(walletAddress, 'hyperliquid');

      // Get symbols that still exist on the exchange
      const exchangeSymbols = new Set(
        currentPositions
          .map((ap) => ap.position.coin)
          .filter((coin) => Math.abs(parseFloat(currentPositions.find((ap) => ap.position.coin === coin)!.position.szi)) > 0)
      );

      // Close positions that are no longer on the exchange
      for (const dbPosition of dbPositions) {
        if (!exchangeSymbols.has(dbPosition.symbol) && dbPosition.status === 'open') {
          await PositionService.closePosition(
            walletAddress,
            'hyperliquid',
            dbPosition.symbol,
            dbPosition.unrealizedPnl // Use last known unrealized PnL as realized
          );
          logger.info(`Closed removed Hyperliquid position: ${dbPosition.symbol}`);
        }
      }
    } catch (error) {
      logger.error('Failed to close removed positions:', error);
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
    logger.info('Hyperliquid position sync circuit breaker reset');
  }
}

// Export singleton instance
export const hyperliquidPositionSync = new HyperliquidPositionSync();
