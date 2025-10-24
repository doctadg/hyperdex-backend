import { BaseExchangeClient } from './base';
import { exchangeConfig } from '@/config/exchanges';
import { OrderbookSnapshot, OrderbookDiff, Trade, Ticker } from '@/types';
import { logger } from '@/utils/logger';

interface HyperliquidMessage {
  method?: string;
  channel?: string;
  subscription?: string;
  data?: unknown;
}

interface HyperliquidOrderbookData {
  coin: string;
  levels: [[string, string][], [string, string][]];
  time?: number;
}

interface HyperliquidTradeData {
  coin: string;
  side: 'buy' | 'sell';
  px: string;
  sz: string;
  time: number;
  hash: string;
}

interface HyperliquidAllTradesData {
  trades: HyperliquidTradeData[];
}

export class HyperliquidClient extends BaseExchangeClient {
  private subscriptionId = 0;
  private subscribedSymbols: string[] = [];
  private subscribedIntervals: string[] = ['1m'];

  constructor() {
    super('Hyperliquid', exchangeConfig.hyperliquid.wsUrl);
  }

  async connect(): Promise<void> {
    await this.createWebSocket();

    // Re-subscribe after reconnection
    if (this.subscribedSymbols.length > 0) {
      await this.subscribe(this.subscribedSymbols, this.subscribedIntervals);
    }
  }

  async disconnect(): Promise<void> {
    this.stopHeartbeat();
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.isConnected = false;
    this.isConnecting = false;
    this.subscriptions.clear();
  }

  async subscribe(symbols: string[], intervals: string[] = ['1m']): Promise<void> {
    if (!this.isConnected) {
      logger.warn('Hyperliquid: Cannot subscribe - not connected');
      throw new Error('Hyperliquid client not connected');
    }

    // Store subscription params for reconnection
    this.subscribedSymbols = symbols;
    this.subscribedIntervals = intervals;

    logger.info(`Hyperliquid: Starting subscription to ${symbols.length} symbols`);

    // Subscribe to all trades
    this.sendMessage({
      method: 'subscribe',
      subscription: {
        type: 'allTrades',
      },
    });

    // Subscribe to orderbook snapshots for each symbol (but skip candles to reduce load)
    for (const symbol of symbols) {
      this.subscriptions.add(symbol);

      // Request initial orderbook snapshot
      this.sendMessage({
        method: 'subscribe',
        subscription: {
          type: 'l2Book',
          coin: symbol,
        },
      });
    }

    logger.info(`Hyperliquid subscribed to ${symbols.length} symbols (orderbook + trades only)`);
  }

  async unsubscribe(symbols: string[]): Promise<void> {
    for (const symbol of symbols) {
      this.subscriptions.delete(symbol);
    }
    
    // Note: Hyperliquid doesn't have explicit unsubscribe in their API
    // We just stop processing data for these symbols
    logger.info(`Hyperliquid unsubscribed from symbols:`, symbols);
  }

  sendHeartbeat(): void {
    this.sendMessage({ method: 'ping' });
  }

  protected handleMessage(message: HyperliquidMessage): void {
    // Handle channel-based messages (new format)
    if (message.channel) {
      // Silently ignore control/response channels
      if (message.channel === 'pong' ||
          message.channel === 'error' ||
          message.channel === 'subscriptionResponse') {
        return;
      }

      if (message.channel === 'allTrades') {
        this.handleTrades(message.data as HyperliquidAllTradesData);
        return;
      }

      if (message.channel === 'l2Book') {
        this.handleOrderbook(message.data as HyperliquidOrderbookData);
        return;
      }

      if (message.channel === 'candle') {
        this.handleCandles(message.data);
        return;
      }

      logger.warn(`Hyperliquid: Unknown channel: ${message.channel}`);
      return;
    }

    // Handle method-based messages (old format / control messages)
    if (message.method === 'ping') {
      this.sendMessage({ method: 'pong' });
      return;
    }

    if (message.method === 'error') {
      logger.error('Hyperliquid error:', message.data);
      this.emit('error', message.data);
      return;
    }

    // Ignore subscription responses
    if (message.method === 'subscriptionResponse') {
      return;
    }

    // Log unexpected message format
    if (message.method || message.channel) {
      logger.warn(`Hyperliquid: Unhandled message:`, JSON.stringify(message).slice(0, 200));
    }
  }

