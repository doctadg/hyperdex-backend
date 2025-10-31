export const TOKEN_CONFIG = {
  ethereum: {
    USDT: {
      address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      decimals: 6,
      symbol: "USDT",
    },
    ETH: {
      address: "0x0000000000000000000000000000000000000000",
      decimals: 18,
      symbol: "ETH",
    },
  },
  arbitrum: {
    USDT: {
      address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
      decimals: 6,
      symbol: "USDT",
    },
    ETH: {
      address: "0x0000000000000000000000000000000000000000",
      decimals: 18,
      symbol: "ETH",
    },
  },
  bnb: {
    USDT: {
      address: "0x55d398326f99059fF775485246999027B3197955",
      decimals: 18,
      symbol: "USDT",
    },
    BNB: {
      address: "0x0000000000000000000000000000000000000000",
      decimals: 18,
      symbol: "BNB",
    },
  },
} as const;
