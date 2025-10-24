import { EventEmitter } from 'events';
import { Orderbook, OrderbookSnapshot, OrderbookUpdate, PriceLevel } from '@/types';
import { orderbookCache } from '@/services/cache/orderbook';
import { logger } from '@/utils/logger';

interface OrderbookState {
  symbol: string;
  exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis';
  bids: Map<string, PriceLevel>;
  asks: Map<string, PriceLevel>;
  lastUpdate: number;
  sequence: number;
}

export class OrderbookProcessor extends EventEmitter {
  private orderbooks: Map<string, OrderbookState> = new Map();
  private snapshotInterval: NodeJS.Timeout | null = null;
  private readonly SNAPSHOT_INTERVAL = 30000; // 30 seconds

  constructor() {
    super();
    this.startSnapshotInterval();
  }

  async processSnapshot(snapshot: OrderbookSnapshot): Promise<void> {
    const key = this.getKey(snapshot.symbol, snapshot.exchange);
    
    // Convert snapshot data to PriceLevel format
    const bids = new Map<string, PriceLevel>();
    const asks = new Map<string, PriceLevel>();

    snapshot.bids.forEach(([price, size]) => {
      bids.set(price, {
        price,
        size,
        timestamp: snapshot.timestamp,
      });
    });

    snapshot.asks.forEach(([price, size]) => {
      asks.set(price, {
        price,
        size,
        timestamp: snapshot.timestamp,
      });
    });

    // Update orderbook state
    this.orderbooks.set(key, {
      symbol: snapshot.symbol,
      exchange: snapshot.exchange,
      bids,
      asks,
      lastUpdate: snapshot.timestamp,
      sequence: snapshot.sequence,
    });

    // Create orderbook object
    const orderbook = this.createOrderbook(snapshot.symbol, snapshot.exchange, bids, asks);
    
    // Cache the orderbook
    await orderbookCache.setOrderbook(orderbook);
    
    // Cache the snapshot
    await orderbookCache.setSnapshot(snapshot);
    
    // Emit update
    this.emit('orderbookUpdated', orderbook);
    
    logger.debug(`Processed orderbook snapshot: ${snapshot.exchange}:${snapshot.symbol}`);
  }

  async processUpdate(update: OrderbookUpdate): Promise<void> {
    const key = this.getKey(update.symbol, update.exchange);
    const currentState = this.orderbooks.get(key);

    if (!currentState) {
      logger.warn(`Received update for unknown orderbook: ${key}`);
      return;
    }

    // Apply updates to current state
    if (update.bids) {
      this.applyPriceLevelUpdates(currentState.bids, update.bids, update.timestamp);
    }

    if (update.asks) {
      this.applyPriceLevelUpdates(currentState.asks, update.asks, update.timestamp);
    }

    // Update metadata
    currentState.lastUpdate = update.timestamp;
    currentState.sequence = update.sequence;

    // Create orderbook object
    const orderbook = this.createOrderbook(
      update.symbol, 
      update.exchange, 
      currentState.bids, 
      currentState.asks
    );
    
    // Cache the updated orderbook
    await orderbookCache.updateOrderbook(update);
    
    // Emit update
    this.emit('orderbookUpdated', orderbook);
    
    logger.debug(`Processed orderbook update: ${update.exchange}:${update.symbol}`);
  }

  private applyPriceLevelUpdates(
    currentLevels: Map<string, PriceLevel>,
    updates: { price: string; size: string; timestamp: number }[],
    timestamp: number
  ): void {
    updates.forEach(update => {
      if (update.size === '0' || update.size === '0.0') {
        // Remove level if size is 0
        currentLevels.delete(update.price);
      } else {
        // Update or add level
        currentLevels.set(update.price, {
          price: update.price,
          size: update.size,
          timestamp,
        });
      }
    });
  }

  private createOrderbook(
    symbol: string,
    exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis',
    bids: Map<string, PriceLevel>,
    asks: Map<string, PriceLevel>
  ): Orderbook {
    // Convert maps to sorted arrays
    const bidLevels = Array.from(bids.values())
      .sort((a, b) => parseFloat(b.price) - parseFloat(a.price))
      .slice(0, 1000); // Limit to 1000 levels

    const askLevels = Array.from(asks.values())
      .sort((a, b) => parseFloat(a.price) - parseFloat(b.price))
      .slice(0, 1000); // Limit to 1000 levels

    // Calculate totals
    const bidTotalSize = bidLevels.reduce((sum, level) => sum + parseFloat(level.size), 0);
    const askTotalSize = askLevels.reduce((sum, level) => sum + parseFloat(level.size), 0);

    // Calculate spread and mid price
    const bestBid = bidLevels.length > 0 ? parseFloat(bidLevels[0].price) : 0;
    const bestAsk = askLevels.length > 0 ? parseFloat(askLevels[0].price) : 0;
    const spread = bestAsk - bestBid;
    const midPrice = (bestBid + bestAsk) / 2;

    return {
      symbol,
      exchange,
      bids: {
        levels: bidLevels,
        totalSize: bidTotalSize.toString(),
      },
      asks: {
        levels: askLevels,
        totalSize: askTotalSize.toString(),
      },
      timestamp: Date.now(),
      sequence: this.orderbooks.get(this.getKey(symbol, exchange))?.sequence || 0,
      spread: spread.toString(),
      midPrice: midPrice.toString(),
    };
  }