  private handleTrades(data: HyperliquidAllTradesData): void {
    if (!data.trades) {
      logger.warn('Hyperliquid: Received trades message with no trades data');
      return;
    }

    const trades: Trade[] = data.trades.map((tradeData) => ({
      id: tradeData.hash,
      symbol: tradeData.coin,
      exchange: 'hyperliquid' as const,
      price: tradeData.px,
      size: tradeData.sz,
      side: tradeData.side,
      timestamp: tradeData.time,
    }));

    logger.info(`Hyperliquid: Processing ${trades.length} trades - first: ${trades[0]?.symbol} @ ${trades[0]?.price}`);
    this.emit('trades', trades);
  }

  private handleOrderbook(data: HyperliquidOrderbookData): void {
    if (!data.levels || !Array.isArray(data.levels) || data.levels.length < 2) {
      logger.warn('Hyperliquid: Received orderbook with invalid levels');
      return;
    }

    const [rawBids, rawAsks] = data.levels;

    // Convert Hyperliquid format {px, sz, n} to [price, size]
    // Handle both object format {px, sz} and array format [price, size]
    const bids: [string, string][] = (rawBids || []).map((level: any) => {
      if (Array.isArray(level)) {
        return [level[0], level[1]] as [string, string];
      }
      return [level.px, level.sz] as [string, string];
    });

    const asks: [string, string][] = (rawAsks || []).map((level: any) => {
      if (Array.isArray(level)) {
        return [level[0], level[1]] as [string, string];
      }
      return [level.px, level.sz] as [string, string];
    });

    const orderbookSnapshot: OrderbookSnapshot = {
      symbol: data.coin,
      exchange: 'hyperliquid',
      bids,
      asks,
      timestamp: data.time || Date.now(),
      sequence: this.subscriptionId++,
    };

    this.emit('orderbook', orderbookSnapshot);
  }

  public async requestOrderbookSnapshot(symbol: string): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Hyperliquid client not connected');
    }

    this.sendMessage({
      method: 'subscribe',
      subscription: {
        type: 'l2Book',
        coin: symbol,
      },
    });
  }

  public async requestRecentTrades(symbol: string): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Hyperliquid client not connected');
    }

    // Hyperliquid doesn't have a specific recent trades endpoint
    // We rely on the allTrades subscription
    logger.info(`Hyperliquid recent trades requested for ${symbol} - using allTrades subscription`);
  }

  private handleCandles(data: any): void {
    if (!data) {
      logger.warn('Hyperliquid: Received empty candle data');
      return;
    }

    logger.info('Hyperliquid: Received candle data:', JSON.stringify(data).slice(0, 200));

    // Hyperliquid candle data format:
    // Array of candles: [{t: timestamp, o: open, h: high, l: low, c: close, v: volume, n: numTrades}]
    const candles = Array.isArray(data) ? data : [data];

    for (const candle of candles) {
      if (!candle.t) {
        logger.warn('Hyperliquid: Skipping candle without timestamp:', candle);
        continue;
      }

      const normalizedCandle = {
        symbol: candle.s || candle.coin,
        exchange: 'hyperliquid' as const,
        interval: candle.i || '1m',
        timestamp: candle.t,
        open: candle.o,
        high: candle.h,
        low: candle.l,
        close: candle.c,
        volume: candle.v,
        numTrades: candle.n,
      };

      logger.info(`Hyperliquid: Emitting candle - ${normalizedCandle.symbol} ${normalizedCandle.interval} @ ${normalizedCandle.close}`);
      this.emit('candle', normalizedCandle);
    }
  }
}