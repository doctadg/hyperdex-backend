import { Request, Response } from 'express';
import { tradeProcessor } from '@/services/processors/trades';
import { tradeCache } from '@/services/cache/trades';
import { logger } from '@/utils/logger';
import { ApiResponse, TradeFilter } from '@/types';

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

    if (side && (side === 'buy' || side === 'sell')) {
      filter.side = side;
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