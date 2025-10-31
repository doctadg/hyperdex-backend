import { BaseExchangeClient } from './base';
import { exchangeConfig } from '@/config/exchanges';
import { OrderbookSnapshot, Trade } from '@/types';
import { logger } from '@/utils/logger';
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
import { ethers } from 'ethers';
import fetch from 'node-fetch';
import * as ed25519 from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';
import FormData from 'form-data';  

// Set up SHA-512 for ed25519
(ed25519 as any).hashes.sha512 = (message: Uint8Array) => sha512(message);


// ============= SIGNER HELPERS =============

function hexToUint8Array(hex: string): Uint8Array {
  const hexWithoutPrefix = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(hexWithoutPrefix.length / 2);
  for (let i = 0; i < hexWithoutPrefix.length; i += 2) {
    bytes[i / 2] = parseInt(hexWithoutPrefix.substr(i, 2), 16);
  }
  return bytes;
}

function uint8ArrayToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}


// ============= WEBSOCKET MESSAGE TYPES =============

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


// ============= TRADING ADAPTER TYPES =============

interface LighterMarket {
  market_id: number;
  symbol: string;
  base_asset_id: number;
  quote_asset_id: number;
  min_order_size: string;
  tick_size: string;
}


// ============= MARKET INDEX MAPPING =============
const MARKET_INDEX_MAP: Record<string, number> = {
  'BTC': 1,
  'ETH': 0,
  'SOL': 2,
  'HYPE': 3,
  'TRUMP': 4,
};

const INDEX_TO_SYMBOL_MAP: Record<number, string> = Object.entries(MARKET_INDEX_MAP).reduce(
  (acc, [symbol, index]) => {
    acc[index] = symbol;
    return acc;
  },
  {} as Record<number, string>
);


// ============= WEBSOCKET CLIENT =============

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
        side: trade.type === 'buy' ? OrderSide.BUY : OrderSide.SELL,
        timestamp: trade.timestamp * 1000,
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

// Add market-specific decimal configuration at the top
const MARKET_DECIMALS: Record<string, { base: number; quote: number }> = {
  'ETH': { base: 6, quote: 2 },   // ETH amount: 6 decimals, price: 2 decimals
  'BTC': { base: 8, quote: 2 },   // BTC amount: 8 decimals, price: 2 decimals
  'SOL': { base: 6, quote: 2 },   // SOL amount: 6 decimals, price: 2 decimals
  'HYPE': { base: 6, quote: 2 },
  'TRUMP': { base: 6, quote: 2 },
};

// Add helper functions after MARKET_INDEX_MAP
function getMarketDecimals(symbol: string): { base: number; quote: number } {
  return MARKET_DECIMALS[symbol] || { base: 6, quote: 2 };
}

function scaleAmount(amount: number, symbol: string): number {
  const decimals = getMarketDecimals(symbol).base;
  return Math.floor(amount * Math.pow(10, decimals));
}

function scalePrice(price: number, symbol: string): number {
  const decimals = getMarketDecimals(symbol).quote;
  return Math.floor(price * Math.pow(10, decimals));
}

// ============= TRADING ADAPTER =============

export class LighterTradingAdapter implements IPerpetualAdapter {
  readonly id = 'lighter';
  readonly name = 'Lighter';
  private clientOrderIndexCounter: number = 0;
  
  private wallet: ethers.Wallet;
  private baseUrl: string;
  private isTestnet: boolean;
  private apiKeyIndex: number;
  private accountIndex?: number;
  private apiKeyPrivateKey?: string;
  
  private markets: Map<number, LighterMarket> = new Map();
  private symbolToMarketId: Map<string, number> = new Map();
  private marketIdToSymbol: Map<number, string> = new Map();

  constructor(config: { 
    privateKey: string; 
    apiKeyIndex?: number;
    isTestnet?: boolean;
  }) {
    this.wallet = new ethers.Wallet(config.privateKey);
    console.log("private key:", this.wallet)
    this.isTestnet = false;
    this.apiKeyIndex = config.apiKeyIndex ?? 2;
    this.baseUrl = this.isTestnet 
      ? 'https://testnet.zklighter.elliot.ai'
      : 'https://mainnet.zklighter.elliot.ai';
    
    this.apiKeyPrivateKey = process.env.LIGHTER_API_KEY_PRIVATE_KEY;
    
    logger.info(`Lighter trading adapter initialized for ${this.isTestnet ? 'TESTNET' : 'MAINNET'}`);
    
    if (!this.apiKeyPrivateKey) {
      logger.warn('⚠️  LIGHTER_API_KEY_PRIVATE_KEY not set - trading disabled');
    }
  }

