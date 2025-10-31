import { Request, Response } from 'express';
import { tradeProcessor } from '@/services/processors/trades';
import { tradeCache } from '@/services/cache/trades';
import { logger } from '@/utils/logger';
import { ApiResponse, TradeFilter } from '@/types';
import { IPerpetualAdapter, PlaceOrderRequest, OrderSide, OrderType } from '@/types/trades';

// ============= TRADING ADAPTER SINGLETON =============

let tradingAdapters: Map<string, IPerpetualAdapter> = new Map();

export function setTradingAdapters(adapters: Map<string, IPerpetualAdapter>) {
  tradingAdapters = adapters;
  logger.info(`Trading adapters registered: ${Array.from(adapters.keys()).join(', ')}`);
}

function getAdapter(exchange: string, res: Response): IPerpetualAdapter | null {
  if (!tradingAdapters || tradingAdapters.size === 0) {
    logger.error('Trading adapters not initialized');
    res.status(500).json({
      success: false,
      error: 'Trading service not initialized',
      timestamp: Date.now(),
    } as ApiResponse);
    return null;
  }
  
  const adapter = tradingAdapters.get(exchange);
  if (!adapter) {
    logger.warn(`Exchange not supported: ${exchange}`);
    res.status(404).json({
      success: false,
      error: `Exchange "${exchange}" not supported. Available: ${Array.from(tradingAdapters.keys()).join(', ')}`,
      timestamp: Date.now(),
    } as ApiResponse);
    return null;
  }

  return adapter;
}

// ============= MARKET DATA (EXISTING) =============

export async function getRecentTrades(req: Request, res: Response): Promise<void> {
  try {
    const { symbol } = req.params;
    const { 
      exchange = 'hyperliquid', 
      limit = 100,
      from,
      to,
      side,
      minSize,
      maxSize,
      minPrice,
      maxPrice
    } = req.query;

    if (!symbol) {
      res.status(400).json({
        success: false,
        error: 'Symbol is required',
        timestamp: Date.now(),
      } as ApiResponse);
      return;
    }

    if (exchange !== 'hyperliquid' && exchange !== 'aster' && exchange !== 'lighter') {
      res.status(400).json({
        success: false,
        error: 'Exchange must be either "hyperliquid", "aster", or "lighter"',
        timestamp: Date.now(),
      } as ApiResponse);
      return;
    }

    const limitNum = parseInt(limit as string, 10);
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 1000) {
      res.status(400).json({
        success: false,
        error: 'Limit must be between 1 and 1000',
        timestamp: Date.now(),
      } as ApiResponse);
      return;
    }

    // Build filter
    const filter: TradeFilter = {
      symbol,
      exchange: exchange as 'hyperliquid' | 'aster' | 'lighter',
    };

    if (side && (side === 'BUY' || side === 'SELL')) {
      filter.side = side as OrderSide;
    }

    if (minSize) filter.minSize = minSize as string;
    if (maxSize) filter.maxSize = maxSize as string;
    if (minPrice) filter.minPrice = minPrice as string;
    if (maxPrice) filter.maxPrice = maxPrice as string;
    if (from) filter.from = parseInt(from as string, 10);
    if (to) filter.to = parseInt(to as string, 10);

    // Get trades with filter
    const trades = await tradeCache.getTradesWithFilter(
      symbol,
      exchange as 'hyperliquid' | 'aster' | 'lighter',
      filter,
      limitNum
    );

    const response = {
      success: true,
      data: {
        symbol,
        exchange,
        trades,
        limit: limitNum,
        count: trades.length,
        filter,
      },
      timestamp: Date.now(),
    } as ApiResponse;

    res.json(response);
  } catch (error) {
    logger.error('Error in getRecentTrades:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      timestamp: Date.now(),
    } as ApiResponse);
  }
}

export async function getTradeMetrics(req: Request, res: Response): Promise<void> {
  try {
    const { symbol } = req.params;
    const { exchange = 'hyperliquid', window = '1h' } = req.query;

    if (!symbol) {
      res.status(400).json({
        success: false,
        error: 'Symbol is required',
        timestamp: Date.now(),
      } as ApiResponse);
      return;
    }

    if (exchange !== 'hyperliquid' && exchange !== 'aster' && exchange !== 'lighter') {
      res.status(400).json({
        success: false,
        error: 'Exchange must be either "hyperliquid", "aster", or "lighter"',
        timestamp: Date.now(),
      } as ApiResponse);
      return;
    }

    if (!['1m', '5m', '15m', '1h', '4h', '1d'].includes(window as string)) {
      res.status(400).json({
        success: false,
        error: 'Window must be one of: 1m, 5m, 15m, 1h, 4h, 1d',
        timestamp: Date.now(),
      } as ApiResponse);
      return;
    }

    const metrics = await tradeProcessor.getTradeMetrics(
      symbol,
      exchange as 'hyperliquid' | 'aster' | 'lighter',
      window as '1m' | '5m' | '15m' | '1h' | '4h' | '1d'
    );

    if (!metrics) {
      res.status(404).json({
        success: false,
        error: 'Trade metrics not found',
        timestamp: Date.now(),
      } as ApiResponse);
      return;
    }

    const response = {
      success: true,
      data: metrics,
      timestamp: Date.now(),
    } as ApiResponse;

    res.json(response);
  } catch (error) {
    logger.error('Error in getTradeMetrics:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      timestamp: Date.now(),
    } as ApiResponse);
  }
}

