import { EventEmitter } from 'events';
import { Candle, ChartUpdate, Timeframe, TickData } from '@/types';
import { chartCache } from '@/services/cache/charts';
import { database } from '@/config/database';
import { logger } from '@/utils/logger';

interface CandleBuilder {
  symbol: string;
  exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis';
  timeframe: Timeframe;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteVolume: number;
  tradeCount: number;
  timestamp: number;
  vwap: number;
}

export class ChartProcessor extends EventEmitter {
  private candleBuilders: Map<string, CandleBuilder> = new Map();
  private batchInsertBuffer: Candle[] = [];
  private batchInsertInterval: NodeJS.Timeout | null = null;
  private readonly BATCH_SIZE = 100;
  private readonly BATCH_INTERVAL = 10000; // 10 seconds

  constructor() {
    super();
    this.startBatchInsert();
  }

  async processTickData(tickData: TickData): Promise<void> {
    const timeframes: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d'];
    
    for (const timeframe of timeframes) {
      await this.updateCandleFromTick(tickData, timeframe);
    }
  }

  private async updateCandleFromTick(tickData: TickData, timeframe: Timeframe): Promise<void> {
    const key = `${tickData.exchange}:${tickData.symbol}:${timeframe}`;
    const windowMs = this.getTimeframeMs(timeframe);
    const candleStart = Math.floor(tickData.timestamp / windowMs) * windowMs;
    const candleEnd = candleStart + windowMs;

    let builder = this.candleBuilders.get(key);

    // Check if we need a new candle
    if (!builder || builder.timestamp !== candleStart) {
      // Complete and save the previous candle if it exists
      if (builder) {
        await this.completeCandle(builder);
      }

      // Try to load existing candle from cache or database
      const existingCandle = await this.loadCandle(
        tickData.symbol,
        tickData.exchange,
        timeframe,
        candleStart
      );

      if (existingCandle) {
        // Update existing candle
        builder = this.candleFromCandle(existingCandle);
      } else {
        // Create new candle
        const price = parseFloat(tickData.price);
        const size = parseFloat(tickData.size);
        
        builder = {
          symbol: tickData.symbol,
          exchange: tickData.exchange,
          timeframe,
          open: price,
          high: price,
          low: price,
          close: price,
          volume: size,
          quoteVolume: price * size,
          tradeCount: 1,
          timestamp: candleStart,
          vwap: price,
        };
      }

      this.candleBuilders.set(key, builder);
    }

    // Update candle with new tick
    const price = parseFloat(tickData.price);
    const size = parseFloat(tickData.size);
    const quoteValue = price * size;

    builder.high = Math.max(builder.high, price);
    builder.low = Math.min(builder.low, price);
    builder.close = price;
    builder.volume += size;
    builder.quoteVolume += quoteValue;
    builder.tradeCount += 1;
    
    // Update VWAP
    builder.vwap = builder.quoteVolume / builder.volume;

    // Emit real-time update
    const updatedCandle = this.createCandleFromBuilder(builder);
    const update: ChartUpdate = {
      symbol: builder.symbol,
      exchange: builder.exchange,
      timeframe: builder.timeframe,
      candle: updatedCandle,
      type: 'update',
    };

    this.emit('candleUpdated', update);
    await chartCache.updateCandle(update);
  }

  private async loadCandle(
    symbol: string,
    exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis',
    timeframe: Timeframe,
    timestamp: number
  ): Promise<Candle | null> {
    // Try cache only - database is too slow for real-time
    const cachedCandle = await chartCache.getLatestCandle(symbol, exchange, timeframe);
    if (cachedCandle && cachedCandle.timestamp === timestamp) {
      return cachedCandle;
    }

    return null;
  }

