import { EventEmitter } from 'events';
import { Candle, Timeframe, ChartUpdate } from '@/types';
import { redisClient } from '@/config/redis';
import { logger } from '@/utils/logger';

interface AggregatedCandle {
  symbol: string;
  timeframe: Timeframe;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteVolume: number;
  tradeCount: number;
  vwap: number;
}

interface CandleCache {
  hyperliquid: Candle | null;
  aster: Candle | null;
  lastAggregated: AggregatedCandle | null;
}

export class AggregatedChartProcessor extends EventEmitter {
  private candleCache: Map<string, CandleCache> = new Map();
  private readonly HISTORY_SIZE = 1500; // Keep last 1500 candles
  private readonly CACHE_TTL = 86400; // 24 hours
  private readonly PUBLISH_THROTTLE_MS = 100; // Publish at most every 100ms
  private lastPublishTime: Map<string, number> = new Map();

  constructor() {
    super();
    logger.info('AggregatedChartProcessor initialized');
  }

  /**
   * Process candle update from individual exchange
   */
  async processCandleUpdate(update: ChartUpdate): Promise<void> {
    const key = this.getCacheKey(update.symbol, update.timeframe);

    // Get or create cache entry
    let cache = this.candleCache.get(key);
    if (!cache) {
      cache = {
        hyperliquid: null,
        aster: null,
        lastAggregated: null,
      };
      this.candleCache.set(key, cache);
    }

    // Update exchange-specific candle
    if (update.exchange === 'hyperliquid') {
      cache.hyperliquid = update.candle;
    } else {
      cache.aster = update.candle;
    }

    // Aggregate if we have data from at least one exchange
    if (cache.hyperliquid || cache.aster) {
      await this.aggregateAndPublish(update.symbol, update.timeframe, cache);
    }
  }

  /**
   * Aggregate candles from both exchanges using VWAP
   */
  private async aggregateAndPublish(
    symbol: string,
    timeframe: Timeframe,
    cache: CandleCache
  ): Promise<void> {
    // Throttle publishing
    const key = this.getCacheKey(symbol, timeframe);
    const lastPublish = this.lastPublishTime.get(key) || 0;
    const now = Date.now();
    if (now - lastPublish < this.PUBLISH_THROTTLE_MS) {
      return;
    }
    this.lastPublishTime.set(key, now);

    try {
      const aggregated = this.mergeCandles(cache.hyperliquid, cache.aster);

      // Only publish if candle data changed
      if (this.hasChanged(cache.lastAggregated, aggregated)) {
        cache.lastAggregated = aggregated;

        // Publish to Redis Pub/Sub for SSE streaming
        await this.publishToRedis(symbol, timeframe, aggregated);

        // Update history in Redis cache
        await this.updateHistory(symbol, timeframe, aggregated);

        // Emit event
        this.emit('aggregated', {
          symbol,
          timeframe,
          candle: aggregated,
        });

        logger.debug(`Aggregated candle published: ${symbol}:${timeframe} @ ${aggregated.close}`);
      }
    } catch (error) {
      logger.error(`Failed to aggregate candles for ${symbol}:${timeframe}:`, error);
    }
  }

  /**
   * Merge candles from both exchanges using VWAP
   */
  private mergeCandles(hlCandle: Candle | null, asterCandle: Candle | null): AggregatedCandle {
    // If only one source, use it directly
    if (!hlCandle && asterCandle) {
      return this.candleToAggregated(asterCandle);
    }
    if (hlCandle && !asterCandle) {
      return this.candleToAggregated(hlCandle);
    }

    // Merge both sources
    const hl = hlCandle!;
    const aster = asterCandle!;

    const hlOpen = parseFloat(hl.open);
    const hlHigh = parseFloat(hl.high);
    const hlLow = parseFloat(hl.low);
    const hlClose = parseFloat(hl.close);
    const hlVolume = parseFloat(hl.volume);
    const hlQuoteVolume = parseFloat(hl.quoteVolume);

    const asterOpen = parseFloat(aster.open);
    const asterHigh = parseFloat(aster.high);
    const asterLow = parseFloat(aster.low);
    const asterClose = parseFloat(aster.close);
    const asterVolume = parseFloat(aster.volume);
    const asterQuoteVolume = parseFloat(aster.quoteVolume);

    const totalVolume = hlVolume + asterVolume;
    const totalQuoteVolume = hlQuoteVolume + asterQuoteVolume;

    // Use VWAP for open and close
    const open = totalVolume > 0
      ? (hlOpen * hlVolume + asterOpen * asterVolume) / totalVolume
      : (hlOpen + asterOpen) / 2;

    const close = totalVolume > 0
      ? (hlClose * hlVolume + asterClose * asterVolume) / totalVolume
      : (hlClose + asterClose) / 2;

    // Take extremes for high and low
    const high = Math.max(hlHigh, asterHigh);
    const low = Math.min(hlLow, asterLow);

    const vwap = totalVolume > 0 ? totalQuoteVolume / totalVolume : close;

    return {
      symbol: hl.symbol,
      timeframe: hl.timeframe,
      timestamp: hl.timestamp,
      open,
      high,
      low,
      close,
      volume: totalVolume,
      quoteVolume: totalQuoteVolume,
      tradeCount: hl.tradeCount + aster.tradeCount,
      vwap,
    };
  }