export async function getCachedTradeSymbols(req: Request, res: Response): Promise<void> {
  try {
    const { exchange } = req.query;

    if (exchange && exchange !== 'hyperliquid' && exchange !== 'aster') {
      res.status(400).json({
        success: false,
        error: 'Exchange must be either "hyperliquid" or "aster"',
        timestamp: Date.now(),
      } as ApiResponse);
      return;
    }

    let symbols: string[];

    if (exchange) {
      symbols = await tradeCache.getAllCachedSymbols(exchange as 'hyperliquid' | 'aster' | 'lighter');
    } else {
      const hyperliquidSymbols = await tradeCache.getAllCachedSymbols('hyperliquid');
      const asterSymbols = await tradeCache.getAllCachedSymbols('aster');
      const lighterSymbols = await tradeCache.getAllCachedSymbols('lighter');
      symbols = [...new Set([...hyperliquidSymbols, ...asterSymbols, ...lighterSymbols])];
    }

    const response = {
      success: true,
      data: {
        symbols,
        exchange: exchange || 'all',
        count: symbols.length,
      },
      timestamp: Date.now(),
    } as ApiResponse;

    res.json(response);
  } catch (error) {
    logger.error('Error in getCachedTradeSymbols:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      timestamp: Date.now(),
    } as ApiResponse);
  }
}

export async function getTradeStats(req: Request, res: Response): Promise<void> {
  try {
    const { exchange } = req.query;

    if (exchange && exchange !== 'hyperliquid' && exchange !== 'aster') {
      res.status(400).json({
        success: false,
        error: 'Exchange must be either "hyperliquid" or "aster"',
        timestamp: Date.now(),
      } as ApiResponse);
      return;
    }

    const stats = tradeProcessor.getStats();

    // Add additional stats from cache if needed
    let totalSymbols = 0;
    if (exchange) {
      totalSymbols = await tradeCache.getAllCachedSymbols(exchange as 'hyperliquid' | 'aster' | 'lighter')
        .then(symbols => symbols.length);
    } else {
      const hyperliquidSymbols = await tradeCache.getAllCachedSymbols('hyperliquid');
      const asterSymbols = await tradeCache.getAllCachedSymbols('aster');
      const lighterSymbols = await tradeCache.getAllCachedSymbols('lighter');
      totalSymbols = new Set([...hyperliquidSymbols, ...asterSymbols, ...lighterSymbols]).size;
    }

    const response = {
      success: true,
      data: {
        ...stats,
        totalCachedSymbols: totalSymbols,
        exchange: exchange || 'all',
      },
      timestamp: Date.now(),
    } as ApiResponse;

    res.json(response);
  } catch (error) {
    logger.error('Error in getTradeStats:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      timestamp: Date.now(),
    } as ApiResponse);
  }
}

// ============= TRADING OPERATIONS (NEW) =============

export async function getBalances(req: Request, res: Response): Promise<void> {
  try {
    const { exchange } = req.params;
    logger.info(`Getting balances for ${exchange}`);
    
    const adapter = getAdapter(exchange, res);
    if (!adapter) return;
    
    const balances = await adapter.getBalances();
    
    logger.info(`Fetched ${balances.length} balances for ${exchange}`);
    
    res.json({
      success: true,
      data: {
        exchange,
        address: adapter.getAddress(),
        balances,
      },
      timestamp: Date.now(),
    } as ApiResponse);
  } catch (error) {
    logger.error(`Error fetching balances:`, error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch balances',
      timestamp: Date.now(),
    } as ApiResponse);
  }
}

