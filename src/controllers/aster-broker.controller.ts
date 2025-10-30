import { Request, Response } from 'express';
import { asterBrokerService } from '../services/aster-broker.service';
import { asterBrokerSpotTradingService } from '../services/aster-broker-trading.service';

/**
 * Generate Aster Spot API key
 * POST /api/aster/broker/generate-api-key
 *
 * Body:
 * {
 * walletId: string  // or address
 * }
 */
export async function generateApiKey(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { walletId, address } = req.body;
    const identifier = walletId || address;

    console.log('[AsterBrokerController] Generating API key', { identifier });

    if (!identifier) {
      res.status(400).json({
        success: false,
        error: 'Missing parameter',
        message: 'Either walletId or address is required'
      });
      return;
    }

    // Generate API key
    const result = await asterBrokerService.generateApiKey(identifier);

    console.log('[AsterBrokerController] ✅ API key generated successfully', {
      keyId: result.keyId,
      address: result.signerAddress
    });

    res.status(200).json({
      success: true,
      message: 'API key generated successfully',
      data: {
        keyId: result.keyId,
        signerAddress: result.signerAddress,
        createdAt: new Date().toISOString()
      }
    });

  } catch (error: any) {
    console.error('[AsterBrokerController] Error generating API key:', error);


    if (error.message.includes('already exists')) {
      res.status(409).json({
        success: false,
        error: 'API key already exists',
        message: error.message
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: 'Failed to generate API key',
      message: error.message || 'Unknown error occurred'
    });
  }
}

export async function getAccountInfo(
  req: Request,
  res: Response
): Promise<void> {
  try {
    // 1. Get identifier from req.query
    const { walletId, address } = req.query;
    const identifier = (walletId || address) as string;

    console.log('[AsterBrokerController] Getting account info', {
      identifier
    });

    // 2. Validate identifier
    if (!identifier) {
      res.status(400).json({
        success: false,
        error: 'Missing parameters',
        message: 'walletId (or address) is required in the query string'
      });
      return;
    }

    // 3. Call the service
    const result = await asterBrokerSpotTradingService.getAccountInfo(identifier);

    console.log('[AsterBrokerController] Account info retrieved');

    // 4. Send response (result from service is the account info object)
    res.status(200).json({
      success: true,
      accountInfo: result
    });

  } catch (error: any) {
    // 5. Handle errors
    console.error('[AsterBrokerController] Error getting account info:', error);

    res.status(500).json({
      success: false,
      error: 'Failed to get account info',
      message: error.message || 'Unknown error occurred'
    });
  }
}

/**
 * Place a Spot Order
 * POST /api/aster/broker/order/place
 *
 * Body:
 * {
 * walletId: string,
 * symbol: string,
 * side: "BUY" | "SELL",
 * type: "MARKET" | "LIMIT",
 * quantity?: string,
 * price?: string,
 * quoteOrderQty?: string, // Use this for MARKET BUY
 * timeInForce?: "GTC" | "IOC" | "FOK",
 * }
 */
export async function placeOrder(
  req: Request,
  res: Response
): Promise<void> {
  try {
    console.log('[AsterBrokerController] Placing order', {
      body: req.body
    });

    // Validate required fields
    const { walletId, address, symbol, side, type } = req.body;
    const identifier = walletId || address;

    if (!identifier) {
      res.status(400).json({
        success: false,
        error: 'Missing walletId or address',
        message: 'walletId or address is required'
      });
      return;
    }

    if (!symbol || !side || !type) {
      res.status(400).json({
        success: false,
        error: 'Missing required parameters',
        message: 'symbol, side, and type are required'
      });
      return;
    }

    // Validate side
    if (!['BUY', 'SELL'].includes(side)) {
      res.status(400).json({
        success: false,
        error: 'Invalid side',
        message: 'side must be BUY or SELL'
      });
      return;
    }

    // Validate type
    const validTypes = ['MARKET', 'LIMIT', 'STOP', 'TAKE_PROFIT', 'STOP_MARKET', 'TAKE_PROFIT_MARKET'];
    if (!validTypes.includes(type)) {
      res.status(400).json({
        success: false,
        error: 'Invalid order type',
        message: `type must be one of: ${validTypes.join(', ')}`
      });
      return;
    }

    // Business logic for order types
    if (type === 'LIMIT' && !req.body.price) {
      res.status(400).json({
        success: false,
        error: 'Missing price',
        message: 'price is required for LIMIT orders'
      });
      return;
    }

    if (type === 'MARKET' && side === 'BUY' && !req.body.quoteOrderQty) {
       res.status(400).json({
        success: false,
        error: 'Missing quoteOrderQty',
        message: 'quoteOrderQty is required for MARKET BUY orders'
      });
      return;
    }

    if (type === 'MARKET' && side === 'SELL' && !req.body.quantity) {
       res.status(400).json({
        success: false,
        error: 'Missing quantity',
        message: 'quantity is required for MARKET SELL orders'
      });
      return;
    }

    // Build order params
    const orderParams: any = {
      symbol,
      side,
      type,
    };

    // Add optional params
    if (req.body.quantity) orderParams.quantity = req.body.quantity;
    if (req.body.quoteOrderQty) orderParams.quoteOrderQty = req.body.quoteOrderQty;
    if (req.body.price) orderParams.price = req.body.price;
    if (req.body.timeInForce) orderParams.timeInForce = req.body.timeInForce;
    if (req.body.stopPrice) orderParams.stopPrice = req.body.stopPrice;
    if (req.body.newClientOrderId) orderParams.newClientOrderId = req.body.newClientOrderId;

    console.log('[AsterBrokerController] Order params', orderParams);

    // Place order
    const result = await asterBrokerSpotTradingService.placeOrder(identifier, orderParams);

    console.log('[AsterBrokerController] ✅ Order placed successfully', {
      orderId: result.orderId,
      symbol: result.symbol,
      status: result.status
    });

    res.status(200).json({
      success: true,
      order: result,
      message: 'Order placed successfully'
    });

  } catch (error: any) {
    console.error('[AsterBrokerController] Error placing order:', error);

    res.status(500).json({
      success: false,
      error: 'Failed to place order',
      message: error.message || 'Unknown error occurred'
    });
  }
}

