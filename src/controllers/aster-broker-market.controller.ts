import { Request, Response } from 'express';
import { asterBrokerMarketDataService } from '../services/aster-broker-market-data.service';


/**
 * Get server time
 * GET /api/aster/market/time
 */
export async function getServerTime(req: Request, res: Response): Promise<void> {
  try {
    const result = await asterBrokerMarketDataService.getServerTime();
    res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    console.error('[AsterMarketController] Error getServerTime:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get server time',
      message: error.message,
    });
  }
}

/**
 * Get exchange info
 * GET /api/aster/market/exchange-info
 */
export async function getExchangeInfo(req: Request, res: Response): Promise<void> {
  try {
    const result = await asterBrokerMarketDataService.getExchangeInfo();
    res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    console.error('[AsterMarketController] Error getExchangeInfo:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get exchange info',
      message: error.message,
    });
  }
}

/**
 * Get order book depth
 * GET /api/aster/market/depth?symbol=ETHUSDT&limit=50
 */
export async function getOrderBook(req: Request, res: Response): Promise<void> {
  try {
    const { symbol, limit } = req.query;
    if (!symbol) {
      res.status(400).json({
        success: false,
        error: 'Missing parameter',
        message: 'symbol is required',
      });
      return;
    }

    const result = await asterBrokerMarketDataService.getOrderBook(
      symbol as string,
      limit ? Number(limit) : 100
    );
    res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    console.error('[AsterMarketController] Error getOrderBook:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get order book',
      message: error.message,
    });
  }
}

/**
 * Get recent trades
 * GET /api/aster/market/trades?symbol=ETHUSDT&limit=10
 */
export async function getRecentTrades(req: Request, res: Response): Promise<void> {
  try {
    const { symbol, limit } = req.query;
    if (!symbol) {
      res.status(400).json({
        success: false,
        error: 'Missing parameter',
        message: 'symbol is required',
      });
      return;
    }
    const result = await asterBrokerMarketDataService.getRecentTrades(
      symbol as string,
      limit ? Number(limit) : 500
    );
    res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    console.error('[AsterMarketController] Error getRecentTrades:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get recent trades',
      message: error.message,
    });
  }
}

/**
 * Get klines (candlesticks)
 * GET /api/aster/market/klines?symbol=ETHUSDT&interval=1h&limit=100
 */
export async function getKlines(req: Request, res: Response): Promise<void> {
  try {
    const { symbol, interval, startTime, endTime, limit } = req.query;
    if (!symbol || !interval) {
      res.status(400).json({
        success: false,
        error: 'Missing parameters',
        message: 'symbol and interval are required',
      });
      return;
    }
    const result = await asterBrokerMarketDataService.getKlines(symbol as string, interval as string, {
      startTime: startTime ? Number(startTime) : undefined,
      endTime: endTime ? Number(endTime) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    console.error('[AsterMarketController] Error getKlines:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get klines',
      message: error.message,
    });
  }
}

/**
 * Get 24hr ticker
 * GET /api/aster/market/ticker-24h?symbol=ETHUSDT
 */
export async function getTicker24h(req: Request, res: Response): Promise<void> {
  try {
    const { symbol } = req.query;
    const result = await asterBrokerMarketDataService.getTicker24h(symbol ? (symbol as string) : undefined);
    res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    console.error('[AsterMarketController] Error getTicker24h:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get 24h ticker',
      message: error.message,
    });
  }
}

/**
 * Get latest ticker price
 * GET /api/aster/market/price?symbol=ETHUSDT
 */
export async function getTickerPrice(req: Request, res: Response): Promise<void> {
  try {
    const { symbol } = req.query;
    const result = await asterBrokerMarketDataService.getTickerPrice(symbol ? (symbol as string) : undefined);
    res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    console.error('[AsterMarketController] Error getTickerPrice:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get ticker price',
      message: error.message,
    });
  }
}

/**
 * Get best bid/ask
 * GET /api/aster/market/book-ticker?symbol=ETHUSDT
 */
export async function getBookTicker(req: Request, res: Response): Promise<void> {
  try {
    const { symbol } = req.query;
    const result = await asterBrokerMarketDataService.getBookTicker(symbol ? (symbol as string) : undefined);
    res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    console.error('[AsterMarketController] Error getBookTicker:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get book ticker',
      message: error.message,
    });
  }
}
