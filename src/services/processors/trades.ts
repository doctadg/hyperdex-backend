import { EventEmitter } from 'events';
import { Trade, TradeMetrics } from '@/types';
import { tradeCache } from '@/services/cache/trades';
import { database } from '@/config/database';
import { logger } from '@/utils/logger';

interface TradeAggregation {
  symbol: string;
  exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis';
  timeframe: '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  closePrice: number;
  volume: number;
  quoteVolume: number;
  tradeCount: number;
  lastUpdate: number;
  windowStart: number;
}

export class TradeProcessor extends EventEmitter {
  private aggregations: Map<string, TradeAggregation> = new Map();
  private batchInsertBuffer: Trade[] = [];
  private batchInsertInterval: NodeJS.Timeout | null = null;
  private readonly BATCH_SIZE = 100;
  private readonly BATCH_INTERVAL = 5000; // 5 seconds

  constructor() {
    super();
    this.startBatchInsert();
  }

  async processTrades(trades: Trade[]): Promise<void> {
    if (trades.length === 0) return;

    // Group trades by symbol and exchange
    const tradesBySymbol = new Map<string, Trade[]>();
    
    trades.forEach(trade => {
      const key = `${trade.exchange}:${trade.symbol}`;
      if (!tradesBySymbol.has(key)) {
        tradesBySymbol.set(key, []);
      }
      tradesBySymbol.get(key)!.push(trade);
    });

    // Process each symbol's trades
    for (const [key, symbolTrades] of tradesBySymbol) {
      await this.processTradesForSymbol(key, symbolTrades);
    }

    // Add to cache
    await tradeCache.addTrades(trades);

    // Add to batch insert buffer
    this.batchInsertBuffer.push(...trades);

    // Emit trades for real-time updates
    this.emit('tradesProcessed', trades);

    logger.debug(`Processed ${trades.length} trades`);
  }

  private async processTradesForSymbol(key: string, trades: Trade[]): Promise<void> {
    // Update aggregations for different timeframes
    const timeframes: Array<'1m' | '5m' | '15m' | '1h' | '4h' | '1d'> = ['1m', '5m', '15m', '1h', '4h', '1d'];
    
    for (const timeframe of timeframes) {
      for (const trade of trades) {
        this.updateAggregation(trade, timeframe);
      }
    }
  }

  private updateAggregation(trade: Trade, timeframe: '1m' | '5m' | '15m' | '1h' | '4h' | '1d'): void {
    const key = `${trade.exchange}:${trade.symbol}:${timeframe}`;
    const windowMs = this.getTimeframeMs(timeframe);
    const windowStart = Math.floor(trade.timestamp / windowMs) * windowMs;

    let aggregation = this.aggregations.get(key);

    // Create new aggregation if needed
    if (!aggregation || aggregation.windowStart !== windowStart) {
      // Emit completed aggregation if it exists
      if (aggregation) {
        this.emit('aggregationCompleted', {
          symbol: aggregation.symbol,
          exchange: aggregation.exchange,
          timeframe: aggregation.timeframe,
          data: aggregation,
        });
      }

      aggregation = {
        symbol: trade.symbol,
        exchange: trade.exchange,
        timeframe,
        openPrice: parseFloat(trade.price),
        highPrice: parseFloat(trade.price),
        lowPrice: parseFloat(trade.price),
        closePrice: parseFloat(trade.price),
        volume: 0,
        quoteVolume: 0,
        tradeCount: 0,
        lastUpdate: trade.timestamp,
        windowStart,
      };

      this.aggregations.set(key, aggregation);
    }

    // Update aggregation with new trade
    const price = parseFloat(trade.price);
    const size = parseFloat(trade.size);
    const quoteValue = price * size;

    aggregation.highPrice = Math.max(aggregation.highPrice, price);
    aggregation.lowPrice = Math.min(aggregation.lowPrice, price);
    aggregation.closePrice = price;
    aggregation.volume += size;
    aggregation.quoteVolume += quoteValue;
    aggregation.tradeCount += 1;
    aggregation.lastUpdate = trade.timestamp;
  }

  private getTimeframeMs(timeframe: '1m' | '5m' | '15m' | '1h' | '4h' | '1d'): number {
    const multipliers = {
      '1m': 60 * 1000,
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '4h': 4 * 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000,
    };
    return multipliers[timeframe];
  }

  async getTradeMetrics(
    symbol: string,
    exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis',
    window: '1m' | '5m' | '15m' | '1h' | '4h' | '1d' = '1h'
  ): Promise<TradeMetrics | null> {
    // Try cache first
    const cachedMetrics = await tradeCache.getTradeMetrics(symbol, exchange, window);
    if (cachedMetrics) {
      const currentPrice = parseFloat(cachedMetrics.price);
      const priceChange = parseFloat(cachedMetrics.priceChange);
      const openPrice = currentPrice - priceChange;

      return {
        symbol,
        exchange,
        price: cachedMetrics.price,
        priceChange: cachedMetrics.priceChange,
        priceChangePercent: cachedMetrics.priceChangePercent,
        volume: cachedMetrics.volume,
        quoteVolume: cachedMetrics.quoteVolume,
        high: cachedMetrics.high,
        low: cachedMetrics.low,
        open: openPrice.toString(),
        count: cachedMetrics.count,
        timestamp: Date.now(),
        window,
      };
    }

    // Fall back to database
    return await this.getTradeMetricsFromDB(symbol, exchange, window);
  }

