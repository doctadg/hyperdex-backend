/**
 * Lighter Adapter for Hyperdex
 * 
 * This adapter provides a comprehensive TypeScript interface for the Lighter DEX.
 * It supports both market data operations (read-only) and authenticated trading operations.
 * 
 * @module LighterAdapter
 */

export * from './lighter-adapter';
export * from './lighter-credentials';
export * from './lighter-signer';
export * from './lighter-errors';

// Re-export types for convenience
export type {
  LighterAccount,
  LighterPosition,
  LighterOrder,
  LighterMarketInfo,
  LighterOrderBook,
  LighterTrade,
  LighterAccountStats,
  LighterTickPrice,
  CreateOrderParams,
  CancelOrderParams,
  UpdateLeverageParams,
  TransferParams,
  WithdrawParams,
} from './lighter-adapter';

export type { LighterCredentials } from './lighter-credentials';
export type {
  SignCreateOrderParams,
  SignCancelOrderParams,
  SignCancelAllOrdersParams,
  SignUpdateLeverageParams,
} from './lighter-signer';

export type {
  LighterCredentials as CredentialsInterface,
} from './lighter-credentials';

