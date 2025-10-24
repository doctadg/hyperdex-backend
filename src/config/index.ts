import { config as dotenvConfig } from 'dotenv';

// Load environment variables
dotenvConfig();

export const config = {
  server: {
    port: parseInt(process.env['PORT'] || '3001'),
    host: process.env['HOST'] || '0.0.0.0',
    nodeEnv: process.env['NODE_ENV'] || 'development',
  },
  database: {
    url: process.env['DATABASE_URL'],
    host: process.env['DATABASE_HOST'] || 'localhost',
    port: parseInt(process.env['DATABASE_PORT'] || '5432'),
    name: process.env['DATABASE_NAME'] || 'hyperdex',
    user: process.env['DATABASE_USER'] || 'postgres',
    password: process.env['DATABASE_PASSWORD'] || 'password',
  },
  redis: {
    host: process.env['REDIS_HOST'] || 'localhost',
    port: parseInt(process.env['REDIS_PORT'] || '6379'),
    password: process.env['REDIS_PASSWORD'],
    db: parseInt(process.env['REDIS_DB'] || '0'),
    keyPrefix: process.env['REDIS_KEY_PREFIX'] || 'hyperdex:',
  },
  cors: {
    origins: process.env['CORS_ORIGINS']?.split(',') || ['http://localhost:3000'],
  },
  exchanges: {
    hyperliquid: {
      wsUrl: process.env['HYPERLIQUID_WS_URL'] || 'wss://api.hyperliquid.xyz/ws',
      restUrl: process.env['HYPERLIQUID_REST_URL'] || 'https://api.hyperliquid.xyz',
    },
    aster: {
      wsUrl: process.env['ASTER_WS_URL'] || 'wss://stream.asterdex.com/ws',
      restUrl: process.env['ASTER_REST_URL'] || 'https://api.asterdex.com',
    },
  },
  logging: {
    level: process.env['LOG_LEVEL'] || 'info',
    format: process.env['LOG_FORMAT'] || 'json',
  },
  cache: {
    ttl: {
      orderbook: parseInt(process.env['CACHE_TTL_ORDERBOOK'] || '30'), // seconds
      trades: parseInt(process.env['CACHE_TTL_TRADES'] || '300'), // seconds
      charts: parseInt(process.env['CACHE_TTL_CHARTS'] || '3600'), // seconds
    },
  },
  websocket: {
    heartbeatInterval: parseInt(process.env['WS_HEARTBEAT_INTERVAL'] || '30000'), // ms
    reconnectInterval: parseInt(process.env['WS_RECONNECT_INTERVAL'] || '5000'), // ms
    maxReconnectAttempts: parseInt(process.env['WS_MAX_RECONNECT_ATTEMPTS'] || '10'),
  },
};