  async initialize(): Promise<void> {
    try {
      logger.info('Initializing Lighter trading adapter...');
      
      await this.fetchAccountData();
      await this.fetchMarkets();
      
      logger.info(`✓ Loaded metadata for ${this.markets.size} markets`);
      logger.info(`✓ Account index: ${this.accountIndex ?? 'MOCK'}`);
    } catch (error) {
      logger.error('Failed to initialize Lighter adapter:', error);
      logger.warn('⚠️  Continuing in read-only mode');
    }
  }

  getAddress(): string {
    return this.wallet.address;
  }

  getSymbols(): string[] {
    return Array.from(this.symbolToMarketId.keys());
  }

  private async apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
    try {
      const url = `${this.baseUrl}${path}`;
      logger.debug(`Lighter API request: ${options?.method || 'GET'} ${url}`);
      
      const response = await fetch(url, {
        method: options?.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(options?.headers as Record<string, string>),
        },
        // body: options?.body,
        body: options?.body ? JSON.stringify(options.body) : undefined,
      });

      const text = await response.text();
      logger.debug(`Lighter API response [${response.status}]:`, text.substring(0, 200));

      if (!response.ok) {
        throw new Error(`Lighter API ${response.status}: ${text}`);
      }

      const data = JSON.parse(text);
      return data as T;
    } catch (error) {
      logger.error('Lighter API request failed:', error);
      throw error;
    }
  }

  private getNextClientOrderIndex(): number {
    // Use timestamp + counter to ensure uniqueness
    return (Date.now() % 1000000) + (this.clientOrderIndexCounter++ % 1000);
  }

  private async fetchAccountData(): Promise<void> {
    try {
      // Use checksum address (NOT lowercase!)
      // const addressChecksum = (this.wallet.address);
      const addressChecksum = ethers.getAddress(this.wallet.address);

      logger.debug(`Looking up account for wallet: ${addressChecksum}`);
      logger.info(`Looking up account for wallet: ${addressChecksum}`);
      
      const response = await this.apiRequest<any>(
        `/api/v1/accountsByL1Address?l1_address=${addressChecksum}`
      );
      
      logger.debug('Account lookup response:', JSON.stringify(response, null, 2));
      
      // IMPORTANT: Response uses 'sub_accounts' not 'accounts'!
      if (response.code === 200 && response.sub_accounts && response.sub_accounts.length > 0) {
        this.accountIndex = response.sub_accounts[0].index;
        const collateral = response.sub_accounts[0].collateral || '0';
        
        logger.info(`✅ Found Lighter account: index=${this.accountIndex}`);
        logger.info(`   Collateral: ${collateral} USDC`);
        logger.info(`   Account Type: ${response.sub_accounts[0].account_type === 0 ? 'Standard' : 'Isolated'}`);
        return;
      }
      
      // Check for "account not found" error code
      if (response.code === 21100 || response.code === 404) {
        throw new Error('ACCOUNT_NOT_REGISTERED');
      }
      
      throw new Error('No account found in response');
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      if (errorMsg.includes('ACCOUNT_NOT_REGISTERED') || errorMsg.includes('21100')) {
        logger.warn(`⚠️  ═══════════════════════════════════════════════════════
          ⚠️  LIGHTER ACCOUNT NOT FOUND
          ⚠️  ═══════════════════════════════════════════════════════
          ⚠️  Wallet: ${this.wallet.address}
          ⚠️  Network: ${this.isTestnet ? 'TESTNET' : 'MAINNET'}
          ⚠️  ACTION REQUIRED:
          ⚠️  1. Visit: https://${this.isTestnet ? 'testnet' : 'app'}.lighter.xyz
          ⚠️  2. Connect your wallet
          ⚠️  3. Complete account registration
          ⚠️  ═══════════════════════════════════════════════════════`
        );

        this.accountIndex = undefined;
      } else {
        logger.error('Failed to fetch Lighter account data:', error);
        logger.warn('⚠️  Continuing in read-only mode');
        this.accountIndex = undefined;
      }
    }
  }


  private async fetchMarkets(): Promise<void> {
    Object.entries(MARKET_INDEX_MAP).forEach(([symbol, marketId]) => {
      this.symbolToMarketId.set(symbol, marketId);
      this.marketIdToSymbol.set(marketId, symbol);
      
      this.markets.set(marketId, {
        market_id: marketId,
        symbol,
        base_asset_id: 0,
        quote_asset_id: 0,
        min_order_size: '0.001',
        tick_size: '0.01',
      });
    });
    
    logger.debug(`Loaded ${this.markets.size} markets`);
  }

  // ============= SIGNER METHODS =============

  private async signMessage(message: string): Promise<string> {
    if (!this.apiKeyPrivateKey) {
      throw new Error('API key private key not set');
    }
    
    // Remove 0x prefix
    let privateKeyHex = this.apiKeyPrivateKey.startsWith('0x') 
      ? this.apiKeyPrivateKey.slice(2) 
      : this.apiKeyPrivateKey;
    
    logger.debug(`Raw private key length: ${privateKeyHex.length} hex chars`);
    
    // If key is 80 hex chars (40 bytes), take the LAST 64 chars (32 bytes)
    // This removes the 8-byte padding that Lighter adds
    if (privateKeyHex.length === 80) {
      privateKeyHex = privateKeyHex.slice(-64); // Last 64 chars
      logger.debug('Extracted 32-byte key from 40-byte padded key');
    } else if (privateKeyHex.length !== 64) {
      throw new Error(
        `Unexpected private key length: ${privateKeyHex.length} hex chars. ` +
        `Expected 64 (32 bytes) or 80 (40 bytes with padding)`
      );
    }
    
    logger.debug(`Using private key: ${privateKeyHex.slice(0, 16)}... (${privateKeyHex.length} chars)`);
    
    const privateKeyBytes = hexToUint8Array(privateKeyHex);
    
    if (privateKeyBytes.length !== 32) {
      throw new Error(`Invalid key: expected 32 bytes, got ${privateKeyBytes.length}`);
    }
    
    const messageBytes = new TextEncoder().encode(message);
    const signature = await ed25519.sign(messageBytes, privateKeyBytes);
    return uint8ArrayToHex(signature);


  }

  private async createAuthToken(expirySeconds: number = 300): Promise<string | null> {
    try {
      if (!this.apiKeyPrivateKey || this.accountIndex === undefined) {
        logger.warn('⚠️  Cannot create auth token - missing API key or account');
        return null;
      }
      
      const timestamp = Math.floor(Date.now() / 1000);
      const expiry = timestamp + expirySeconds;
      
      // Create the message to sign: "account_index:expiry"
      const authMessage = `${this.accountIndex}:${expiry}`;
      
      logger.debug(`Creating auth token for account ${this.accountIndex}, expiry: ${expiry}`);
      logger.debug(`Auth message: ${authMessage}`);
      
      // Sign the message
      const signature = await this.signMessage(authMessage);
      
      // Auth token format: "signature:expiry"
      const authToken = `${signature}:${expiry}`;
      
      logger.info('✅ Auth token created successfully');
      logger.debug(`Auth token: ${signature.slice(0, 32)}...`);
      
      return authToken;
      
    } catch (error) {
      logger.error('Failed to create auth token:', error);
      return null;
    }
  }

  private async getNextNonce(): Promise<number> {
    const response = await this.apiRequest<any>(
      `/api/v1/nextNonce?account_index=${this.accountIndex}&api_key_index=${this.apiKeyIndex}`
    );
    return response?.data?.nonce || response?.nonce;
  }

  // ============= PUBLIC API METHODS =============
  async getBalances(): Promise<Balance[]> {
    try {
      if (this.accountIndex === undefined) {
        logger.warn('⚠️  No Lighter account registered');
        return [];
      }

      logger.debug(`Fetching balances for account ${this.accountIndex}`);
      
      // Use the working endpoint
      const response = await this.apiRequest<any>(
        `/api/v1/accountsByL1Address?l1_address=${this.wallet.address}`
      );
      
      if (response.code === 200 && response.sub_accounts && response.sub_accounts.length > 0) {
        const account = response.sub_accounts[0];
        
        return [{
          asset: 'USDC',
          free: account.available_balance || account.collateral || '0',
          total: account.collateral || '0',
        }];
      }
      
      return [];
    } catch (error) {
      logger.error('Failed to get balances:', error);
      return [];
    }
  }

  async getPositions(): Promise<Position[]> {
    try {
      if (this.accountIndex === undefined) {
        logger.warn('⚠️  No account registered');
        return [];
      }

      logger.debug(`Fetching positions for account ${this.accountIndex}`);
      
      const response = await this.apiRequest<any>(
        `/api/v1/accountsByL1Address?l1_address=${this.wallet.address}`
      );
      
      if (response.code === 200 && response.sub_accounts && response.sub_accounts.length > 0) {
        const account = response.sub_accounts[0];
        const positions = account.positions || [];
        
        return positions
          .filter((pos: any) => parseFloat(pos.position || '0') !== 0)
          .map((pos: any) => {
            const size = parseFloat(pos.position || '0');
            const symbol = this.marketIdToSymbol.get(pos.market_id) || `MARKET_${pos.market_id}`;
            
            return {
              symbol,
              exchange: 'lighter' as const,
              walletAddress: this.getAddress(),
              side: size > 0 ? 'LONG' as PositionSide : 'SHORT' as PositionSide,
              size: Math.abs(size).toString(),
              entryPrice: pos.avg_entry_price || '0',
              markPrice: pos.mark_price || '0',
              unrealizedPnl: pos.unrealized_pnl || '0',
              leverage: pos.leverage || 1,
              marginMode: pos.margin_mode === 0 ? 'CROSS' as MarginMode : 'ISOLATED' as MarginMode,
              timestamp: Date.now(),
            };
          });
      }
      
      return [];
    } catch (error) {
      logger.error('Failed to get positions:', error);
      return [];
    }
  }

  async getOpenOrders(): Promise<Order[]> {
    try {
      if (this.accountIndex === undefined) {
        logger.warn('⚠️  No account - returning empty orders');
        return [];
      }

      if (!this.apiKeyPrivateKey) {
        logger.warn('⚠️  API key not set - cannot fetch orders (requires authentication)');
        return [];
      }

      const authToken = await this.createAuthToken();
      if (!authToken) {
        logger.warn('⚠️  Failed to create auth token');
        return [];
      }

      const allOrders: Order[] = [];
      
      // Query each market for active orders
      for (const [symbol, marketId] of this.symbolToMarketId.entries()) {
        try {
          const response = await this.apiRequest<any>(
            `/api/v1/accountActiveOrders?account_index=${this.accountIndex}&market_id=${marketId}&auth=${authToken}`
          );
          
          const orders = response?.orders || response?.data || [];
          
          for (const order of orders) {
            // Handle both response formats
            const isBuy = order.is_ask === false || order.is_ask === 0 || order.side === 'buy';
            
            allOrders.push({
              orderId: order.order_index?.toString() || order.id?.toString() || order.order_id?.toString(),
              symbol,
              side: isBuy ? 'BUY' as OrderSide : 'SELL' as OrderSide,
              type: (order.order_type === 'limit' || order.order_type === 0) ? 'LIMIT' as OrderType : 'MARKET' as OrderType,
              status: 'OPEN' as OrderStatus,
              price: order.price || '0',
              quantity: order.remaining_base_amount || order.base_amount || order.size || '0',
              timestamp: order.created_at ? order.created_at * 1000 : Date.now(),
            });
          }
        } catch (error) {
          logger.debug(`No orders for ${symbol} (market ${marketId})`);
          continue;
        }
      }
      
      logger.debug(`Retrieved ${allOrders.length} total open orders`);
      return allOrders;
      
    } catch (error) {
      logger.error('Failed to get orders:', error);
      return [];
    }
  }

  async getTicker(symbol: string): Promise<Ticker> {
    try {
      const marketId = this.symbolToMarketId.get(symbol);
      if (marketId === undefined) {
        throw new Error(`Unknown symbol: ${symbol}`);
      }

      logger.debug(`Fetching ticker for ${symbol} (market ${marketId})`);
      
      const response = await this.apiRequest<any>(
        `/api/v1/orderBookDetails?market_id=${marketId}`
      );
      
      if (response.code === 200 && response.order_book_details && response.order_book_details.length > 0) {
        const marketData = response.order_book_details[0];
        
        return {
          symbol,
          exchange: 'lighter' as const,
          markPrice: marketData.last_trade_price?.toString() 
            || marketData.mark_price?.toString() 
            || marketData.price?.toString() 
            || '0',
          volume24h: marketData.daily_quote_token_volume?.toString() 
            || marketData.volume_24h?.toString() 
            || '0',
          fundingRate: marketData.funding_rate?.toString() || '0',
          timestamp: Date.now(),
        };
      }
      
      // Return empty ticker if no data
      return {
        symbol,
        exchange: 'lighter' as const,
        markPrice: '0',
        volume24h: '0',
        fundingRate: '0',
        timestamp: Date.now(),
      };
    } catch (error) {
      logger.error(`Failed to get ticker for ${symbol}:`, error);
      throw error;
    }
  }

  async getOrderbook(symbol: string): Promise<Orderbook> {
    try {
      const marketId = this.symbolToMarketId.get(symbol);
      if (marketId === undefined) {
        throw new Error(`Unknown symbol: ${symbol}`);
      }

      logger.debug(`Fetching orderbook for ${symbol} (market ${marketId})`);
      
      const response = await this.apiRequest<any>(
        `/api/v1/orderBookOrders?market_id=${marketId}&limit=20`
      );
      
      const rawBids = response?.bids || [];
      const rawAsks = response?.asks || [];
      
      // Aggregate orders by price level
      const bidsByPrice = new Map<string, number>();
      for (const order of rawBids) {
        const price = order.price;
        const size = parseFloat(order.remaining_base_amount || order.size || '0');
        if (size > 0) {
          bidsByPrice.set(price, (bidsByPrice.get(price) || 0) + size);
        }
      }
      
      const asksByPrice = new Map<string, number>();
      for (const order of rawAsks) {
        const price = order.price;
        const size = parseFloat(order.remaining_base_amount || order.size || '0');
        if (size > 0) {
          asksByPrice.set(price, (asksByPrice.get(price) || 0) + size);
        }
      }
      
      const bidLevels = Array.from(bidsByPrice.entries())
        .sort((a, b) => parseFloat(b[0]) - parseFloat(a[0]))
        .slice(0, 20)
        .map(([price, size]) => ({
          price,
          size: size.toString(),
          timestamp: Date.now(),
        }));
      
      const askLevels = Array.from(asksByPrice.entries())
        .sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]))
        .slice(0, 20)
        .map(([price, size]) => ({
          price,
          size: size.toString(),
          timestamp: Date.now(),
        }));
      
      const bidTotalSize = bidLevels.reduce((sum, l) => sum + parseFloat(l.size), 0);
      const askTotalSize = askLevels.reduce((sum, l) => sum + parseFloat(l.size), 0);
      
      const bestBid = bidLevels[0] ? parseFloat(bidLevels[0].price) : 0;
      const bestAsk = askLevels[0] ? parseFloat(askLevels[0].price) : 0;
      const spread = bestAsk > 0 && bestBid > 0 ? bestAsk - bestBid : 0;
      const midPrice = bestAsk > 0 && bestBid > 0 ? (bestBid + bestAsk) / 2 : 0;
      
      return {
        symbol,
        exchange: 'lighter',
        bids: { levels: bidLevels, totalSize: bidTotalSize.toString() },
        asks: { levels: askLevels, totalSize: askTotalSize.toString() },
        timestamp: Date.now(),
        sequence: 0,
        spread: spread.toString(),
        midPrice: midPrice.toString(),
      };
    } catch (error) {
      logger.error(`Failed to get orderbook for ${symbol}:`, error);
      throw error;
    }
  }

