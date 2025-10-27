import { exchangeConfig } from '@/config/exchanges';
import { logger } from '@/utils/logger';
import axios, { AxiosInstance } from 'axios';

// ============================================
// Types Definitions
// ============================================

export interface LighterAccount {
  account_index: number;
  l1_address: string;
  sub_accounts?: any[];
  created_at?: number;
}

export interface LighterPosition {
  market_id: number;
  side: 'long' | 'short';
  size: string;
  entry_price: string;
  mark_price: string;
  unrealized_pnl: string;
  leverage: string;
  margin: string;
  liquidation_price?: string;
}

export interface LighterOrder {
  order_id: string;
  market_id: number;
  side: 'buy' | 'sell';
  order_type: number;
  price: string;
  size: string;
  filled_size: string;
  status: string;
  time_in_force: number;
  trigger_price?: string;
  timestamp: number;
  client_order_id?: string;
}

export interface LighterMarketInfo {
  market_id: number;
  base_token: string;
  quote_token: string;
  decimals: number;
  tick_size: string;
  min_order_size: string;
  max_leverage: string;
}

export interface LighterOrderBook {
  market_id: number;
  bids: Array<[string, string]>;
  asks: Array<[string, string]>;
  timestamp: number;
}

export interface LighterTrade {
  trade_id: number;
  market_id: number;
  price: string;
  size: string;
  side: 'buy' | 'sell';
  timestamp: number;
  tx_hash: string;
}

export interface LighterAccountStats {
  account_index: number;
  total_collateral: string;
  total_collateral_usd: string;
  available_margin: string;
  open_positions: LighterPosition[];
  open_orders: LighterOrder[];
}

export interface LighterTickPrice {
  market_id: number;
  mark_price: string;
  index_price: string;
  last_price: string;
  funding_rate: string;
  open_interest: string;
  volume_24h: string;
}

// Order creation parameters
export interface CreateOrderParams {
  market_index: number;
  client_order_index: number;
  base_amount: string;
  price: string;
  is_ask: boolean;
  order_type: number;
  time_in_force: number;
  reduce_only?: boolean;
  trigger_price?: string;
  expiry?: number;
}

export interface CancelOrderParams {
  market_index: number;
  order_index: number;
}

export interface UpdateLeverageParams {
  market_index: number;
  leverage: number;
}

export interface TransferParams {
  account_index_to: number;
  amount: string;
}

export interface WithdrawParams {
  to_address: string;
  amount: string;
}

// ============================================
// Lighter REST API Client
// ============================================

export class LighterRestClient {
  private client: AxiosInstance;
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || exchangeConfig.lighter.restUrl;
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  // Account Operations
  async getAccount(by: 'index' | 'l1_address', value: string): Promise<LighterAccount> {
    const response = await this.client.get(`/api/v1/account?by=${by}&value=${value}`);
    // Handle both response.data.data and response.data structures
    return response.data?.data || response.data;
  }

  async getAccountsByL1Address(l1Address: string): Promise<LighterAccount[]> {
    const response = await this.client.get(`/api/v1/accountsByL1Address?l1_address=${l1Address}`);
    return response.data.data;
  }

  async getAccountPositions(accountIndex: number): Promise<LighterPosition[]> {
    try {
      const account = await this.getAccount('index', accountIndex.toString());
      // Parse positions from account data
      const positions: LighterPosition[] = [];
      
      logger.debug(`Lighter: Account ${accountIndex} positions`, {
        hasAccount: !!account,
        hasSubAccounts: !!(account && account.sub_accounts),
      });
      
      if (account && account.sub_accounts) {
        // Process sub-accounts for positions
        // This depends on the actual API response structure
        // TODO: Implement proper position parsing based on API response
      }
      return positions;
    } catch (error) {
      logger.error('Lighter: Error getting account positions:', error);
      // Return empty array instead of throwing
      return [];
    }
  }

  async getAccountPnL(
    accountIndex: number,
    startTimestamp?: number,
    endTimestamp?: number
  ): Promise<any> {
    const params: any = { account_index: accountIndex };
    if (startTimestamp) params.start_timestamp = startTimestamp;
    if (endTimestamp) params.end_timestamp = endTimestamp;

    const response = await this.client.get('/api/v1/pnl', { params });
    return response.data.data;
  }

