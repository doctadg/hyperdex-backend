import { BaseExchangeClient } from './base';
import { exchangeConfig } from '@/config/exchanges';
import { OrderbookSnapshot, Trade } from '@/types';
import { logger } from '@/utils/logger';

import { 
  OrderSide,
} from '@/types/trades';

interface AvantisMessage {
  stream?: string;
  data?: unknown;
  e?: string;
  s?: string;
  U?: number;
  u?: number;
  b?: string[][];
  a?: string[][];
  E?: number;
  p?: string;
  q?: string;
  m?: boolean;
  i?: string;
}

interface AvantisTradeData {
  e: 'trade';
  E: number;
  s: string;
  p: string;
  q: string;
  m: boolean;
  i: string;
}

interface AvantisDepthData {
  e: 'depthUpdate';
  E: number;
  s: string;
  U: number;
  u: number;
  b: string[][];
  a: string[][];
}

export class AvantisClient extends BaseExchangeClient {
  private subscribedSymbols: string[] = [];
  private subscribedIntervals: string[] = ['1m'];

  constructor() {
    // Use Avantis WebSocket endpoint
    super('Avantis', exchangeConfig.avantis.wsUrl);
  }

  async connect(): Promise<void> {
    // Build combined stream URL with all subscriptions for Avantis
    if (this.subscribedSymbols.length > 0) {
      const streams: string[] = [];

      for (const symbol of this.subscribedSymbols) {
        // Add USDT suffix for Avantis perpetual futures trading pairs
        const avantisSymbol = `${symbol}USDT`.toLowerCase();
        streams.push(`${avantisSymbol}@trade`);
        streams.push(`${avantisSymbol}@depth20@100ms`);

        for (const interval of this.subscribedIntervals) {
          streams.push(`${avantisSymbol}@kline_${interval}`);
        }
      }

      // Use combined stream endpoint for Avantis (Binance-compatible)
      this.url = `${exchangeConfig.avantis.wsUrl}/stream?streams=${streams.join('/')}`;
    } else {
      // Use simple WebSocket endpoint if no streams specified
      this.url = `${exchangeConfig.avantis.wsUrl}/ws`;
    }

    await this.createWebSocket();
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
    // Store subscription params
    this.subscribedSymbols = symbols;
    this.subscribedIntervals = intervals;

    for (const symbol of symbols) {
      this.subscriptions.add(symbol);
    }

    // If already connected, we need to reconnect with new stream URL
    if (this.isConnected) {
      await this.disconnect();
      await this.connect();
    }

    logger.info(`Avantis subscribed to symbols: ${symbols.join(', ')} with intervals: ${intervals.join(', ')}`);
  }