  private candleFromCandle(candle: Candle): CandleBuilder {
    return {
      symbol: candle.symbol,
      exchange: candle.exchange,
      timeframe: candle.timeframe,
      open: parseFloat(candle.open),
      high: parseFloat(candle.high),
      low: parseFloat(candle.low),
      close: parseFloat(candle.close),
      volume: parseFloat(candle.volume),
      quoteVolume: parseFloat(candle.quoteVolume),
      tradeCount: candle.tradeCount,
      timestamp: candle.timestamp,
      vwap: parseFloat(candle.vwap || '0'),
    };
  }

  private createCandleFromBuilder(builder: CandleBuilder): Candle {
    const open = builder.open.toString();
    const high = builder.high.toString();
    const low = builder.low.toString();
    const close = builder.close.toString();
    const volume = builder.volume.toString();
    const quoteVolume = builder.quoteVolume.toString();
    const vwap = builder.vwap.toString();

    // Calculate price changes
    const priceChange = (builder.close - builder.open).toString();
    const priceChangePercent = builder.open > 0 ? 
      (((builder.close - builder.open) / builder.open) * 100).toString() : '0';

    return {
      symbol: builder.symbol,
      exchange: builder.exchange,
      timeframe: builder.timeframe,
      timestamp: builder.timestamp,
      open,
      high,
      low,
      close,
      volume,
      quoteVolume,
      tradeCount: builder.tradeCount,
      vwap,
      priceChange,
      priceChangePercent,
    };
  }

  private async completeCandle(builder: CandleBuilder): Promise<void> {
    const candle = this.createCandleFromBuilder(builder);
    
    // Add to batch insert buffer
    this.batchInsertBuffer.push(candle);
    
    // Cache the candle
    await chartCache.setCandles([candle]);
    
    // Emit completion event
    const update: ChartUpdate = {
      symbol: builder.symbol,
      exchange: builder.exchange,
      timeframe: builder.timeframe,
      candle,
      type: 'new',
    };

    this.emit('candleCompleted', update);
    await chartCache.updateCandle(update);
  }

  async getCandles(
    symbol: string,
    exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis',
    timeframe: Timeframe,
    from: number,
    to: number,
    limit: number = 1000
  ): Promise<Candle[]> {
    // Try cache first
    const cachedCandles = await chartCache.getCandles(symbol, exchange, timeframe, from, to, limit);
    if (cachedCandles.length > 0) {
      return cachedCandles;
    }

    // Fall back to database
    try {
      const result = await database.query<Candle>(
        `SELECT * FROM candles
         WHERE symbol = $1 AND exchange = $2 AND timeframe = $3
         AND timestamp >= $4 AND timestamp <= $5
         ORDER BY timestamp ASC
         LIMIT $6`,
        [symbol, exchange, timeframe, from, to, limit]
      );
      return result.rows;
    } catch (error) {
      logger.error(`Failed to get candles from DB: ${symbol}:${exchange}:${timeframe}`, error);
      return [];
    }
  }

  async getLatestCandle(
    symbol: string,
    exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis',
    timeframe: Timeframe
  ): Promise<Candle | null> {
    // Try cache first
    const cachedCandle = await chartCache.getLatestCandle(symbol, exchange, timeframe);
    if (cachedCandle) {
      return cachedCandle;
    }

    // Fall back to database
    try {
      const result = await database.query<Candle>(
        `SELECT * FROM candles
         WHERE symbol = $1 AND exchange = $2 AND timeframe = $3
         ORDER BY timestamp DESC
         LIMIT 1`,
        [symbol, exchange, timeframe]
      );

      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      logger.error(`Failed to get latest candle from DB: ${symbol}:${exchange}:${timeframe}`, error);
      return null;
    }
  }

  private getTimeframeMs(timeframe: Timeframe): number {
    const multipliers = {
      '1s': 1 * 1000,
      '1m': 60 * 1000,
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '4h': 4 * 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000,
    };
    return multipliers[timeframe];
  }