  async getAccountInactiveOrders(
    accountIndex: number,
    marketId?: number,
    limit?: number
  ): Promise<LighterOrder[]> {
    try {
      const params: any = { account_index: accountIndex };
      if (marketId !== undefined) params.market_id = marketId;
      if (limit !== undefined) params.limit = limit;

      const response = await this.client.get('/api/v1/accountInactiveOrders', { params });
      // Handle both response.data.data and response.data structures
      return response.data?.data || response.data || [];
    } catch (error: any) {
      logger.error('Lighter: Error getting inactive orders:', error.message);
      return [];
    }
  }

  // Market Data Operations
  async getOrderBooks(): Promise<LighterOrderBook[]> {
    const response = await this.client.get('/api/v1/orderBooks');
    return response.data.data;
  }

  async getOrderBookDetails(marketId: number): Promise<any> {
    try {
      const response = await this.client.get(`/api/v1/orderBookDetails?market_id=${marketId}`);
      // Handle both response.data.data and response.data structures
      const data = response.data?.data || response.data;
      
      // Log for debugging
      logger.debug(`Lighter: OrderBookDetails for market ${marketId}`, {
        hasData: !!data,
        keys: data ? Object.keys(data) : [],
      });
      
      return data || {};
    } catch (error: any) {
      logger.error('Lighter: Error getting order book details:', error.message);
      return {};
    }
  }

  async getRecentTrades(marketId: number, limit: number = 100): Promise<LighterTrade[]> {
    try {
      const response = await this.client.get(`/api/v1/recentTrades?market_id=${marketId}&limit=${limit}`);
      // Handle both response.data.data and response.data structures
      const trades = response.data?.data || response.data || [];
      
      logger.debug(`Lighter: Recent trades for market ${marketId}`, {
        count: Array.isArray(trades) ? trades.length : 0,
      });
      
      return Array.isArray(trades) ? trades : [];
    } catch (error: any) {
      logger.error('Lighter: Error getting recent trades:', error.message);
      return [];
    }
  }

  async getTrades(
    marketId: number,
    startTimestamp?: number,
    endTimestamp?: number,
    limit?: number
  ): Promise<LighterTrade[]> {
    const params: any = { market_id: marketId };
    if (startTimestamp) params.start_timestamp = startTimestamp;
    if (endTimestamp) params.end_timestamp = endTimestamp;
    if (limit) params.limit = limit;

    const response = await this.client.get('/api/v1/trades', { params });
    return response.data.data || [];
  }

  async getExchangeStats(): Promise<any> {
    try {
      const response = await this.client.get('/api/v1/exchangeStats');
      // Handle both response.data.data and response.data structures
      const data = response.data?.data || response.data;
      
      logger.debug('Lighter: Exchange stats', {
        hasData: !!data,
        keys: data ? Object.keys(data) : [],
      });
      
      return data || {};
    } catch (error: any) {
      logger.error('Lighter: Error getting exchange stats:', error.message);
      return {};
    }
  }

  // Candlestick/Chart Data
  async getCandlesticks(
    marketId: number,
    resolution: string,
    startTimestamp?: number,
    endTimestamp?: number,
    countBack?: number
  ): Promise<any[]> {
    const params: any = {
      market_id: marketId,
      resolution,
    };
    if (startTimestamp) params.start_timestamp = startTimestamp;
    if (endTimestamp) params.end_timestamp = endTimestamp;
    if (countBack) params.count_back = countBack;

    const response = await this.client.get('/api/v1/candlesticks', { params });
    return response.data.data || [];
  }

  // Transaction Operations
  async getAccountTransactions(
    accountIndex: number,
    index: number = 0,
    limit: number = 100
  ): Promise<any[]> {
    try {
      const params = { account_index: accountIndex, index, limit };
      const response = await this.client.get('/api/v1/accountTxs', { params });
      // Handle both response.data.data and response.data structures
      return response.data?.data || response.data || [];
    } catch (error: any) {
      logger.error('Lighter: Error getting account transactions:', error.message);
      return [];
    }
  }

  async getNextNonce(accountIndex: number, apiKeyIndex: number): Promise<number> {
    const params = { account_index: accountIndex, api_key_index: apiKeyIndex };
    const response = await this.client.get('/api/v1/nextNonce', { params });
    return response.data.data.nonce;
  }

  // Funding & Fees
  async getFundingRates(marketId: number): Promise<any> {
    const response = await this.client.get(`/api/v1/fundings?market_id=${marketId}`);
    return response.data.data;
  }

  async getDepositHistory(accountIndex: number): Promise<any> {
    const params = { account_index: accountIndex };
    const response = await this.client.get('/api/v1/deposit/history', { params });
    return response.data.data || [];
  }

