import { redisClient } from '@/config/redis';
import { cacheTTL } from '@/config/exchanges';
import { Candle, ChartDataRequest, ChartUpdate, Timeframe } from '@/types';
import { logger } from '@/utils/logger';

export class ChartCache {
  private readonly CANDLES_KEY_PREFIX = 'candles:';
  private readonly UPDATE_CHANNEL_PREFIX = 'charts:update:';

  async setCandles(candles: Candle[]): Promise<void> {
    if (candles.length === 0) return;

    // Group candles by symbol, exchange, and timeframe
    const candlesByGroup = new Map<string, Candle[]>();
    
    candles.forEach(candle => {
      const key = `${candle.exchange}:${candle.symbol}:${candle.timeframe}`;
      if (!candlesByGroup.has(key)) {
        candlesByGroup.set(key, []);
      }
      candlesByGroup.get(key)!.push(candle);
    });

    // Process each group
    for (const [key, groupCandles] of candlesByGroup) {
      await this.setCandlesForGroup(key, groupCandles);
    }

    logger.debug(`Cached ${candles.length} candles`);
  }

  private async setCandlesForGroup(key: string, candles: Candle[]): Promise<void> {
    const candlesKey = `${this.CANDLES_KEY_PREFIX}${key}`;
    
    // Add candles to sorted set with timestamp as score
    for (const candle of candles) {
      await redisClient.getClient().zadd(candlesKey, candle.timestamp, JSON.stringify(candle));
    }
    
    // Keep only the most recent candles (based on config)
    const maxCandles = 1000; // Could be configurable
    await redisClient.getClient().zremrangebyrank(candlesKey, 0, -maxCandles - 1);
    
    // Set TTL
    await redisClient.getClient().expire(candlesKey, cacheTTL.charts);
  }

  async getCandles(
    symbol: string,
    exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis',
    timeframe: Timeframe,
    from: number,
    to: number,
    limit: number = 1000
  ): Promise<Candle[]> {
    const key = `${this.CANDLES_KEY_PREFIX}${exchange}:${symbol}:${timeframe}`;
    
    // Get candles in the time range
    const candleData = await redisClient.getClient()
      .zrangebyscore(key, from, to, 'LIMIT', 0, limit);
    
    const candles: Candle[] = [];
    
    for (const data of candleData) {
      try {
        const candle = JSON.parse(data) as Candle;
        candles.push(candle);
      } catch (error) {
        logger.error(`Failed to parse candle from cache: ${data}`, error);
      }
    }
    
    // Sort by timestamp
    candles.sort((a, b) => a.timestamp - b.timestamp);
    
    return candles;
  }

  async getLatestCandle(
    symbol: string,
    exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis',
    timeframe: Timeframe
  ): Promise<Candle | null> {
    const key = `${this.CANDLES_KEY_PREFIX}${exchange}:${symbol}:${timeframe}`;
    
    // Get the latest candle (highest score)
    const candleData = await redisClient.getClient()
      .zrange(key, -1, -1, 'REV');
    
    if (candleData.length === 0) {
      return null;
    }
    
    try {
      return JSON.parse(candleData[0]) as Candle;
    } catch (error) {
      logger.error(`Failed to parse latest candle from cache: ${candleData[0]}`, error);
      return null;
    }
  }

  async updateCandle(update: ChartUpdate): Promise<void> {
    const key = `${this.CANDLES_KEY_PREFIX}${update.exchange}:${update.symbol}:${update.timeframe}`;
    
    if (update.type === 'new') {
      // Add new candle
      await redisClient.getClient()
        .zadd(key, update.candle.timestamp, JSON.stringify(update.candle));
    } else if (update.type === 'update') {
      // Update existing candle
      await redisClient.getClient()
        .zremrangebyscore(key, update.candle.timestamp, update.candle.timestamp);
      await redisClient.getClient()
        .zadd(key, update.candle.timestamp, JSON.stringify(update.candle));
    }
    
    // Set TTL
    await redisClient.getClient().expire(key, cacheTTL.charts);
    
    // Publish update
    await this.publishCandleUpdate(update);
    
    logger.debug(`Candle ${update.type}: ${update.exchange}:${update.symbol}:${update.timeframe}`);
  }

  async getCandleCount(
    symbol: string,
    exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis',
    timeframe: Timeframe
  ): Promise<number> {
    const key = `${this.CANDLES_KEY_PREFIX}${exchange}:${symbol}:${timeframe}`;
    return await redisClient.getClient().zcard(key);
  }

