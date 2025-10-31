import axios, { Method } from 'axios';
import * as crypto from 'crypto';
import { URLSearchParams } from 'url';
import { prisma } from '../lib/prisma';
import { decrypt } from '../lib/encryption';

const ASTER_BASE_URL = 'https://sapi.asterdex.com';
const RECV_WINDOW = 5000;

interface AsterSpotOrderParams {
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT' | 'STOP' | 'TAKE_PROFIT' | 'STOP_MARKET' | 'TAKE_PROFIT_MARKET';
  quantity?: string;
  quoteOrderQty?: string;
  price?: string;
  timeInForce?: 'GTC' | 'IOC' | 'FOK' | 'GTX';
  stopPrice?: string;
  newClientOrderId?: string;
}

export class AsterBrokerSpotTradingService {

  //Place Order
  async placeOrder(
    walletIdOrAddress: string,
    params: AsterSpotOrderParams
  ): Promise<any> {
    this.log('Placing Spot Order on Aster', { walletIdOrAddress, params });

    const apiKeyCreds = await this.getApiKeyCredentials(walletIdOrAddress);
    const apiKey = decrypt(apiKeyCreds.asterApiKey);
    const apiSecret = decrypt(apiKeyCreds.asterApiSecret);
    this.log('Aster Trading Address', { tradingAddress: apiKeyCreds.address });

    const signedParams = this.signRequest(params, apiSecret);
    this.log('Sending signed order to Aster', { signedParams });

    return await this.sendToAster('/api/v1/order', 'POST', signedParams, apiKey);
  }


  // Get order status
  async getOrder(
    walletIdOrAddress: string,
    params: { symbol: string; orderId?: number; origClientOrderId?: string }
  ): Promise<any> {
    const apiKeyCreds = await this.getApiKeyCredentials(walletIdOrAddress);
    const apiKey = decrypt(apiKeyCreds.asterApiKey);
    const apiSecret = decrypt(apiKeyCreds.asterApiSecret);

    const signedParams = this.signRequest(params, apiSecret);
    return await this.sendToAster('/api/v1/order', 'GET', signedParams, apiKey);
  }

  // Cancel an order
  async cancelOrder(
    walletIdOrAddress: string,
    params: { symbol: string; orderId?: number; origClientOrderId?: string }
  ): Promise<any> {
    const apiKeyCreds = await this.getApiKeyCredentials(walletIdOrAddress);
    const apiKey = decrypt(apiKeyCreds.asterApiKey);
    const apiSecret = decrypt(apiKeyCreds.asterApiSecret);

    const signedParams = this.signRequest(params, apiSecret);
    return await this.sendToAster('/api/v1/order', 'DELETE', signedParams, apiKey);
  }

  //Get Open orders
  async getOpenOrders(
    walletIdOrAddress: string,
    symbol?: string
  ): Promise<any> {
    this.log('Getting open orders', { walletIdOrAddress, symbol });
    const apiKeyCreds = await this.getApiKeyCredentials(walletIdOrAddress);
    const apiKey = decrypt(apiKeyCreds.asterApiKey);
    const apiSecret = decrypt(apiKeyCreds.asterApiSecret);

    const params: { symbol?: string } = {};
    if (symbol) {
      params.symbol = symbol;
    }

    const signedParams = this.signRequest(params, apiSecret);
    return await this.sendToAster('/api/v1/openOrders', 'GET', signedParams, apiKey);
  }

  //Get All Orders
  async getAllOrders(
      walletIdOrAddress: string,
      params: {
        symbol: string;
        orderId?: number;
        startTime?: number;
        endTime?: number;
        limit?: number;
      }
    ): Promise<any> {
      this.log('Getting all orders', { walletIdOrAddress, params });
      const apiKeyCreds = await this.getApiKeyCredentials(walletIdOrAddress);
      const apiKey = decrypt(apiKeyCreds.asterApiKey);
      const apiSecret = decrypt(apiKeyCreds.asterApiSecret);

      const signedParams = this.signRequest(params, apiSecret);
      return await this.sendToAster('/api/v1/allOrders', 'GET', signedParams, apiKey);
    }

    // Get My Trades
    async getMyTrades(
      walletIdOrAddress: string,
      params: {
        symbol: string;
        orderId?: number;
        startTime?: number;
        endTime?: number;
        fromId?: number;
        limit?: number;
      }
    ): Promise<any> {
      this.log('Getting user trades (my trades)', { walletIdOrAddress, params });
      const apiKeyCreds = await this.getApiKeyCredentials(walletIdOrAddress);
      const apiKey = decrypt(apiKeyCreds.asterApiKey);
      const apiSecret = decrypt(apiKeyCreds.asterApiSecret);

      const signedParams = this.signRequest(params, apiSecret);
      return await this.sendToAster('/api/v1/userTrades', 'GET', signedParams, apiKey);
    }

