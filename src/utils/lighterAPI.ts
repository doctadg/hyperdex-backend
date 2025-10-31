import * as ed25519 from '@noble/ed25519';
import FormData from 'form-data';
import { logger } from '@/utils/logger'; 

// Lighter API constants
const LIGHTER_API_BASE = 'https://mainnet.zklighter.elliot.ai';

// Transaction types (from Lighter docs)
export const TX_TYPE_CREATE_ORDER = 14;
export const TX_TYPE_CANCEL_ORDER = 15;
export const TX_TYPE_MODIFY_ORDER = 17;

// Order types
export const ORDER_TYPE_MARKET = 0;
export const ORDER_TYPE_LIMIT = 1;
export const ORDER_TYPE_STOP_LOSS = 2;
export const ORDER_TYPE_STOP_LOSS_LIMIT = 3;
export const ORDER_TYPE_TAKE_PROFIT = 4;
export const ORDER_TYPE_TAKE_PROFIT_LIMIT = 5;
export const ORDER_TYPE_TWAP = 6;

// Time in force
export const ORDER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL = 0;
export const ORDER_TIME_IN_FORCE_GOOD_TILL_TIME = 1;
export const ORDER_TIME_IN_FORCE_POST_ONLY = 2;

// Market indices (Symbol to market ID mapping)
export const MARKET_INDICES: Record<string, number> = {
  'ETH': 0,
  'BTC': 1,
  'SOL': 2,
  'HYPE': 3,
  'TRUMP': 4,
};

export interface LighterCredentials {
  apiKeyPrivate: string;  // Hex-encoded Ed25519 private key
  apiKeyPublic: string;   // Hex-encoded Ed25519 public key
  accountIndex: number;
  apiKeyIndex: number;
}

export interface CreateOrderParams {
  marketIndex: number;
  clientOrderIndex: number;
  baseAmount: number;  // Signed integer (positive=buy, negative=sell)
  price: number;       // Price as integer
  isAsk: boolean;
  orderType: number;
  timeInForce: number;
  reduceOnly: number;  // 0 or 1
  triggerPrice: number;
  orderExpiry?: number;
}

export interface CancelOrderParams {
  marketIndex: number;
  orderIndex: number;
}

export interface Transaction {
  txType: number;
  payload: string;
  signature: string;
  accountIndex: number;
  apiKeyIndex: number;
  nonce: number;
}


// /**
//  * Generates a new Ed25519 key pair for Lighter API authentication
//  */
// export async function generateLighterAPIKey(): Promise<{ privateKey: string; publicKey: string }> {
//   // Generate random 32-byte private key
//   const privateKeyBytes = new Uint8Array(32);
//   if (typeof window !== 'undefined' && window.crypto) {
//     window.crypto.getRandomValues(privateKeyBytes);
//   } else {
//     // Node.js environment
//     const crypto = require('crypto');
//     crypto.randomFillSync(privateKeyBytes);
//   }

//   const publicKey = await ed25519.getPublicKeyAsync(privateKeyBytes);

//   return {
//     privateKey: Buffer.from(privateKeyBytes).toString('hex'),
//     publicKey: Buffer.from(publicKey).toString('hex'),
//   };
// }

/**
 * LighterAPIClient - Handles transaction signing and submission to Lighter
 */
export class LighterAPIClient {
  private credentials: LighterCredentials;
  private baseURL: string;

  constructor(credentials: LighterCredentials, baseURL: string = LIGHTER_API_BASE) {
    this.credentials = credentials;
    this.baseURL = baseURL;
  }