  async getWithdrawHistory(accountIndex: number): Promise<any> {
    const params = { account_index: accountIndex };
    const response = await this.client.get('/api/v1/withdraw/history', { params });
    return response.data.data || [];
  }

  // Status & Health
  async getStatus(): Promise<any> {
    const response = await this.client.get('/');
    return response.data;
  }

  async getInfo(): Promise<any> {
    const response = await this.client.get('/info');
    return response.data;
  }
}

// ============================================
// Lighter Signer Client (for authenticated operations)
// ============================================

export class LighterSignerClient {
  private restClient: LighterRestClient;
  private privateKey: string;
  private accountIndex: number;
  private apiKeyIndex: number;
  private baseUrl: string;
  private signer: any; // LighterSigner from lighter-signer.ts

  constructor(
    privateKey: string,
    accountIndex: number,
    apiKeyIndex: number,
    baseUrl?: string
  ) {
    this.privateKey = privateKey;
    this.accountIndex = accountIndex;
    this.apiKeyIndex = apiKeyIndex;
    this.baseUrl = baseUrl || exchangeConfig.lighter.restUrl;
    this.restClient = new LighterRestClient(this.baseUrl);
    
    // Import and initialize the TypeScript signer
    import('./lighter-signer').then((module) => {
      this.signer = new module.LighterSigner(privateKey, accountIndex, baseUrl);
    }).catch((error) => {
      logger.error('Failed to initialize LighterSigner:', error);
    });
  }

  private async getSigner() {
    if (!this.signer) {
      const signerModule = await import('./lighter-signer');
      this.signer = new signerModule.LighterSigner(this.privateKey, this.accountIndex, this.baseUrl);
    }
    return this.signer;
  }

  async placeOrder(params: CreateOrderParams): Promise<{ tx: any; txHash: string; error?: string }> {
    try {
      logger.info('Lighter: Placing order via TypeScript signer', params);
      const signer = await this.getSigner();
      return await signer.createOrder(
        {
          marketIndex: params.market_index,
          clientOrderIndex: params.client_order_index,
          baseAmount: params.base_amount,
          price: params.price,
          isAsk: params.is_ask,
          orderType: params.order_type,
          timeInForce: params.time_in_force,
          reduceOnly: params.reduce_only || false,
          triggerPrice: params.trigger_price || '0',
        },
        this.apiKeyIndex
      );
    } catch (error: any) {
      logger.error('Lighter: Error placing order:', error);
      return { tx: null, txHash: '', error: error.message };
    }
  }

  async cancelOrder(params: CancelOrderParams): Promise<{ tx: any; txHash: string; error?: string }> {
    try {
      logger.info('Lighter: Canceling order via TypeScript signer', params);
      const signer = await this.getSigner();
      return await signer.cancelOrder(
        {
          marketIndex: params.market_index,
          orderIndex: params.order_index,
        },
        this.apiKeyIndex
      );
    } catch (error: any) {
      logger.error('Lighter: Error canceling order:', error);
      return { tx: null, txHash: '', error: error.message };
    }
  }

  async cancelAllOrders(marketId: number, timeInForce?: number): Promise<{ tx: any; txHash: string; error?: string }> {
    try {
      logger.info('Lighter: Canceling all orders via TypeScript signer', { marketId, timeInForce });
      const signer = await this.getSigner();
      return await signer.cancelAllOrders(
        {
          marketIndex: marketId,
          timeInForce: timeInForce || 0,
        },
        this.apiKeyIndex
      );
    } catch (error: any) {
      logger.error('Lighter: Error canceling all orders:', error);
      return { tx: null, txHash: '', error: error.message };
    }
  }

  async updateLeverage(params: UpdateLeverageParams): Promise<{ tx: any; txHash: string; error?: string }> {
    try {
      logger.info('Lighter: Updating leverage via TypeScript signer', params);
      const signer = await this.getSigner();
      return await signer.updateLeverage(
        {
          marketIndex: params.market_index,
          leverage: params.leverage,
        },
        this.apiKeyIndex
      );
    } catch (error: any) {
      logger.error('Lighter: Error updating leverage:', error);
      return { tx: null, txHash: '', error: error.message };
    }
  }

  async transfer(params: TransferParams): Promise<{ tx: any; txHash: string; error?: string }> {
    try {
      logger.info('Lighter: Transfer (not yet implemented in TS signer)', params);
      throw new Error('Transfer not yet implemented');
    } catch (error: any) {
      logger.error('Lighter: Error transferring:', error);
      return { tx: null, txHash: '', error: error.message };
    }
  }