// async placeOrder(request: PlaceOrderRequest): Promise<OrderResponse> {
//   if (!this.apiKeyPrivateKey || this.accountIndex === undefined) {
//     throw new Error('API key or account not initialized');
//   }

//   const marketId = this.symbolToMarketId.get(request.symbol);
//   if (marketId === undefined) {
//     throw new Error(`Unknown symbol: ${request.symbol}`);
//   }

//   try {
//     // Get next nonce first
//     const nonce = await this.getNextNonce();
//     logger.debug(`Using nonce: ${nonce} for account: ${this.accountIndex}`);
    
//     // Convert price and quantity to proper format
//     const priceInt = Math.floor(parseFloat(request.price || '0') * 1e8);
//     const quantityInt = Math.floor(parseFloat(request.quantity) * 1e8);
    
//     // Build transaction object
//     const tx = {
//       AccountIndex: this.accountIndex,
//       OrderBookIndex: marketId,
//       BaseAmount: quantityInt.toString(),
//       Price: priceInt.toString(),
//       IsAsk: request.side === 'SELL' ? 1 : 0,
//       OrderType: request.type === 'MARKET' ? 1 : 0,
//       ExpiredAt: -1,
//       Nonce: nonce,
//       ApiKeyIndex: this.apiKeyIndex,
//     };
    
