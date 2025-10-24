import { Request, Response } from 'express';
import { chartProcessor } from '@/services/processors/charts';
import { chartCache } from '@/services/cache/charts';
import { logger } from '@/utils/logger';
import { ApiResponse, Timeframe } from '@/types';

export async function getCandles(req: Request, res: Response): Promise<void> {
  try {
    const { symbol } = req.params;
    const { 
      exchange = 'hyperliquid',
      timeframe = '1h',
      from,
      to,
      limit = 1000
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

    if (!['1s', '1m', '5m', '15m', '1h', '4h', '1d'].includes(timeframe as string)) {
      res.status(400).json({
        success: false,
        error: 'Timeframe must be one of: 1s, 1m, 5m, 15m, 1h, 4h, 1d',
        timestamp: Date.now(),
      } as ApiResponse);
      return;
    }

    const limitNum = parseInt(limit as string, 10);
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 10000) {
      res.status(400).json({
        success: false,
        error: 'Limit must be between 1 and 10000',
        timestamp: Date.now(),
      } as ApiResponse);
      return;
    }

    // Calculate time range
    const now = Date.now();
    const toTime = to ? parseInt(to as string, 10) : now;
    const fromTime = from ? parseInt(from as string, 10) : toTime - (24 * 60 * 60 * 1000); // Default to 24 hours

    if (fromTime >= toTime) {
      res.status(400).json({
        success: false,
        error: 'From time must be less than to time',
        timestamp: Date.now(),
      } as ApiResponse);
      return;
    }

    // Get candles
    const candles = await chartProcessor.getCandles(
      symbol,
      exchange as 'hyperliquid' | 'aster' | 'lighter',
      timeframe as Timeframe,
      fromTime,
      toTime,
      limitNum
    );

    const response = {
      success: true,
      data: {
        symbol,
        exchange,
        timeframe: timeframe as Timeframe,
        candles,
        from: fromTime,
        to: toTime,
        limit: limitNum,
        count: candles.length,
        hasMore: candles.length === limitNum,
      },
      timestamp: Date.now(),
    } as ApiResponse;

    res.json(response);
  } catch (error) {
    logger.error('Error in getCandles:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      timestamp: Date.now(),
    } as ApiResponse);
  }
}

export async function getLatestCandle(req: Request, res: Response): Promise<void> {
  try {
    const { symbol } = req.params;
    const { exchange = 'hyperliquid', timeframe = '1h' } = req.query;

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

    if (!['1s', '1m', '5m', '15m', '1h', '4h', '1d'].includes(timeframe as string)) {
      res.status(400).json({
        success: false,
        error: 'Timeframe must be one of: 1s, 1m, 5m, 15m, 1h, 4h, 1d',
        timestamp: Date.now(),
      } as ApiResponse);
      return;
    }

    // Try to get current candle from processor first
    const currentCandle = chartProcessor.getCurrentCandle(
      symbol,
      exchange as 'hyperliquid' | 'aster' | 'lighter',
      timeframe as Timeframe
    );

    // If no current candle, try to get latest from cache/database
    const latestCandle = currentCandle || await chartProcessor.getLatestCandle(
      symbol,
      exchange as 'hyperliquid' | 'aster' | 'lighter',
      timeframe as Timeframe
    );

    if (!latestCandle) {
      res.status(404).json({
        success: false,
        error: 'No candle data found',
        timestamp: Date.now(),
      } as ApiResponse);
      return;
    }

    const response = {
      success: true,
      data: {
        ...latestCandle,
        isCurrent: !!currentCandle,
      },
      timestamp: Date.now(),
    } as ApiResponse;

    res.json(response);
  } catch (error) {
    logger.error('Error in getLatestCandle:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      timestamp: Date.now(),
    } as ApiResponse);
  }
}

export async function getCurrentCandles(req: Request, res: Response): Promise<void> {
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

    // Get all current candles
    const currentCandles = chartProcessor.getAllCurrentCandles();

    // Filter by exchange if specified
    const filteredCandles = exchange 
      ? currentCandles.filter(candle => candle.exchange === exchange)
      : currentCandles;

    const response = {
      success: true,
      data: {
        candles: filteredCandles,
        exchange: exchange || 'all',
        count: filteredCandles.length,
      },
      timestamp: Date.now(),
    } as ApiResponse;

    res.json(response);
  } catch (error) {
    logger.error('Error in getCurrentCandles:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      timestamp: Date.now(),
    } as ApiResponse);
  }
}

export async function getCachedChartSymbols(req: Request, res: Response): Promise<void> {
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
      symbols = await chartCache.getAllCachedSymbols(exchange as 'hyperliquid' | 'aster' | 'lighter');
    } else {
      const hyperliquidSymbols = await chartCache.getAllCachedSymbols('hyperliquid');
      const asterSymbols = await chartCache.getAllCachedSymbols('aster');
      const lighterSymbols = await chartCache.getAllCachedSymbols('lighter');
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
    logger.error('Error in getCachedChartSymbols:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      timestamp: Date.now(),
    } as ApiResponse);
  }
}

export async function getChartStats(req: Request, res: Response): Promise<void> {
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

    const stats = chartProcessor.getStats();

    // Add additional stats from cache if needed
    let totalSymbols = 0;
    if (exchange) {
      totalSymbols = await chartCache.getAllCachedSymbols(exchange as 'hyperliquid' | 'aster' | 'lighter')
        .then(symbols => symbols.length);
    } else {
      const hyperliquidSymbols = await chartCache.getAllCachedSymbols('hyperliquid');
      const asterSymbols = await chartCache.getAllCachedSymbols('aster');
      const lighterSymbols = await chartCache.getAllCachedSymbols('lighter');
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
    logger.error('Error in getChartStats:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      timestamp: Date.now(),
    } as ApiResponse);
  }
}