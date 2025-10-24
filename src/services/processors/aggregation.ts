import { EventEmitter } from 'events';
import { Orderbook } from '@/types';
import { redisClient } from '@/config/redis';
import { logger } from '@/utils/logger';

interface SourceLevel {
  platform: 'hyperliquid' | 'aster' | 'lighter' | 'avantis';
  size: number;
}

interface AggregatedLevel {
  price: number;
  totalSize: number;
  sources: SourceLevel[];
}

interface RoutingDecision {
  platform: 'hyperliquid' | 'aster' | 'lighter' | 'avantis';
  price: number;
  reason: string;
  savings: number;
  savingsPercent: number;
}

export interface AggregatedOrderbook {
  symbol: string;
  timestamp: number;
  aggregated: {
    bids: AggregatedLevel[];
    asks: AggregatedLevel[];
    spread: {
      value: number;
      percentage: number;
    };
    bestBid: {
      price: number;
      platform: 'hyperliquid' | 'aster' | 'lighter' | 'avantis';
      size: number;
    };
    bestAsk: {
      price: number;
      platform: 'hyperliquid' | 'aster' | 'lighter' | 'avantis';
      size: number;
    };
  };
  sources: {
    hyperliquid: {
      bids: Array<{ price: number; size: number }>;
      asks: Array<{ price: number; size: number }>;
      lastUpdate: number;
    } | null;
    aster: {
      bids: Array<{ price: number; size: number }>;
      asks: Array<{ price: number; size: number }>;
      lastUpdate: number;
    } | null;
    lighter: {
      bids: Array<{ price: number; size: number }>;
      asks: Array<{ price: number; size: number }>;
      lastUpdate: number;
    } | null;
    avantis: {
      bids: Array<{ price: number; size: number }>;
      asks: Array<{ price: number; size: number }>;
      lastUpdate: number;
    } | null;
  };
  routing: {
    buy: RoutingDecision;
    sell: RoutingDecision;
  };
}

export class AggregationProcessor extends EventEmitter {
  private orderbookCache: Map<string, Orderbook> = new Map();
  private readonly CACHE_TTL = 60; // 60 seconds
  private readonly ROUTING_TTL = 1; // 1 second for ultra-fresh routing
  private readonly PUBLISH_THROTTLE_MS = 50; // Publish at most every 50ms
  private lastPublishTime: Map<string, number> = new Map();

  constructor() {
    super();
    logger.info('AggregationProcessor initialized');
  }

  /**
   * Update orderbook cache and trigger aggregation
   */
  async processOrderbookUpdate(orderbook: Orderbook): Promise<void> {
    const key = this.getCacheKey(orderbook.symbol, orderbook.exchange);
    this.orderbookCache.set(key, orderbook);

    // Trigger aggregation for this symbol (with throttling)
    await this.aggregateAndPublish(orderbook.symbol);
  }

  /**
   * Main aggregation logic - merges orderbooks from both exchanges
   */
  private async aggregateAndPublish(symbol: string): Promise<void> {
    // Throttle publishing to avoid overwhelming Redis
    const lastPublish = this.lastPublishTime.get(symbol) || 0;
    const now = Date.now();
    if (now - lastPublish < this.PUBLISH_THROTTLE_MS) {
      return;
    }
    this.lastPublishTime.set(symbol, now);

    const hlBook = this.orderbookCache.get(this.getCacheKey(symbol, 'hyperliquid'));
    const asterBook = this.orderbookCache.get(this.getCacheKey(symbol, 'aster'));
    const lighterBook = this.orderbookCache.get(this.getCacheKey(symbol, 'lighter'));
    const avantisBook = this.orderbookCache.get(this.getCacheKey(symbol, 'avantis'));

    // Need at least one book to continue
    if (!hlBook && !asterBook && !lighterBook && !avantisBook) {
      logger.warn(`No orderbook data available for ${symbol}`);
      return;
    }

    try {
      // Merge orderbooks
      const aggregated = this.mergeOrderbooks(symbol, hlBook, asterBook, lighterBook, avantisBook);

      // Calculate routing
      aggregated.routing = this.calculateRouting(aggregated);

      // Publish to Redis Pub/Sub for SSE streaming
      await this.publishToRedis(symbol, aggregated);

      // Cache in Redis for REST API
      await this.cacheInRedis(symbol, aggregated);

      // Emit event
      this.emit('aggregated', aggregated);

      logger.debug(`Aggregated orderbook published: ${symbol}`);
    } catch (error) {
      logger.error(`Failed to aggregate orderbook for ${symbol}:`, error);
    }
  }

