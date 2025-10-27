/**
 * Example usage of the Lighter Adapter
 * 
 * This file demonstrates how to use the Lighter adapter for various operations.
 * Uncomment the sections you want to test.
 * 
 * To run these examples:
 *   import './lighter-adapter-example';
 *   runAllExamples();
 */

import { LighterAdapter, getLighterCredentials, decryptLighterPrivateKey } from './';
import { logger } from '@/utils/logger';

/**
 * Example: Get market data
 */
export async function getMarketDataExample() {
  const adapter = new LighterAdapter();
  
  try {
    // Get order book for ETH (market ID 0)
    const orderBook = await adapter.getOrderBook(0, 20);
    logger.info('ETH Order Book:', {
      bids: orderBook.bids.slice(0, 3),
      asks: orderBook.asks.slice(0, 3),
      timestamp: orderBook.timestamp,
    });
    
    // Get recent trades
    const trades = await adapter.getRecentTrades(0, 10);
    logger.info('Recent trades:', trades.slice(0, 3));
    
    // Get ticker data
    const ticker = await adapter.getTickerData(0);
    logger.info('ETH Ticker:', {
      markPrice: ticker.mark_price,
      indexPrice: ticker.index_price,
      lastPrice: ticker.last_price,
      fundingRate: ticker.funding_rate,
      openInterest: ticker.open_interest,
      volume24h: ticker.volume_24h,
    });
    
  } catch (error) {
    logger.error('Error getting market data:', error);
  }
}

/**
 * Example: Get account information
 */
export async function getAccountInfoExample() {
  const adapter = new LighterAdapter();
  
  const walletAddress = '0x8D7f03FdE1A626223364E592740a233b72395235';
  const accountIndex = 65;
  
  try {
    // Get account by address
    const account = await adapter.getAccountByAddress(walletAddress);
    logger.info('Account:', {
      accountIndex: account.account_index,
      l1Address: account.l1_address,
    });
    
    // Get positions
    const positions = await adapter.getAccountPositions(accountIndex);
    logger.info('Positions:', positions);
    
    // Get open orders
    const orders = await adapter.getOpenOrders(accountIndex);
    logger.info('Open orders:', orders);
    
    // Get PnL history
    const pnl = await adapter.getAccountPnL(
      accountIndex,
      Date.now() - 7 * 24 * 60 * 60 * 1000, // 7 days ago
      Date.now()
    );
    logger.info('P&L:', pnl);
    
  } catch (error) {
    logger.error('Error getting account info:', error);
  }
}

/**
 * Example: Place an order (requires credentials and signer initialization)
 */
export async function placeOrderExample() {
  const adapter = new LighterAdapter();
  
  const walletAddress = '0x8D7f03FdE1A626223364E592740a233b72395235';
  const accountIndex = 65;
  
  try {
    // Get credentials
    const credentials = await getLighterCredentials(walletAddress);
    
    if (!credentials) {
      logger.error('No credentials found for wallet');
      return;
    }
    
    // Note: Signing is not yet implemented
    // You'll need to implement Ed25519 signing first
    logger.warn('Signing not yet implemented - skipping order placement');
    
    /*
    // Decrypt private key
    const privateKey = decryptLighterPrivateKey(credentials.api_key_private_encrypted);
    
    // Initialize signer
    adapter.initializeSigner(
      credentials.wallet_address,
      privateKey,
      credentials.account_index,
      credentials.api_key_index
    );
    
    // Place a limit buy order
    const result = await adapter.placeOrder(walletAddress, accountIndex, {
      market_index: 0, // ETH
      client_order_index: Date.now(),
      base_amount: '100000', // 0.01 ETH (100000 in base units)
      price: '405000', // $4050 per ETH
      is_ask: false, // Buy order
      order_type: 0, // Limit order
      time_in_force: 1, // Good Till Time
      reduce_only: false,
      trigger_price: '0',
    });
    
    if (result.error) {
      logger.error('Order failed:', result.error);
    } else {
      logger.info('Order placed successfully:', result.txHash);
    }
    */
    
  } catch (error) {
    logger.error('Error placing order:', error);
  }
}

/**
 * Example: Cancel an order
 */
export async function cancelOrderExample() {
  const adapter = new LighterAdapter();
  
  const walletAddress = '0x8D7f03FdE1A626223364E592740a233b72395235';
  const accountIndex = 65;
  
  try {
    // Note: Requires signer initialization (see placeOrderExample)
    
    const result = await adapter.cancelOrder(walletAddress, accountIndex, {
      market_index: 0,
      order_index: 123,
    });
    
    if (result.error) {
      logger.error('Cancel failed:', result.error);
    } else {
      logger.info('Order canceled:', result.txHash);
    }
    
  } catch (error) {
    logger.error('Error canceling order:', error);
  }
}

/**
 * Example: Get order history
 */
export async function getOrderHistoryExample() {
  const adapter = new LighterAdapter();
  
  const accountIndex = 65;
  const marketId = 0; // ETH
  
  try {
    const history = await adapter.getOrderHistory(accountIndex, marketId, 50);
    logger.info('Order history:', history);
  } catch (error) {
    logger.error('Error getting order history:', error);
  }
}

/**
 * Example: Update leverage
 */
export async function updateLeverageExample() {
  const adapter = new LighterAdapter();
  
  const walletAddress = '0x8D7f03FdE1A626223364E592740a233b72395235';
  const accountIndex = 65;
  
  try {
    // Note: Requires signer initialization
    
    const result = await adapter.updateLeverage(walletAddress, accountIndex, {
      market_index: 0,
      leverage: 10, // 10x leverage
    });
    
    if (result.error) {
      logger.error('Leverage update failed:', result.error);
    } else {
      logger.info('Leverage updated:', result.txHash);
    }
    
  } catch (error) {
    logger.error('Error updating leverage:', error);
  }
}

/**
 * Example: Health check
 */
export async function healthCheckExample() {
  const adapter = new LighterAdapter();
  
  try {
    const isHealthy = await adapter.healthCheck();
    logger.info('Lighter health:', isHealthy ? 'Healthy' : 'Unhealthy');
    
    if (isHealthy) {
      const info = await adapter.getExchangeInfo();
      logger.info('Exchange info:', info);
    }
  } catch (error) {
    logger.error('Health check failed:', error);
  }
}

/**
 * Run all examples
 */
export async function runAllExamples() {
  logger.info('Starting Lighter adapter examples...');
  
  await healthCheckExample();
  await getMarketDataExample();
  // await getAccountInfoExample(); // Requires valid account
  // await placeOrderExample(); // Requires credentials
  // await cancelOrderExample(); // Requires credentials
  // await getOrderHistoryExample(); // Requires valid account
  // await updateLeverageExample(); // Requires credentials
}

// Uncomment to run examples
// runAllExamples().catch(console.error);

