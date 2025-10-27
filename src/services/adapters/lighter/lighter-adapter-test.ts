/**
 * Lighter Adapter Test Suite
 * 
 * This file tests all functionalities of the Lighter adapter.
 * 
 * Usage:
 *   # Run all tests (default market ETH/0):
 *   npm run dev -- src/services/adapters/lighter/lighter-adapter-test.ts
 *   
 *   # Run all tests with specific market:
 *   npm run dev -- src/services/adapters/lighter/lighter-adapter-test.ts -- --market=1
 *   
 *   # Run specific test function:
 *   npm run dev -- src/services/adapters/lighter/lighter-adapter-test.ts orderbook
 *   npm run dev -- src/services/adapters/lighter/lighter-adapter-test.ts ticker --market=1
 * 
 * Available test functions:
 *   - health          : Health check and exchange info
 *   - orderbook       : Get order book
 *   - trades          : Get recent trades
 *   - ticker          : Get ticker data
 *   - account         : Get account information
 *   - positions       : Get account positions
 *   - orders          : Get open orders
 *   - history         : Get order history
 *   - balances        : Get account balances
 *   - ledger          : Get ledger/transaction history
 *   - place_order     : Place an order (requires credentials)
 *   - cancel_order    : Cancel an order (requires credentials)
 *   - leverage        : Update leverage (requires credentials)
 * 
 * Market IDs:
 *   - 0 = ETH
 *   - 1 = BTC
 *   - 2 = SOL
 *   - 3 = HYPE
 *   - 4 = TRUMP
 */

import { LighterAdapter, getLighterCredentials } from './';
import { logger } from '@/utils/logger';

// Configuration - Update these for your testing
const TEST_CONFIG = {
  // Use testnet for testing
  baseUrl: 'https://mainnet.zklighter.elliot.ai', // or testnet.zklighter.elliot.ai
  walletAddress: '0xb401B621fbf1f8F0aEFe5955d6fea2DF1344f19A', // Your wallet
  accountIndex: 65, // Your account index
  privateKey: '8ef345352201d9c15bb27243df0aeef9051efbfe22fc5acc62c54d20297de3bf', // Your Ed25519 private key (hex string, no 0x prefix)
  apiKeyIndex: 2,
};

// Market IDs - based on Lighter's market mapping
// 0 = ETH, 1 = BTC, 2 = SOL, 3 = HYPE, 4 = TRUMP
const MARKET_IDS = {
  ETH: 0,
  BTC: 1,
  SOL: 2,
  HYPE: 3,
  TRUMP: 4,
};

// Default market for testing
const DEFAULT_MARKET_ID = MARKET_IDS.ETH;

/**
 * Test 1: Health Check
 */
async function testHealthCheck() {
  console.log('\n=== Test 1: Health Check ===');
  try {
    const adapter = new LighterAdapter(TEST_CONFIG.baseUrl);
    const isHealthy = await adapter.healthCheck();
    console.log('✓ Health check:', isHealthy ? 'Healthy' : 'Unhealthy');
    
    if (isHealthy) {
      const info = await adapter.getExchangeInfo();
      console.log('✓ Exchange info retrieved:', Object.keys(info).length, 'properties');
    }
  } catch (error: any) {
    console.error('✗ Health check failed:', error.message);
  }
}

/**
 * Test 2: Market Data - Order Book
 */
async function testMarketData_OrderBook(marketId: number = DEFAULT_MARKET_ID) {
  console.log(`\n=== Test 2: Market Data - Order Book (Market ${marketId}) ===`);
  try {
    const adapter = new LighterAdapter(TEST_CONFIG.baseUrl);
    const orderBook = await adapter.getOrderBook(marketId, 10);
    
    console.log(`✓ Order book retrieved for market ${marketId}`);
    console.log('  Bids:', orderBook.bids.length, 'levels');
    console.log('  Asks:', orderBook.asks.length, 'levels');
    
    if (orderBook.bids.length > 0 && orderBook.asks.length > 0) {
      const bestBid = Array.isArray(orderBook.bids[0]) ? orderBook.bids[0] : [null, null];
      const bestAsk = Array.isArray(orderBook.asks[0]) ? orderBook.asks[0] : [null, null];
      console.log('  Best bid:', `Price: ${bestBid[0]}, Size: ${bestBid[1]}`);
      console.log('  Best ask:', `Price: ${bestAsk[0]}, Size: ${bestAsk[1]}`);
    } else {
      console.log('  ⚠ No order book data available');
    }
  } catch (error: any) {
    console.error('✗ Order book failed:', error.message);
    if (error.response) {
      console.error('  Response status:', error.response.status);
      console.error('  Response data:', error.response.data);
    }
  }
}