  private startBatchInsert(): void {
    this.batchInsertInterval = setInterval(async () => {
      if (this.batchInsertBuffer.length === 0) {
        return;
      }

      const candlesToInsert = this.batchInsertBuffer.splice(0, this.BATCH_SIZE);
      
      try {
        await this.insertCandlesBatch(candlesToInsert);
        logger.debug(`Batch inserted ${candlesToInsert.length} candles`);
      } catch (error) {
        logger.error('Failed to batch insert candles:', error);
        // Re-add failed candles to buffer for retry
        this.batchInsertBuffer.unshift(...candlesToInsert);
      }
    }, this.BATCH_INTERVAL);
  }

  private async insertCandlesBatch(candles: Candle[]): Promise<void> {
    // Skip database - use cache only for real-time performance
    // Candles are already cached via chartCache.setCandles() in completeCandle()
    return;
  }

  async forceCompleteAllCandles(): Promise<void> {
    for (const builder of this.candleBuilders.values()) {
      await this.completeCandle(builder);
    }
    this.candleBuilders.clear();
  }

  getCurrentCandle(
    symbol: string,
    exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis',
    timeframe: Timeframe
  ): Candle | null {
    const key = `${exchange}:${symbol}:${timeframe}`;
    const builder = this.candleBuilders.get(key);
    
    if (!builder) {
      return null;
    }

    return this.createCandleFromBuilder(builder);
  }

  getAllCurrentCandles(): Candle[] {
    return Array.from(this.candleBuilders.values()).map(builder => 
      this.createCandleFromBuilder(builder)
    );
  }

  async cleanupOldData(): Promise<void> {
    await chartCache.cleanupOldData();
    
    // Also cleanup old candles from database
    const retentionPeriods = {
      '1s': 1 * 60 * 60 * 1000,      // 1 hour
      '1m': 30 * 24 * 60 * 60 * 1000, // 30 days
      '5m': 30 * 24 * 60 * 60 * 1000, // 30 days
      '15m': 30 * 24 * 60 * 60 * 1000, // 30 days
      '1h': 365 * 24 * 60 * 60 * 1000, // 1 year
      '4h': 365 * 24 * 60 * 60 * 1000, // 1 year
      '1d': 365 * 24 * 60 * 60 * 1000, // 1 year
    };

    for (const [timeframe, retentionMs] of Object.entries(retentionPeriods)) {
      const cutoffTime = Date.now() - retentionMs;

      try {
        const result = await database.query(
          'DELETE FROM candles WHERE timeframe = $1 AND timestamp < $2',
          [timeframe, cutoffTime]
        );

        logger.info(`Cleaned up old candles for ${timeframe}: ${result.rowCount || 0} records deleted`);
      } catch (error) {
        logger.error(`Failed to cleanup old candles for ${timeframe}:`, error);
      }
    }
  }

  stop(): void {
    if (this.batchInsertInterval) {
      clearInterval(this.batchInsertInterval);
      this.batchInsertInterval = null;
    }

    // Complete all current candles and insert remaining buffer
    this.forceCompleteAllCandles()
      .then(() => {
        if (this.batchInsertBuffer.length > 0) {
          return this.insertCandlesBatch(this.batchInsertBuffer);
        }
      })
      .then(() => logger.info('Chart processor shutdown completed'))
      .catch(error => logger.error('Error during chart processor shutdown:', error));

    this.removeAllListeners();
  }

  getStats(): {
    activeCandleBuilders: number;
    buildersByTimeframe: Record<string, number>;
    bufferSize: number;
  } {
    const stats = {
      activeCandleBuilders: this.candleBuilders.size,
      buildersByTimeframe: {} as Record<string, number>,
      bufferSize: this.batchInsertBuffer.length,
    };

    for (const builder of this.candleBuilders.values()) {
      stats.buildersByTimeframe[builder.timeframe] = 
        (stats.buildersByTimeframe[builder.timeframe] || 0) + 1;
    }

    return stats;
  }
}

export const chartProcessor = new ChartProcessor();