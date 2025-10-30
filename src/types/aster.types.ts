/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ASTER DEX TRADING TYPES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Comprehensive type definitions for Aster DEX API integration with Dynamic
 * WaaS delegated wallet signing.
 *
 * @module aster.types
 * @description Production-grade type definitions for Aster perpetual futures
 *              trading with strict validation and comprehensive documentation.
 *
 * Key Features:
 * - Type-safe API request/response definitions
 * - Aster API authentication types
 * - Order management types
 * - Position tracking types
 * - Error handling types
 *
 * @see https://github.com/asterdex/api-docs
 */

// ═══════════════════════════════════════════════════════════════════════════
// ASTER API CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Aster API base configuration
 */
export interface AsterConfig {
  /** Base API URL (e.g., https://fapi.asterdex.com) */
  baseUrl: string;
  /** API timeout in milliseconds */
  timeout: number;
  /** Enable debug logging */
  debug: boolean;
}

/**
 * Aster API authentication headers
 */
export interface AsterAuthHeaders {
  /** API key identifier */
  'X-MBX-APIKEY': string;
  /** Content type */
  'Content-Type': string;
  /** User agent */
  'User-Agent': string;
}

// ═══════════════════════════════════════════════════════════════════════════
// ORDER TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Order side (direction)
 */
export type OrderSide = 'BUY' | 'SELL';

/**
 * Order type
 */
export type OrderType =
  | 'LIMIT'           // Limit order
  | 'MARKET'          // Market order
  | 'STOP'            // Stop loss order
  | 'TAKE_PROFIT'     // Take profit order
  | 'STOP_MARKET'     // Stop market order
  | 'TAKE_PROFIT_MARKET'; // Take profit market order

/**
 * Time in force (order duration)
 */
export type TimeInForce =
  | 'GTC'  // Good Till Cancel
  | 'IOC'  // Immediate or Cancel
  | 'FOK'  // Fill or Kill
  | 'GTX'; // Good Till Crossing (Post only)

/**
 * Order status
 */
export type OrderStatus =
  | 'NEW'              // Order has been accepted
  | 'PARTIALLY_FILLED' // Order partially filled
  | 'FILLED'           // Order fully filled
  | 'CANCELED'         // Order canceled
  | 'REJECTED'         // Order rejected
  | 'EXPIRED';         // Order expired

/**
 * Position side
 */
export type PositionSide = 'LONG' | 'SHORT' | 'BOTH';

// ═══════════════════════════════════════════════════════════════════════════
// API REQUEST TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Base request parameters (all API calls require timestamp and signature)
 */
export interface AsterBaseRequest {
  /** Unix timestamp in milliseconds */
  timestamp: number;
  /** HMAC SHA256 signature */
  signature: string;
  /** Optional receive window in milliseconds (default: 5000) */
  recvWindow?: number;
}

/**
 * New order request
 */
export interface AsterNewOrderRequest extends AsterBaseRequest {
  /** Trading pair symbol (e.g., BTCUSDT) */
  symbol: string;
  /** Order side (BUY/SELL) */
  side: OrderSide;
  /** Order type */
  type: OrderType;
  /** Order quantity */
  quantity: number;
  /** Time in force (required for LIMIT orders) */
  timeInForce?: TimeInForce;
  /** Price (required for LIMIT orders) */
  price?: number;
  /** Position side (for hedge mode) */
  positionSide?: PositionSide;
  /** Stop price (for STOP/TAKE_PROFIT orders) */
  stopPrice?: number;
  /** Reduce only flag */
  reduceOnly?: boolean;
  /** Client order ID (optional) */
  newClientOrderId?: string;
}

/**
 * Cancel order request
 */
export interface AsterCancelOrderRequest extends AsterBaseRequest {
  /** Trading pair symbol */
  symbol: string;
  /** Order ID (either orderId or origClientOrderId required) */
  orderId?: number;
  /** Original client order ID */
  origClientOrderId?: string;
}

/**
 * Query order request
 */
export interface AsterQueryOrderRequest extends AsterBaseRequest {
  /** Trading pair symbol */
  symbol: string;
  /** Order ID (either orderId or origClientOrderId required) */
  orderId?: number;
  /** Original client order ID */
  origClientOrderId?: string;
}

/**
 * Get open orders request
 */
export interface AsterOpenOrdersRequest extends Partial<AsterBaseRequest> {
  /** Trading pair symbol (optional, returns all if omitted) */
  symbol?: string;
}

/**
 * Get position information request
 */