    // Get current account information (balances)
    async getAccountInfo(walletIdOrAddress: string): Promise<any> {
      this.log('Getting Spot Account Info', { walletIdOrAddress });

      const apiKeyCreds = await this.getApiKeyCredentials(walletIdOrAddress);
      const apiKey = decrypt(apiKeyCreds.asterApiKey);
      const apiSecret = decrypt(apiKeyCreds.asterApiSecret);

      const signedParams = this.signRequest({}, apiSecret);
      this.log('Getting account info');

      return await this.sendToAster('/api/v1/account', 'GET', signedParams, apiKey);
    }

    // Close Position
  async closePosition(
        walletIdOrAddress: string,
        symbol: string,
        baseAsset: string
      ): Promise<any> {
        this.log(`Attempting to close position for ${baseAsset} via ${symbol}`, { walletIdOrAddress });

        const accountInfo = await this.getAccountInfo(walletIdOrAddress);
        if (!accountInfo || !accountInfo.balances) {
          throw new Error("Failed to retrieve account balances.");
        }

        const assetBalance = accountInfo.balances.find((b: any) => b.asset === baseAsset);

        if (!assetBalance || !assetBalance.free) {
          throw new Error(`No free balance found for asset: ${baseAsset}`);
        }

        const freeQuantity = parseFloat(assetBalance.free);
        this.log(`Found free quantity: ${freeQuantity} ${baseAsset}`);

        if (freeQuantity <= 0) {
          this.log("No position to close (quantity is zero or less).");
          return { code: 0, msg: "No position to close.", quantity: 0 };
        }

        this.log(`Placing MARKET SELL for ${freeQuantity} ${baseAsset} on ${symbol}`);
        return this.placeOrder(walletIdOrAddress, {
          symbol,
          side: 'SELL',
          type: 'MARKET',
          quantity: freeQuantity.toString(),
        });
      }


  private async getApiKeyCredentials(walletIdOrAddress: string): Promise<{
    walletId: string;
    address: string;
    asterApiKey: string;
    asterApiSecret: string;
  }> {
    const apiKey = await prisma.asterApiKey.findFirst({
      where: {
        OR: [
          { walletId: walletIdOrAddress },
          { address: walletIdOrAddress.toLowerCase() },
        ],
      },
    });

    if (!apiKey) {
      throw new Error(
        'No Aster API key found. Please generate API key first using POST /api/aster/broker/generate-api-key'
      );
    }

    // Update lastUsedAt
    await prisma.asterApiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
    });

    return {
      walletId: apiKey.walletId,
      address: apiKey.address,
      asterApiKey: apiKey.asterApiKey,
      asterApiSecret: apiKey.asterApiSecret,
    };
  }


  private signRequest(params: any, apiSecret: string): Record<string, any> {
    const paramsWithTimestamp: Record<string, any> = {
      ...params,
      timestamp: Date.now(),
      recvWindow: RECV_WINDOW,
    };

    const finalParams: Record<string, any> = {};
    for (const key in paramsWithTimestamp) {
      if (
        paramsWithTimestamp[key] !== null &&
        paramsWithTimestamp[key] !== undefined
      ) {
        finalParams[key] = paramsWithTimestamp[key];
      }
    }

    const queryString = new URLSearchParams(finalParams).toString();


    const signature = crypto
      .createHmac('sha256', apiSecret)
      .update(queryString)
      .digest('hex');

    return {
      ...finalParams,
      signature,
    };
  }

  private async sendToAster(
    endpoint: string,
    method: Method,
    params: Record<string, any>,
    apiKey: string
  ): Promise<any> {
    const url = `${ASTER_BASE_URL}${endpoint}`;
    const headers = {
      'X-MBX-APIKEY': apiKey,
      'User-Agent': 'Hyperdex/1.0',
    };

    try {
      let response;

      if (method === 'POST') {
        response = await axios.post(url, new URLSearchParams(params).toString(), {
          headers: {
            ...headers,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        });
      } else if (method === 'GET') {
        response = await axios.get(url, { params, headers });
      } else if (method === 'DELETE') {
        response = await axios.delete(url, { params, headers });
      } else {
        throw new Error(`Unsupported method: ${method}`);
      }

      this.log('Aster Spot API response', {
        status: response?.status,
        data: response?.data
      });

      return response?.data;
    } catch (error: any) {
      const errorData = error.response?.data;
      console.error('[AsterBrokerSpotTrading] Error calling Aster:', {
        endpoint,
        method,
        error: errorData || error.message,
      });

      throw new Error(
        `Aster API error: ${errorData?.msg || error.message} (Code: ${errorData?.code})`
      );
    }
  }

  private log(message: string, data?: any): void {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[AsterBrokerSpotTrading] ${message}`, data || '');
    }
  }
}

export const asterBrokerSpotTradingService = new AsterBrokerSpotTradingService();