  /**
   * Merge orderbooks from multiple exchanges
   */
  private mergeOrderbooks(
    symbol: string,
    hlBook: Orderbook | undefined,
    asterBook: Orderbook | undefined,
    lighterBook: Orderbook | undefined,
    avantisBook: Orderbook | undefined
  ): AggregatedOrderbook {
    const timestamp = Date.now();

    // Merge bids
    const aggregatedBids = this.mergeLevels(
      hlBook?.bids.levels || [],
      asterBook?.bids.levels || [],
      lighterBook?.bids.levels || [],
      avantisBook?.bids.levels || [],
      'bid'
    );

    // Merge asks
    const aggregatedAsks = this.mergeLevels(
      hlBook?.asks.levels || [],
      asterBook?.asks.levels || [],
      lighterBook?.asks.levels || [],
      avantisBook?.asks.levels || [],
      'ask'
    );

    // Calculate best bid/ask
    const bestBid = aggregatedBids[0];
    const bestAsk = aggregatedAsks[0];

    // Calculate spread
    const spreadValue = bestAsk && bestBid ? bestAsk.price - bestBid.price : 0;
    const spreadPercentage = bestBid && bestBid.price > 0
      ? (spreadValue / bestBid.price) * 100
      : 0;

    return {
      symbol,
      timestamp,
      aggregated: {
        bids: aggregatedBids,
        asks: aggregatedAsks,
        spread: {
          value: spreadValue,
          percentage: spreadPercentage,
        },
        bestBid: bestBid
          ? {
              price: bestBid.price,
              platform: bestBid.sources[0].platform,
              size: bestBid.sources[0].size,
            }
          : { price: 0, platform: 'hyperliquid', size: 0 },
        bestAsk: bestAsk
          ? {
              price: bestAsk.price,
              platform: bestAsk.sources[0].platform,
              size: bestAsk.sources[0].size,
            }
          : { price: 0, platform: 'hyperliquid', size: 0 },
      },
      sources: {
        hyperliquid: hlBook
          ? {
              bids: hlBook.bids.levels.slice(0, 20).map(l => ({
                price: parseFloat(l.price),
                size: parseFloat(l.size),
              })),
              asks: hlBook.asks.levels.slice(0, 20).map(l => ({
                price: parseFloat(l.price),
                size: parseFloat(l.size),
              })),
              lastUpdate: hlBook.timestamp,
            }
          : null,
        aster: asterBook
          ? {
              bids: asterBook.bids.levels.slice(0, 20).map(l => ({
                price: parseFloat(l.price),
                size: parseFloat(l.size),
              })),
              asks: asterBook.asks.levels.slice(0, 20).map(l => ({
                price: parseFloat(l.price),
                size: parseFloat(l.size),
              })),
              lastUpdate: asterBook.timestamp,
            }
          : null,
        lighter: lighterBook
          ? {
              bids: lighterBook.bids.levels.slice(0, 20).map(l => ({
                price: parseFloat(l.price),
                size: parseFloat(l.size),
              })),
              asks: lighterBook.asks.levels.slice(0, 20).map(l => ({
                price: parseFloat(l.price),
                size: parseFloat(l.size),
              })),
              lastUpdate: lighterBook.timestamp,
            }
          : null,
        avantis: avantisBook
          ? {
              bids: avantisBook.bids.levels.slice(0, 20).map(l => ({
                price: parseFloat(l.price),
                size: parseFloat(l.size),
              })),
              asks: avantisBook.asks.levels.slice(0, 20).map(l => ({
                price: parseFloat(l.price),
                size: parseFloat(l.size),
              })),
              lastUpdate: avantisBook.timestamp,
            }
          : null,
      },
      routing: {
        buy: { platform: 'hyperliquid', price: 0, reason: '', savings: 0, savingsPercent: 0 },
        sell: { platform: 'hyperliquid', price: 0, reason: '', savings: 0, savingsPercent: 0 },
      },
    };
  }