  private async getTradeMetricsFromDB(
    symbol: string,
    exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis',
    window: '1m' | '5m' | '15m' | '1h' | '4h' | '1d'
  ): Promise<TradeMetrics | null> {
    const windowMs = this.getTimeframeMs(window);
    const cutoffTime = Date.now() - windowMs;

    try {
      const result = await database.query<Trade>(
        `SELECT * FROM trades
         WHERE symbol = $1 AND exchange = $2 AND timestamp >= $3
         ORDER BY timestamp ASC`,
        [symbol, exchange, cutoffTime]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const trades = result.rows;
      const prices = trades.map(trade => parseFloat(trade.price));
      const volumes = trades.map(trade => parseFloat(trade.size));
      const quoteVolumes = trades.map(trade => parseFloat(trade.price) * parseFloat(trade.size));

      const currentPrice = prices[prices.length - 1];
      const firstPrice = prices[0];
      const priceChange = currentPrice - firstPrice;
      const priceChangePercent = (priceChange / firstPrice) * 100;

      const totalVolume = volumes.reduce((sum, vol) => sum + vol, 0);
      const totalQuoteVolume = quoteVolumes.reduce((sum, vol) => sum + vol, 0);
      const high = Math.max(...prices);
      const low = Math.min(...prices);

      return {
        symbol,
        exchange,
        price: currentPrice.toString(),
        priceChange: priceChange.toString(),
        priceChangePercent: priceChangePercent.toString(),
        volume: totalVolume.toString(),
        quoteVolume: totalQuoteVolume.toString(),
        high: high.toString(),
        low: low.toString(),
        open: firstPrice.toString(),
        count: trades.length,
        timestamp: Date.now(),
        window,
      };
    } catch (error) {
      logger.error(`Failed to get trade metrics from DB: ${symbol}:${exchange}`, error);
      return null;
    }
  }

  async getRecentTrades(
    symbol: string,
    exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis',
    limit: number = 100
  ): Promise<Trade[]> {
    // Try cache first
    const cachedTrades = await tradeCache.getRecentTrades(symbol, exchange, limit);
    if (cachedTrades.length > 0) {
      return cachedTrades;
    }

    // Fall back to database
    try {
      const result = await database.query<Trade>(
        `SELECT * FROM trades
         WHERE symbol = $1 AND exchange = $2
         ORDER BY timestamp DESC
         LIMIT $3`,
        [symbol, exchange, limit]
      );
      return result.rows;
    } catch (error) {
      logger.error(`Failed to get recent trades from DB: ${symbol}:${exchange}`, error);
      return [];
    }
  }

  private startBatchInsert(): void {
    this.batchInsertInterval = setInterval(async () => {
      if (this.batchInsertBuffer.length === 0) {
        return;
      }

      const tradesToInsert = this.batchInsertBuffer.splice(0, this.BATCH_SIZE);
      
      try {
        await this.insertTradesBatch(tradesToInsert);
        logger.debug(`Batch inserted ${tradesToInsert.length} trades`);
      } catch (error) {
        logger.error('Failed to batch insert trades:', error);
        // Re-add failed trades to buffer for retry
        this.batchInsertBuffer.unshift(...tradesToInsert);
      }
    }, this.BATCH_INTERVAL);
  }

  private async insertTradesBatch(trades: Trade[]): Promise<void> {
    if (trades.length === 0) return;

    const values = trades.map(trade => 
      `('${trade.id}', '${trade.symbol}', '${trade.exchange}', '${trade.price}', '${trade.size}', '${trade.side}', ${trade.timestamp}, ${trade.blockTime || 'NULL'})`
    ).join(', ');

    const query = `
      INSERT INTO trades (id, symbol, exchange, price, size, side, timestamp, block_time)
      VALUES ${values}
      ON CONFLICT (id) DO NOTHING
    `;

    await database.query(query);
  }

  getAggregation(
    symbol: string,
    exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis',
    timeframe: '1m' | '5m' | '15m' | '1h' | '4h' | '1d'
  ): TradeAggregation | null {
    const key = `${exchange}:${symbol}:${timeframe}`;
    return this.aggregations.get(key) || null;
  }

  getAllAggregations(): TradeAggregation[] {
    return Array.from(this.aggregations.values());
  }

  async cleanupOldData(): Promise<void> {
    const retentionPeriod = 7 * 24 * 60 * 60 * 1000; // 7 days
    const cutoffTime = Date.now() - retentionPeriod;

    try {
      const result = await database.query(
        'DELETE FROM trades WHERE timestamp < $1',
        [cutoffTime]
      );

      logger.info(`Cleaned up old trades: ${result.rowCount || 0} records deleted`);
    } catch (error) {
      logger.error('Failed to cleanup old trades:', error);
    }
  }

  stop(): void {
    if (this.batchInsertInterval) {
      clearInterval(this.batchInsertInterval);
      this.batchInsertInterval = null;
    }

    // Insert remaining trades in buffer
    if (this.batchInsertBuffer.length > 0) {
      this.insertTradesBatch(this.batchInsertBuffer)
        .then(() => logger.info('Inserted remaining trades on shutdown'))
        .catch(error => logger.error('Failed to insert remaining trades:', error));
    }

    this.removeAllListeners();
  }

  getStats(): {
    totalAggregations: number;
    aggregationsByTimeframe: Record<string, number>;
    bufferSize: number;
  } {
    const stats = {
      totalAggregations: this.aggregations.size,
      aggregationsByTimeframe: {} as Record<string, number>,
      bufferSize: this.batchInsertBuffer.length,
    };

    for (const aggregation of this.aggregations.values()) {
      stats.aggregationsByTimeframe[aggregation.timeframe] = 
        (stats.aggregationsByTimeframe[aggregation.timeframe] || 0) + 1;
    }

    return stats;
  }
}

export const tradeProcessor = new TradeProcessor();