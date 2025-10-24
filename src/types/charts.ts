export interface OHLCV {
  timestamp: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  quoteVolume: string;
  tradeCount: number;
}

export interface Candle extends OHLCV {
  symbol: string;
  exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis';
  timeframe: Timeframe;
  vwap?: string;
  priceChange?: string;
  priceChangePercent?: string;
}

export type Timeframe = '1s' | '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

export interface ChartDataRequest {
  symbol: string;
  exchange?: 'hyperliquid' | 'aster' | 'lighter' | 'avantis';
  timeframe: Timeframe;
  from: number;
  to: number;
  limit?: number;
}

export interface ChartDataResponse {
  symbol: string;
  exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis';
  timeframe: Timeframe;
  candles: Candle[];
  hasMore: boolean;
  nextFrom?: number;
}

export interface ChartUpdate {
  symbol: string;
  exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis';
  timeframe: Timeframe;
  candle: Candle;
  type: 'update' | 'new';
}

export interface ChartMetrics {
  symbol: string;
  exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis';
  timeframe: Timeframe;
  currentPrice: string;
  priceChange: string;
  priceChangePercent: string;
  high: string;
  low: string;
  volume: string;
  quoteVolume: string;
  vwap: string;
  movingAverages: {
    sma: Record<string, string>;
    ema: Record<string, string>;
  };
  indicators: {
    rsi?: string;
    macd?: {
      macd: string;
      signal: string;
      histogram: string;
    };
    bollinger?: {
      upper: string;
      middle: string;
      lower: string;
    };
  };
}

export interface TickData {
  symbol: string;
  exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis';
  price: string;
  size: string;
  side: 'buy' | 'sell';
  timestamp: number;
  tradeId: string;
}

export interface ChartSubscription {
  id: string;
  symbol: string;
  exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis';
  timeframe: Timeframe;
  clientId: string;
  active: boolean;
  createdAt: number;
  lastUpdate: number;
}