/**
 * Get order status
 * GET /api/aster/broker/order?walletId=xxx&symbol=BTCUSDT&orderId=123456
 */
export async function getOrder(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { walletId, address, symbol, orderId } = req.query;
    const identifier = (walletId || address) as string;

    console.log('[AsterBrokerController] Getting order', {
      identifier,
      symbol,
      orderId
    });

    if (!identifier || !symbol || !orderId) {
      res.status(400).json({
        success: false,
        error: 'Missing parameters',
        message: 'walletId (or address), symbol, and orderId are required'
      });
      return;
    }

    const orderIdNum = Number(orderId as string);
    if (isNaN(orderIdNum)) {
       res.status(400).json({
        success: false,
        error: 'Invalid parameter',
        message: 'orderId must be a number'
      });
      return;
    }

    const result = await asterBrokerSpotTradingService.getOrder(
      identifier,
      {
        symbol: symbol as string,
        orderId: orderIdNum
      }
    );

    console.log('[AsterBrokerController] Order retrieved', {
      orderId: result.orderId,
      status: result.status
    });

    res.status(200).json({
      success: true,
      order: result
    });

  } catch (error: any) {
    console.error('[AsterBrokerController] Error getting order:', error);

    res.status(500).json({
      success: false,
      error: 'Failed to get order',
      message: error.message || 'Unknown error occurred'
    });
  }
}

/**
 * Close spot position (Sell all available base asset)
 * POST /api/aster/broker/positions/close
 *
 * Body:
 * {
 * walletId: string,
 * symbol: string,     (e.g., "BTCUSDT")
 * baseAsset: string   (e.g., "BTC")
 * }
 */
export async function closePosition(
  req: Request,
  res: Response
): Promise<void> {
  try {

    const { walletId, address, symbol, baseAsset } = req.body;
    const identifier = walletId || address;

    console.log('[AsterBrokerController] Closing spot position', req.body);

    if (!identifier || !symbol || !baseAsset) {
      res.status(400).json({
        success: false,
        error: 'Missing parameters',
        message: 'walletId (or address), symbol, and baseAsset are required'
      });
      return;
    }

    const result = await asterBrokerSpotTradingService.closePosition(
      identifier,
      symbol,
      baseAsset
    );


    console.log('[AsterBrokerController] ✅ Position closed successfully');

    res.status(200).json({
      success: true,
      order: result,
      message: 'Position close request processed'
    });

  } catch (error: any) {
    console.error('[AsterBrokerController] Error closing position:', error);

    res.status(500).json({
      success: false,
      error: 'Failed to close position',
      message: error.message
    });
  }
}

/**
 * Cancel order
 * DELETE /api/aster/broker/order
 *
 * Body:
 * {
 * walletId: string,
 * symbol: string,
 * orderId: number
 * }
 */
export async function cancelOrder(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { walletId, address, symbol, orderId } = req.body;
    const identifier = walletId || address;

    console.log('[AsterBrokerController] Canceling order', req.body);

    if (!identifier || !symbol || !orderId) {
      res.status(400).json({
        success: false,
        error: 'Missing parameters',
        message: 'walletId (or address), symbol, and orderId are required'
      });
      return;
    }


    const orderIdNum = Number(orderId);
    if (isNaN(orderIdNum)) {
       res.status(400).json({
        success: false,
        error: 'Invalid parameter',
        message: 'orderId must be a number'
      });
      return;
    }

    const result = await asterBrokerSpotTradingService.cancelOrder(
      identifier,
      { symbol, orderId: orderIdNum }
    );


    console.log('[AsterBrokerController] ✅ Order canceled successfully');

    res.status(200).json({
      success: true,
      order: result,
      message: 'Order canceled successfully'
    });

  } catch (error: any) {
    console.error('[AsterBrokerController] Error canceling order:', error);

    res.status(500).json({
      success: false,
      error: 'Failed to cancel order',
      message: error.message
    });
  }
}
