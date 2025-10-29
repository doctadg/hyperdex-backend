import { ethers } from 'ethers';
import WebSocket from 'ws';
import fetch from 'node-fetch';
import { BaseExchangeClient } from './base';
import { exchangeConfig } from '@/config/exchanges';
import { OrderbookSnapshot, Trade } from '@/types';
import { 
  IPerpetualAdapter,
  PlaceOrderRequest, 
  OrderResponse, 
  CancelResponse,
  Order,
  Position,
  Balance,
  Ticker,
  OrderSide,
  OrderStatus,
  OrderType,
  PositionSide,
  MarginMode,
} from '@/types/trades';
import { Orderbook } from '@/types/orderbook';
import { logger } from '@/utils/logger';

// ============= HYPERLIQUID-SPECIFIC TYPES =============

interface HLMeta {
  universe: Array<{ name: string; szDecimals: number }>;
}

interface HLClearinghouseState {
  assetPositions: Array<{
    position: {
      coin: string;
      szi: string;
      entryPx: string | null;
      markPx: string;
      unrealizedPnl: string;
      leverage: { value: number; type: 'cross' | 'isolated' };
    };
  }>;
  marginSummary: { accountValue: string };
  withdrawable: string;
}

interface HLOpenOrder {
  oid: number;
  coin: string;
  side: 'B' | 'A';
  limitPx: string;
  sz: string;
  timestamp: number;
}

interface HLAssetCtx {
  coin: string;
  markPx: string;
  dayNtlVlm: string;
  funding: string;
}

interface HLL2Book {
  coin: string;
  levels: [[{ px: string; sz: string; n: number }[]], [{ px: string; sz: string; n: number }[]]];
  time: number;
}

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
      side: tradeData.side === 'buy' ? OrderSide.BUY : OrderSide.SELL,  
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

export class HyperliquidTradingAdapter implements IPerpetualAdapter {
  readonly id = 'hyperliquid';
  readonly name = 'Hyperliquid';
  
  private wallet: ethers.Wallet;
  private baseUrl: string;
  private isTestnet: boolean;
  
  private symbolToIndex = new Map<string, number>();
  private indexToSymbol = new Map<number, string>();
  private assetMetadata = new Map<string, { universe: number; szDecimals: number }>(); // ADDED
  private metadata?: HLMeta;

  constructor(config: { privateKey: string; isTestnet?: boolean }) {
    this.wallet = new ethers.Wallet(config.privateKey);
    this.isTestnet = config.isTestnet ?? false;
    this.baseUrl = 'https://api.hyperliquid.xyz';
    
    logger.info(`Hyperliquid trading adapter initialized for ${this.isTestnet ? 'TESTNET' : 'MAINNET'}`);
  }

  async initialize(): Promise<void> {
    try {
      logger.info('Initializing Hyperliquid trading adapter...');
      const meta = await this.infoRequest<HLMeta>({ type: 'meta' });
      this.metadata = meta;
      
      meta.universe.forEach((asset, index) => {
        this.symbolToIndex.set(asset.name, index);
        this.indexToSymbol.set(index, asset.name);
        // ADD THIS - Store full metadata
        this.assetMetadata.set(asset.name, {
          universe: index,
          szDecimals: asset.szDecimals,
        });
      });
      
      logger.info(`✓ Loaded metadata for ${this.symbolToIndex.size} symbols`);
      logger.info(`✓ Asset metadata populated: ${this.assetMetadata.size} assets`); // ADD THIS
    } catch (error) {
      logger.error('Failed to initialize:', error);
      throw error;
    }
  }


  getAddress(): string {
    return this.wallet.address;
  }

  getSymbols(): string[] {
    return Array.from(this.symbolToIndex.keys());
  }

