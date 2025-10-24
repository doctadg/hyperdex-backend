import { redisClient } from '@/config/redis';
import { cacheTTL } from '@/config/exchanges';
import { Orderbook, OrderbookSnapshot, OrderbookUpdate } from '@/types';
import { logger } from '@/utils/logger';

export class OrderbookCache {
  private readonly ORDERBOOK_KEY_PREFIX = 'orderbook:';
  private readonly SNAPSHOT_KEY_PREFIX = 'orderbook:snapshot:';
  private readonly UPDATE_CHANNEL_PREFIX = 'orderbook:update:';

  async setOrderbook(orderbook: Orderbook): Promise<void> {
    const key = `${this.ORDERBOOK_KEY_PREFIX}${orderbook.exchange}:${orderbook.symbol}`;
    const data = JSON.stringify(orderbook);
    
    await redisClient.set(key, data, cacheTTL.orderbook);
    
    // Publish update to subscribers
    await this.publishUpdate(orderbook);
    
    logger.debug(`Orderbook cached: ${orderbook.exchange}:${orderbook.symbol}`);
  }

  async getOrderbook(symbol: string, exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis'): Promise<Orderbook | null> {
    const key = `${this.ORDERBOOK_KEY_PREFIX}${exchange}:${symbol}`;
    const data = await redisClient.get(key);
    
    if (!data) {
      return null;
    }
    
    try {
      return JSON.parse(data) as Orderbook;
    } catch (error) {
      logger.error(`Failed to parse orderbook from cache: ${key}`, error);
      return null;
    }
  }

  async setSnapshot(snapshot: OrderbookSnapshot): Promise<void> {
    const key = `${this.SNAPSHOT_KEY_PREFIX}${snapshot.exchange}:${snapshot.symbol}`;
    const data = JSON.stringify(snapshot);
    
    await redisClient.set(key, data, cacheTTL.orderbook);
    
    logger.debug(`Orderbook snapshot cached: ${snapshot.exchange}:${snapshot.symbol}`);
  }

  async getSnapshot(symbol: string, exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis'): Promise<OrderbookSnapshot | null> {
    const key = `${this.SNAPSHOT_KEY_PREFIX}${exchange}:${symbol}`;
    const data = await redisClient.get(key);
    
    if (!data) {
      return null;
    }
    
    try {
      return JSON.parse(data) as OrderbookSnapshot;
    } catch (error) {
      logger.error(`Failed to parse orderbook snapshot from cache: ${key}`, error);
      return null;
    }
  }

  async updateOrderbook(update: OrderbookUpdate): Promise<void> {
    const key = `${this.ORDERBOOK_KEY_PREFIX}${update.exchange}:${update.symbol}`;
    
    // Get current orderbook
    const currentOrderbook = await this.getOrderbook(update.symbol, update.exchange);
    
    if (!currentOrderbook) {
      logger.warn(`No existing orderbook found for update: ${update.exchange}:${update.symbol}`);
      return;
    }

    // Apply updates
    if (update.bids) {
      currentOrderbook.bids.levels = this.applyPriceLevelUpdates(
        currentOrderbook.bids.levels,
        update.bids
      );
    }

    if (update.asks) {
      currentOrderbook.asks.levels = this.applyPriceLevelUpdates(
        currentOrderbook.asks.levels,
        update.asks
      );
    }

    // Update metadata
    currentOrderbook.timestamp = update.timestamp;
    currentOrderbook.sequence = update.sequence;
    currentOrderbook.spread = this.calculateSpread(currentOrderbook);
    currentOrderbook.midPrice = this.calculateMidPrice(currentOrderbook);

    // Save updated orderbook
    await this.setOrderbook(currentOrderbook);
  }