//     logger.debug('Transaction object:', JSON.stringify(tx));
    
//     // Sign the transaction
//     const messageToSign = JSON.stringify(tx);
//     const signature = await this.signMessage(messageToSign);
//     logger.debug(`Signature generated: ${signature.slice(0, 32)}...`);
    
//     // Add signature to transaction
//     const signedTx = {
//       ...tx,
//       Sig: signature,
//     };
    
//     // CRITICAL: Use URLSearchParams for proper form-urlencoded format
//     const formData = new URLSearchParams();
//     formData.append('tx_type', '14');  // String value
//     formData.append('tx_info', JSON.stringify(signedTx));
    
//     logger.debug('Form data being sent:', formData.toString());
//     console.log('Form data being sent:', formData);
    
//     // Direct fetch call to avoid apiRequest JSON conversion
//     const url = `${this.baseUrl}/api/v1/sendTx`;
//     const response = await fetch(url, {
//       method: 'POST',
//       headers: {
//         'Content-Type': 'application/x-www-form-urlencoded',
//       },
//       body: formData.toString(),
//     });
    
//     const text = await response.text();
//     logger.debug(`Response [${response.status}]:`, text.substring(0, 500));
    
//     if (!response.ok) {
//       throw new Error(`Lighter API ${response.status}: ${text}`);
//     }
    
