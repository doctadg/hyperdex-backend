import { Request, Response } from 'express';
import { redisClient } from '@/config/redis';
import { logger } from '@/utils/logger';

/**
 * GET /api/aggregated/book
 * Get cached aggregated orderbook from Redis
 */
export async function getAggregatedBook(req: Request, res: Response): Promise<void> {
  try {
    const symbol = (req.query.symbol as string || 'BTC').toUpperCase();
    const cacheKey = `agg:book:${symbol}`;

    const cached = await redisClient.get(cacheKey);
    if (!cached) {
      res.status(404).json({
        success: false,
        error: `No aggregated orderbook found for ${symbol}`,
        timestamp: Date.now(),
      });
      return;
    }

    const data = JSON.parse(cached);
    res.json({
      success: true,
      data,
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error('Error fetching aggregated orderbook:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch aggregated orderbook',
      timestamp: Date.now(),
    });
  }
}

/**
 * GET /api/aggregated/candles
 * Get cached aggregated candles from Redis
 */
export async function getAggregatedCandles(req: Request, res: Response): Promise<void> {
  try {
    const symbol = (req.query.symbol as string || 'BTC').toUpperCase();
    const interval = req.query.interval as string || '1m';
    const from = req.query.from ? parseInt(req.query.from as string) : undefined;
    const to = req.query.to ? parseInt(req.query.to as string) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 1500;

    const cacheKey = `agg:candles:${symbol}:${interval}:history`;
    const cached = await redisClient.get(cacheKey);

    if (!cached) {
      res.json({
        success: true,
        data: [],
        timestamp: Date.now(),
      });
      return;
    }

    let candles = JSON.parse(cached);

    // Filter by time range
    if (from !== undefined || to !== undefined) {
      candles = candles.filter((candle: any) => {
        if (from !== undefined && candle.timestamp < from * 1000) return false;
        if (to !== undefined && candle.timestamp > to * 1000) return false;
        return true;
      });
    }

    // Apply limit
    if (limit) {
      candles = candles.slice(-limit);
    }

    // Convert to TradingView format
    const bars = candles.map((candle: any) => ({
      time: candle.timestamp,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
    }));

    // Return array directly for TradingView compatibility
    res.json(bars);
  } catch (error) {
    logger.error('Error fetching aggregated candles:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch aggregated candles',
      timestamp: Date.now(),
    });
  }
}

/**
 * GET /api/aggregated/routing
 * Get smart routing recommendations from Redis cache
 */
export async function getAggregatedRouting(req: Request, res: Response): Promise<void> {
  try {
    const symbol = (req.query.symbol as string || 'BTC').toUpperCase();
    const cacheKey = `agg:routing:${symbol}`;

    const cached = await redisClient.get(cacheKey);
    if (!cached) {
      res.status(404).json({
        success: false,
        error: `No routing data found for ${symbol}`,
        timestamp: Date.now(),
      });
      return;
    }

    const data = JSON.parse(cached);
    res.json({
      success: true,
      data,
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error('Error fetching routing data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch routing data',
      timestamp: Date.now(),
    });
  }
}

/**
 * GET /api/aggregated/stream
 * SSE endpoint for real-time aggregated orderbook updates
 */
export async function streamAggregatedBook(req: Request, res: Response): Promise<void> {
  const symbol = (req.query.symbol as string || 'BTC').toUpperCase();
  const channel = `aggregated:book:${symbol}`;

  logger.info(`[Aggregated SSE] Client connecting to ${channel}`);

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Send connected event
  res.write(`event: connected\ndata: ${JSON.stringify({ channel, symbol, timestamp: Date.now() })}\n\n`);

  // Create a dedicated Redis subscriber for this SSE connection
  const Redis = require('ioredis');
  const subscriber = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    lazyConnect: true,
  });

  await subscriber.connect();

  const messageHandler = (chan: string, message: string) => {
    if (chan === channel) {
      try {
        const msg = JSON.parse(message);
        logger.debug(`[Aggregated SSE] Sending update for ${symbol}`);
        res.write(`event: book\ndata: ${JSON.stringify(msg.data)}\n\n`);
      } catch (err) {
        logger.error('[Aggregated SSE] Failed to parse message:', err);
      }
    }
  };

  subscriber.on('message', messageHandler);

  try {
    await subscriber.subscribe(channel);
    logger.info(`[Aggregated SSE] Subscribed to ${channel}`);
  } catch (err) {
    logger.error(`[Aggregated SSE] Failed to subscribe to ${channel}:`, err);
    res.write(`event: error\ndata: ${JSON.stringify({ message: 'Failed to subscribe' })}\n\n`);
    subscriber.disconnect();
    res.end();
    return;
  }

  // Cleanup on client disconnect
  req.on('close', () => {
    logger.info(`[Aggregated SSE] Client disconnected from ${channel}`);
    subscriber.unsubscribe(channel);
    subscriber.disconnect();
  });
}

/**
 * GET /api/aggregated/stream/candles
 * SSE endpoint for real-time aggregated candle updates
 */
export async function streamAggregatedCandles(req: Request, res: Response): Promise<void> {
  const symbol = (req.query.symbol as string || 'BTC').toUpperCase();
  const interval = req.query.interval as string || '1m';
  const channel = `aggregated:candles:${symbol}:${interval}`;

  logger.info(`[Aggregated Candles SSE] Client connecting to ${channel}`);

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Send connected event
  res.write(`event: connected\ndata: ${JSON.stringify({ channel, symbol, interval, timestamp: Date.now() })}\n\n`);

  // Create a dedicated Redis subscriber for this SSE connection
  const Redis = require('ioredis');
  const subscriber = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    lazyConnect: true,
  });

  await subscriber.connect();

  const messageHandler = (chan: string, message: string) => {
    if (chan === channel) {
      try {
        const msg = JSON.parse(message);
        logger.debug(`[Aggregated Candles SSE] Sending update for ${symbol}:${interval}`);
        res.write(`event: bar\ndata: ${JSON.stringify(msg.data)}\n\n`);
      } catch (err) {
        logger.error('[Aggregated Candles SSE] Failed to parse message:', err);
      }
    }
  };

  subscriber.on('message', messageHandler);

  try {
    await subscriber.subscribe(channel);
    logger.info(`[Aggregated Candles SSE] Subscribed to ${channel}`);
  } catch (err) {
    logger.error(`[Aggregated Candles SSE] Failed to subscribe to ${channel}:`, err);
    res.write(`event: error\ndata: ${JSON.stringify({ message: 'Failed to subscribe' })}\n\n`);
    subscriber.disconnect();
    res.end();
    return;
  }

  // Cleanup on client disconnect
  req.on('close', () => {
    logger.info(`[Aggregated Candles SSE] Client disconnected from ${channel}`);
    subscriber.unsubscribe(channel);
    subscriber.disconnect();
  });
}
