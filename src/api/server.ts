import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { config } from '@/config';
import { logger } from '@/utils/logger';
import { ApiResponse } from '@/types';

// Import route handlers
import {
  getOrderbook,
  getFullOrderbook,
  getOrderbookMetrics,
  getCachedOrderbooks,
} from './routes/orderbook';

import {
  getRecentTrades,
  getTradeMetrics,
  getCachedTradeSymbols,
  getTradeStats,
  getBalances,
  getTradingPositions,
  getOpenOrders,
  placeOrder,
  cancelOrder,
  getTicker,
  setTradingAdapters,
} from './routes/trades';

import {
  getCandles,
  getLatestCandle,
  getCurrentCandles,
  getCachedChartSymbols,
  getChartStats,
} from './routes/charts';

import {
  getAggregatedBook,
  getAggregatedCandles,
  getAggregatedRouting,
  streamAggregatedBook,
  streamAggregatedCandles,
} from './routes/aggregated';

import {
  getPositions,
  getPositionSummary,
  getPositionsBySymbol,
  syncPositions,
  upsertPosition,
  updatePosition,
  closePosition,
  getSyncStatus,
  resetCircuitBreakers,
} from './routes/positions';

import {
  trackVolume,
  getLeaderboard as getVolumeLeaderboard,
  getUserStats as getVolumeUserStats,
  getUserRecentTrades as getVolumeRecentTrades,
  getPlatformStats as getVolumePlatformStats,
  clearVolume as clearVolumeData,
} from './routes/volume';

const app: Express = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: config.cors.origins,
  credentials: true,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again later.',
    timestamp: Date.now(),
  } as ApiResponse,
});
app.use(limiter as any);

// Body parsing middleware
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: Date.now(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    },
  } as ApiResponse);
});

// API info endpoint
app.get('/api', (req, res) => {
  res.json({
    success: true,
    data: {
      name: 'Hyperdex Trading Data API',
      version: '1.0.0',
      description: 'Real-time trading data backend for Hyperdex',
      endpoints: {
        orderbook: {
          'GET /api/orderbook/:symbol': 'Get orderbook with depth',
          'GET /api/orderbook/:symbol/full': 'Get full orderbook',
          'GET /api/orderbook/:symbol/metrics': 'Get orderbook metrics',
          'GET /api/orderbook/cached': 'Get cached orderbook symbols',
        },
        trades: {
          'GET /api/trades/:symbol': 'Get recent trades',
          'GET /api/trades/:symbol/metrics': 'Get trade metrics',
          'GET /api/trades/cached': 'Get cached trade symbols',
          'GET /api/trades/stats': 'Get trade statistics',
          'GET /api/trading/:exchange/balances': 'Get account balances',
          'GET /api/trading/:exchange/positions': 'Get open positions',
          'GET /api/trading/:exchange/orders': 'Get open orders',
          'POST /api/trading/:exchange/orders': 'Place new order',
          'DELETE /api/trading/:exchange/orders/:orderId': 'Cancel order (requires ?symbol=)',
          'GET /api/trading/:exchange/ticker/:symbol': 'Get ticker for symbol',
        },
        charts: {
          'GET /api/charts/:symbol/candles': 'Get OHLCV candles',
          'GET /api/charts/:symbol/latest': 'Get latest candle',
          'GET /api/charts/current': 'Get all current candles',
          'GET /api/charts/cached': 'Get cached chart symbols',
          'GET /api/charts/stats': 'Get chart statistics',
        },
      },
      exchanges: ['hyperliquid', 'aster'],
      timeframes: ['1s', '1m', '5m', '15m', '1h', '4h', '1d'],
    },
    timestamp: Date.now(),
  } as ApiResponse);
});

// Orderbook routes
app.get('/api/orderbook/:symbol', getOrderbook);
app.get('/api/orderbook/:symbol/full', getFullOrderbook);
app.get('/api/orderbook/:symbol/metrics', getOrderbookMetrics);
app.get('/api/orderbook/cached', getCachedOrderbooks);

// Trades routes
app.get('/api/trades/:symbol', getRecentTrades);
app.get('/api/trades/:symbol/metrics', getTradeMetrics);
app.get('/api/trades/cached', getCachedTradeSymbols);
app.get('/api/trades/stats', getTradeStats);
app.get('/api/trading/:exchange/balances', getBalances);
app.get('/api/trading/:exchange/positions', getTradingPositions);
app.get('/api/trading/:exchange/orders', getOpenOrders);
app.post('/api/trading/:exchange/orders', placeOrder);
app.delete('/api/trading/:exchange/orders/:orderId', cancelOrder);
app.get('/api/trading/:exchange/ticker/:symbol', getTicker);

// Charts routes
app.get('/api/charts/:symbol/candles', getCandles);
app.get('/api/charts/:symbol/latest', getLatestCandle);
app.get('/api/charts/current', getCurrentCandles);
app.get('/api/charts/cached', getCachedChartSymbols);
app.get('/api/charts/stats', getChartStats);

// Aggregated data routes
app.get('/api/aggregated/book', getAggregatedBook);
app.get('/api/aggregated/candles', getAggregatedCandles);
app.get('/api/aggregated/routing', getAggregatedRouting);
app.get('/api/aggregated/stream', streamAggregatedBook);
app.get('/api/aggregated/stream/candles', streamAggregatedCandles);

// Position routes
app.get('/api/positions/status', getSyncStatus);
app.post('/api/positions/reset-circuits', resetCircuitBreakers);
app.get('/api/positions/:walletAddress', getPositions);
app.get('/api/positions/:walletAddress/summary', getPositionSummary);
app.get('/api/positions/:walletAddress/:symbol', getPositionsBySymbol);
app.post('/api/positions/:walletAddress/sync', syncPositions);
app.post('/api/positions', upsertPosition);
app.put('/api/positions/:id', updatePosition);
app.delete('/api/positions/:walletAddress/:platform/:symbol', closePosition);

// Volume routes
app.post('/api/volume/track', trackVolume);
app.get('/api/volume/leaderboard', getVolumeLeaderboard);
app.get('/api/volume/user/:address', getVolumeUserStats);
app.get('/api/volume/user/:address/recent', getVolumeRecentTrades);
app.get('/api/volume/platform/:platform/stats', getVolumePlatformStats);
app.post('/api/volume/clear', clearVolumeData);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.originalUrl} not found`,
    timestamp: Date.now(),
  } as ApiResponse);
});

// Global error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    timestamp: Date.now(),
  } as ApiResponse);
});

export { app };
