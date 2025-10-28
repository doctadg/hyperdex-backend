import * as ed25519 from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';
import axios from 'axios';
import { logger } from '@/utils/logger';
import { exchangeConfig } from '@/config/exchanges';

// Set up SHA-512 for ed25519 (required by @noble/ed25519 v3.0.0+)
// The library requires hashes.sha512 to be set for synchronous operations
(ed25519 as any).hashes.sha512 = (message: Uint8Array) => sha512(message);

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
    try {
      const response = await axios.get(`${this.baseUrl}/api/v1/nextNonce`, {
        params: {
          account_index: this.accountIndex,
          api_key_index: apiKeyIndex,
        },
      });
      
      // Handle different response structures
      const nonce = response.data?.data?.nonce || response.data?.nonce;
      if (nonce === undefined) {
        logger.error('Lighter: Invalid nonce response', response.data);
        throw new Error('Invalid nonce response');
      }
      return nonce;
    } catch (error: any) {
      logger.error('Lighter: Error getting nonce:', error.message);
      throw error;
    }
  }

  /**
   * Sign a message with Ed25519
   */
  private async signMessage(message: string): Promise<string> {
    const privateKeyBytes = hexToUint8Array(this.privateKey);
    const messageBytes = new TextEncoder().encode(message);
    const signature = await ed25519.sign(messageBytes, privateKeyBytes);
    return uint8ArrayToHex(signature);
  }

  /**
   * Sign a create order transaction
   */
  private async signCreateOrder(
    params: SignCreateOrderParams,
    nonce: number
  ): Promise<any> {
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

    // Create a message to sign (this would need to match Lighter's signing scheme)
    // For now, we'll create a placeholder signature structure
    // In a production implementation, you'd need to properly compute the Ed25519 signature
    // over the transaction fields in the format expected by Lighter
    const messageToSign = JSON.stringify(tx);
    
    // Sign the message
    const signature = await this.signMessage(messageToSign);
    
    tx['Sig'] = signature;
    
    logger.debug('Lighter: Create order transaction', tx);
    return tx;
  }

  /**
   * Sign a cancel order transaction
   */
  private async signCancelOrder(params: SignCancelOrderParams, nonce: number): Promise<any> {
    const tx = {
      AccountIndex: this.accountIndex,
      OrderBookIndex: params.marketIndex,
      OrderNonce: params.orderIndex,
      ExpiredAt: -1,
      Nonce: nonce,
    };

    // Sign the transaction
    const messageToSign = JSON.stringify(tx);
    const signature = await this.signMessage(messageToSign);
    tx['Sig'] = signature;

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
  private async signUpdateLeverage(params: SignUpdateLeverageParams, nonce: number): Promise<any> {
    const tx = {
      AccountIndex: this.accountIndex,
      OrderBookIndex: params.marketIndex,
      Leverage: params.leverage,
      Nonce: nonce,
    };

    // Sign the transaction
    const messageToSign = JSON.stringify(tx);
    const signature = await this.signMessage(messageToSign);
    tx['Sig'] = signature;

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

      // Create and sign transaction
      const txObj = await this.signCreateOrder(params, nonce);
      
      // Send transaction using form data (multipart/form-data)
      const formData = new URLSearchParams();
      formData.append('tx_type', TX_TYPE_CREATE_ORDER.toString());
      formData.append('tx_info', JSON.stringify(txObj));
      
      const response = await axios.post(`${this.baseUrl}/api/v1/sendTx`, formData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      if (response.data.code === 200) {
        return {
          tx: txObj,
          txHash: response.data.data?.tx_hash || '',
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
      const txObj = await this.signCancelOrder(params, nonce);

      const formData = new URLSearchParams();
      formData.append('tx_type', TX_TYPE_CANCEL_ORDER.toString());
      formData.append('tx_info', JSON.stringify(txObj));
      
      const response = await axios.post(`${this.baseUrl}/api/v1/sendTx`, formData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      if (response.data.code === 200) {
        return {
          tx: txObj,
          txHash: response.data.data?.tx_hash || '',
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

      const formData = new URLSearchParams();
      formData.append('tx_type', TX_TYPE_CANCEL_ALL_ORDERS.toString());
      formData.append('tx_info', JSON.stringify(txObj));
      
      const response = await axios.post(`${this.baseUrl}/api/v1/sendTx`, formData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
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
      const txObj = await this.signUpdateLeverage(params, nonce);

      const formData = new URLSearchParams();
      formData.append('tx_type', TX_TYPE_UPDATE_LEVERAGE.toString());
      formData.append('tx_info', JSON.stringify(txObj));
      
      const response = await axios.post(`${this.baseUrl}/api/v1/sendTx`, formData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      if (response.data.code === 200) {
        return {
          tx: txObj,
          txHash: response.data.data?.tx_hash || '',
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

