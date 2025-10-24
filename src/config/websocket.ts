import { websocketConfig } from './exchanges';

export interface WebSocketServerConfig {
  port: number;
  heartbeatInterval: number;
  maxConnections: number;
  perMessageDeflate: boolean;
  compression: {
    zlibDeflateOptions: {
      level: number;
    };
  };
}

export const wsServerConfig: WebSocketServerConfig = {
  port: parseInt(process.env['WS_PORT'] || '3002'),
  heartbeatInterval: websocketConfig.heartbeatInterval,
  maxConnections: websocketConfig.maxConnections,
  perMessageDeflate: true,
  compression: {
    zlibDeflateOptions: {
      level: 3,
    },
  },
};

export const wsChannels = {
  orderbook: 'orderbook',
  trades: 'trades',
  charts: 'charts',
  ticker: 'ticker',
  funding: 'funding',
  liquidations: 'liquidations',
} as const;

export const wsMessageTypes = {
  subscribe: 'subscribe',
  unsubscribe: 'unsubscribe',
  data: 'data',
  error: 'error',
  ping: 'ping',
  pong: 'pong',
  connected: 'connected',
  disconnected: 'disconnected',
} as const;