  async deleteCandles(
    symbol: string,
    exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis',
    timeframe: Timeframe
  ): Promise<void> {
    const key = `${this.CANDLES_KEY_PREFIX}${exchange}:${symbol}:${timeframe}`;
    await redisClient.del(key);
    
    logger.info(`Candles deleted from cache: ${exchange}:${symbol}:${timeframe}`);
  }

  async deleteAllCandlesForSymbol(
    symbol: string,
    exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis'
  ): Promise<void> {
    const pattern = `${this.CANDLES_KEY_PREFIX}${exchange}:${symbol}:*`;
    const keys = await redisClient.getClient().keys(pattern);
    
    if (keys.length > 0) {
      await redisClient.getClient().del(...keys);
      logger.info(`All candles deleted from cache: ${exchange}:${symbol}`);
    }
  }

  async getAllCachedSymbols(exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis'): Promise<string[]> {
    const pattern = `${this.CANDLES_KEY_PREFIX}${exchange}:*`;
    const keys = await redisClient.getClient().keys(pattern);
    
    const symbols = new Set<string>();
    
    for (const key of keys) {
      const parts = key.split(':');
      if (parts.length >= 3) {
        symbols.add(parts[2]); // symbol is at index 2
      }
    }
    
    return Array.from(symbols);
  }

  async publishCandleUpdate(update: ChartUpdate): Promise<void> {
    const channel = `${this.UPDATE_CHANNEL_PREFIX}${update.exchange}:${update.symbol}:${update.timeframe}`;
    const message = JSON.stringify({
      type: 'candle_update',
      data: update,
      timestamp: Date.now()
    });
    
    await redisClient.publish(channel, message);
  }

  async subscribeToUpdates(
    symbol: string,
    exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis',
    timeframe: Timeframe,
    callback: (update: ChartUpdate) => void
  ): Promise<void> {
    const channel = `${this.UPDATE_CHANNEL_PREFIX}${exchange}:${symbol}:${timeframe}`;
    
    await redisClient.subscribe(channel, (_ch, message) => {
      try {
        const parsed = JSON.parse(message);
        if (parsed.type === 'candle_update' && parsed.data) {
          callback(parsed.data as ChartUpdate);
        }
      } catch (error) {
        logger.error(`Failed to parse candle update message: ${message}`, error);
      }
    });
    
    logger.info(`Subscribed to candle updates: ${channel}`);
  }

  async cleanupOldData(): Promise<void> {
    const retentionPeriods = {
      '1s': 1 * 60 * 60 * 1000,      // 1 hour
      '1m': 30 * 24 * 60 * 60 * 1000, // 30 days
      '5m': 30 * 24 * 60 * 60 * 1000, // 30 days
      '15m': 30 * 24 * 60 * 60 * 1000, // 30 days
      '1h': 365 * 24 * 60 * 60 * 1000, // 1 year
      '4h': 365 * 24 * 60 * 60 * 1000, // 1 year
      '1d': 365 * 24 * 60 * 60 * 1000, // 1 year
    };

    const now = Date.now();
    
    for (const [timeframe, retentionMs] of Object.entries(retentionPeriods)) {
      const cutoffTime = now - retentionMs;
      const pattern = `${this.CANDLES_KEY_PREFIX}*:${timeframe}`;
      const keys = await redisClient.getClient().keys(pattern);
      
      for (const key of keys) {
        await redisClient.getClient().zremrangebyscore(key, 0, cutoffTime);
      }
    }
    
    logger.info('Old candle data cleanup completed');
  }

  async healthCheck(): Promise<boolean> {
    try {
      const testKey = `${this.CANDLES_KEY_PREFIX}health:test:1m`;
      const testCandle: Candle = {
        symbol: 'TEST',
        exchange: 'hyperliquid',
        timeframe: '1m',
        timestamp: Date.now(),
        open: '100',
        high: '101',
        low: '99',
        close: '100.5',
        volume: '10',
        quoteVolume: '1005',
        tradeCount: 5,
      };
      
      await redisClient.getClient().zadd(testKey, testCandle.timestamp, JSON.stringify(testCandle));
      const result = await redisClient.getClient().zrange(testKey, 0, 0);
      await redisClient.del(testKey);
      
      return result.length > 0;
    } catch (error) {
      logger.error('Chart cache health check failed', error);
      return false;
    }
  }
}

export const chartCache = new ChartCache();