//     const data = JSON.parse(text);
//     logger.info('Order placement response:', data);
    
//     if (data.code === 200) {
//       return {
//         orderId: data.data?.order_index?.toString() || data.data?.tx_hash || '',
//         status: 'OPEN' as OrderStatus,
//         symbol: request.symbol,
//         side: request.side,
//         type: request.type,
//         price: request.price || '0',
//         quantity: request.quantity,
//         filledQuantity: '0',
//         timestamp: Date.now(),
//       };
//     } else {
//       throw new Error(`Order placement failed: ${data.msg || data.message}`);
//     }
//   } catch (error) {
//     logger.error('Failed to place order:', error);
//     throw error;
//   }
// }

async placeOrder(request: PlaceOrderRequest): Promise<OrderResponse> {
  if (!this.apiKeyPrivateKey || this.accountIndex === undefined) {
    throw new Error('API key or account not initialized');
  }

  const marketId = this.symbolToMarketId.get(request.symbol);
  if (marketId === undefined) {
    throw new Error(`Unknown symbol: ${request.symbol}`);
  }

  try {
    // Step 1: Get nonce
    const nonce = await this.getNextNonce();
    logger.debug(`Using nonce: ${nonce}`);
    
    // Step 2: Scale values correctly
    const priceScaled = scalePrice(parseFloat(request.price || '0'), request.symbol);
    const quantityScaled = scaleAmount(parseFloat(request.quantity), request.symbol);
    
    logger.debug(`Price: ${priceScaled}, Quantity: ${quantityScaled}`);
    
    // Step 3: Build order parameters
    const orderParams = {
      market_index: marketId,
      client_order_index: Date.now() % 1000000,
      base_amount: quantityScaled,
      price: priceScaled,
      is_ask: request.side === 'SELL',
      order_type: request.type === 'MARKET' ? 0 : 1,
      time_in_force: request.type === 'MARKET' ? 0 : 1,
      reduce_only: 0,
      trigger_price: 0,
      order_expiry: -1,
    };
    
    // Step 4: Create message to sign
    const messageParts = [
      14,  // tx_type
      this.accountIndex,
      this.apiKeyIndex,
      nonce,
      orderParams.market_index,
      orderParams.client_order_index,
      orderParams.base_amount,
      orderParams.price,
      orderParams.is_ask ? 1 : 0,
      orderParams.order_type,
      orderParams.time_in_force,
      orderParams.reduce_only,
      orderParams.trigger_price,
      orderParams.order_expiry,
    ];
    
    const messageToSign = messageParts.join(':');
    logger.debug('Signing message:', messageToSign);
    
    // Step 5: Sign
    const signature = await this.signMessage(messageToSign);
    logger.debug(`Signature: ${signature.slice(0, 32)}...`);
    
    // Step 6: Create FormData (CRITICAL!)
    const formData = new FormData();
    formData.append('tx_type', '14');  // Must be string
    formData.append('account_index', String(this.accountIndex));
    formData.append('api_key_index', String(this.apiKeyIndex));
    formData.append('nonce', String(nonce));
    formData.append('signature', signature);
    formData.append('tx_info', JSON.stringify(orderParams));
    
    logger.debug('Sending form data...');
    
    // Step 7: Send with proper headers
    const response = await fetch(`${this.baseUrl}/api/v1/sendTx`, {
      method: 'POST',
      body: formData,
      // Don't set Content-Type - FormData sets it automatically with boundary
    });
    
    const text = await response.text();
    logger.debug(`Response [${response.status}]:`, text);
    
    if (!response.ok) {
      throw new Error(`API Error ${response.status}: ${text}`);
    }
    
    const data = JSON.parse(text);
    
    if (data.code === 200 || data.success) {
      return {
        orderId: data.data?.order_index?.toString() || data.tx_hash || '',
        status: 'OPEN' as OrderStatus,
        symbol: request.symbol,
        side: request.side,
        type: request.type,
        price: request.price || '0',
        quantity: request.quantity,
        filledQuantity: '0',
        timestamp: Date.now(),
      };
    } else {
      throw new Error(`Order failed: ${data.msg || data.message || JSON.stringify(data)}`);
    }
  } catch (error) {
    logger.error('Order placement failed:', error);
    throw error;
  }
}


