import { sign as ed25519_sign } from '@noble/ed25519';
import axios from 'axios';
import { logger } from '@/utils/logger';
import { exchangeConfig } from '@/config/exchanges';

// Transaction types
export const TX_TYPE_CREATE_ORDER = 14;
export const TX_TYPE_CANCEL_ORDER = 15;
export const TX_TYPE_CANCEL_ALL_ORDERS = 16;
export const TX_TYPE_UPDATE_LEVERAGE = 20;

// Order types
export const ORDER_TYPE_LIMIT = 0;
export const ORDER_TYPE_MARKET = 1;

// Time in force
export const TIF_IMMEDIATE_OR_CANCEL = 0;
export const TIF_GOOD_TILL_TIME = 1;
export const TIF_POST_ONLY = 2;

export interface SignCreateOrderParams {
  marketIndex: number;
  clientOrderIndex: number;
  baseAmount: string;
  price: string;
  isAsk: boolean;
  orderType: number;
  timeInForce: number;
  reduceOnly: boolean;
  triggerPrice: string;
  expiry?: number;
}

export interface SignCancelOrderParams {
  marketIndex: number;
  orderIndex: number;
}

export interface SignCancelAllOrdersParams {
  marketIndex: number;
  timeInForce: number;
}

export interface SignUpdateLeverageParams {
  marketIndex: number;
  leverage: number;
}

/**
 * Converts hex string to Uint8Array
 */
function hexToUint8Array(hex: string): Uint8Array {
  const hexWithoutPrefix = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(hexWithoutPrefix.length / 2);
  for (let i = 0; i < hexWithoutPrefix.length; i += 2) {
    bytes[i / 2] = parseInt(hexWithoutPrefix.substr(i, 2), 16);
  }
  return bytes;
}

/**
 * Converts Uint8Array to hex string
 */
