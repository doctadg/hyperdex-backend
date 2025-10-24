export interface Symbol {
  name: string;
  baseAsset: string;
  quoteAsset: string;
  exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis';
  status: 'active' | 'inactive' | 'maintenance';
  contractType?: 'perpetual' | 'quarterly' | 'spot';
  expiration?: number;
  contractSize?: string;
  pricePrecision: number;
  sizePrecision: number;
  minQuantity: string;
  maxQuantity: string;
  minNotional: string;
  maxNotional: string;
  tickSize: string;
  stepSize: string;
  makerFee: string;
  takerFee: string;
  leverage: {
    min: number;
    max: number;
    default: number;
  };
  marginType: 'cross' | 'isolated';
  fundingRate?: string;
  nextFundingTime?: number;
  markPrice?: string;
  indexPrice?: string;
  lastPrice?: string;
  volume24h?: string;
  quoteVolume24h?: string;
  priceChange24h?: string;
  priceChangePercent24h?: string;
  high24h?: string;
  low24h?: string;
  openInterest?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Ticker {
  symbol: string;
  exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis';
  price: string;
  priceChange: string;
  priceChangePercent: string;
  weightedAvgPrice: string;
  prevClosePrice: string;
  lastPrice: string;
  lastQty: string;
  bidPrice: string;
  bidQty: string;
  askPrice: string;
  askQty: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
  openTime: number;
  closeTime: number;
  firstId: number;
  lastId: number;
  count: number;
}

export interface MarketStats {
  symbol: string;
  exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis';
  timestamp: number;
  price: string;
  volume24h: string;
  quoteVolume24h: string;
  priceChange24h: string;
  priceChangePercent24h: string;
  high24h: string;
  low24h: string;
  open24h: string;
  vwap24h: string;
  trades24h: number;
  bidPrice: string;
  askPrice: string;
  spread: string;
  spreadPercent: string;
  orderbookDepth: {
    bidVolume: string;
    askVolume: string;
    totalVolume: string;
  };
  openInterest?: string;
  fundingRate?: string;
  nextFundingTime?: number;
  markPrice?: string;
  indexPrice?: string;
}

export interface MarketOverview {
  timestamp: number;
  totalVolume24h: string;
  totalQuoteVolume24h: string;
  activeSymbols: number;
  totalTrades24h: number;
  topGainers: Ticker[];
  topLosers: Ticker;
  topVolume: Ticker[];
  exchangeStats: {
    hyperliquid: {
      volume24h: string;
      symbols: number;
      trades24h: number;
    };
    aster: {
      volume24h: string;
      symbols: number;
      trades24h: number;
    };
  };
}

export interface MarketEvent {
  type: 'ticker' | 'trade' | 'orderbook' | 'funding' | 'liquidation';
  symbol: string;
  exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis';
  timestamp: number;
  data: unknown;
}

export interface ExchangeStatus {
  exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis';
  status: 'online' | 'offline' | 'maintenance';
  lastUpdate: number;
  latency: number;
  message?: string;
  features: {
    orderbook: boolean;
    trades: boolean;
    charts: boolean;
    funding: boolean;
  };
}