  /**
   * Merge price levels from multiple sources
   */
  private mergeLevels(
    hlLevels: Array<{ price: string; size: string }>,
    asterLevels: Array<{ price: string; size: string }>,
    lighterLevels: Array<{ price: string; size: string }>,
    avantisLevels: Array<{ price: string; size: string }>,
    side: 'bid' | 'ask'
  ): AggregatedLevel[] {
    const priceMap = new Map<number, SourceLevel[]>();

    // Helper function to normalize prices to 2 decimal places
    // This ensures prices like 180.520 and 180.52 are treated as the same
    const normalizePrice = (price: number): number => {
      return Math.round(price * 100) / 100;
    };

    // Add Hyperliquid levels
    hlLevels.forEach(level => {
      const rawPrice = parseFloat(level.price);
      const price = normalizePrice(rawPrice);
      const size = parseFloat(level.size);

      if (!priceMap.has(price)) {
        priceMap.set(price, []);
      }
      priceMap.get(price)!.push({ platform: 'hyperliquid', size });
    });

    // Add Aster levels
    asterLevels.forEach(level => {
      const rawPrice = parseFloat(level.price);
      const price = normalizePrice(rawPrice);
      const size = parseFloat(level.size);

      if (!priceMap.has(price)) {
        priceMap.set(price, []);
      }
      priceMap.get(price)!.push({ platform: 'aster', size });
    });

    // Add Lighter levels
    lighterLevels.forEach(level => {
      const rawPrice = parseFloat(level.price);
      const price = normalizePrice(rawPrice);
      const size = parseFloat(level.size);

      if (!priceMap.has(price)) {
        priceMap.set(price, []);
      }
      priceMap.get(price)!.push({ platform: 'lighter', size });
    });

    // Add Avantis levels
    avantisLevels.forEach(level => {
      const rawPrice = parseFloat(level.price);
      const price = normalizePrice(rawPrice);
      const size = parseFloat(level.size);

      if (!priceMap.has(price)) {
        priceMap.set(price, []);
      }
      priceMap.get(price)!.push({ platform: 'avantis', size });
    });

    // Convert to aggregated levels
    const aggregated = Array.from(priceMap.entries()).map(([price, sources]) => ({
      price,
      totalSize: sources.reduce((sum, s) => sum + s.size, 0),
      sources,
    }));

    // Sort: bids descending, asks ascending
    aggregated.sort((a, b) => (side === 'bid' ? b.price - a.price : a.price - b.price));

    // Return top 50 levels
    return aggregated.slice(0, 50);
  }