/**
 * Test 3: Market Data - Recent Trades
 */
async function testMarketData_RecentTrades(marketId: number = DEFAULT_MARKET_ID) {
  console.log(`\n=== Test 3: Market Data - Recent Trades (Market ${marketId}) ===`);
  try {
    const adapter = new LighterAdapter(TEST_CONFIG.baseUrl);
    const trades = await adapter.getRecentTrades(marketId, 10);
    
    console.log(`✓ Recent trades retrieved: ${trades.length} trades`);
    if (trades.length > 0) {
      console.log('  Last trade:', {
        price: trades[0].price,
        size: trades[0].size,
        side: trades[0].side,
        timestamp: new Date(trades[0].timestamp).toISOString(),
      });
      
      if (trades.length > 1) {
        console.log(`  ... and ${trades.length - 1} more trades`);
      }
    } else {
      console.log('  ⚠ No recent trades available');
    }
  } catch (error: any) {
    console.error('✗ Recent trades failed:', error.message);
    if (error.response) {
      console.error('  Response status:', error.response.status);
    }
  }
}

/**
 * Test 4: Market Data - Ticker Data
 */
async function testMarketData_Ticker(marketId: number = DEFAULT_MARKET_ID) {
  console.log(`\n=== Test 4: Market Data - Ticker (Market ${marketId}) ===`);
  try {
    const adapter = new LighterAdapter(TEST_CONFIG.baseUrl);
    const ticker = await adapter.getTickerData(marketId);
    
    console.log(`✓ Ticker data retrieved for market ${marketId}:`);
    console.log('  Mark price:', ticker.mark_price);
    console.log('  Index price:', ticker.index_price);
    console.log('  Last price:', ticker.last_price);
    console.log('  Funding rate:', ticker.funding_rate);
    console.log('  Open interest:', ticker.open_interest);
    console.log('  24h volume:', ticker.volume_24h);
    
    if (ticker.mark_price === '0' && ticker.index_price === '0') {
      console.log('  ⚠ Note: Market data appears empty or market is inactive');
    }
  } catch (error: any) {
    console.error('✗ Ticker data failed:', error.message);
    if (error.response) {
      console.error('  Response status:', error.response.status);
    }
  }
}

/**
 * Test 5: Account Information
 */
async function testAccountInfo() {
  console.log('\n=== Test 5: Account Information ===');
  try {
    const adapter = new LighterAdapter(TEST_CONFIG.baseUrl);
    const account = await adapter.getAccountByIndex(TEST_CONFIG.accountIndex);
    
    if (!account) {
      console.log('⚠ Account not found (account may not exist)');
      console.log('  Note: This requires a valid account index');
      return;
    }
    
    console.log('✓ Account info retrieved:');
    console.log('  Account index:', account.account_index);
    console.log('  L1 address:', account.l1_address);
  } catch (error: any) {
    console.error('✗ Account info failed:', error.message);
    console.log('  Note: This requires a valid account index');
  }
}

/**
 * Test 6: Get Positions
 */
async function testPositions() {
  console.log('\n=== Test 6: Get Positions ===');
  try {
    const adapter = new LighterAdapter(TEST_CONFIG.baseUrl);
    const positions = await adapter.getAccountPositions(TEST_CONFIG.accountIndex);
    
    console.log('✓ Positions retrieved:', positions.length);
    if (positions.length > 0) {
      positions.forEach((pos, i) => {
        console.log(`  Position ${i + 1}:`, {
          market_id: pos.market_id,
          side: pos.side,
          size: pos.size,
          entry_price: pos.entry_price,
          unrealized_pnl: pos.unrealized_pnl,
          leverage: pos.leverage,
        });
      });
    }
  } catch (error: any) {
    console.error('✗ Positions failed:', error.message);
    console.log('  Note: This requires a valid account with positions');
  }
}

/**
 * Test 7: Get Open Orders
 */
async function testOpenOrders() {
  console.log('\n=== Test 7: Open Orders ===');
  try {
    const adapter = new LighterAdapter(TEST_CONFIG.baseUrl);
    const orders = await adapter.getOpenOrders(TEST_CONFIG.accountIndex);
    
    console.log('✓ Open orders retrieved:', orders.length);
    if (orders.length > 0) {
      orders.forEach((order, i) => {
        console.log(`  Order ${i + 1}:`, {
          order_id: order.order_id,
          market_id: order.market_id,
          side: order.side,
          price: order.price,
          size: order.size,
          status: order.status,
        });
      });
    }
  } catch (error: any) {
    console.error('✗ Open orders failed:', error.message);
  }
}

