import { ServerConfig } from '@/types';

export const exchangeConfig: ServerConfig['exchanges'] = {
  hyperliquid: {
    wsUrl: process.env['HYPERLIQUID_WS_URL'] || 'wss://api.hyperliquid.xyz/ws',
    restUrl: process.env['HYPERLIQUID_REST_URL'] || 'https://api.hyperliquid.xyz/info',
  },
  aster: {
    wsUrl: process.env['ASTER_WS_URL'] || 'wss://fstream.asterdex.com',
    restUrl: process.env['ASTER_REST_URL'] || 'https://fapi.asterdex.com',
  },
  lighter: {
    wsUrl: process.env['LIGHTER_WS_URL'] || 'wss://mainnet.zklighter.elliot.ai/stream',
    restUrl: process.env['LIGHTER_REST_URL'] || 'https://mainnet.zklighter.elliot.ai',
  },
  avantis: {
    wsUrl: process.env['AVANTIS_WS_URL'] || 'wss://fstream-base.avantisfi.com',
    restUrl: process.env['AVANTIS_REST_URL'] || 'https://fapi-base.avantisfi.com',
  },
};

export const supportedSymbols = [
  'BTC', 'ETH', 'SOL', 'HYPE', 'TRUMP',
];

export const timeframes = ['1s', '1m', '5m', '15m', '1h', '4h', '1d'] as const;

export const cacheTTL = {
  orderbook: parseInt(process.env['CACHE_TTL_ORDERBOOK'] || '300'), // 5 minutes
  trades: parseInt(process.env['CACHE_TTL_TRADES'] || '60'), // 1 minute
  charts: parseInt(process.env['CACHE_TTL_CHARTS'] || '3600'), // 1 hour
};

export const websocketConfig = {
  heartbeatInterval: parseInt(process.env['WS_HEARTBEAT_INTERVAL'] || '30000'), // 30 seconds
  maxConnections: parseInt(process.env['WS_MAX_CONNECTIONS'] || '10000'),
};

export const rateLimitConfig = {
  windowMs: parseInt(process.env['RATE_LIMIT_WINDOW_MS'] || '900000'), // 15 minutes
  maxRequests: parseInt(process.env['RATE_LIMIT_MAX_REQUESTS'] || '100'),
};

export const chartConfig = {
  timeframes: process.env['CHART_TIMEFRAMES']?.split(',') || ['1m', '5m', '15m', '1h', '4h', '1d'],
  maxCandles: parseInt(process.env['CHART_MAX_CANDLES'] || '1000'),
  tickDataRetentionHours: parseInt(process.env['TICK_DATA_RETENTION_HOURS'] || '24'),
};