  async withdraw(params: WithdrawParams): Promise<{ tx: any; txHash: string; error?: string }> {
    try {
      logger.info('Lighter: Withdraw (not yet implemented in TS signer)', params);
      throw new Error('Withdrawal not yet implemented');
    } catch (error: any) {
      logger.error('Lighter: Error withdrawing:', error);
      return { tx: null, txHash: '', error: error.message };
    }
  }
}

// ============================================
// Lighter Adapter Service
// ============================================

export class LighterAdapter {
  private restClient: LighterRestClient;
  private signerClients: Map<string, LighterSignerClient> = new Map();

  constructor(baseUrl?: string) {
    this.restClient = new LighterRestClient(baseUrl);
  }

  // Initialize signer for a specific wallet
  initializeSigner(walletAddress: string, privateKey: string, accountIndex: number, apiKeyIndex: number = 2): void {
    const signerKey = this.getSignerKey(walletAddress, accountIndex);
    const signer = new LighterSignerClient(privateKey, accountIndex, apiKeyIndex);
    this.signerClients.set(signerKey, signer);
    logger.info(`Lighter: Initialized signer for wallet ${walletAddress}`);
  }

  private getSignerKey(walletAddress: string, accountIndex: number): string {
    return `${walletAddress}:${accountIndex}`;
  }

  // Market Data Operations
  async getMarketInfo(marketId: number): Promise<LighterMarketInfo> {
    return this.restClient.getOrderBookDetails(marketId);
  }

  async getOrderBook(marketId: number, limit: number = 50): Promise<LighterOrderBook> {
    try {
      const details = await this.restClient.getOrderBookDetails(marketId);
      
      // Handle different response structures
      const bids = Array.isArray(details?.bids) ? details.bids : details?.order_book?.bids || [];
      const asks = Array.isArray(details?.asks) ? details.asks : details?.order_book?.asks || [];
      
      // Format the response to match LighterOrderBook interface
      return {
        market_id: marketId,
        bids: (bids as any).slice(0, limit) || [],
        asks: (asks as any).slice(0, limit) || [],
        timestamp: Date.now(),
      };
    } catch (error: any) {
      logger.error('Lighter: Error getting order book:', error.message);
      return {
        market_id: marketId,
        bids: [],
        asks: [],
        timestamp: Date.now(),
      };
    }
  }

  async getRecentTrades(marketId: number, limit: number = 100): Promise<LighterTrade[]> {
    return this.restClient.getRecentTrades(marketId, limit);
  }

  async getTickerData(marketId: number): Promise<LighterTickPrice> {
    try {
      const stats = await this.restClient.getExchangeStats();
      const marketStats = stats?.markets?.[marketId] || stats?.market_stats;
      
      if (!marketStats) {
        logger.warn(`Lighter: Market ${marketId} stats not found`);
        return {
          market_id: marketId,
          mark_price: '0',
          index_price: '0',
          last_price: '0',
          funding_rate: '0',
          open_interest: '0',
          volume_24h: '0',
        };
      }

      return {
        market_id: marketId,
        mark_price: marketStats.mark_price || marketStats.last_price || '0',
        index_price: marketStats.index_price || marketStats.last_price || '0',
        last_price: marketStats.last_price || marketStats.mark_price || '0',
        funding_rate: marketStats.funding_rate || '0',
        open_interest: marketStats.open_interest || '0',
        volume_24h: marketStats.volume_24h || marketStats.daily_quote_token_volume || '0',
      };
    } catch (error: any) {
      logger.error('Lighter: Error getting ticker data:', error.message);
      return {
        market_id: marketId,
        mark_price: '0',
        index_price: '0',
        last_price: '0',
        funding_rate: '0',
        open_interest: '0',
        volume_24h: '0',
      };
    }
  }

  // Account Operations
  async getAccountByIndex(accountIndex: number): Promise<LighterAccount | null> {
    try {
      return await this.restClient.getAccount('index', accountIndex.toString());
    } catch (error: any) {
      logger.error('Lighter: Error getting account by index:', error.message);
      return null;
    }
  }

  async getAccountByAddress(l1Address: string): Promise<LighterAccount | null> {
    try {
      return await this.restClient.getAccount('l1_address', l1Address);
    } catch (error: any) {
      logger.error('Lighter: Error getting account by address:', error.message);
      return null;
    }
  }