  /**
   * Get the next nonce for this API key
   */
  async getNextNonce(): Promise<number> {
    const response = await fetch(
      `${this.baseURL}/api/v1/nextNonce?account_index=${this.credentials.accountIndex}&api_key_index=${this.credentials.apiKeyIndex}`
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch nonce: ${response.statusText}`);
    }

    const data: any = await response.json();
    console.log('Nonce response data:', data);
    return data.nonce || 0;
  }

  /**
   * Sign a message using Ed25519
   */
  private async signMessage(message: string): Promise<string> {
    const privateKeyBytes = Buffer.from(this.credentials.apiKeyPrivate, 'hex');
    const messageBytes = Buffer.from(message, 'utf-8');

    console.log('Signing message:', message);
    console.log('Private key bytes:', privateKeyBytes);
    console.log('this.credentials.apiKeyPrivate:',this.credentials.apiKeyPrivate);

    const signature = await ed25519.signAsync(messageBytes, privateKeyBytes);
    return Buffer.from(signature).toString('hex');
  }

  /**
   * Serialize create order parameters into a message to sign
   */
  private serializeCreateOrder(params: CreateOrderParams, nonce: number): string {
    // Create a deterministic string representation for signing
    // Format: txType:accountIndex:apiKeyIndex:nonce:marketIndex:baseAmount:price:...
    const parts = [
      TX_TYPE_CREATE_ORDER,
      this.credentials.accountIndex,
      this.credentials.apiKeyIndex,
      nonce,
      params.marketIndex,
      params.clientOrderIndex,
      params.baseAmount,
      params.price,
      params.isAsk ? 1 : 0,
      params.orderType,
      params.timeInForce,
      params.reduceOnly,
      params.triggerPrice,
      params.orderExpiry || -1,
    ];

    return parts.join(':');
  }

  /**
   * Serialize cancel order parameters into a message to sign
   */
  private serializeCancelOrder(params: CancelOrderParams, nonce: number): string {
    const parts = [
      TX_TYPE_CANCEL_ORDER,
      this.credentials.accountIndex,
      this.credentials.apiKeyIndex,
      nonce,
      params.marketIndex,
      params.orderIndex,
    ];

    return parts.join(':');
  }

  /**
   * Sign a create order transaction
   */
  async signCreateOrder(params: CreateOrderParams, nonce?: number): Promise<Transaction> {
    const txNonce = nonce !== undefined ? nonce : await this.getNextNonce();
    const message = this.serializeCreateOrder(params, txNonce);
    const signature = await this.signMessage(message);

    // Create transaction payload
    const payload = JSON.stringify({
      market_index: params.marketIndex,
      client_order_index: params.clientOrderIndex,
      base_amount: params.baseAmount.toString(),
      price: params.price.toString(),
      is_ask: params.isAsk,
      order_type: params.orderType,
      time_in_force: params.timeInForce,
      reduce_only: params.reduceOnly,
      trigger_price: params.triggerPrice.toString(),
      order_expiry: params.orderExpiry || -1,
    });

    return {
      txType: TX_TYPE_CREATE_ORDER,
      payload,
      signature,
      accountIndex: this.credentials.accountIndex,
      apiKeyIndex: this.credentials.apiKeyIndex,
      nonce: txNonce,
    };
  }

  /**
   * Sign a cancel order transaction
   */
  async signCancelOrder(params: CancelOrderParams, nonce?: number): Promise<Transaction> {
    const txNonce = nonce !== undefined ? nonce : await this.getNextNonce();
    const message = this.serializeCancelOrder(params, txNonce);
    const signature = await this.signMessage(message);

    const payload = JSON.stringify({
      market_index: params.marketIndex,
      order_index: params.orderIndex,
    });

    return {
      txType: TX_TYPE_CANCEL_ORDER,
      payload,
      signature,
      accountIndex: this.credentials.accountIndex,
      apiKeyIndex: this.credentials.apiKeyIndex,
      nonce: txNonce,
    };
  }

  // /**
  //  * Send a signed transaction to Lighter
  //  */
  // async sendTransaction(transaction: Transaction): Promise<{ txHash: string; status: string }> {
  //   const requestBody = {
  //     tx_type: transaction.txType,
  //     account_index: transaction.accountIndex,
  //     api_key_index: transaction.apiKeyIndex,
  //     nonce: transaction.nonce,
  //     payload: transaction.payload,
  //     signature: transaction.signature,
  //   };

  //   const response = await fetch(`${this.baseURL}/api/v1/sendTx`, {
  //     method: 'POST',
  //     headers: {
  //       'Content-Type': 'application/json',
  //     },
  //     body: JSON.stringify(requestBody),
  //   });

  //   if (!response.ok) {
  //     const errorText = await response.text();
  //     throw new Error(`Transaction failed: ${response.statusText} - ${errorText}`);
  //   }

  //   const data: any = await response.json();
  //   return {
  //     txHash: data.tx_hash || data.txHash || '',
  //     status: data.status || 'submitted',
  //   };
  // }

  /**
   * Send a signed transaction to Lighter using multipart/form-data
   */
  async sendTransaction(transaction: Transaction): Promise<{ txHash: string; status: string }> {
    try {
      if (!transaction) {
        throw new Error('Transaction object is required');
      }

      if (!transaction.signature) {
        throw new Error('Transaction signature is required');
      }

      // Parse payload JSON string back to object
      let payloadObj: Record<string, any> = {};
      try {
        payloadObj = JSON.parse(transaction.payload);
      } catch (e) {
        logger.warn('Could not parse payload as JSON, treating as empty object');
      }

      // Create FormData
      const formData = new FormData();
      
      // Append required fields
      formData.append('tx_type', String(transaction.txType));
      formData.append('price_protection', 'false');
      
      // Build tx_info - merge all fields
      const txInfo: Record<string, any> = {
        AccountIndex: transaction.accountIndex,
        ApiKeyIndex: transaction.apiKeyIndex,
        Nonce: transaction.nonce,
        ...payloadObj,  // Now safely spread the parsed object
        Sig: transaction.signature,
      };
      
      // Append tx_info as stringified JSON
      const txInfoString = JSON.stringify(txInfo);
      formData.append('tx_info', txInfoString);
      
      logger.debug('📤 Sending transaction');
      logger.debug(`   Type: ${transaction.txType}`);
      logger.debug(`   Account: ${transaction.accountIndex}`);
      logger.debug(`   Nonce: ${transaction.nonce}`);
      logger.debug(`   tx_info keys: ${Object.keys(txInfo).join(', ')}`);

      // Send request
      const response = await fetch(`${this.baseURL}/api/v1/sendTx`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          // Don't set Content-Type - FormData will handle it
        },
        body: formData,
      });

      const responseText = await response.text();
      logger.debug(`Response [${response.status}]:`, responseText.substring(0, 300));

      if (!response.ok) {
        logger.error(`❌ API Error ${response.status}:`, responseText);
        throw new Error(`Transaction failed: ${response.status} - ${responseText}`);
      }

      const data = JSON.parse(responseText);
      
      if (data.code === 200 || data.success) {
        logger.info('✅ Transaction successful');
        logger.debug('Response:', data);
        return {
          txHash: data.tx_hash || data.txHash || data.hash || '',
          status: data.status || 'submitted',
        };
      } else {
        logger.error('❌ Transaction rejected:', data);
        throw new Error(`Transaction rejected: ${data.message || JSON.stringify(data)}`);
      }
      
    } catch (error) {
      logger.error('❌ Send transaction failed:', error);
      throw error;
    }
  }

  /**
   * Send multiple transactions in a batch
   */
  async sendTransactionBatch(transactions: Transaction[]): Promise<{ txHashes: string[]; status: string }> {
    const requestBody = {
      transactions: transactions.map(tx => ({
        tx_type: tx.txType,
        account_index: tx.accountIndex,
        api_key_index: tx.apiKeyIndex,
        nonce: tx.nonce,
        payload: tx.payload,
        signature: tx.signature,
      })),
    };

    const response = await fetch(`${this.baseURL}/api/v1/sendTxBatch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Batch transaction failed: ${response.statusText} - ${errorText}`);
    }

    const data : any = await response.json();
    return {
      txHashes: data.tx_hashes || data.txHashes || [],
      status: data.status || 'submitted',
    };
  }

  /**
   * Helper method: Create and submit an order in one call
   */
  async createOrder(params: CreateOrderParams): Promise<{ txHash: string; status: string }> {
    const transaction = await this.signCreateOrder(params);
    return this.sendTransaction(transaction);
  }

  /**
   * Helper method: Cancel an order in one call
   */
  async cancelOrder(params: CancelOrderParams): Promise<{ txHash: string; status: string }> {
    const transaction = await this.signCancelOrder(params);
    return this.sendTransaction(transaction);
  }

  /**
   * Fetch account information from Lighter
   */
  async getAccountInfo(accountIndex?: number): Promise<any> {
    const accIndex = accountIndex || this.credentials.accountIndex;
    const response = await fetch(`${this.baseURL}/api/v1/account?account_index=${accIndex}`);

    if (!response.ok) {
      throw new Error(`Failed to fetch account info: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Fetch account by L1 address
   */
  static async getAccountByL1Address(l1Address: string): Promise<any> {
    const response = await fetch(
      `${LIGHTER_API_BASE}/api/v1/accountsByL1Address?l1_address=${l1Address}`
    );

    if (!response.ok) {
      if (response.status === 404) {
        return null;  // Account not found
      }
      throw new Error(`Failed to fetch account: ${response.statusText}`);
    }

    return response.json();
  }
}

/**
 * Helper function to get market index from symbol
 */
export function getMarketIndex(symbol: string): number {
  const upperSymbol = symbol.toUpperCase();
  const index = MARKET_INDICES[upperSymbol];

  if (index === undefined) {
    throw new Error(`Unknown market symbol: ${symbol}`);
  }

  return index;
}

/**
 * Convert price from decimal to Lighter's integer format
 * Lighter uses uint32 for prices with a specific scaling factor
 */
export function priceToLighterFormat(price: number, decimals: number = 2): number {
  // Multiply by scaling factor (e.g., 100 for 2 decimals, 10000 for 4 decimals)
  return Math.floor(price * Math.pow(10, decimals));
}

/**
 * Convert size from decimal to Lighter's integer format
 * Lighter uses int64 for base amounts
 */
export function sizeToLighterFormat(size: number, isSell: boolean, decimals: number = 6): number {
  const scaledSize = Math.floor(Math.abs(size) * Math.pow(10, decimals));
  return isSell ? -scaledSize : scaledSize;
}