export interface AsterPositionRequest extends Partial<AsterBaseRequest> {
  /** Trading pair symbol (optional, returns all if omitted) */
  symbol?: string;
}

/**
 * Get account information request
 */
export interface AsterAccountRequest extends AsterBaseRequest {}

// ═══════════════════════════════════════════════════════════════════════════
// API RESPONSE TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * New order response
 */
export interface AsterNewOrderResponse {
  /** Order ID */
  orderId: number;
  /** Trading pair symbol */
  symbol: string;
  /** Order status */
  status: OrderStatus;
  /** Client order ID */
  clientOrderId: string;
  /** Price */
  price: string;
  /** Average filled price */
  avgPrice: string;
  /** Original quantity */
  origQty: string;
  /** Executed quantity */
  executedQty: string;
  /** Cumulative quote quantity */
  cumQty: string;
  /** Cumulative quote asset transacted quantity */
  cumQuote: string;
  /** Time in force */
  timeInForce: TimeInForce;
  /** Order type */
  type: OrderType;
  /** Reduce only */
  reduceOnly: boolean;
  /** Close position */
  closePosition: boolean;
  /** Order side */
  side: OrderSide;
  /** Position side */
  positionSide: PositionSide;
  /** Stop price */
  stopPrice: string;
  /** Update time */
  updateTime: number;
}

/**
 * Order information response
 */
export interface AsterOrderResponse extends AsterNewOrderResponse {
  /** Order creation time */
  time: number;
  /** Order activation time */
  activateTime?: number;
  /** Price rate */
  priceRate?: string;
}

/**
 * Position information
 */
export interface AsterPositionInfo {
  /** Trading pair symbol */
  symbol: string;
  /** Position side */
  positionSide: PositionSide;
  /** Position amount */
  positionAmt: string;
  /** Entry price */
  entryPrice: string;
  /** Mark price */
  markPrice: string;
  /** Unrealized PnL */
  unRealizedProfit: string;
  /** Liquidation price */
  liquidationPrice: string;
  /** Leverage */
  leverage: string;
  /** Maximum notional value */
  maxNotionalValue: string;
  /** Margin type (cross/isolated) */
  marginType: 'cross' | 'isolated';
  /** Isolated margin */
  isolatedMargin: string;
  /** Is auto add margin */
  isAutoAddMargin: boolean;
  /** Position initial margin */
  positionInitialMargin: string;
  /** Maintenance margin */
  maintMargin: string;
  /** Update time */
  updateTime: number;
}

/**
 * Account balance information
 */
export interface AsterAccountBalance {
  /** Account alias */
  accountAlias: string;
  /** Asset name */
  asset: string;
  /** Wallet balance */
  balance: string;
  /** Cross wallet balance */
  crossWalletBalance: string;
  /** Cross unrealized PnL */
  crossUnPnl: string;
  /** Available balance */
  availableBalance: string;
  /** Maximum withdraw amount */
  maxWithdrawAmount: string;
  /** Margin available */
  marginAvailable: boolean;
  /** Update time */
  updateTime: number;
}

/**
 * Account information response
 */
export interface AsterAccountInfo {
  /** Fee tier */
  feeTier: number;
  /** Can trade */
  canTrade: boolean;
  /** Can deposit */
  canDeposit: boolean;
  /** Can withdraw */
  canWithdraw: boolean;
  /** Update time */
  updateTime: number;
  /** Total initial margin */
  totalInitialMargin: string;
  /** Total maintenance margin */
  totalMaintMargin: string;
  /** Total wallet balance */
  totalWalletBalance: string;
  /** Total unrealized profit */
  totalUnrealizedProfit: string;
  /** Total margin balance */
  totalMarginBalance: string;
  /** Total position initial margin */
  totalPositionInitialMargin: string;
  /** Total open order initial margin */
  totalOpenOrderInitialMargin: string;
  /** Total cross wallet balance */
  totalCrossWalletBalance: string;
  /** Total cross unrealized PnL */
  totalCrossUnPnl: string;
  /** Available balance */
  availableBalance: string;
  /** Maximum withdraw amount */
  maxWithdrawAmount: string;
  /** Assets */
  assets: AsterAccountBalance[];
  /** Positions */
  positions: AsterPositionInfo[];
}

// ═══════════════════════════════════════════════════════════════════════════
// ERROR TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Aster API error response
 */
export interface AsterErrorResponse {
  /** Error code */
  code: number;
  /** Error message */
  msg: string;
}

/**
 * Common Aster error codes
 */