  /**
   * Calculate smart routing recommendations
   */
  private calculateRouting(aggregated: AggregatedOrderbook): {
    buy: RoutingDecision;
    sell: RoutingDecision;
  } {
    const hlSource = aggregated.sources.hyperliquid;
    const asterSource = aggregated.sources.aster;
    const lighterSource = aggregated.sources.lighter;
    const avantisSource = aggregated.sources.avantis;

    // Get best prices from each exchange
    const hlBestAsk = hlSource?.asks[0]?.price || Infinity;
    const asterBestAsk = asterSource?.asks[0]?.price || Infinity;
    const lighterBestAsk = lighterSource?.asks[0]?.price || Infinity;
    const avantisBestAsk = avantisSource?.asks[0]?.price || Infinity;
    const hlBestBid = hlSource?.bids[0]?.price || 0;
    const asterBestBid = asterSource?.bids[0]?.price || 0;
    const lighterBestBid = lighterSource?.bids[0]?.price || 0;
    const avantisBestBid = avantisSource?.bids[0]?.price || 0;

    // Calculate buy routing (best ask)
    let buyPlatform: 'hyperliquid' | 'aster' | 'lighter' | 'avantis' = 'hyperliquid';
    let buyPrice = hlBestAsk;
    if (asterBestAsk < buyPrice) {
      buyPlatform = 'aster';
      buyPrice = asterBestAsk;
    }
    if (lighterBestAsk < buyPrice) {
      buyPlatform = 'lighter';
      buyPrice = lighterBestAsk;
    }
    if (avantisBestAsk < buyPrice) {
      buyPlatform = 'avantis';
      buyPrice = avantisBestAsk;
    }
    const avgOtherAsk = (hlBestAsk + asterBestAsk + lighterBestAsk + avantisBestAsk - buyPrice) / 3;
    const buySavings = Math.abs(avgOtherAsk - buyPrice);
    const buySavingsPercent = buyPrice > 0 ? (buySavings / buyPrice) * 100 : 0;

    // Calculate sell routing (best bid)
    let sellPlatform: 'hyperliquid' | 'aster' | 'lighter' | 'avantis' = 'hyperliquid';
    let sellPrice = hlBestBid;
    if (asterBestBid > sellPrice) {
      sellPlatform = 'aster';
      sellPrice = asterBestBid;
    }
    if (lighterBestBid > sellPrice) {
      sellPlatform = 'lighter';
      sellPrice = lighterBestBid;
    }
    if (avantisBestBid > sellPrice) {
      sellPlatform = 'avantis';
      sellPrice = avantisBestBid;
    }
    const avgOtherBid = (hlBestBid + asterBestBid + lighterBestBid + avantisBestBid - sellPrice) / 3;
    const sellSavings = Math.abs(sellPrice - avgOtherBid);
    const sellSavingsPercent = sellPrice > 0 ? (sellSavings / sellPrice) * 100 : 0;

    return {
      buy: {
        platform: buyPlatform,
        price: buyPrice,
        reason: `Best ask price${buySavings > 0 ? ` (${buySavingsPercent.toFixed(3)}% better)` : ''}`,
        savings: buySavings,
        savingsPercent: buySavingsPercent,
      },
      sell: {
        platform: sellPlatform,
        price: sellPrice,
        reason: `Best bid price${sellSavings > 0 ? ` (${sellSavingsPercent.toFixed(3)}% better)` : ''}`,
        savings: sellSavings,
        savingsPercent: sellSavingsPercent,
      },
    };
  }

  /**
   * Publish to Redis Pub/Sub for SSE streaming
   */
  private async publishToRedis(symbol: string, data: AggregatedOrderbook): Promise<void> {
    const channel = `aggregated:book:${symbol}`;
    const message = JSON.stringify({
      channel,
      data,
      timestamp: Date.now(),
    });

    await redisClient.publish(channel, message);
    logger.debug(`Published aggregated book to ${channel}`);
  }

  /**
   * Cache in Redis for REST API
   */
  private async cacheInRedis(symbol: string, data: AggregatedOrderbook): Promise<void> {
    // Cache full aggregated book (60s TTL)
    await redisClient.set(
      `agg:book:${symbol}`,
      JSON.stringify(data),
      this.CACHE_TTL
    );

    // Cache routing separately (1s TTL for ultra-fresh routing)
    await redisClient.set(
      `agg:routing:${symbol}`,
      JSON.stringify(data.routing),
      this.ROUTING_TTL
    );

    logger.debug(`Cached aggregated data for ${symbol}`);
  }

  /**
   * Get cache key for orderbook
   */
  private getCacheKey(symbol: string, exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis'): string {
    return `${exchange}:${symbol}`;
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      cachedOrderbooks: this.orderbookCache.size,
      symbols: Array.from(
        new Set(
          Array.from(this.orderbookCache.keys()).map(key => key.split(':')[1])
        )
      ),
    };
  }

  /**
   * Stop processor
   */
  stop(): void {
    this.orderbookCache.clear();
    this.lastPublishTime.clear();
    logger.info('AggregationProcessor stopped');
  }
}

export const aggregationProcessor = new AggregationProcessor();
