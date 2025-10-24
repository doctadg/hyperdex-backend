import { Request, Response } from 'express';
import { orderbookProcessor } from '@/services/processors/orderbook';
import { orderbookCache } from '@/services/cache/orderbook';
import { logger } from '@/utils/logger';
import { ApiResponse } from '@/types';

export async function getOrderbook(req: Request, res: Response): Promise<void> {
  try {
    const { symbol } = req.params;
    const { exchange = 'hyperliquid', depth = 20 } = req.query;

    if (!symbol) {
      res.status(400).json({
        success: false,
        error: 'Symbol is required',
        timestamp: Date.now(),
      } as ApiResponse);
      return;
    }

    const depthNum = parseInt(depth as string, 10);
    if (isNaN(depthNum) || depthNum < 1 || depthNum > 1000) {
      res.status(400).json({
        success: false,
        error: 'Depth must be between 1 and 1000',
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

    // Get top levels from processor
    const topLevels = await orderbookProcessor.getTopLevels(
      symbol,
      exchange as 'hyperliquid' | 'aster' | 'lighter',
      depthNum
    );

    if (!topLevels) {
      res.status(404).json({
        success: false,
        error: 'Orderbook not found',
        timestamp: Date.now(),
      } as ApiResponse);
      return;
    }

    // Get full orderbook for additional metadata
    const fullOrderbook = await orderbookProcessor.getOrderbook(
      symbol,
      exchange as 'hyperliquid' | 'aster' | 'lighter'
    );

    const response = {
      success: true,
      data: {
        symbol,
        exchange,
        bids: topLevels.bids,
        asks: topLevels.asks,
        timestamp: fullOrderbook?.timestamp || Date.now(),
        spread: fullOrderbook?.spread || '0',
        midPrice: fullOrderbook?.midPrice || '0',
        depth: depthNum,
      },
      timestamp: Date.now(),
    } as ApiResponse;

    res.json(response);
  } catch (error) {
    logger.error('Error in getOrderbook:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      timestamp: Date.now(),
    } as ApiResponse);
  }
}

export async function getFullOrderbook(req: Request, res: Response): Promise<void> {
  try {
    const { symbol } = req.params;
    const { exchange = 'hyperliquid' } = req.query;

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

    const orderbook = await orderbookProcessor.getOrderbook(
      symbol,
      exchange as 'hyperliquid' | 'aster' | 'lighter'
    );

    if (!orderbook) {
      res.status(404).json({
        success: false,
        error: 'Orderbook not found',
        timestamp: Date.now(),
      } as ApiResponse);
      return;
    }

    const response = {
      success: true,
      data: orderbook,
      timestamp: Date.now(),
    } as ApiResponse;

    res.json(response);
  } catch (error) {
    logger.error('Error in getFullOrderbook:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      timestamp: Date.now(),
    } as ApiResponse);
  }
}

export async function getOrderbookMetrics(req: Request, res: Response): Promise<void> {
  try {
    const { symbol } = req.params;
    const { exchange = 'hyperliquid', size = '1' } = req.query;

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

    // Get spread
    const spread = orderbookProcessor.calculateSpread(
      symbol,
      exchange as 'hyperliquid' | 'aster' | 'lighter'
    );

    // Get price impact
    const priceImpact = orderbookProcessor.calculatePriceImpact(
      symbol,
      exchange as 'hyperliquid' | 'aster' | 'lighter',
      size as string
    );

    // Get orderbook for additional metrics
    const orderbook = await orderbookProcessor.getOrderbook(
      symbol,
      exchange as 'hyperliquid' | 'aster' | 'lighter'
    );

    const response = {
      success: true,
      data: {
        symbol,
        exchange,
        spread,
        priceImpact,
        bidVolume: orderbook?.bids.totalSize || '0',
        askVolume: orderbook?.asks.totalSize || '0',
        totalVolume: orderbook ? 
          (parseFloat(orderbook.bids.totalSize) + parseFloat(orderbook.asks.totalSize)).toString() : '0',
        bestBid: orderbook?.bids.levels[0]?.price || '0',
        bestAsk: orderbook?.asks.levels[0]?.price || '0',
        midPrice: orderbook?.midPrice || '0',
        timestamp: orderbook?.timestamp || Date.now(),
      },
      timestamp: Date.now(),
    } as ApiResponse;

    res.json(response);
  } catch (error) {
    logger.error('Error in getOrderbookMetrics:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      timestamp: Date.now(),
    } as ApiResponse);
  }
}

export async function getCachedOrderbooks(req: Request, res: Response): Promise<void> {
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
      symbols = await orderbookCache.getAllCachedSymbols(exchange as 'hyperliquid' | 'aster' | 'lighter');
    } else {
      const hyperliquidSymbols = await orderbookCache.getAllCachedSymbols('hyperliquid');
      const asterSymbols = await orderbookCache.getAllCachedSymbols('aster');
      const lighterSymbols = await orderbookCache.getAllCachedSymbols('lighter');
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
    logger.error('Error in getCachedOrderbooks:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      timestamp: Date.now(),
    } as ApiResponse);
  }
}