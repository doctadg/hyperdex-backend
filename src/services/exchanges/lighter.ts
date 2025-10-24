import { BaseExchangeClient } from './base';
import { exchangeConfig } from '@/config/exchanges';
import { OrderbookSnapshot, Trade } from '@/types';
import { logger } from '@/utils/logger';

interface LighterOrderBookUpdate {
  channel: string;
  offset: number;
  order_book: {
    code: number;
    asks: Array<{
      price: string;
      size: string;
    }>;
    bids: Array<{
      price: string;
      size: string;
    }>;
    offset: number;
  };
  type: string;
}

interface LighterTrade {
  trade_id: number;
  tx_hash: string;
  type: string;
  market_id: number;
  size: string;
  price: string;
  usd_amount: string;
  ask_id: number;
  bid_id: number;
  ask_account_id: number;
  bid_account_id: number;
  is_maker_ask: boolean;
  block_height: number;
  timestamp: number;
}

interface LighterMarketStats {
  channel: string;
  market_stats: {
    market_id: number;
    index_price: string;
    mark_price: string;
    open_interest: string;
    last_trade_price: string;
    current_funding_rate: string;
    funding_rate: string;
    funding_timestamp: number;
    daily_base_token_volume: number;
    daily_quote_token_volume: number;
    daily_price_low: number;
    daily_price_high: number;
    daily_price_change: number;
  };
  type: string;
}

interface LighterMessage {
  channel?: string;
  type?: string;
  trades?: LighterTrade[];
  order_book?: any;
  market_stats?: any;
  offset?: number;
}

// Map common symbols to Lighter market indices
const MARKET_INDEX_MAP: Record<string, number> = {
  'BTC': 1,  // Swapped with ETH - was 0
  'ETH': 0,  // Swapped with BTC - was 1
  'SOL': 2,
  'HYPE': 3,
  'TRUMP': 4,
  // Add more mappings as needed
};

// Reverse mapping for market index to symbol
const INDEX_TO_SYMBOL_MAP: Record<number, string> = Object.entries(MARKET_INDEX_MAP).reduce(
  (acc, [symbol, index]) => {
    acc[index] = symbol;
    return acc;
  },
  {} as Record<number, string>
);

export class LighterClient extends BaseExchangeClient {
  private subscribedMarkets: Set<number> = new Set();
  private symbolToMarketIndex: Map<string, number> = new Map();
  private pingInterval: NodeJS.Timeout | null = null;

  constructor() {
    super('Lighter', exchangeConfig.lighter.wsUrl);

    // Initialize symbol to market index mapping
    Object.entries(MARKET_INDEX_MAP).forEach(([symbol, index]) => {
      this.symbolToMarketIndex.set(symbol, index);
    });
  }

  async connect(): Promise<void> {
    await this.createWebSocket();
  }

  async disconnect(): Promise<void> {
    this.stopHeartbeat();
    this.stopPingInterval();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.isConnected = false;
    this.isConnecting = false;
    this.subscriptions.clear();
    this.subscribedMarkets.clear();
  }

