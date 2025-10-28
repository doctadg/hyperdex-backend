# Lighter Adapter for Hyperdex

A comprehensive TypeScript adapter for integrating Lighter DEX with the Hyperdex trading platform.

## Overview

The Lighter adapter provides a TypeScript interface to the Lighter DEX, supporting both read-only market data operations and authenticated trading operations. It is designed to work seamlessly with the Hyperdex backend.

## Directory Structure

```
src/services/adapters/lighter/
├── README.md                     # This file
├── index.ts                       # Main exports
├── lighter-adapter.ts             # Core adapter implementation
├── lighter-credentials.ts         # Credential management
├── lighter-adapter-example.ts     # Usage examples
└── LIGHTER_ADAPTER_SUMMARY.md    # Implementation summary
```

## Quick Start

### Import the Adapter

```typescript
import { LighterAdapter } from '@/services/adapters/lighter';
```

### Basic Usage

```typescript
// Initialize the adapter
const adapter = new LighterAdapter();

// Get market data (no credentials needed)
const orderBook = await adapter.getOrderBook(0); // ETH market
const trades = await adapter.getRecentTrades(0, 10);

// Get account information
const account = await adapter.getAccountByIndex(65);
const positions = await adapter.getAccountPositions(65);

// Initialize signer for trading operations
adapter.initializeSigner(walletAddress, privateKey, accountIndex, apiKeyIndex);

// Place an order
const result = await adapter.placeOrder(walletAddress, accountIndex, {
  market_index: 0,
  client_order_index: Date.now(),
  base_amount: '100000',
  price: '405000',
  is_ask: false,
  order_type: 0,
  time_in_force: 1,
  reduce_only: false,
});
```

## Key Components

### LighterAdapter Class

The main adapter that provides access to all Lighter functionality:

```typescript
const adapter = new LighterAdapter();
```

**Market Data Operations:**
- `getOrderBook(marketId, limit)` - Get order book snapshot
- `getRecentTrades(marketId, limit)` - Get recent trades
- `getTickerData(marketId)` - Get mark price, funding rate, etc.

**Account Operations:**
- `getAccountByIndex(accountIndex)` - Get account by index
- `getAccountByAddress(l1Address)` - Get account by address
- `getAccountPositions(accountIndex)` - Get open positions
- `getOpenOrders(accountIndex, marketId?)` - Get open orders
- `getOrderHistory(accountIndex, marketId?, limit?)` - Get order history
- `getAccountPnL(accountIndex, startTimestamp?, endTimestamp?)` - Get P&L history
- `getLedger(accountIndex)` - Get transaction ledger

**Trading Operations (requires signer):**
- `placeOrder(walletAddress, accountIndex, params)` - Place an order
- `cancelOrder(walletAddress, accountIndex, params)` - Cancel an order
- `cancelAllOrders(walletAddress, accountIndex, marketId, timeInForce?)` - Cancel all orders
- `updateLeverage(walletAddress, accountIndex, params)` - Update leverage
- `transfer(walletAddress, accountIndex, params)` - Transfer funds
- `withdraw(walletAddress, accountIndex, params)` - Withdraw funds

### Credential Management

```typescript
import { 
  getLighterCredentials, 
  storeLighterCredentials, 
  deleteLighterCredentials 
} from '@/services/adapters/lighter';

// Get credentials
const credentials = await getLighterCredentials(walletAddress);

// Store credentials
await storeLighterCredentials({
  walletAddress: '0x...',
  accountIndex: 1,
  apiKeyIndex: 2,
  apiKeyPrivateEncrypted: encryptedKey,
  apiKeyPublic: publicKey
});

// Delete credentials
await deleteLighterCredentials(walletAddress);
```

## Configuration

The adapter uses configuration from `@/config/exchanges`:

```typescript
export const exchangeConfig = {
  lighter: {
    wsUrl: process.env.LIGHTER_WS_URL || 'wss://mainnet.zklighter.elliot.ai/stream',
    restUrl: process.env.LIGHTER_REST_URL || 'https://mainnet.zklighter.elliot.ai',
  }
};
```

## Order Types

- `0` - Limit
- `1` - Market
- `2` - Stop Loss
- `3` - Stop Loss Limit
- `4` - Take Profit
- `5` - Take Profit Limit
- `6` - TWAP

## Time In Force

- `0` - Immediate or Cancel (IOC)
- `1` - Good Till Time (GTT)
- `2` - Post Only

## Market IDs

- `0` - ETH
- `1` - BTC
- `2` - SOL
- `3` - HYPE
- `4` - TRUMP

## Examples

See `lighter-adapter-example.ts` for comprehensive examples of:
- Getting market data
- Retrieving account information
- Placing and canceling orders
- Managing leverage
- Health checks

## Notes

### Ed25519 Signing

⚠️ **Important**: The Ed25519 signing functionality is not yet implemented in the TypeScript adapter. You need to implement one of the following:

1. **Python SDK Integration**: Call the Python SDK via subprocess
2. **Native Module**: Create a Node.js native addon
3. **JavaScript Library**: Use a JavaScript Ed25519 library (e.g., `@noble/ed25519`)

The structure is ready, but you need to implement the actual signing logic in `LighterSignerClient`.

## Dependencies

The adapter requires:
- `axios` for HTTP requests

Install with:
```bash
npm install axios
```

Note: Ed25519 signing is not yet implemented. When ready to implement signing, you can choose from:
- Python SDK integration via subprocess
- Native Node.js addon
- JavaScript library like `@noble/ed25519`

## Documentation

- **This README**: Basic usage and quick reference
- **lighter-adapter-example.ts**: Comprehensive code examples
- **LIGHTER_ADAPTER_SUMMARY.md**: Full implementation details

## Support

For issues or questions:
1. Check the examples in `lighter-adapter-example.ts`
2. Review the full documentation in `LIGHTER_ADAPTER_SUMMARY.md`
3. Check the Lighter Python SDK: https://github.com/elliottech/lighter-python