/**
 * Test 8: Get Order History
 */
async function testOrderHistory() {
  console.log('\n=== Test 8: Order History ===');
  try {
    const adapter = new LighterAdapter(TEST_CONFIG.baseUrl);
    const history = await adapter.getOrderHistory(TEST_CONFIG.accountIndex, DEFAULT_MARKET_ID, 10);
    
    console.log('✓ Order history retrieved:', history.length);
  } catch (error: any) {
    console.error('✗ Order history failed:', error.message);
  }
}

/**
 * Test 9: Place Order (Requires Credentials)
 */
async function testPlaceOrder() {
  console.log('\n=== Test 9: Place Order (Authenticated) ===');
  
  if (!TEST_CONFIG.privateKey) {
    console.log('⚠ Skipped - No private key configured');
    console.log('  To test, set TEST_CONFIG.privateKey');
    return;
  }
  
  try {
    const adapter = new LighterAdapter(TEST_CONFIG.baseUrl);
    
    // Initialize signer
    adapter.initializeSigner(
      TEST_CONFIG.walletAddress,
      TEST_CONFIG.privateKey,
      TEST_CONFIG.accountIndex,
      TEST_CONFIG.apiKeyIndex
    );
    
    // Place a small test order
    const orderParams = {
      market_index: DEFAULT_MARKET_ID,
      client_order_index: Date.now(),
      base_amount: '10000', // Very small amount for testing
      price: '200000', // Low price
      is_ask: false, // Buy order
      order_type: 0, // Limit
      time_in_force: 1, // Good Till Time
      reduce_only: false,
      trigger_price: '0',
    };
    
    console.log('  Order parameters:', orderParams);
    
    const result = await adapter.placeOrder(
      TEST_CONFIG.walletAddress,
      TEST_CONFIG.accountIndex,
      orderParams
    );
    
    if (result.error) {
      console.log('⚠ Order placement returned error:', result.error);
    } else {
      console.log('✓ Order placed successfully!');
      console.log('  Transaction hash:', result.txHash);
    }
  } catch (error: any) {
    console.error('✗ Place order failed:', error.message);
  }
}

/**
 * Test 10: Cancel Order (Requires Credentials)
 */
async function testCancelOrder() {
  console.log('\n=== Test 10: Cancel Order (Authenticated) ===');
  
  if (!TEST_CONFIG.privateKey) {
    console.log('⚠ Skipped - No private key configured');
    return;
  }
  
  try {
    const adapter = new LighterAdapter(TEST_CONFIG.baseUrl);
    
    // Initialize signer
    adapter.initializeSigner(
      TEST_CONFIG.walletAddress,
      TEST_CONFIG.privateKey,
      TEST_CONFIG.accountIndex,
      TEST_CONFIG.apiKeyIndex
    );
    
    // Cancel order by index (using a test index)
    const cancelParams = {
      market_index: DEFAULT_MARKET_ID,
      order_index: 123, // Replace with actual order index
    };
    
    console.log('  Cancel parameters:', cancelParams);
    console.log('  Note: Using test order index. Set actual order_index for real cancellation.');
    
    const result = await adapter.cancelOrder(
      TEST_CONFIG.walletAddress,
      TEST_CONFIG.accountIndex,
      cancelParams
    );
    
    if (result.error) {
      console.log('⚠ Cancel order returned error:', result.error);
    } else {
      console.log('✓ Order cancelled successfully!');
      console.log('  Transaction hash:', result.txHash);
    }
  } catch (error: any) {
    console.error('✗ Cancel order failed:', error.message);
  }
}

/**
 * Test 11: Update Leverage (Requires Credentials)
 */