  async subscribe(symbols: string[]): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Lighter client not connected');
    }

    for (const symbol of symbols) {
      const marketIndex = this.symbolToMarketIndex.get(symbol) ?? MARKET_INDEX_MAP[symbol];

      if (marketIndex === undefined) {
        logger.warn(`Lighter: Unknown symbol ${symbol}, skipping`);
        continue;
      }

      // Subscribe to order book
      this.sendMessage({
        type: 'subscribe',
        channel: `order_book/${marketIndex}`,
      });

      // Subscribe to trades
      this.sendMessage({
        type: 'subscribe',
        channel: `trade/${marketIndex}`,
      });

      // Subscribe to market stats
      this.sendMessage({
        type: 'subscribe',
        channel: `market_stats/${marketIndex}`,
      });

      this.subscribedMarkets.add(marketIndex);
      this.subscriptions.add(symbol);

      logger.info(`Lighter subscribed to symbol: ${symbol} (market ${marketIndex})`);
    }
  }

  async unsubscribe(symbols: string[]): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Lighter client not connected');
    }

    for (const symbol of symbols) {
      const marketIndex = this.symbolToMarketIndex.get(symbol) ?? MARKET_INDEX_MAP[symbol];

      if (marketIndex === undefined) {
        continue;
      }

      // Unsubscribe from order book
      this.sendMessage({
        type: 'unsubscribe',
        channel: `order_book/${marketIndex}`,
      });

      // Unsubscribe from trades
      this.sendMessage({
        type: 'unsubscribe',
        channel: `trade/${marketIndex}`,
      });

      // Unsubscribe from market stats
      this.sendMessage({
        type: 'unsubscribe',
        channel: `market_stats/${marketIndex}`,
      });

      this.subscribedMarkets.delete(marketIndex);
      this.subscriptions.delete(symbol);

      logger.info(`Lighter unsubscribed from symbol: ${symbol} (market ${marketIndex})`);
    }
  }

  sendHeartbeat(): void {
    // Lighter doesn't require explicit heartbeat/ping messages
    // The connection is maintained automatically
  }

  private startPingInterval(): void {
    this.stopPingInterval();
    // Send a ping every 30 seconds to keep connection alive
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, 30000);
  }

  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  protected handleMessage(message: LighterMessage): void {
    try {
      // Handle different message types based on channel
      if (message.channel) {
        const channelParts = message.channel.split(':');
        if (channelParts.length < 1) return;

        const channelType = channelParts[0];

        switch (channelType) {
          case 'order_book':
            this.handleOrderBookUpdate(message as LighterOrderBookUpdate);
            break;
          case 'trade':
            this.handleTradeUpdate(message);
            break;
          case 'market_stats':
            this.handleMarketStats(message as LighterMarketStats);
            break;
          default:
            logger.debug(`Lighter: Unhandled channel type: ${channelType}`);
        }
      }

      // Handle subscription confirmations
      if (message.type === 'subscribed') {
        logger.debug(`Lighter: Subscription confirmed for channel`, message.channel);
      }
    } catch (error) {
      logger.error('Lighter: Error handling message:', error);
    }
  }

  private handleOrderBookUpdate(message: LighterOrderBookUpdate): void {
    try {
      // Extract market index from channel (format: "order_book:0")
      const channelParts = message.channel.split(':');
      if (channelParts.length < 2) return;

      const marketIndex = parseInt(channelParts[1]);
      const symbol = INDEX_TO_SYMBOL_MAP[marketIndex];

      if (!symbol) {
        logger.warn(`Lighter: Unknown market index ${marketIndex}`);
        return;
      }

      const orderbook: OrderbookSnapshot = {
        symbol,
        exchange: 'lighter',
        bids: message.order_book.bids.map(level => [level.price, level.size]),
        asks: message.order_book.asks.map(level => [level.price, level.size]),
        timestamp: Date.now(),
        sequence: message.order_book.offset,
      };

      this.emit('orderbook', orderbook);
    } catch (error) {
      logger.error('Lighter: Error handling order book update:', error);
    }
  }

  private handleTradeUpdate(message: LighterMessage): void {
    try {
      if (!message.trades || message.trades.length === 0) return;

      // Extract market index from channel (format: "trade:0")
      const channelParts = message.channel!.split(':');
      if (channelParts.length < 2) return;

      const marketIndex = parseInt(channelParts[1]);
      const symbol = INDEX_TO_SYMBOL_MAP[marketIndex];

      if (!symbol) {
        logger.warn(`Lighter: Unknown market index ${marketIndex}`);
        return;
      }

      const trades: Trade[] = message.trades.map(trade => ({
        id: trade.trade_id.toString(),
        symbol,
        exchange: 'lighter',
        price: trade.price,
        size: trade.size,
        side: trade.type === 'buy' ? 'buy' : 'sell',
        timestamp: trade.timestamp * 1000, // Convert to milliseconds
      }));

      this.emit('trades', trades);
    } catch (error) {
      logger.error('Lighter: Error handling trade update:', error);
    }
  }

  private handleMarketStats(message: LighterMarketStats): void {
    try {
      const marketIndex = message.market_stats.market_id;
      const symbol = INDEX_TO_SYMBOL_MAP[marketIndex];

      if (!symbol) {
        logger.warn(`Lighter: Unknown market index ${marketIndex}`);
        return;
      }

      // Emit market stats for potential future use
      this.emit('marketStats', {
        symbol,
        exchange: 'lighter',
        indexPrice: message.market_stats.index_price,
        markPrice: message.market_stats.mark_price,
        lastPrice: message.market_stats.last_trade_price,
        openInterest: message.market_stats.open_interest,
        fundingRate: message.market_stats.funding_rate,
        volume24h: message.market_stats.daily_quote_token_volume,
        high24h: message.market_stats.daily_price_high,
        low24h: message.market_stats.daily_price_low,
        priceChange24h: message.market_stats.daily_price_change,
        timestamp: Date.now(),
      });
    } catch (error) {
      logger.error('Lighter: Error handling market stats:', error);
    }
  }

  public async requestOrderbookSnapshot(symbol: string): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Lighter client not connected');
    }

    const marketIndex = this.symbolToMarketIndex.get(symbol) ?? MARKET_INDEX_MAP[symbol];

    if (marketIndex === undefined) {
      throw new Error(`Unknown symbol: ${symbol}`);
    }

    // Resubscribe to get fresh snapshot
    this.sendMessage({
      type: 'subscribe',
      channel: `order_book/${marketIndex}`,
    });
  }

  public async requestRecentTrades(symbol: string): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Lighter client not connected');
    }

    const marketIndex = this.symbolToMarketIndex.get(symbol) ?? MARKET_INDEX_MAP[symbol];

    if (marketIndex === undefined) {
      throw new Error(`Unknown symbol: ${symbol}`);
    }

    // Subscribe to trades channel
    this.sendMessage({
      type: 'subscribe',
      channel: `trade/${marketIndex}`,
    });
  }
}