//   async placeOrder(request: PlaceOrderRequest): Promise<OrderResponse> {
//   if (!this.apiKeyPrivateKey || this.accountIndex === undefined) {
//     throw new Error('API key or account not initialized');
//   }

//   const marketId = this.symbolToMarketId.get(request.symbol);
//   if (marketId === undefined) {
//     throw new Error(`Unknown symbol: ${request.symbol}`);
//   }

//   try {
//     // Get next nonce first
//     const nonce = await this.getNextNonce();
//     logger.debug(`Using nonce: ${nonce} for account: ${this.accountIndex}`);
    
//     // Convert price and quantity to proper format
//     // Lighter expects integer values (multiply by precision factor)
//     const priceInt = Math.floor(parseFloat(request.price || '0') * 1e8); // 8 decimals
//     const quantityInt = Math.floor(parseFloat(request.quantity) * 1e8);
    
//     // Build transaction object with correct field names
//     const tx = {
//       AccountIndex: this.accountIndex,
//       OrderBookIndex: marketId,
//       BaseAmount: quantityInt.toString(),
//       Price: priceInt.toString(),
//       IsAsk: request.side === 'SELL' ? 1 : 0,
//       OrderType: request.type === 'MARKET' ? 1 : 0,
//       ExpiredAt: -1,
//       Nonce: nonce,
//       ApiKeyIndex: this.apiKeyIndex, // Add this field
//     };
    
