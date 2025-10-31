export * from './orderbook';
export * from './trades';
export * from './charts';
// export * from './market';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  offset?: number;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface WebSocketMessage {
  id: string;
  method: 'subscribe' | 'unsubscribe' | 'ping' | 'pong';
  channel: string;
  params?: Record<string, unknown>;
  timestamp: number;
}

export interface WebSocketResponse {
  id: string;
  method: string;
  channel: string;
  data: unknown;
  timestamp: number;
}

export interface ClientSubscription {
  id: string;
  clientId: string;
  channel: string;
  symbol: string;
  exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis';
  params: Record<string, unknown>;
  active: boolean;
  createdAt: number;
  lastUpdate: number;
}

export interface ServerConfig {
  port: number;
  nodeEnv: string;
  database: {
    url: string;
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
  };
  redis: {
    url: string;
    host: string;
    port: number;
    password?: string;
  };
  exchanges: {
    hyperliquid: {
      wsUrl: string;
      restUrl: string;
    };
    aster: {
      wsUrl: string;
      restUrl: string;
    };
    lighter: {
      wsUrl: string;
      restUrl: string;
    };
    avantis: {
      wsUrl: string;
      restUrl: string;
    };
  };
  websocket: {
    heartbeatInterval: number;
    maxConnections: number;
  };
  cache: {
    ttl: {
      orderbook: number;
      trades: number;
      charts: number;
    };
  };
  logging: {
    level: string;
    file: string;
  };
}