  private getKey(symbol: string, exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis'): string {
    return `${exchange}:${symbol}`;
  }

  async getOrderbook(symbol: string, exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis'): Promise<Orderbook | null> {
    // First try cache
    const cachedOrderbook = await orderbookCache.getOrderbook(symbol, exchange);
    if (cachedOrderbook) {
      return cachedOrderbook;
    }

    // Fall back to memory state
    const key = this.getKey(symbol, exchange);
    const state = this.orderbooks.get(key);
    
    if (!state) {
      return null;
    }

    return this.createOrderbook(symbol, exchange, state.bids, state.asks);
  }

  async getTopLevels(
    symbol: string, 
    exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis', 
    depth: number = 20
  ): Promise<{ bids: PriceLevel[]; asks: PriceLevel[] } | null> {
    const orderbook = await this.getOrderbook(symbol, exchange);
    
    if (!orderbook) {
      return null;
    }

    return {
      bids: orderbook.bids.levels.slice(0, depth),
      asks: orderbook.asks.levels.slice(0, depth),
    };
  }

  calculateSpread(symbol: string, exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis'): { 
    spread: string; 
    spreadPercent: string; 
  } | null {
    const key = this.getKey(symbol, exchange);
    const state = this.orderbooks.get(key);
    
    if (!state || state.bids.size === 0 || state.asks.size === 0) {
      return null;
    }

    const bestBid = parseFloat(Array.from(state.bids.keys())[0]);
    const bestAsk = parseFloat(Array.from(state.asks.keys())[0]);
    
    const spread = bestAsk - bestBid;
    const spreadPercent = (spread / bestBid) * 100;

    return {
      spread: spread.toString(),
      spreadPercent: spreadPercent.toString(),
    };
  }

  calculatePriceImpact(
    symbol: string,
    exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis',
    size: string
  ): { buyImpact: string; sellImpact: string } | null {
    const key = this.getKey(symbol, exchange);
    const state = this.orderbooks.get(key);
    
    if (!state) {
      return null;
    }

    const tradeSize = parseFloat(size);
    
    // Calculate buy impact (using asks)
    let buyCost = 0;
    let buySize = 0;
    const sortedAsks = Array.from(state.asks.entries())
      .sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]));

    for (const [price, level] of sortedAsks) {
      const levelSize = parseFloat(level.size);
      const levelPrice = parseFloat(price);
      
      if (buySize + levelSize >= tradeSize) {
        const remainingSize = tradeSize - buySize;
        buyCost += remainingSize * levelPrice;
        buySize += remainingSize;
        break;
      } else {
        buyCost += levelSize * levelPrice;
        buySize += levelSize;
      }
    }

    // Calculate sell impact (using bids)
    let sellRevenue = 0;
    let sellSize = 0;
    const sortedBids = Array.from(state.bids.entries())
      .sort((a, b) => parseFloat(b[0]) - parseFloat(a[0]));

    for (const [price, level] of sortedBids) {
      const levelSize = parseFloat(level.size);
      const levelPrice = parseFloat(price);
      
      if (sellSize + levelSize >= tradeSize) {
        const remainingSize = tradeSize - sellSize;
        sellRevenue += remainingSize * levelPrice;
        sellSize += remainingSize;
        break;
      } else {
        sellRevenue += levelSize * levelPrice;
        sellSize += levelSize;
      }
    }

    const avgBuyPrice = buySize > 0 ? buyCost / buySize : 0;
    const avgSellPrice = sellSize > 0 ? sellRevenue / sellSize : 0;
    
    const midPrice = (avgBuyPrice + avgSellPrice) / 2;
    
    const buyImpact = midPrice > 0 ? ((avgBuyPrice - midPrice) / midPrice) * 100 : 0;
    const sellImpact = midPrice > 0 ? ((midPrice - avgSellPrice) / midPrice) * 100 : 0;

    return {
      buyImpact: buyImpact.toString(),
      sellImpact: sellImpact.toString(),
    };
  }

  private startSnapshotInterval(): void {
    this.snapshotInterval = setInterval(async () => {
      for (const [key, state] of this.orderbooks) {
        const orderbook = this.createOrderbook(
          state.symbol,
          state.exchange,
          state.bids,
          state.asks
        );
        
        await orderbookCache.setOrderbook(orderbook);
      }
    }, this.SNAPSHOT_INTERVAL);
  }

  stop(): void {
    if (this.snapshotInterval) {
      clearInterval(this.snapshotInterval);
      this.snapshotInterval = null;
    }
    this.removeAllListeners();
  }

  getStats(): {
    totalOrderbooks: number;
    orderbooksByExchange: Record<string, number>;
    lastUpdates: Record<string, number>;
  } {
    const stats = {
      totalOrderbooks: this.orderbooks.size,
      orderbooksByExchange: {} as Record<string, number>,
      lastUpdates: {} as Record<string, number>,
    };

    for (const [key, state] of this.orderbooks) {
      const exchange = state.exchange;
      stats.orderbooksByExchange[exchange] = (stats.orderbooksByExchange[exchange] || 0) + 1;
      stats.lastUpdates[key] = state.lastUpdate;
    }

    return stats;
  }
}

export const orderbookProcessor = new OrderbookProcessor();