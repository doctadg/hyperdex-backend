import axios from 'axios';

const ASTER_BASE_URL = 'https://sapi.asterdex.com';

/**
 * Service for handling all PUBLIC, NON-AUTHENTICATED market data endpoints.
 */
export class AsterBrokerMarketDataService {

  private async sendPublicRequest(endpoint: string, params: Record<string, any> = {}): Promise<any> {
    const url = `${ASTER_BASE_URL}${endpoint}`;
    try {
      const response = await axios.get(url, { params });
      return response.data;
    } catch (error: any) {
      const errorData = error.response?.data;
      console.error('[AsterBrokerMarketData] Error calling Aster:', {
        endpoint,
        error: errorData || error.message,
      });
      throw new Error(
        `Aster API error: ${errorData?.msg || error.message} (Code: ${errorData?.code})`
      );
    }
  }

  /**
   * Test server connectivity
   * GET /api/v1/ping
   */
  async ping(): Promise<any> {
    return this.sendPublicRequest('/api/v1/ping');
  }

  /**
   * Get server time
   * GET /api/v1/time
   */
  async getServerTime(): Promise<any> {
    return this.sendPublicRequest('/api/v1/time');
  }

  /**
   * Get exchange trading rules and symbol information
   * GET /api/v1/exchangeInfo
   */
  async getExchangeInfo(): Promise<any> {
    return this.sendPublicRequest('/api/v1/exchangeInfo');
  }

  /**
   * Get order book depth
   * GET /api/v1/depth
   */
  async getOrderBook(symbol: string, limit: number = 100): Promise<any> {
    if (![5, 10, 20, 50, 100, 500, 1000].includes(limit)) {
      throw new Error('Invalid limit: must be one of 5, 10, 20, 50, 100, 500, 1000');
    }
    return this.sendPublicRequest('/api/v1/depth', { symbol, limit });
  }

  /**
   * Get recent public trades
   * GET /api/v1/trades
   */
  async getRecentTrades(symbol: string, limit: number = 500): Promise<any> {
    return this.sendPublicRequest('/api/v1/trades', { symbol, limit });
  }

  /**
   * Get older public trades
   * GET /api/v1/historicalTrades
   */
  async getHistoricalTrades(symbol: string, limit: number = 500, fromId?: number): Promise<any> {
    const params: any = { symbol, limit };
    if (fromId) {
      params.fromId = fromId;
    }
    return this.sendPublicRequest('/api/v1/historicalTrades', params);
  }

  /**
   * Get aggregated public trades
   * GET /api/v1/aggTrades
   */
  async getAggTrades(symbol: string, params: { fromId?: number, startTime?: number, endTime?: number, limit?: number }): Promise<any> {
    return this.sendPublicRequest('/api/v1/aggTrades', { symbol, ...params });
  }

  /**
   * Get kline/candlestick data
   * GET /api/v1/klines
   */
  async getKlines(symbol: string, interval: string, params: { startTime?: number, endTime?: number, limit?: number }): Promise<any> {
    return this.sendPublicRequest('/api/v1/klines', { symbol, interval, ...params });
  }

  /**
   * Get 24hr ticker price change statistics
   * GET /api/v1/ticker/24hr
   */
  async getTicker24h(symbol?: string): Promise<any> {
    const params = symbol ? { symbol } : {};
    return this.sendPublicRequest('/api/v1/ticker/24hr', params);
  }

  /**
   * Get latest price for a symbol or symbols
   * GET /api/v1/ticker/price
   */
  async getTickerPrice(symbol?: string): Promise<any> {
    const params = symbol ? { symbol } : {};
    return this.sendPublicRequest('/api/v1/ticker/price', params);
  }

  /**
   * Get best price/qty on the order book for a symbol or symbols
   * GET /api/v1/ticker/bookTicker
   */
  async getBookTicker(symbol?: string): Promise<any> {
    const params = symbol ? { symbol } : {};
    return this.sendPublicRequest('/api/v1/ticker/bookTicker', params);
  }
}

export const asterBrokerMarketDataService = new AsterBrokerMarketDataService();