export async function getTradingPositions(req: Request, res: Response): Promise<void> {
  try {
    const { exchange } = req.params;
    logger.info(`Getting positions for ${exchange}`);
    
    const adapter = getAdapter(exchange, res);
    if (!adapter) return;
    
    const positions = await adapter.getPositions();
    
    logger.info(`Fetched ${positions.length} positions for ${exchange}`);
    
    res.json({
      success: true,
      data: {
        exchange,
        address: adapter.getAddress(),
        positions,
        count: positions.length,
      },
      timestamp: Date.now(),
    } as ApiResponse);
  } catch (error) {
    logger.error(`Error fetching positions:`, error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch positions',
      timestamp: Date.now(),
    } as ApiResponse);
  }
}

export async function getOpenOrders(req: Request, res: Response): Promise<void> {
  try {
    const { exchange } = req.params;
    logger.info(`Getting open orders for ${exchange}`);
    
    const adapter = getAdapter(exchange, res);
    if (!adapter) return;
    
    const orders = await adapter.getOpenOrders();
    
    logger.info(`Fetched ${orders.length} open orders for ${exchange}`);
    
    res.json({
      success: true,
      data: {
        exchange,
        orders,
        count: orders.length,
      },
      timestamp: Date.now(),
    } as ApiResponse);
  } catch (error) {
    logger.error(`Error fetching orders:`, error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch orders',
      timestamp: Date.now(),
    } as ApiResponse);
  }
}

export async function placeOrder(req: Request, res: Response): Promise<void> {
  try {
    const { exchange } = req.params;

    const adapter = getAdapter(exchange, res);
    if (!adapter) return;
    
    const { symbol, side, type, quantity, price, reduceOnly } = req.body;
    
    if (!symbol || !side || !type || !quantity) {
      logger.warn('Place order validation failed:', req.body);
      res.status(400).json({
        success: false,
        error: 'Missing required fields: symbol, side, type, quantity',
        timestamp: Date.now(),
      } as ApiResponse);
      return;
    }
    
    if (!['BUY', 'SELL'].includes(side.toUpperCase())) {
      res.status(400).json({
        success: false,
        error: 'Invalid side. Must be BUY or SELL',
        timestamp: Date.now(),
      } as ApiResponse);
      return;
    }
    
    if (!['LIMIT', 'MARKET'].includes(type.toUpperCase())) {
      res.status(400).json({
        success: false,
        error: 'Invalid type. Must be LIMIT or MARKET',
        timestamp: Date.now(),
      } as ApiResponse);
      return;
    }
    
    const orderRequest: PlaceOrderRequest = {
      symbol: symbol.toUpperCase(),
      side: side.toUpperCase() as OrderSide,
      type: type.toUpperCase() as OrderType,
      quantity: String(quantity),
      price: price ? String(price) : undefined,
      reduceOnly: Boolean(reduceOnly),
    };
    
    logger.info(`Placing order on ${exchange}:`, orderRequest);
    
    const result = await adapter.placeOrder(orderRequest);
    
    logger.info(`Order placed successfully on ${exchange}:`, {
      orderId: result.orderId,
      symbol: result.symbol,
      status: result.status,
    });
    
    res.json({
      success: true,
      data: result,
      timestamp: Date.now(),
    } as ApiResponse);
  } catch (error) {
    logger.error(`Error placing order:`, error);
    
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to place order',
      timestamp: Date.now(),
    } as ApiResponse);
  }
}

export async function cancelOrder(req: Request, res: Response): Promise<void> {
  try {
    const { exchange, orderId } = req.params;
    const { symbol } = req.query;
    
    if (!symbol) {
      res.status(400).json({
        success: false,
        error: 'Missing required query parameter: symbol',
        timestamp: Date.now(),
      } as ApiResponse);
      return;
    }
    
    const adapter = getAdapter(exchange, res);
    if (!adapter) return;
    
    logger.info(`Canceling order ${orderId} on ${exchange} for ${symbol}`);
    
    const result = await adapter.cancelOrder(orderId, symbol as string);
    
    logger.info(`Order canceled successfully on ${exchange}:`, result);
    
    res.json({
      success: true,
      data: result,
      timestamp: Date.now(),
    } as ApiResponse);
  } catch (error) {
    logger.error(`Error canceling order:`, error);
    
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to cancel order',
      timestamp: Date.now(),
    } as ApiResponse);
  }
}

export async function getTicker(req: Request, res: Response): Promise<void> {
  try {
    const { exchange, symbol } = req.params;
    
    const adapter = getAdapter(exchange, res);
    if (!adapter) return;
    
    const ticker = await adapter.getTicker(symbol);
    
    res.json({
      success: true,
      data: ticker,
      timestamp: Date.now(),
    } as ApiResponse);
  } catch (error) {
    logger.error(`Error fetching ticker:`, error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch ticker',
      timestamp: Date.now(),
    } as ApiResponse);
  }
}