  /**
   * Convert Candle to AggregatedCandle
   */
  private candleToAggregated(candle: Candle): AggregatedCandle {
    return {
      symbol: candle.symbol,
      timeframe: candle.timeframe,
      timestamp: candle.timestamp,
      open: parseFloat(candle.open),
      high: parseFloat(candle.high),
      low: parseFloat(candle.low),
      close: parseFloat(candle.close),
      volume: parseFloat(candle.volume),
      quoteVolume: parseFloat(candle.quoteVolume),
      tradeCount: candle.tradeCount,
      vwap: parseFloat(candle.vwap || candle.close),
    };
  }

  /**
   * Check if aggregated candle has changed
   */
  private hasChanged(prev: AggregatedCandle | null, current: AggregatedCandle): boolean {
    if (!prev) return true;

    return (
      prev.open !== current.open ||
      prev.high !== current.high ||
      prev.low !== current.low ||
      prev.close !== current.close ||
      prev.volume !== current.volume
    );
  }

  /**
   * Publish to Redis Pub/Sub for SSE streaming
   */
  private async publishToRedis(
    symbol: string,
    timeframe: Timeframe,
    candle: AggregatedCandle
  ): Promise<void> {
    const channel = `aggregated:candles:${symbol}:${timeframe}`;
    const message = JSON.stringify({
      channel,
      data: {
        time: candle.timestamp,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
      },
      timestamp: Date.now(),
    });

    await redisClient.publish(channel, message);
    logger.debug(`Published aggregated candle to ${channel}`);
  }

  /**
   * Update candle history in Redis cache
   */
  private async updateHistory(
    symbol: string,
    timeframe: Timeframe,
    candle: AggregatedCandle
  ): Promise<void> {
    const cacheKey = `agg:candles:${symbol}:${timeframe}:history`;

    try {
      // Get existing history
      const existingData = await redisClient.get(cacheKey);
      const history: AggregatedCandle[] = existingData ? JSON.parse(existingData) : [];

      // Find existing candle with same timestamp
      const existingIndex = history.findIndex(c => c.timestamp === candle.timestamp);

      if (existingIndex >= 0) {
        // Update existing candle
        history[existingIndex] = candle;
      } else {
        // Add new candle
        history.push(candle);

        // Sort by timestamp
        history.sort((a, b) => a.timestamp - b.timestamp);

        // Keep only last HISTORY_SIZE candles
        if (history.length > this.HISTORY_SIZE) {
          history.splice(0, history.length - this.HISTORY_SIZE);
        }
      }

      // Save back to Redis
      await redisClient.set(cacheKey, JSON.stringify(history), this.CACHE_TTL);

      logger.debug(`Updated candle history for ${symbol}:${timeframe} (${history.length} candles)`);
    } catch (error) {
      logger.error(`Failed to update candle history for ${symbol}:${timeframe}:`, error);
    }
  }

  /**
   * Get candle history from Redis
   */
  async getHistory(
    symbol: string,
    timeframe: Timeframe,
    from?: number,
    to?: number
  ): Promise<AggregatedCandle[]> {
    const cacheKey = `agg:candles:${symbol}:${timeframe}:history`;

    try {
      const data = await redisClient.get(cacheKey);
      if (!data) {
        return [];
      }

      let history: AggregatedCandle[] = JSON.parse(data);

      // Filter by time range if specified
      if (from !== undefined || to !== undefined) {
        history = history.filter(candle => {
          if (from !== undefined && candle.timestamp < from) return false;
          if (to !== undefined && candle.timestamp > to) return false;
          return true;
        });
      }

      return history;
    } catch (error) {
      logger.error(`Failed to get candle history for ${symbol}:${timeframe}:`, error);
      return [];
    }
  }

  /**
   * Get cache key
   */
  private getCacheKey(symbol: string, timeframe: Timeframe): string {
    return `${symbol}:${timeframe}`;
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      cachedSymbols: this.candleCache.size,
      symbols: Array.from(
        new Set(
          Array.from(this.candleCache.keys()).map(key => key.split(':')[0])
        )
      ),
    };
  }

  /**
   * Stop processor
   */
  stop(): void {
    this.candleCache.clear();
    this.lastPublishTime.clear();
    logger.info('AggregatedChartProcessor stopped');
  }
}

export const aggregatedChartProcessor = new AggregatedChartProcessor();