  private applyPriceLevelUpdates(
    currentLevels: { price: string; size: string; timestamp: number }[],
    updates: { price: string; size: string; timestamp: number }[]
  ): { price: string; size: string; timestamp: number }[] {
    const levelMap = new Map<string, { price: string; size: string; timestamp: number }>();

    // Add current levels to map
    currentLevels.forEach(level => {
      levelMap.set(level.price, level);
    });

    // Apply updates
    updates.forEach(update => {
      if (update.size === '0' || update.size === '0.0') {
        // Remove level if size is 0
        levelMap.delete(update.price);
      } else {
        // Update or add level
        levelMap.set(update.price, update);
      }
    });

    // Convert back to array and sort by price
    return Array.from(levelMap.values()).sort((a, b) => {
      const priceA = parseFloat(a.price);
      const priceB = parseFloat(b.price);
      return priceB - priceA; // Descending order for bids, ascending for asks
    });
  }

  private calculateSpread(orderbook: Orderbook): string {
    if (orderbook.bids.levels.length === 0 || orderbook.asks.levels.length === 0) {
      return '0';
    }

    const bestBid = parseFloat(orderbook.bids.levels[0].price);
    const bestAsk = parseFloat(orderbook.asks.levels[0].price);
    return (bestAsk - bestBid).toString();
  }

  private calculateMidPrice(orderbook: Orderbook): string {
    if (orderbook.bids.levels.length === 0 || orderbook.asks.levels.length === 0) {
      return '0';
    }

    const bestBid = parseFloat(orderbook.bids.levels[0].price);
    const bestAsk = parseFloat(orderbook.asks.levels[0].price);
    return ((bestBid + bestAsk) / 2).toString();
  }

  async deleteOrderbook(symbol: string, exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis'): Promise<void> {
    const orderbookKey = `${this.ORDERBOOK_KEY_PREFIX}${exchange}:${symbol}`;
    const snapshotKey = `${this.SNAPSHOT_KEY_PREFIX}${exchange}:${symbol}`;
    
    await Promise.all([
      redisClient.del(orderbookKey),
      redisClient.del(snapshotKey)
    ]);
    
    logger.info(`Orderbook deleted from cache: ${exchange}:${symbol}`);
  }

  async getAllCachedSymbols(exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis'): Promise<string[]> {
    const pattern = `${this.ORDERBOOK_KEY_PREFIX}${exchange}:*`;
    const keys = await redisClient.getClient().keys(pattern);
    
    return keys.map(key => key.replace(`${this.ORDERBOOK_KEY_PREFIX}${exchange}:`, ''));
  }

  async publishUpdate(orderbook: Orderbook): Promise<void> {
    const channel = `${this.UPDATE_CHANNEL_PREFIX}${orderbook.exchange}:${orderbook.symbol}`;
    const message = JSON.stringify({
      type: 'orderbook_update',
      data: orderbook,
      timestamp: Date.now()
    });
    
    await redisClient.publish(channel, message);
  }

  async subscribeToUpdates(
    symbol: string,
    exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis',
    callback: (orderbook: Orderbook) => void
  ): Promise<void> {
    const channel = `${this.UPDATE_CHANNEL_PREFIX}${exchange}:${symbol}`;
    
    await redisClient.subscribe(channel, (ch, message) => {
      try {
        const parsed = JSON.parse(message);
        if (parsed.type === 'orderbook_update' && parsed.data) {
          callback(parsed.data as Orderbook);
        }
      } catch (error) {
        logger.error(`Failed to parse orderbook update message: ${message}`, error);
      }
    });
    
    logger.info(`Subscribed to orderbook updates: ${channel}`);
  }

  async healthCheck(): Promise<boolean> {
    try {
      const testKey = `${this.ORDERBOOK_KEY_PREFIX}health:test`;
      await redisClient.set(testKey, 'test', 10);
      const result = await redisClient.get(testKey);
      await redisClient.del(testKey);
      return result === 'test';
    } catch (error) {
      logger.error('Orderbook cache health check failed', error);
      return false;
    }
  }
}

export const orderbookCache = new OrderbookCache();