  async unsubscribe(symbols: string[]): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Avantis client not connected');
    }

    const streams: string[] = [];

    for (const symbol of symbols) {
      // Add USDT suffix for Avantis perpetual futures trading pairs
      const avantisSymbol = `${symbol}USDT`.toLowerCase();
      streams.push(`${avantisSymbol}@trade`);
      streams.push(`${avantisSymbol}@depth20@100ms`);
      this.subscriptions.delete(symbol);
    }

    this.sendMessage({
      method: 'UNSUBSCRIBE',
      params: streams,
      id: Date.now(),
    });

    logger.info(`Avantis unsubscribed from symbols:`, symbols);
  }

  sendHeartbeat(): void {
    // Avantis's WebSocket handles ping/pong automatically
    // The server sends a ping frame every 5 minutes
    // Our base class handles the pong response in createWebSocket()
    // No explicit ping needed from client side
  }

  protected handleMessage(message: AvantisMessage): void {
    // Handle stream-based messages
    if (message.stream && message.data) {
      const streamParts = message.stream.split('@');
      if (streamParts.length >= 2) {
        const streamType = streamParts[1];
        const symbol = streamParts[0]?.toUpperCase() || '';

        if (streamType === 'trade') {
          this.handleTrade(message.data as AvantisTradeData, symbol);
        } else if (streamType && streamType.startsWith('depth')) {
          this.handleDepthUpdate(message.data as AvantisDepthData, symbol);
        } else if (streamType && streamType.startsWith('kline_')) {
          const interval = streamType.replace('kline_', '');
          this.handleKline(message.data, symbol, interval);
        }
      }
      return;
    }

    // Handle direct messages (like PONG response)
    if (message.e === 'pong') {
      return;
    }

    // Handle direct trade messages
    if (message.e === 'trade' && message.s) {
      this.handleTrade(message as AvantisTradeData, message.s);
      return;
    }

    // Handle direct depth update messages
    if (message.e === 'depthUpdate' && message.s) {
      this.handleDepthUpdate(message as AvantisDepthData, message.s);
      return;
    }

    // Handle direct kline messages
    if (message.e === 'kline' && message.s) {
      const klineData: any = (message as any).k;
      if (klineData) {
        this.handleKline({ k: klineData }, message.s, klineData.i);
      }
      return;
    }
  }

  private handleTrade(data: AvantisTradeData, symbol: string): void {
    // Remove USDT suffix to normalize symbol
    const normalizedSymbol = symbol.replace('USDT', '');

    const trade: Trade = {
      id: data.i,
      symbol: normalizedSymbol,
      exchange: 'avantis',
      price: data.p,
      size: data.q,
      // side: data.m ? 'sell' : 'buy',
      side: data.m ? OrderSide.SELL : OrderSide.BUY,
      timestamp: data.E,
    };

    this.emit('trades', [trade]);
  }

  private handleDepthUpdate(data: AvantisDepthData, symbol: string): void {
    // Remove USDT suffix to normalize symbol
    const normalizedSymbol = symbol.replace('USDT', '');

    const orderbookDiff: OrderbookSnapshot = {
      symbol: normalizedSymbol,
      exchange: 'avantis',
      bids: (data.b || []).filter(level => level.length >= 2) as [string, string][],
      asks: (data.a || []).filter(level => level.length >= 2) as [string, string][],
      timestamp: data.E,
      sequence: data.u,
    };

    this.emit('orderbook', orderbookDiff);
  }

  public async requestOrderbookSnapshot(symbol: string): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Avantis client not connected');
    }

    // Add USDT suffix for Avantis perpetual futures trading pairs
    const avantisSymbol = `${symbol}USDT`.toLowerCase();

    // Request depth snapshot
    this.sendMessage({
      method: 'SUBSCRIBE',
      params: [`${avantisSymbol}@depth20@100ms`],
      id: Date.now(),
    });
  }

  public async requestRecentTrades(symbol: string): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Avantis client not connected');
    }

    // Add USDT suffix for Avantis perpetual futures trading pairs
    const avantisSymbol = `${symbol}USDT`.toLowerCase();

    // Subscribe to trades
    this.sendMessage({
      method: 'SUBSCRIBE',
      params: [`${avantisSymbol}@trade`],
      id: Date.now(),
    });
  }

  private handleKline(data: any, symbol: string, interval: string): void {
    if (!data || !data.k) return;

    // Remove USDT suffix to normalize symbol
    const normalizedSymbol = symbol.replace('USDT', '');

    const k = data.k;
    // Avantis kline data format (Binance-compatible):
    // k: { t: openTime, T: closeTime, s: symbol, i: interval, o: open, h: high, l: low, c: close, v: volume, n: numTrades, x: isFinal }
    const normalizedCandle = {
      symbol: normalizedSymbol,
      exchange: 'avantis' as const,
      interval,
      timestamp: k.t,
      open: k.o,
      high: k.h,
      low: k.l,
      close: k.c,
      volume: k.v,
      numTrades: k.n,
      isFinal: k.x,
    };

    this.emit('candle', normalizedCandle);
  }
}