//     logger.debug('Transaction object:', tx);
    
//     // Sign the transaction
//     const messageToSign = JSON.stringify(tx);
//     logger.debug('Message to sign:', messageToSign);
    
//     const signature = await this.signMessage(messageToSign);
//     logger.debug(`Signature generated: ${signature.slice(0, 32)}...`);
    
//     // Add signature to transaction
//     const signedTx = {
//       ...tx,
//       Sig: signature,
//     };
    
//     // Send transaction using sendTx endpoint
//     const response = await this.apiRequest<any>('/api/v1/sendTx', {
//       method: 'POST',
//       headers: {
//         'Content-Type': 'application/json',
//       },
//       body: {
//         tx_type: 14, // Order placement type
//         tx_info: JSON.stringify(signedTx),
//       },
//     });
    
//     logger.info('Order placement response:', response);
    
//     if (response.code === 200) {
//       return {
//         orderId: response.data?.order_index?.toString() || response.data?.tx_hash || '',
//         status: 'OPEN' as OrderStatus,
//         symbol: request.symbol,
//         side: request.side,
//         type: request.type,
//         price: request.price || '0',
//         quantity: request.quantity,
//         filledQuantity: '0',
//         timestamp: Date.now(),
//       };
//     } else {
//       throw new Error(`Order placement failed: ${response.msg || response.message}`);
//     }
//   } catch (error) {
//     logger.error('Failed to place order:', error);
//     throw error;
//   }
// }


  // async placeOrder(request: PlaceOrderRequest): Promise<OrderResponse> {
  //   if (!this.apiKeyPrivateKey || this.accountIndex === undefined) {
  //     throw new Error('API key or account not initialized');
  //   }

  //   const marketId = this.symbolToMarketId.get(request.symbol);
  //   if (marketId === undefined) {
  //     throw new Error(`Unknown symbol: ${request.symbol}`);
  //   }

  //   try {
  //     const nonce = await this.getNextNonce();
      
  //     const tx = {
  //       AccountIndex: this.accountIndex,
  //       OrderBookIndex: marketId,
  //       BaseAmount: parseInt(request.quantity),
  //       Price: parseInt(request.price || '0'),
  //       IsAsk: request.side === 'SELL' ? 1 : 0,
  //       OrderType: request.type === 'MARKET' ? 1 : 0,
  //       ExpiredAt: -1,
  //       Nonce: nonce,
  //     };
      
  //     const messageToSign = JSON.stringify(tx);
  //     const signature = await this.signMessage(messageToSign);
  //     (tx as any).Sig = signature;
      
  //     const formData = new URLSearchParams();
  //     formData.append('tx_type', '14');
  //     formData.append('tx_info', JSON.stringify(tx));
      
  //     const response = await fetch(`${this.baseUrl}/api/v1/sendTx`, {
  //       method: 'POST',
  //       headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  //       body: formData,
  //     });
      
  //     const data: any = await response.json();
      
  //     if (data.code === 200) {
  //       return {
  //         orderId: data.data?.tx_hash || '',
  //         status: 'OPEN' as OrderStatus,
  //         symbol: request.symbol,
  //         side: request.side,
  //         type: request.type,
  //         price: request.price || '0',
  //         quantity: request.quantity,
  //         filledQuantity: '0',
  //         timestamp: Date.now(),
  //       };
  //     } else {
  //       throw new Error(data.msg || 'Order failed');
  //     }
  //   } catch (error) {
  //     logger.error('Failed to place order:', error);
  //     throw error;
  //   }
  // }

  async cancelOrder(orderId: string, symbol: string): Promise<CancelResponse> {
    if (!this.apiKeyPrivateKey || this.accountIndex === undefined) {
      throw new Error('API key or account not initialized');
    }

    const marketId = this.symbolToMarketId.get(symbol);
    if (marketId === undefined) {
      throw new Error(`Unknown symbol: ${symbol}`);
    }

    try {
      const nonce = await this.getNextNonce();
      
      const tx = {
        AccountIndex: this.accountIndex,
        OrderBookIndex: marketId,
        OrderNonce: parseInt(orderId),
        ExpiredAt: -1,
        Nonce: nonce,
      };
      
      const messageToSign = JSON.stringify(tx);
      const signature = await this.signMessage(messageToSign);
      (tx as any).Sig = signature;
      
      const formData = new URLSearchParams();
      formData.append('tx_type', '15');
      formData.append('tx_info', JSON.stringify(tx));
      
      const response = await fetch(`${this.baseUrl}/api/v1/sendTx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData,
      });
      
      const data: any = await response.json();
      
      if (data.code === 200) {
        return {
          orderId,
          symbol,
          status: 'SUCCESS',
        };
      } else {
        throw new Error(data.msg || 'Cancel failed');
      }
    } catch (error) {
      logger.error('Failed to cancel order:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    logger.info('Disconnecting Lighter trading adapter');
  }
}