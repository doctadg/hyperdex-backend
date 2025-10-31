import axios, { Method } from 'axios';
import * as crypto from 'crypto';
import { URLSearchParams } from 'url';
import { prisma } from '../lib/prisma';
import { decrypt } from '../lib/encryption';

const ASTER_BASE_URL = 'https://sapi.asterdex.com';
const RECV_WINDOW = 5000;

/**
 * Service for handling AUTHENTICATED wallet/account actions
 * like transfers and withdrawals.
 */
export class AsterBrokerWalletService {

  /**
   * Transfer funds between Spot and Futures accounts.
   * POST /api/v1/asset/wallet/transfer (TRADE)
   */
  async transferPerpSpot(
    walletIdOrAddress: string,
    params: {
      amount: string; // e.g., "100.50"
      asset: string; // e.g., "USDT"
      clientTranId: string;
      kindType: 'FUTURE_SPOT' | 'SPOT_FUTURE';
    }
  ): Promise<any> {
    this.log('Transferring Perp/Spot', { walletIdOrAddress, params });
    const apiKeyCreds = await this.getApiKeyCredentials(walletIdOrAddress);
    const apiKey = decrypt(apiKeyCreds.asterApiKey);
    const apiSecret = decrypt(apiKeyCreds.asterApiSecret);

    const signedParams = this.signRequest(params, apiSecret);
    return await this.sendToAster('/api/v1/asset/wallet/transfer', 'POST', signedParams, apiKey);
  }

  /**
   * Transfer funds to another AsterDEX user (internal transfer).
   * POST /api/v1/asset/sendToAddress (TRADE)
   */
  async internalTransfer(
    walletIdOrAddress: string,
    params: {
      amount: string; // e.g., "100.50"
      asset: string; // e.g., "USDT"
      toAddress: string;
      clientTranId?: string;
    }
  ): Promise<any> {
    this.log('Sending internal transfer', { walletIdOrAddress, params });
    const apiKeyCreds = await this.getApiKeyCredentials(walletIdOrAddress);
    const apiKey = decrypt(apiKeyCreds.asterApiKey);
    const apiSecret = decrypt(apiKeyCreds.asterApiSecret);

    const signedParams = this.signRequest(params, apiSecret);
    return await this.sendToAster('/api/v1/asset/sendToAddress', 'POST', signedParams, apiKey);
  }

  /**
   * Get estimated withdrawal fee (public).
   * GET /api/v1/aster/withdraw/estimateFee (NONE)
   */
  async getWithdrawFee(asset: string, chainId: string): Promise<any> {
    this.log('Getting withdraw fee estimate', { asset, chainId });
    const url = `${ASTER_BASE_URL}/api/v1/aster/withdraw/estimateFee`;
    try {
      const response = await axios.get(url, { params: { asset, chainId } });
      return response.data;
    } catch (error: any) {
      const errorData = error.response?.data;
      console.error('[AsterBrokerWallet] Error getting withdraw fee:', {
        error: errorData || error.message,
      });
      throw new Error(
        `Aster API error: ${errorData?.msg || error.message} (Code: ${errorData?.code})`
      );
    }
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
      console.error('[AsterBrokerWallet] Error calling Aster:', {
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
      console.log(`[AsterBrokerWallet] ${message}`, data || '');
    }
  }
}

export const asterBrokerWalletService = new AsterBrokerWalletService();
