export enum OrderSide { BUY = 'BUY', SELL = 'SELL' }
export enum OrderType { LIMIT = 'LIMIT', MARKET = 'MARKET' }
export enum OrderStatus { 
  OPEN = 'OPEN', 
  FILLED = 'FILLED', 
  CANCELED = 'CANCELED', 
  REJECTED = 'REJECTED' 
}
export enum TimeInForce { GTC = 'GTC', IOC = 'IOC', POST_ONLY = 'POST_ONLY' }
export enum PositionSide { LONG = 'LONG', SHORT = 'SHORT', FLAT = 'FLAT' }
export enum MarginMode { CROSS = 'CROSS', ISOLATED = 'ISOLATED' }

export type Unsubscribe = () => void;

// ============= TRADES (Market Data - Public) =============

/**
 * Trade - A completed/executed trade from the orderbook
 * This is PUBLIC data from WebSocket (anyone can see these trades)
 */
export interface Trade {
  id: string;
  symbol: string;
  exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis';
  price: string;
  size: string;
  side: OrderSide;  
  timestamp: number;
  blockTime?: number;
}

export interface AggregatedTrade {
  symbol: string;
  exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis';
  price: string;
  size: string;
  side: OrderSide;  
  timestamp: number;
  tradeCount: number;
  firstTradeId: string;
  lastTradeId: string;
}

export interface TradeMetrics {
  symbol: string;
  exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis';
  price: string;
  priceChange: string;
  priceChangePercent: string;
  volume: string;
  quoteVolume: string;
  high: string;
  low: string;
  open: string;
  count: number;
  timestamp: number;
  window: '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
}

export interface TradeStream {
  symbol: string;
  exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis';
  trades: Trade[];
  lastUpdate: number;
}

export interface TradeFilter {
  symbol?: string;
  exchange?: 'hyperliquid' | 'aster' | 'lighter' | 'avantis';
  side?: OrderSide;  // ✅ CHANGED: Use enum
  minSize?: string;
  maxSize?: string;
  minPrice?: string;
  maxPrice?: string;
  from?: number;
  to?: number;
}

// ============= ORDERS (Trading - Private) =============

/**
 * Order - YOUR open order (private, authenticated)
 */
export interface Order {
  orderId: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  status: OrderStatus;
  price: string;
  quantity: string;
  timestamp: number;
}

export interface PlaceOrderRequest {
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: string;
  price?: string;
  timeInForce?: TimeInForce;
  reduceOnly?: boolean;
  clientOrderId?: string;
}

export interface OrderResponse {
  orderId: string;
  status: OrderStatus;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  price: string;
  quantity: string;
  filledQuantity: string;
  timestamp: number;
}

export interface CancelResponse {
  orderId: string;
  symbol: string;
  status: 'SUCCESS' | 'FAILED';
}

// ============= POSITIONS & ACCOUNT =============

export interface Position {
  symbol: string;
  exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis';
  walletAddress: string;
  side: PositionSide;
  size: string;
  entryPrice: string;
  markPrice: string;
  unrealizedPnl: string;
  leverage: number;
  marginMode: MarginMode;
  timestamp: number;
}

export interface Balance {
  asset: string;
  free: string;
  total: string;
}

export interface Ticker {
  symbol: string;
  exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis';
  markPrice: string;
  volume24h: string;
  fundingRate?: string;
  timestamp: number;
}

// ============= ADAPTER INTERFACE =============

export interface IPerpetualAdapter {
  readonly id: string;
  readonly name: string;
  
  initialize(): Promise<void>;
  getAddress(): string;
  getSymbols(): string[];
  
  placeOrder(request: PlaceOrderRequest): Promise<OrderResponse>;
  cancelOrder(orderId: string, symbol: string): Promise<CancelResponse>;
  getOpenOrders(): Promise<Order[]>;
  
  getPositions(): Promise<Position[]>;
  getBalances(): Promise<Balance[]>;
  
  getTicker(symbol: string): Promise<Ticker>;
  getOrderbook(symbol: string): Promise<import('./orderbook').Orderbook>;
  
  disconnect(): Promise<void>;
}
