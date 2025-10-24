export interface TradeVolumeData {
  userAddress: string;
  platform: 'hyperliquid' | 'aster' | 'lighter' | 'avantis';
  marketId: string;
  side: 'buy' | 'sell';
  size: string;
  price: string;
  notionalValue: number;
  leverage: number;
  fees: number;
  timestamp: number;
  orderId?: string;
}

export interface LeaderboardEntry {
  rank: number;
  address: string;
  totalVolume: number;
  tradeCount: number;
  primaryPlatform: 'hyperliquid' | 'aster' | 'lighter' | 'avantis';
  lastTradeTime: number;
}

export interface UserVolumeStats {
  address: string;
  rank: number | null;
  totalVolume: number;
  tradeCount: number;
  volumeByPlatform: {
    hyperliquid: number;
    aster: number;
  };
  volumeByTimeframe: {
    daily: number;
    weekly: number;
    monthly: number;
    allTime: number;
  };
  percentile: number | null;
}