async function testUpdateLeverage() {
  console.log('\n=== Test 11: Update Leverage (Authenticated) ===');
  
  if (!TEST_CONFIG.privateKey) {
    console.log('⚠ Skipped - No private key configured');
    return;
  }
  
  try {
    const adapter = new LighterAdapter(TEST_CONFIG.baseUrl);
    
    // Initialize signer
    adapter.initializeSigner(
      TEST_CONFIG.walletAddress,
      TEST_CONFIG.privateKey,
      TEST_CONFIG.accountIndex,
      TEST_CONFIG.apiKeyIndex
    );
    
    // Update leverage
    const leverageParams = {
      market_index: DEFAULT_MARKET_ID,
      leverage: 5, // 5x leverage
    };
    
    console.log('  Leverage parameters:', leverageParams);
    
    const result = await adapter.updateLeverage(
      TEST_CONFIG.walletAddress,
      TEST_CONFIG.accountIndex,
      leverageParams
    );
    
    if (result.error) {
      console.log('⚠ Update leverage returned error:', result.error);
    } else {
      console.log('✓ Leverage updated successfully!');
      console.log('  Transaction hash:', result.txHash);
    }
  } catch (error: any) {
    console.error('✗ Update leverage failed:', error.message);
  }
}

/**
 * Test 12: Get Balances
 */
async function testGetBalances() {
  console.log('\n=== Test 12: Get Balances ===');
  try {
    const adapter = new LighterAdapter(TEST_CONFIG.baseUrl);
    const balances = await adapter.getBalances(TEST_CONFIG.accountIndex);
    
    console.log('✓ Balances retrieved');
    console.log('  Balances:', balances);
  } catch (error: any) {
    console.error('✗ Get balances failed:', error.message);
  }
}

/**
 * Test 13: Get Ledger/Transaction History
 */
async function testGetLedger() {
  console.log('\n=== Test 13: Get Ledger ===');
  try {
    const adapter = new LighterAdapter(TEST_CONFIG.baseUrl);
    const ledger = await adapter.getLedger(TEST_CONFIG.accountIndex);
    
    console.log('✓ Ledger retrieved');
    if (Array.isArray(ledger)) {
      console.log('  Transactions:', ledger.length);
    }
  } catch (error: any) {
    console.error('✗ Get ledger failed:', error.message);
  }
}

/**
 * Run all tests
 */
async function runAllTests(marketId: number = DEFAULT_MARKET_ID) {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('   Lighter Adapter Test Suite');
  console.log('═══════════════════════════════════════════════════');
  console.log('\nTesting adapter for:', TEST_CONFIG.baseUrl);
  console.log('Default market ID:', marketId);
  console.log('\nRunning tests...\n');
  
  const startTime = Date.now();
  
  // Market data tests (no authentication required)
  await testHealthCheck();
  await testMarketData_OrderBook(marketId);
  await testMarketData_RecentTrades(marketId);
  await testMarketData_Ticker(marketId);
  
  // Account tests (may require valid account index)
  await testAccountInfo();
  await testPositions();
  await testOpenOrders();
  await testOrderHistory();
  await testGetBalances();
  await testGetLedger();
  
  // Trading tests (require authentication)
  await testPlaceOrder();
  await testCancelOrder();
  await testUpdateLeverage();
  
  const duration = Date.now() - startTime;
  
  console.log('\n═══════════════════════════════════════════════════');
  console.log('   Tests Complete');
  console.log('═══════════════════════════════════════════════════');
  console.log(`Duration: ${(duration / 1000).toFixed(2)}s`);
  console.log('\n');
}

/**
 * Run specific test
 */
async function runSpecificTest(testName: string) {
  console.log('\n═══════════════════════════════════════════════════');
  console.log(`   Running Test: ${testName}`);
  console.log('═══════════════════════════════════════════════════\n');
  
  const tests: Record<string, () => Promise<void>> = {
    health: testHealthCheck,
    orderbook: testMarketData_OrderBook,
    trades: testMarketData_RecentTrades,
    ticker: testMarketData_Ticker,
    account: testAccountInfo,
    positions: testPositions,
    orders: testOpenOrders,
    history: testOrderHistory,
    place_order: testPlaceOrder,
    cancel_order: testCancelOrder,
    leverage: testUpdateLeverage,
    balances: testGetBalances,
    ledger: testGetLedger,
  };
  
  if (tests[testName]) {
    await tests[testName]();
  } else {
    console.error(`Unknown test: ${testName}`);
    console.log('Available tests:', Object.keys(tests).join(', '));
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  // Parse arguments
  const testName = args.find(arg => !arg.startsWith('--'));
  const marketIdArg = args.find(arg => arg.startsWith('--market='));
  const marketId = marketIdArg 
    ? parseInt(marketIdArg.split('=')[1]) 
    : DEFAULT_MARKET_ID;
  
  if (testName) {
    await runSpecificTest(testName);
  } else {
    await runAllTests(marketId);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error('\n✗ Test suite failed:', error);
    process.exit(1);
  });
}

export { runAllTests, runSpecificTest, MARKET_IDS };