  async getAccountPositions(accountIndex: number): Promise<LighterPosition[]> {
    return this.restClient.getAccountPositions(accountIndex);
  }

  async getAccountPnL(accountIndex: number, startTimestamp?: number, endTimestamp?: number): Promise<any> {
    return this.restClient.getAccountPnL(accountIndex, startTimestamp, endTimestamp);
  }

  async getOpenOrders(accountIndex: number, marketId?: number): Promise<LighterOrder[]> {
    return this.restClient.getAccountInactiveOrders(accountIndex, marketId);
  }

  async getOrderHistory(accountIndex: number, marketId?: number, limit?: number): Promise<LighterOrder[]> {
    return this.restClient.getAccountInactiveOrders(accountIndex, marketId, limit);
  }

  async getBalances(accountIndex: number): Promise<any> {
    // This would get account balances from the account data
    const account = await this.getAccountByIndex(accountIndex);
    // Parse balances from account data
    // The structure depends on the actual API response
    return {};
  }

  async getLedger(accountIndex: number): Promise<any> {
    return this.restClient.getAccountTransactions(accountIndex);
  }

  // Trading Operations (require signer)
  async placeOrder(
    walletAddress: string,
    accountIndex: number,
    orderParams: CreateOrderParams
  ): Promise<{ tx: any; txHash: string; error?: string }> {
    const signerKey = this.getSignerKey(walletAddress, accountIndex);
    const signer = this.signerClients.get(signerKey);

    if (!signer) {
      throw new Error(`Signer not initialized for wallet ${walletAddress}, account ${accountIndex}`);
    }

    return signer.placeOrder(orderParams);
  }

  async cancelOrder(
    walletAddress: string,
    accountIndex: number,
    cancelParams: CancelOrderParams
  ): Promise<{ tx: any; txHash: string; error?: string }> {
    const signerKey = this.getSignerKey(walletAddress, accountIndex);
    const signer = this.signerClients.get(signerKey);

    if (!signer) {
      throw new Error(`Signer not initialized for wallet ${walletAddress}, account ${accountIndex}`);
    }

    return signer.cancelOrder(cancelParams);
  }

  async cancelAllOrders(
    walletAddress: string,
    accountIndex: number,
    marketId: number,
    timeInForce?: number
  ): Promise<{ tx: any; txHash: string; error?: string }> {
    const signerKey = this.getSignerKey(walletAddress, accountIndex);
    const signer = this.signerClients.get(signerKey);

    if (!signer) {
      throw new Error(`Signer not initialized for wallet ${walletAddress}, account ${accountIndex}`);
    }

    return signer.cancelAllOrders(marketId, timeInForce);
  }

  async updateLeverage(
    walletAddress: string,
    accountIndex: number,
    leverageParams: UpdateLeverageParams
  ): Promise<{ tx: any; txHash: string; error?: string }> {
    const signerKey = this.getSignerKey(walletAddress, accountIndex);
    const signer = this.signerClients.get(signerKey);

    if (!signer) {
      throw new Error(`Signer not initialized for wallet ${walletAddress}, account ${accountIndex}`);
    }

    return signer.updateLeverage(leverageParams);
  }

  async transfer(
    walletAddress: string,
    accountIndex: number,
    transferParams: TransferParams
  ): Promise<{ tx: any; txHash: string; error?: string }> {
    const signerKey = this.getSignerKey(walletAddress, accountIndex);
    const signer = this.signerClients.get(signerKey);

    if (!signer) {
      throw new Error(`Signer not initialized for wallet ${walletAddress}, account ${accountIndex}`);
    }

    return signer.transfer(transferParams);
  }

  async withdraw(
    walletAddress: string,
    accountIndex: number,
    withdrawParams: WithdrawParams
  ): Promise<{ tx: any; txHash: string; error?: string }> {
    const signerKey = this.getSignerKey(walletAddress, accountIndex);
    const signer = this.signerClients.get(signerKey);

    if (!signer) {
      throw new Error(`Signer not initialized for wallet ${walletAddress}, account ${accountIndex}`);
    }

    return signer.withdraw(withdrawParams);
  }

  // Health & Status
  async healthCheck(): Promise<boolean> {
    try {
      await this.restClient.getStatus();
      return true;
    } catch (error) {
      logger.error('Lighter: Health check failed', error);
      return false;
    }
  }

  async getExchangeInfo(): Promise<any> {
    return this.restClient.getInfo();
  }
}

