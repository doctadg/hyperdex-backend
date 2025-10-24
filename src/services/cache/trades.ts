import { redisClient } from '@/config/redis';
import { cacheTTL } from '@/config/exchanges';
import { Trade, TradeFilter } from '@/types';
import { logger } from '@/utils/logger';

export class TradeCache {
  private readonly TRADES_KEY_PREFIX = 'trades:';
  private readonly RECENT_TRADES_KEY_PREFIX = 'recent_trades:';
  private readonly UPDATE_CHANNEL_PREFIX = 'trades:update:';

  async addTrades(trades: Trade[]): Promise<void> {
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
      await this.addTradesForSymbol(key, symbolTrades);
    }

    // Publish updates
    for (const trade of trades) {
      await this.publishTradeUpdate(trade);
    }

    logger.debug(`Added ${trades.length} trades to cache`);
  }

  private async addTradesForSymbol(key: string, trades: Trade[]): Promise<void> {
    const recentTradesKey = `${this.RECENT_TRADES_KEY_PREFIX}${key}`;
    
    // Add trades to recent trades list
    for (const trade of trades) {
      await redisClient.lpush(recentTradesKey, JSON.stringify(trade));
    }
    
    // Keep only the most recent 1000 trades
    await redisClient.ltrim(recentTradesKey, 0, 999);
    
    // Set TTL
    await redisClient.getClient().expire(recentTradesKey, cacheTTL.trades);
  }

  async getRecentTrades(
    symbol: string, 
    exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis',
    limit: number = 100
  ): Promise<Trade[]> {
    const key = `${this.RECENT_TRADES_KEY_PREFIX}${exchange}:${symbol}`;
    const tradeData = await redisClient.lrange(key, 0, limit - 1);
    
    const trades: Trade[] = [];
    
    for (const data of tradeData) {
      try {
        const trade = JSON.parse(data) as Trade;
        trades.push(trade);
      } catch (error) {
        logger.error(`Failed to parse trade from cache: ${data}`, error);
      }
    }
    
    return trades;
  }

  async getTradesWithFilter(
    symbol: string,
    exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis',
    filter: TradeFilter,
    limit: number = 100
  ): Promise<Trade[]> {
    const allTrades = await this.getRecentTrades(symbol, exchange, limit * 2); // Get more to filter
    
    return allTrades.filter(trade => {
      if (filter.side && trade.side !== filter.side) return false;
      if (filter.minSize && parseFloat(trade.size) < parseFloat(filter.minSize)) return false;
      if (filter.maxSize && parseFloat(trade.size) > parseFloat(filter.maxSize)) return false;
      if (filter.minPrice && parseFloat(trade.price) < parseFloat(filter.minPrice)) return false;
      if (filter.maxPrice && parseFloat(trade.price) > parseFloat(filter.maxPrice)) return false;
      if (filter.from && trade.timestamp < filter.from) return false;
      if (filter.to && trade.timestamp > filter.to) return false;
      
      return true;
    }).slice(0, limit);
  }

  async getTradeMetrics(
    symbol: string,
    exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis',
    window: '1m' | '5m' | '15m' | '1h' | '4h' | '1d' = '1h'
  ): Promise<{
    price: string;
    priceChange: string;
    priceChangePercent: string;
    volume: string;
    quoteVolume: string;
    high: string;
    low: string;
    count: number;
  } | null> {
    const trades = await this.getRecentTrades(symbol, exchange, 1000);
    
    if (trades.length === 0) {
      return null;
    }

    const now = Date.now();
    const windowMs = this.getWindowMs(window);
    const cutoffTime = now - windowMs;
    
    const recentTrades = trades.filter(trade => trade.timestamp >= cutoffTime);
    
    if (recentTrades.length === 0) {
      return null;
    }

    const prices = recentTrades.map(trade => parseFloat(trade.price));
    const volumes = recentTrades.map(trade => parseFloat(trade.size));
    const quoteVolumes = recentTrades.map(trade => parseFloat(trade.price) * parseFloat(trade.size));
    
    const currentPrice = prices[prices.length - 1];
    const firstPrice = prices[0];
    const priceChange = currentPrice - firstPrice;
    const priceChangePercent = (priceChange / firstPrice) * 100;
    
    const totalVolume = volumes.reduce((sum, vol) => sum + vol, 0);
    const totalQuoteVolume = quoteVolumes.reduce((sum, vol) => sum + vol, 0);
    const high = Math.max(...prices);
    const low = Math.min(...prices);

    return {
      price: currentPrice.toString(),
      priceChange: priceChange.toString(),
      priceChangePercent: priceChangePercent.toString(),
      volume: totalVolume.toString(),
      quoteVolume: totalQuoteVolume.toString(),
      high: high.toString(),
      low: low.toString(),
      count: recentTrades.length,
    };
  }

  private getWindowMs(window: '1m' | '5m' | '15m' | '1h' | '4h' | '1d'): number {
    const multipliers = {
      '1m': 60 * 1000,
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '4h': 4 * 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000,
    };
    
    return multipliers[window];
  }

  async deleteTrades(symbol: string, exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis'): Promise<void> {
    const key = `${this.RECENT_TRADES_KEY_PREFIX}${exchange}:${symbol}`;
    await redisClient.del(key);
    
    logger.info(`Trades deleted from cache: ${exchange}:${symbol}`);
  }

  async getAllCachedSymbols(exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis'): Promise<string[]> {
    const pattern = `${this.RECENT_TRADES_KEY_PREFIX}${exchange}:*`;
    const keys = await redisClient.getClient().keys(pattern);
    
    return keys.map(key => key.replace(`${this.RECENT_TRADES_KEY_PREFIX}${exchange}:`, ''));
  }

  async publishTradeUpdate(trade: Trade): Promise<void> {
    const channel = `${this.UPDATE_CHANNEL_PREFIX}${trade.exchange}:${trade.symbol}`;
    const message = JSON.stringify({
      type: 'trade_update',
      data: trade,
      timestamp: Date.now()
    });
    
    await redisClient.publish(channel, message);
  }

  async subscribeToUpdates(
    symbol: string,
    exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis',
    callback: (trade: Trade) => void
  ): Promise<void> {
    const channel = `${this.UPDATE_CHANNEL_PREFIX}${exchange}:${symbol}`;
    
    await redisClient.subscribe(channel, (_ch, message) => {
      try {
        const parsed = JSON.parse(message);
        if (parsed.type === 'trade_update' && parsed.data) {
          callback(parsed.data as Trade);
        }
      } catch (error) {
        logger.error(`Failed to parse trade update message: ${message}`, error);
      }
    });
    
    logger.info(`Subscribed to trade updates: ${channel}`);
  }

  async healthCheck(): Promise<boolean> {
    try {
      const testKey = `${this.RECENT_TRADES_KEY_PREFIX}health:test`;
      await redisClient.lpush(testKey, 'test');
      const result = await redisClient.lrange(testKey, 0, 0);
      await redisClient.del(testKey);
      return result.length > 0 && result[0] === 'test';
    } catch (error) {
      logger.error('Trade cache health check failed', error);
      return false;
    }
  }
}

export const tradeCache = new TradeCache();