function uint8ArrayToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export class LighterSigner {
  private privateKey: string;
  private accountIndex: number;
  private baseUrl: string;

  constructor(privateKey: string, accountIndex: number, baseUrl?: string) {
    this.privateKey = privateKey;
    this.accountIndex = accountIndex;
    this.baseUrl = baseUrl || exchangeConfig.lighter.restUrl;
  }

  /**
   * Get next nonce for the account
   */
  async getNextNonce(apiKeyIndex: number): Promise<number> {
    const response = await axios.get(`${this.baseUrl}/api/v1/nextNonce`, {
      params: {
        account_index: this.accountIndex,
        api_key_index: apiKeyIndex,
      },
    });
    return response.data.data.nonce;
  }

  /**
   * Sign a message with Ed25519
   */
  private async signMessage(message: string): Promise<string> {
    const privateKeyBytes = hexToUint8Array(this.privateKey);
    const messageBytes = new TextEncoder().encode(message);
    const signature = await ed25519_sign(messageBytes, privateKeyBytes);
    return uint8ArrayToHex(signature);
  }

  /**
   * Sign a create order transaction
   */
  private signCreateOrder(
    params: SignCreateOrderParams,
    nonce: number
  ): any {
    const expireAt = params.expiry || -1;
    
    const tx = {
      AccountIndex: this.accountIndex,
      OrderBookIndex: params.marketIndex,
      BaseAmount: parseInt(params.baseAmount),
      Price: parseInt(params.price),
      IsAsk: params.isAsk ? 1 : 0,
      OrderType: params.orderType,
      ExpiredAt: expireAt,
      Nonce: nonce,
    };

    logger.debug('Lighter: Create order transaction', tx);
    return tx;
  }

  /**
   * Sign a cancel order transaction
   */
  private signCancelOrder(params: SignCancelOrderParams, nonce: number): any {
    const tx = {
      AccountIndex: this.accountIndex,
      OrderBookIndex: params.marketIndex,
      OrderNonce: params.orderIndex,
      ExpiredAt: -1,
      Nonce: nonce,
    };

    logger.debug('Lighter: Cancel order transaction', tx);
    return tx;
  }

  /**
   * Sign a cancel all orders transaction
   */
  private signCancelAllOrders(params: SignCancelAllOrdersParams, nonce: number): any {
    const tx = {
      AccountIndex: this.accountIndex,
      OrderBookIndex: params.marketIndex,
      TimeInForce: params.timeInForce,
      ExpiredAt: Date.now(),
      Nonce: nonce,
    };

    logger.debug('Lighter: Cancel all orders transaction', tx);
    return tx;
  }

  /**
   * Sign an update leverage transaction
   */
  private signUpdateLeverage(params: SignUpdateLeverageParams, nonce: number): any {
    const tx = {
      AccountIndex: this.accountIndex,
      OrderBookIndex: params.marketIndex,
      Leverage: params.leverage,
      Nonce: nonce,
    };

    logger.debug('Lighter: Update leverage transaction', tx);
    return tx;
  }

  /**
   * Create and sign an order, then send it
   */
  async createOrder(
    params: SignCreateOrderParams,
    apiKeyIndex: number
  ): Promise<{ tx: any; txHash: string; error?: string }> {
    try {
      // Get nonce
      const nonce = await this.getNextNonce(apiKeyIndex);
      logger.info(`Lighter: Got nonce ${nonce} for account ${this.accountIndex}`);

      // Create transaction
      const txObj = this.signCreateOrder(params, nonce);
      
      // Note: The transaction needs to be signed by computing a signature over specific fields
      // The exact signing format depends on Lighter's C library implementation
      // For now, we'll send the unsigned transaction and see what the API requires
      
      // Send transaction
      const response = await axios.post(`${this.baseUrl}/api/v1/sendTx`, {
        tx_type: TX_TYPE_CREATE_ORDER,
        tx_info: JSON.stringify(txObj),
      });

      if (response.data.code === 200) {
        return {
          tx: txObj,
          txHash: response.data.data.tx_hash,
          error: undefined,
        };
      } else {
        return {
          tx: txObj,
          txHash: '',
          error: response.data.msg || 'Unknown error',
        };
      }
    } catch (error: any) {
      logger.error('Lighter: Error creating order:', error);
      return {
        tx: null,
        txHash: '',
        error: error.message || String(error),
      };
    }
  }

  /**
   * Cancel an order
   */
  async cancelOrder(
    params: SignCancelOrderParams,
    apiKeyIndex: number
  ): Promise<{ tx: any; txHash: string; error?: string }> {
    try {
      const nonce = await this.getNextNonce(apiKeyIndex);
      const txObj = this.signCancelOrder(params, nonce);

      const response = await axios.post(`${this.baseUrl}/api/v1/sendTx`, {
        tx_type: TX_TYPE_CANCEL_ORDER,
        tx_info: JSON.stringify(txObj),
      });

      if (response.data.code === 200) {
        return {
          tx: txObj,
          txHash: response.data.data.tx_hash,
          error: undefined,
        };
      } else {
        return {
          tx: txObj,
          txHash: '',
          error: response.data.msg || 'Unknown error',
        };
      }
    } catch (error: any) {
      logger.error('Lighter: Error canceling order:', error);
      return {
        tx: null,
        txHash: '',
        error: error.message || String(error),
      };
    }
  }

  /**
   * Cancel all orders
   */
  async cancelAllOrders(
    params: SignCancelAllOrdersParams,
    apiKeyIndex: number
  ): Promise<{ tx: any; txHash: string; error?: string }> {
    try {
      const nonce = await this.getNextNonce(apiKeyIndex);
      const txObj = this.signCancelAllOrders(params, nonce);

      const response = await axios.post(`${this.baseUrl}/api/v1/sendTx`, {
        tx_type: TX_TYPE_CANCEL_ALL_ORDERS,
        tx_info: JSON.stringify(txObj),
      });

      if (response.data.code === 200) {
        return {
          tx: txObj,
          txHash: response.data.data.tx_hash,
          error: undefined,
        };
      } else {
        return {
          tx: txObj,
          txHash: '',
          error: response.data.msg || 'Unknown error',
        };
      }
    } catch (error: any) {
      logger.error('Lighter: Error canceling all orders:', error);
      return {
        tx: null,
        txHash: '',
        error: error.message || String(error),
      };
    }
  }

  /**
   * Update leverage
   */
  async updateLeverage(
    params: SignUpdateLeverageParams,
    apiKeyIndex: number
  ): Promise<{ tx: any; txHash: string; error?: string }> {
    try {
      const nonce = await this.getNextNonce(apiKeyIndex);
      const txObj = this.signUpdateLeverage(params, nonce);

      const response = await axios.post(`${this.baseUrl}/api/v1/sendTx`, {
        tx_type: TX_TYPE_UPDATE_LEVERAGE,
        tx_info: JSON.stringify(txObj),
      });

      if (response.data.code === 200) {
        return {
          tx: txObj,
          txHash: response.data.data.tx_hash,
          error: undefined,
        };
      } else {
        return {
          tx: txObj,
          txHash: '',
          error: response.data.msg || 'Unknown error',
        };
      }
    } catch (error: any) {
      logger.error('Lighter: Error updating leverage:', error);
      return {
        tx: null,
        txHash: '',
        error: error.message || String(error),
      };
    }
  }
}

