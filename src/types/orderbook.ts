export interface PriceLevel {
  price: string;
  size: string;
  timestamp: number;
}

export interface OrderbookSide {
  levels: PriceLevel[];
  totalSize: string;
}

export interface Orderbook {
  symbol: string;
  exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis';
  bids: OrderbookSide;
  asks: OrderbookSide;
  timestamp: number;
  sequence: number;
  spread: string;
  midPrice: string;
}

export interface OrderbookUpdate {
  symbol: string;
  exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis';
  bids?: PriceLevel[];
  asks?: PriceLevel[];
  timestamp: number;
  sequence: number;
  type: 'snapshot' | 'diff';
}

export interface OrderbookSnapshot {
  symbol: string;
  exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis';
  bids: [string, string][];
  asks: [string, string][];
  timestamp: number;
  sequence: number;
}

export interface OrderbookDiff {
  symbol: string;
  exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis';
  bids: [string, string][];
  asks: [string, string][];
  timestamp: number;
  sequence: number;
}

export interface OrderbookMetrics {
  symbol: string;
  exchange: 'hyperliquid' | 'aster' | 'lighter' | 'avantis';
  bidVolume: string;
  askVolume: string;
  totalVolume: string;
  spread: string;
  spreadPercentage: string;
  bestBid: string;
  bestAsk: string;
  midPrice: string;
  priceImpact: {
    buy: string;
    sell: string;
  };
}