  private async infoRequest<T>(payload: any): Promise<T> {
    try {
      const response = await fetch(`${this.baseUrl}/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Info API ${response.status}: ${response.statusText}`);
      }

      return await response.json() as T;
    } catch (error) {
      logger.error('Info API request failed:', error);
      throw error;
    }
  }

  private async exchangeRequest(action: any, nonce: number, signature: { r: string; s: string; v: number }): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/exchange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action, 
          nonce, 
          signature,
          vaultAddress: null,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Exchange API ${response.status}: ${text}`);
      }

      return await response.json();
    } catch (error) {
      logger.error('Exchange API request failed:', error);
      throw error;
    }
  }

  private async signL1Action(action: any, nonce: number): Promise<{ r: string; s: string; v: number }> {
    try {
      const payload = {
        action,
        vaultAddress: null,
        nonce,
      };

      // Simple: just sign the JSON payload
      const message = JSON.stringify(payload);
      const messageHash = ethers.hashMessage(message);
      
      // Sign using personal_sign (EIP-191)
      const signature = await this.wallet.signMessage(message);
      const sig = ethers.Signature.from(signature);

      logger.info('✓ Signature created');
      logger.info(`   Wallet: ${this.wallet.address}`);
      logger.info(`   Message: ${message.slice(0, 100)}...`);

      return {
        r: sig.r,
        s: sig.s,
        v: sig.v,
      };
    } catch (error) {
      logger.error('Failed to sign L1 action:', error);
      throw error;
    }
  }

  async placeOrder(request: PlaceOrderRequest): Promise<OrderResponse> {
    try {
      logger.info('Placing order:', request);
      
      // Get asset metadata
      const assetInfo = this.assetMetadata.get(request.symbol);
      if (!assetInfo) {
        throw new Error(`Unknown symbol: ${request.symbol}. Asset metadata not loaded.`);
      }

      // Format size with correct decimals
      const szDecimals = assetInfo.szDecimals || 5;
      const formattedSize = parseFloat(request.quantity).toFixed(szDecimals);

      // Map TimeInForce to Hyperliquid format
      let tif: { tif: string };
      if (request.timeInForce === 'POST_ONLY') {
        tif = { tif: 'Alo' }; // Alo = Add Liquidity Only (POST_ONLY)
      } else {
        tif = { tif: 'Gtc' }; // Default: Good Till Cancel
      }

      // Build order
      const order = {
        a: assetInfo.universe,           // Asset index
        b: request.side === 'BUY',        // true = buy, false = sell
        p: request.price || '0',          // Price as string
        s: formattedSize,                 // Size with correct decimals
        r: request.reduceOnly || false,   // Reduce only flag
        t: { limit: tif },
      };

      const action = {
        type: 'order',
        orders: [order],
        grouping: 'na',
      };

      const nonce = Date.now();
      const signature = await this.signL1Action(action, nonce);

      // Send request
      const result = await this.exchangeRequest(action, nonce, signature);

      logger.info('Order placed successfully:', result);

      // Parse response
      const status = result?.response?.data?.statuses?.[0];
      const orderId = status?.resting?.oid?.toString() || nonce.toString();

      return {
        orderId,
        status: 'OPEN' as OrderStatus,
        symbol: request.symbol,
        side: request.side,
        type: request.type,
        price: request.price || '0',
        quantity: formattedSize,
        filledQuantity: '0',
        timestamp: nonce,
      };
    } catch (error) {
      logger.error('Failed to place order:', error);
      throw error;
    }
  }

  async cancelOrder(orderId: string, symbol: string): Promise<CancelResponse> {
    try {
      const assetIndex = this.symbolToIndex.get(symbol);
      if (assetIndex === undefined) {
        throw new Error(`Unknown symbol: ${symbol}`);
      }

      const action = {
        type: 'cancel',
        cancels: [{ a: assetIndex, o: parseInt(orderId) }],
      };

      const nonce = Date.now();
      const signature = await this.signL1Action(action, nonce);
      await this.exchangeRequest(action, nonce, signature);
      
      return { orderId, symbol, status: 'SUCCESS' };
    } catch (error) {
      logger.error('Failed to cancel order:', error);
      throw error;
    }
  }


  async getOpenOrders(): Promise<Order[]> {
    try {
      logger.debug('Fetching open orders');
      
      const response = await this.infoRequest<any>({
        type: 'openOrders',
        user: this.wallet.address,
      });
      
      // Hyperliquid returns an array directly or wrapped in response
      const orders = Array.isArray(response) ? response : (response.orders || []);
      
      logger.debug(`Received ${orders.length} open orders from Hyperliquid`);
      
      if (orders.length === 0) {
        return [];
      }
      
      return orders.map((o: HLOpenOrder) => ({
        orderId: o.oid.toString(),
        symbol: o.coin,
        side: o.side === 'B' ? 'BUY' as OrderSide : 'SELL' as OrderSide,
        type: 'LIMIT' as OrderType,
        status: 'OPEN' as OrderStatus,
        price: o.limitPx,
        quantity: o.sz,
        timestamp: o.timestamp,
      }));
    } catch (error) {
      logger.error('Failed to get orders:', error);
      
      // If it's a 422 error with no orders, return empty array
      if (error instanceof Error && error.message.includes('422')) {
        logger.info('No open orders (422 response)');
        return [];
      }
      
      throw error;
    }
  }

  async getPositions(): Promise<Position[]> {
    try {
      const state = await this.infoRequest<HLClearinghouseState>({
        type: 'clearinghouseState',
        user: this.wallet.address,
      });
      
      return state.assetPositions
        .filter(ap => parseFloat(ap.position.szi) !== 0)
        .map(ap => {
          const szi = parseFloat(ap.position.szi);
          return {
            symbol: ap.position.coin,
            exchange: 'hyperliquid' as const,
            walletAddress: this.getAddress(),
            side: szi > 0 ? 'LONG' as PositionSide : 'SHORT' as PositionSide,
            size: Math.abs(szi).toString(),
            entryPrice: ap.position.entryPx || '0',
            markPrice: ap.position.markPx,
            unrealizedPnl: ap.position.unrealizedPnl,
            leverage: ap.position.leverage.value,
            marginMode: ap.position.leverage.type === 'cross' ? 'CROSS' as MarginMode : 'ISOLATED' as MarginMode,
            timestamp: Date.now(),
          };
        });
    } catch (error) {
      logger.error('Failed to get positions:', error);
      throw error;
    }
  }

  async getBalances(): Promise<Balance[]> {
    try {
      const state = await this.infoRequest<HLClearinghouseState>({
        type: 'clearinghouseState',
        user: this.wallet.address,
      });
      
      return [{
        asset: 'USDC',
        free: state.withdrawable,
        total: state.marginSummary.accountValue,
      }];
    } catch (error) {
      logger.error('Failed to get balances:', error);
      throw error;
    }
  }

  async getTicker(symbol: string): Promise<Ticker> {
    try {
      const mids = await this.infoRequest<Record<string, string>>({ type: 'allMids' });
      
      if (!mids[symbol]) {
        throw new Error(`Symbol not found: ${symbol}`);
      }
      
      try {
        const response = await this.infoRequest<any>({ type: 'metaAndAssetCtxs' });
        const contexts = response[1] as HLAssetCtx[];
        const ctx = contexts.find(c => c.coin === symbol);
        
        if (ctx) {
          return {
            symbol,
            exchange: 'hyperliquid' as const,
            markPrice: ctx.markPx,
            volume24h: ctx.dayNtlVlm,
            fundingRate: ctx.funding,
            timestamp: Date.now(),
          };
        }
      } catch (e) {
        // Fallback to mid price
      }
      
      return {
        symbol,
        exchange: 'hyperliquid' as const,
        markPrice: mids[symbol],
        volume24h: '0',
        timestamp: Date.now(),
      };
    } catch (error) {
      logger.error('Failed to get ticker:', error);
      throw error;
    }
  }

  async getOrderbook(symbol: string): Promise<Orderbook> {
    try {
      const book = await this.infoRequest<HLL2Book>({ type: 'l2Book', coin: symbol });
      
      const levels = book.levels || [[], []];
      const bidsArray = (Array.isArray(levels[0]) ? levels[0] : []) as Array<{ px: string; sz: string; n: number }>;
      const asksArray = (Array.isArray(levels[1]) ? levels[1] : []) as Array<{ px: string; sz: string; n: number }>;
      
      const bidLevels = bidsArray.slice(0, 20).map(b => ({
        price: b.px,
        size: b.sz,
        timestamp: book.time || Date.now(),
      }));
      
      const askLevels = asksArray.slice(0, 20).map(a => ({
        price: a.px,
        size: a.sz,
        timestamp: book.time || Date.now(),
      }));
      
      const bidTotalSize = bidLevels.reduce((sum, l) => sum + parseFloat(l.size), 0);
      const askTotalSize = askLevels.reduce((sum, l) => sum + parseFloat(l.size), 0);
      
      const bestBid = bidLevels[0] ? parseFloat(bidLevels[0].price) : 0;
      const bestAsk = askLevels[0] ? parseFloat(askLevels[0].price) : 0;
      const spread = bestAsk - bestBid;
      const midPrice = (bestBid + bestAsk) / 2;
      
      return {
        symbol,
        exchange: 'hyperliquid',
        bids: {
          levels: bidLevels,
          totalSize: bidTotalSize.toString(),
        },
        asks: {
          levels: askLevels,
          totalSize: askTotalSize.toString(),
        },
        timestamp: book.time || Date.now(),
        sequence: 0,
        spread: spread.toString(),
        midPrice: midPrice.toString(),
      };
    } catch (error) {
      logger.error('Failed to get orderbook:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    logger.info('Disconnecting trading adapter');
  }
}