export interface Trade {
  id: string;
  symbol: string;
  exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis';
  price: string;
  size: string;
  side: 'buy' | 'sell';
  timestamp: number;
  blockTime?: number;
}

export interface AggregatedTrade {
  symbol: string;
  exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis';
  price: string;
  size: string;
  side: 'buy' | 'sell';
  timestamp: number;
  tradeCount: number;
  firstTradeId: string;
  lastTradeId: string;
}

export interface TradeMetrics {
  symbol: string;
  exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis';
  price: string;
  priceChange: string;
  priceChangePercent: string;
  volume: string;
  quoteVolume: string;
  high: string;
  low: string;
  open: string;
  count: number;
  timestamp: number;
  window: '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
}

export interface TradeStream {
  symbol: string;
  exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis';
  trades: Trade[];
  lastUpdate: number;
}

export interface RecentTradesRequest {
  symbol: string;
  exchange?: 'hyperliquid' | 'aster' | 'lighter' | 'avantis';
  limit?: number;
  from?: number;
  to?: number;
}

export interface TradeFilter {
  symbol?: string;
  exchange?: 'hyperliquid' | 'aster' | 'lighter' | 'avantis';
  side?: 'buy' | 'sell';
  minSize?: string;
  maxSize?: string;
  minPrice?: string;
  maxPrice?: string;
  from?: number;
  to?: number;
}