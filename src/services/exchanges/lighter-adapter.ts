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
    return response.data.data;
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
      if (account.sub_accounts) {
        // Process sub-accounts for positions
        // This depends on the actual API response structure
      }
      return positions;
    } catch (error) {
      logger.error('Lighter: Error getting account positions:', error);
      throw error;
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
    const params: any = { account_index: accountIndex };
    if (marketId !== undefined) params.market_id = marketId;
    if (limit !== undefined) params.limit = limit;

    const response = await this.client.get('/api/v1/accountInactiveOrders', { params });
    return response.data.data || [];
  }

  // Market Data Operations
  async getOrderBooks(): Promise<LighterOrderBook[]> {
    const response = await this.client.get('/api/v1/orderBooks');
    return response.data.data;
  }

  async getOrderBookDetails(marketId: number): Promise<any> {
    const response = await this.client.get(`/api/v1/orderBookDetails?market_id=${marketId}`);
    return response.data.data;
  }

  async getRecentTrades(marketId: number, limit: number = 100): Promise<LighterTrade[]> {
    const response = await this.client.get(`/api/v1/recentTrades?market_id=${marketId}&limit=${limit}`);
    return response.data.data || [];
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
    const response = await this.client.get('/api/v1/exchangeStats');
    return response.data.data;
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
    const params = { account_index: accountIndex, index, limit };
    const response = await this.client.get('/api/v1/accountTxs', { params });
    return response.data.data || [];
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
  }

  // Note: The actual signing logic would need to be implemented
  // This requires Ed25519 signature generation which is more complex
  // For now, we provide the structure and interface

  private async signMessage(message: string): Promise<string> {
    // TODO: Implement Ed25519 signing
    // This would require either:
    // 1. A native module for Ed25519 signing
    // 2. Integration with the Python SDK via subprocess
    // 3. A JavaScript Ed25519 library
    throw new Error('Ed25519 signing not yet implemented');
  }

  private async sendSignedTransaction(tx: any): Promise<any> {
    // TODO: Implement transaction signing and sending
    // This requires the signed tx to be sent to the API
    throw new Error('Signed transaction sending not yet implemented');
  }

  async placeOrder(params: CreateOrderParams): Promise<{ tx: any; txHash: string; error?: string }> {
    try {
      // This would construct and sign an order transaction
      // For now, return placeholder
      logger.info('Lighter: Place order (not yet implemented)', params);
      throw new Error('Order placement not yet implemented - requires Ed25519 signing');
    } catch (error: any) {
      logger.error('Lighter: Error placing order:', error);
      return { tx: null, txHash: '', error: error.message };
    }
  }

  async cancelOrder(params: CancelOrderParams): Promise<{ tx: any; txHash: string; error?: string }> {
    try {
      logger.info('Lighter: Cancel order (not yet implemented)', params);
      throw new Error('Order cancellation not yet implemented - requires Ed25519 signing');
    } catch (error: any) {
      logger.error('Lighter: Error canceling order:', error);
      return { tx: null, txHash: '', error: error.message };
    }
  }

  async cancelAllOrders(marketId: number, timeInForce?: number): Promise<{ tx: any; txHash: string; error?: string }> {
    try {
      logger.info('Lighter: Cancel all orders (not yet implemented)', { marketId, timeInForce });
      throw new Error('Cancel all orders not yet implemented - requires Ed25519 signing');
    } catch (error: any) {
      logger.error('Lighter: Error canceling all orders:', error);
      return { tx: null, txHash: '', error: error.message };
    }
  }

  async updateLeverage(params: UpdateLeverageParams): Promise<{ tx: any; txHash: string; error?: string }> {
    try {
      logger.info('Lighter: Update leverage (not yet implemented)', params);
      throw new Error('Leverage update not yet implemented - requires Ed25519 signing');
    } catch (error: any) {
      logger.error('Lighter: Error updating leverage:', error);
      return { tx: null, txHash: '', error: error.message };
    }
  }

  async transfer(params: TransferParams): Promise<{ tx: any; txHash: string; error?: string }> {
    try {
      logger.info('Lighter: Transfer (not yet implemented)', params);
      throw new Error('Transfer not yet implemented - requires Ed25519 signing');
    } catch (error: any) {
      logger.error('Lighter: Error transferring:', error);
      return { tx: null, txHash: '', error: error.message };
    }
  }

  async withdraw(params: WithdrawParams): Promise<{ tx: any; txHash: string; error?: string }> {
    try {
      logger.info('Lighter: Withdraw (not yet implemented)', params);
      throw new Error('Withdrawal not yet implemented - requires Ed25519 signing');
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
    const details = await this.restClient.getOrderBookDetails(marketId);
    // Format the response to match LighterOrderBook interface
    return {
      market_id: marketId,
      bids: details.bids?.slice(0, limit) || [],
      asks: details.asks?.slice(0, limit) || [],
      timestamp: Date.now(),
    };
  }

  async getRecentTrades(marketId: number, limit: number = 100): Promise<LighterTrade[]> {
    return this.restClient.getRecentTrades(marketId, limit);
  }

  async getTickerData(marketId: number): Promise<LighterTickPrice> {
    const stats = await this.restClient.getExchangeStats();
    const marketStats = stats.markets?.[marketId];
    
    if (!marketStats) {
      throw new Error(`Market ${marketId} not found`);
    }

    return {
      market_id: marketId,
      mark_price: marketStats.mark_price || '0',
      index_price: marketStats.index_price || '0',
      last_price: marketStats.last_price || '0',
      funding_rate: marketStats.funding_rate || '0',
      open_interest: marketStats.open_interest || '0',
      volume_24h: marketStats.volume_24h || '0',
    };
  }

  // Account Operations
  async getAccountByIndex(accountIndex: number): Promise<LighterAccount> {
    return this.restClient.getAccount('index', accountIndex.toString());
  }

  async getAccountByAddress(l1Address: string): Promise<LighterAccount> {
    return this.restClient.getAccount('l1_address', l1Address);
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