export enum AsterErrorCode {
  /** Unknown error */
  UNKNOWN = -1000,
  /** Disconnected */
  DISCONNECTED = -1001,
  /** Unauthorized */
  UNAUTHORIZED = -1002,
  /** Too many requests */
  TOO_MANY_REQUESTS = -1003,
  /** Unexpected response */
  UNEXPECTED_RESP = -1006,
  /** Timeout */
  TIMEOUT = -1007,
  /** Invalid message */
  INVALID_MESSAGE = -1013,
  /** Unknown order composition */
  UNKNOWN_ORDER_COMPOSITION = -1014,
  /** Too many orders */
  TOO_MANY_ORDERS = -1015,
  /** Service shutting down */
  SERVICE_SHUTTING_DOWN = -1016,
  /** Unsupported operation */
  UNSUPPORTED_OPERATION = -1020,
  /** Invalid timestamp */
  INVALID_TIMESTAMP = -1021,
  /** Invalid signature */
  INVALID_SIGNATURE = -1022,
  /** Illegal characters */
  ILLEGAL_CHARS = -1100,
  /** Too many parameters */
  TOO_MANY_PARAMETERS = -1101,
  /** Mandatory param empty or malformed */
  MANDATORY_PARAM_EMPTY_OR_MALFORMED = -1102,
  /** Unknown param */
  UNKNOWN_PARAM = -1103,
  /** Unread parameters */
  UNREAD_PARAMETERS = -1104,
  /** Param empty */
  PARAM_EMPTY = -1105,
  /** Param not required */
  PARAM_NOT_REQUIRED = -1106,
  /** Invalid asset */
  INVALID_ASSET = -1121,
  /** Invalid account */
  INVALID_ACCOUNT = -1122,
  /** Invalid symbol */
  INVALID_SYMBOL = -2010,
  /** Invalid order type */
  INVALID_ORDER_TYPE = -2011,
  /** Invalid side */
  INVALID_SIDE = -2012,
  /** Invalid quantity */
  INVALID_QUANTITY = -2013,
  /** Invalid price */
  INVALID_PRICE = -2014,
  /** Insufficient balance */
  INSUFFICIENT_BALANCE = -2019,
  /** Order does not exist */
  ORDER_NOT_FOUND = -2013,
  /** Position not found */
  POSITION_NOT_FOUND = -2018,
}

// ═══════════════════════════════════════════════════════════════════════════
// APPLICATION TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Simplified open position request (application layer)
 */
export interface OpenPositionParams {
  /** Wallet ID (for delegation lookup) */
  walletId: string;
  /** Trading pair (e.g., BTCUSDT) */
  symbol: string;
  /** Order side (BUY for long, SELL for short) */
  side: OrderSide;
  /** Position size (quantity) */
  quantity: number;
  /** Leverage (1-125) */
  leverage: number;
  /** Order type (default: MARKET) */
  type?: OrderType;
  /** Price (required for LIMIT orders) */
  price?: number;
  /** Stop loss price (optional) */
  stopLoss?: number;
  /** Take profit price (optional) */
  takeProfit?: number;
  /** Reduce only (close only, don't open) */
  reduceOnly?: boolean;
}

/**
 * Close position request (application layer)
 */
export interface ClosePositionParams {
  /** Wallet ID (for delegation lookup) */
  walletId: string;
  /** Trading pair */
  symbol: string;
  /** Position side to close */
  positionSide?: PositionSide;
  /** Close entire position (true) or partial amount */
  closeAll?: boolean;
  /** Quantity to close (if not closeAll) */
  quantity?: number;
}

/**
 * Position summary (application layer)
 */
export interface PositionSummary {
  /** Trading pair */
  symbol: string;
  /** Position side */
  side: PositionSide;
  /** Entry price */
  entryPrice: number;
  /** Current mark price */
  markPrice: number;
  /** Position size */
  size: number;
  /** Leverage */
  leverage: number;
  /** Unrealized PnL */
  unrealizedPnl: number;
  /** Unrealized PnL percentage */
  pnlPercent: number;
  /** Liquidation price */
  liquidationPrice: number;
  /** Margin type */
  marginType: 'cross' | 'isolated';
  /** Last update timestamp */
  updatedAt: number;
}

/**
 * Trading operation result
 */
export interface TradingResult<T = any> {
  /** Operation success flag */
  success: boolean;
  /** Result data */
  data?: T;
  /** Error information */
  error?: {
    code: number;
    message: string;
    details?: any;
  };
  /** Execution metadata */
  metadata: {
    /** Wallet address used */
    walletAddress: string;
    /** Execution timestamp */
    timestamp: number;
    /** Request ID for tracing */
    requestId: string;
  };
}
