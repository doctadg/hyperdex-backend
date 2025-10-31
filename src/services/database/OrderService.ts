// import { database } from '@/config/database';

// const db = database;

// /**
//  * Extended Order interface for database operations
//  */
// export interface OrderEntity {
//   id?: number;
//   walletAddress: string;
//   platform: 'hyperliquid' | 'aster' | 'lighter' | 'avantis';
//   orderId: string;
//   clientOrderId?: string;
//   symbol: string;
//   side: 'buy' | 'sell';
//   type: 'market' | 'limit';
//   status: 'pending' | 'open' | 'filled' | 'partial' | 'cancelled' | 'rejected';
//   price: string;
//   quantity: string;
//   filledQuantity: string;
//   remainingQuantity: string;
//   timeInForce?: 'GTC' | 'IOC' | 'FOK';
//   reduceOnly: boolean;
//   platformData?: Record<string, any>;
//   timestamp: number;
//   createdAt?: number;
//   updatedAt?: number;
//   filledAt?: number;
//   cancelledAt?: number;
// }

// /**
//  * Database service for order management
//  */
// export class OrderService {
//   /**
//    * Create a new order
//    */
//   static async createOrder(
//     order: Omit<OrderEntity, 'id' | 'createdAt' | 'updatedAt'>
//   ): Promise<OrderEntity> {
//     const query = `
//       INSERT INTO orders (
//         wallet_address, platform, order_id, client_order_id, symbol, side, type,
//         status, price, quantity, filled_quantity, remaining_quantity,
//         time_in_force, reduce_only, platform_data, timestamp
//       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
//       RETURNING *
//     `;

//     const values = [
//       order.walletAddress,
//       order.platform,
//       order.orderId,
//       order.clientOrderId || null,
//       order.symbol,
//       order.side,
//       order.type,
//       order.status,
//       order.price,
//       order.quantity,
//       order.filledQuantity,
//       order.remainingQuantity,
//       order.timeInForce || null,
//       order.reduceOnly || false,
//       order.platformData ? JSON.stringify(order.platformData) : null,
//       order.timestamp
//     ];

//     const result = await db.query(query, values);
//     return this.mapRowToOrder(result.rows[0]);
//   }

//   /**
//    * Update order status and details
//    */
//   static async updateOrder(
//     orderId: string,
//     platform: string,
//     updates: {
//       status?: string;
//       filledQuantity?: string;
//       remainingQuantity?: string;
//       platformData?: Record<string, any>;
//       filledAt?: number;
//       cancelledAt?: number;
//     }
//   ): Promise<OrderEntity | null> {
//     const query = `
//       UPDATE orders SET
//         status = COALESCE($3, status),
//         filled_quantity = COALESCE($4, filled_quantity),
//         remaining_quantity = COALESCE($5, remaining_quantity),
//         platform_data = CASE
//           WHEN $6::jsonb IS NOT NULL THEN platform_data || $6::jsonb
//           ELSE platform_data
//         END,
//         filled_at = COALESCE($7, filled_at),
//         cancelled_at = COALESCE($8, cancelled_at),
//         updated_at = EXTRACT(EPOCH FROM NOW()) * 1000
//       WHERE order_id = $1 AND platform = $2
//       RETURNING *
//     `;

//     const values = [
//       orderId,
//       platform,
//       updates.status || null,
//       updates.filledQuantity || null,
//       updates.remainingQuantity || null,
//       updates.platformData ? JSON.stringify(updates.platformData) : null,
//       updates.filledAt || null,
//       updates.cancelledAt || null
//     ];

//     const result = await db.query(query, values);
//     return result.rows.length > 0 ? this.mapRowToOrder(result.rows[0]) : null;
//   }

//   /**
//    * Cancel an order
//    */
//   static async cancelOrder(
//     orderId: string,
//     platform: string
//   ): Promise<OrderEntity | null> {
//     const query = `
//       UPDATE orders SET
//         status = 'cancelled',
//         cancelled_at = EXTRACT(EPOCH FROM NOW()) * 1000,
//         updated_at = EXTRACT(EPOCH FROM NOW()) * 1000
//       WHERE order_id = $1 AND platform = $2 AND status NOT IN ('filled', 'cancelled')
//       RETURNING *
//     `;

//     const result = await db.query(query, [orderId, platform]);
//     return result.rows.length > 0 ? this.mapRowToOrder(result.rows[0]) : null;
//   }

//   /**
//    * Get all orders for a wallet
//    */
//   static async getOrdersByWallet(
//     walletAddress: string,
//     platform?: string,
//     status?: string,
//     limit: number = 100,
//     offset: number = 0
//   ): Promise<OrderEntity[]> {
//     let query = `
//       SELECT * FROM orders
//       WHERE wallet_address = $1
//     `;
//     const values: any[] = [walletAddress];
//     let paramIndex = 2;

//     if (platform) {
//       query += ` AND platform = $${paramIndex}`;
//       values.push(platform);
//       paramIndex++;
//     }

//     if (status) {
//       query += ` AND status = $${paramIndex}`;
//       values.push(status);
//       paramIndex++;
//     }

//     query += ` ORDER BY timestamp DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
//     values.push(limit, offset);

//     const result = await db.query(query, values);
//     return result.rows.map(this.mapRowToOrder);
//   }

//   /**
//    * Get orders by symbol for a wallet
//    */
//   static async getOrdersBySymbol(
//     walletAddress: string,
//     symbol: string,
//     platform?: string,
//     limit: number = 50
//   ): Promise<OrderEntity[]> {
//     let query = `
//       SELECT * FROM orders
//       WHERE wallet_address = $1 AND symbol = $2
//     `;
//     const values: any[] = [walletAddress, symbol];

//     if (platform) {
//       query += ` AND platform = $3`;
//       values.push(platform);
//     }

//     query += ` ORDER BY timestamp DESC LIMIT ${limit}`;

//     const result = await db.query(query, values);
//     return result.rows.map(this.mapRowToOrder);
//   }

//   /**
//    * Get order by ID
//    */
//   static async getOrderById(
//     orderId: string,
//     platform: string
//   ): Promise<OrderEntity | null> {
//     const query = `
//       SELECT * FROM orders
//       WHERE order_id = $1 AND platform = $2
//     `;

//     const result = await db.query(query, [orderId, platform]);
//     return result.rows.length > 0 ? this.mapRowToOrder(result.rows[0]) : null;
//   }

//   /**
//    * Get order by client order ID
//    */
//   static async getOrderByClientId(
//     clientOrderId: string,
//     walletAddress: string
//   ): Promise<OrderEntity | null> {
//     const query = `
//       SELECT * FROM orders
//       WHERE client_order_id = $1 AND wallet_address = $2
//     `;

//     const result = await db.query(query, [clientOrderId, walletAddress]);
//     return result.rows.length > 0 ? this.mapRowToOrder(result.rows[0]) : null;
//   }

//   /**
//    * Get orders summary for a wallet
//    */
//   static async getOrdersSummary(walletAddress: string, platform?: string): Promise<{
//     totalOrders: number;
//     openOrders: number;
//     filledOrders: number;
//     cancelledOrders: number;
//     totalVolume: number;
//     totalFilled: number;
//     ordersByPlatform: Record<string, number>;
//   }> {
//     let platformFilter = '';
//     const values: any[] = [walletAddress];

//     if (platform) {
//       platformFilter = ` AND platform = $2`;
//       values.push(platform);
//     }

//     const query = `
//       SELECT
//         COUNT(*) as total_orders,
//         COUNT(*) FILTER (WHERE status = 'open' OR status = 'pending') as open_orders,
//         COUNT(*) FILTER (WHERE status = 'filled') as filled_orders,
//         COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_orders,
//         SUM(CAST(quantity AS DECIMAL)) as total_volume,
//         SUM(CAST(filled_quantity AS DECIMAL)) as total_filled,
//         platform
//       FROM orders
//       WHERE wallet_address = $1${platformFilter}
//       GROUP BY platform
//     `;

//     const result = await db.query<{
//       total_orders: string;
//       open_orders: string;
//       filled_orders: string;
//       cancelled_orders: string;
//       total_volume: string;
//       total_filled: string;
//       platform: string;
//     }>(query, values);

//     const summary = {
//       totalOrders: 0,
//       openOrders: 0,
//       filledOrders: 0,
//       cancelledOrders: 0,
//       totalVolume: 0,
//       totalFilled: 0,
//       ordersByPlatform: {} as Record<string, number>
//     };

//     for (const row of result.rows) {
//       summary.totalOrders += parseInt(row.total_orders);
//       summary.openOrders += parseInt(row.open_orders);
//       summary.filledOrders += parseInt(row.filled_orders);
//       summary.cancelledOrders += parseInt(row.cancelled_orders);
//       summary.totalVolume += parseFloat(row.total_volume) || 0;
//       summary.totalFilled += parseFloat(row.total_filled) || 0;
//       summary.ordersByPlatform[row.platform] = parseInt(row.total_orders);
//     }

//     return summary;
//   }

//   /**
//    * Get recent filled orders for a wallet
//    */
//   static async getRecentFilledOrders(
//     walletAddress: string,
//     hoursAgo: number = 24,
//     limit: number = 50
//   ): Promise<OrderEntity[]> {
//     const cutoffTime = Date.now() - (hoursAgo * 60 * 60 * 1000);
//     const query = `
//       SELECT * FROM orders
//       WHERE wallet_address = $1 AND status = 'filled' AND filled_at > $2
//       ORDER BY filled_at DESC
//       LIMIT $3
//     `;

//     const result = await db.query(query, [walletAddress, cutoffTime, limit]);
//     return result.rows.map(this.mapRowToOrder);
//   }

//   /**
//    * Update multiple orders (batch operation)
//    */
//   static async updateOrdersBatch(
//     updates: Array<{
//       orderId: string;
//       platform: string;
//       data: Partial<OrderEntity>;
//     }>
//   ): Promise<OrderEntity[]> {
//     const results: OrderEntity[] = [];

//     for (const update of updates) {
//       const order = await this.updateOrder(update.orderId, update.platform, {
//         status: update.data.status,
//         filledQuantity: update.data.filledQuantity,
//         remainingQuantity: update.data.remainingQuantity,
//         platformData: update.data.platformData,
//         filledAt: update.data.filledAt,
//         cancelledAt: update.data.cancelledAt
//       });

//       if (order) {
//         results.push(order);
//       }
//     }

//     return results;
//   }

//   /**
//    * Cancel multiple orders
//    */
//   static async cancelOrdersBatch(
//     orders: Array<{ orderId: string; platform: string }>
//   ): Promise<OrderEntity[]> {
//     const results: OrderEntity[] = [];

//     for (const order of orders) {
//       const cancelled = await this.cancelOrder(order.orderId, order.platform);
//       if (cancelled) {
//         results.push(cancelled);
//       }
//     }

//     return results;
//   }

//   /**
//    * Clean up old closed/cancelled orders (data retention)
//    */
//   static async cleanupOldOrders(daysOld: number = 90): Promise<number> {
//     const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
//     const query = `
//       DELETE FROM orders
//       WHERE status IN ('cancelled', 'rejected', 'filled')
//         AND (cancelled_at < $1 OR filled_at < $1 OR updated_at < $1)
//     `;

//     const result = await db.query(query, [cutoffTime]);
//     return result.rowCount || 0;
//   }

//   /**
//    * Map database row to OrderEntity object
//    */
//   private static mapRowToOrder(row: any): OrderEntity {
//     let platformData: Record<string, any> | undefined;

//     // Handle both string (needs parsing) and object (already parsed) cases
//     if (row.platform_data) {
//       if (typeof row.platform_data === 'string') {
//         try {
//           platformData = JSON.parse(row.platform_data);
//         } catch (e) {
//           platformData = undefined;
//         }
//       } else {
//         // Already an object (JSONB from PostgreSQL)
//         platformData = row.platform_data;
//       }
//     }

//     return {
//       id: row.id,
//       walletAddress: row.wallet_address,
//       platform: row.platform,
//       orderId: row.order_id,
//       clientOrderId: row.client_order_id,
//       symbol: row.symbol,
//       side: row.side,
//       type: row.type,
//       status: row.status,
//       price: row.price,
//       quantity: row.quantity,
//       filledQuantity: row.filled_quantity,
//       remainingQuantity: row.remaining_quantity,
//       timeInForce: row.time_in_force,
//       reduceOnly: row.reduce_only,
//       platformData: platformData,
//       timestamp: parseInt(row.timestamp),
//       createdAt: row.created_at ? parseInt(row.created_at) : undefined,
//       updatedAt: row.updated_at ? parseInt(row.updated_at) : undefined,
//       filledAt: row.filled_at ? parseInt(row.filled_at) : undefined,
//       cancelledAt: row.cancelled_at ? parseInt(row.cancelled_at) : undefined
//     };
//   }
// }




import { database } from '@/config/database';

const db = database;

/**
 * Extended Order interface for database operations
 */
export interface OrderEntity {
  id?: number;
  walletAddress: string;
  platform: 'hyperliquid' | 'aster' | 'lighter' | 'avantis';
  orderId: string;
  clientOrderId?: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit';
  status: 'pending' | 'open' | 'filled' | 'partial' | 'cancelled' | 'rejected';
  price: string;
  quantity: string;
  filledQuantity: string;
  remainingQuantity: string;
  timeInForce?: 'GTC' | 'IOC' | 'FOK';
  reduceOnly: boolean;
  platformData?: Record<string, any>;
  timestamp: number;
  createdAt?: number;
  updatedAt?: number;
  filledAt?: number;
  cancelledAt?: number;
}

/**
 * Database service for order management
 */
export class OrderService {
  /**
   * Create a new order
   */
  static async createOrder(
    order: Omit<OrderEntity, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<OrderEntity> {
    const query = `
      INSERT INTO orders (
        wallet_address, platform, order_id, client_order_id, symbol, side, type,
        status, price, quantity, filled_quantity, remaining_quantity,
        time_in_force, reduce_only, platform_data, timestamp
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *
    `;

    const values = [
      order.walletAddress,
      order.platform,
      order.orderId,
      order.clientOrderId || null,
      order.symbol,
      order.side,
      order.type,
      order.status,
      order.price,
      order.quantity,
      order.filledQuantity,
      order.remainingQuantity,
      order.timeInForce || null,
      order.reduceOnly || false,
      order.platformData ? JSON.stringify(order.platformData) : null,
      order.timestamp
    ];

    const result = await db.query(query, values);
    return this.mapRowToOrder(result.rows[0]);
  }

  /**
   * Update order status and details
   */
  static async updateOrder(
    orderId: string,
    platform: string,
    updates: {
      status?: string;
      filledQuantity?: string;
      remainingQuantity?: string;
      platformData?: Record<string, any>;
      filledAt?: number;
      cancelledAt?: number;
    }
  ): Promise<OrderEntity | null> {
    const query = `
      UPDATE orders SET
        status = COALESCE($3, status),
        filled_quantity = COALESCE($4, filled_quantity),
        remaining_quantity = COALESCE($5, remaining_quantity),
        platform_data = CASE
          WHEN $6::jsonb IS NOT NULL THEN platform_data || $6::jsonb
          ELSE platform_data
        END,
        filled_at = COALESCE($7, filled_at),
        cancelled_at = COALESCE($8, cancelled_at),
        updated_at = EXTRACT(EPOCH FROM NOW()) * 1000
      WHERE order_id = $1 AND platform = $2
      RETURNING *
    `;

    const values = [
      orderId,
      platform,
      updates.status || null,
      updates.filledQuantity || null,
      updates.remainingQuantity || null,
      updates.platformData ? JSON.stringify(updates.platformData) : null,
      updates.filledAt || null,
      updates.cancelledAt || null
    ];

    const result = await db.query(query, values);
    return result.rows.length > 0 ? this.mapRowToOrder(result.rows[0]) : null;
  }

  /**
   * Cancel an order
   */
  static async cancelOrder(
    orderId: string,
    platform: string
  ): Promise<OrderEntity | null> {
    const query = `
      UPDATE orders SET
        status = 'cancelled',
        cancelled_at = EXTRACT(EPOCH FROM NOW()) * 1000,
        updated_at = EXTRACT(EPOCH FROM NOW()) * 1000
      WHERE order_id = $1 AND platform = $2 AND status NOT IN ('filled', 'cancelled')
      RETURNING *
    `;

    const result = await db.query(query, [orderId, platform]);
    return result.rows.length > 0 ? this.mapRowToOrder(result.rows[0]) : null;
  }

  /**
   * Get all orders for a wallet
   */
  static async getOrdersByWallet(
    walletAddress: string,
    platform?: string,
    status?: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<OrderEntity[]> {
    let query = `
      SELECT * FROM orders
      WHERE wallet_address = $1
    `;
    const values: any[] = [walletAddress];
    let paramIndex = 2;

    if (platform) {
      query += ` AND platform = $${paramIndex}`;
      values.push(platform);
      paramIndex++;
    }

    if (status) {
      query += ` AND status = $${paramIndex}`;
      values.push(status);
      paramIndex++;
    }

    query += ` ORDER BY timestamp DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    values.push(limit, offset);

    const result = await db.query(query, values);
    return result.rows.map(row => this.mapRowToOrder(row));
  }

  /**
   * Get orders by symbol for a wallet
   */
  static async getOrdersBySymbol(
    walletAddress: string,
    symbol: string,
    platform?: string,
    limit: number = 50
  ): Promise<OrderEntity[]> {
    let query = `
      SELECT * FROM orders
      WHERE wallet_address = $1 AND symbol = $2
    `;
    const values: any[] = [walletAddress, symbol];

    if (platform) {
      query += ` AND platform = $3`;
      values.push(platform);
    }

    query += ` ORDER BY timestamp DESC LIMIT $4`;
    values.push(limit);

    const result = await db.query(query, values);
    return result.rows.map(row => this.mapRowToOrder(row));
  }

  /**
   * Get order by ID
   */
  static async getOrderById(
    orderId: string,
    platform: string
  ): Promise<OrderEntity | null> {
    const query = `
      SELECT * FROM orders
      WHERE order_id = $1 AND platform = $2
    `;

    const result = await db.query(query, [orderId, platform]);
    return result.rows.length > 0 ? this.mapRowToOrder(result.rows[0]) : null;
  }

  /**
   * Get order by client order ID
   */
  static async getOrderByClientId(
    clientOrderId: string,
    walletAddress: string
  ): Promise<OrderEntity | null> {
    const query = `
      SELECT * FROM orders
      WHERE client_order_id = $1 AND wallet_address = $2
    `;

    const result = await db.query(query, [clientOrderId, walletAddress]);
    return result.rows.length > 0 ? this.mapRowToOrder(result.rows[0]) : null;
  }

  /**
   * Get orders summary for a wallet
   */
  static async getOrdersSummary(walletAddress: string, platform?: string): Promise<{
    totalOrders: number;
    openOrders: number;
    filledOrders: number;
    cancelledOrders: number;
    totalVolume: number;
    totalFilled: number;
    ordersByPlatform: Record<string, number>;
  }> {
    let platformFilter = '';
    const values: any[] = [walletAddress];

    if (platform) {
      platformFilter = ` AND platform = $2`;
      values.push(platform);
    }

    const query = `
      SELECT
        COUNT(*) as total_orders,
        COUNT(*) FILTER (WHERE status = 'open' OR status = 'pending') as open_orders,
        COUNT(*) FILTER (WHERE status = 'filled') as filled_orders,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_orders,
        SUM(CAST(quantity AS DECIMAL)) as total_volume,
        SUM(CAST(filled_quantity AS DECIMAL)) as total_filled,
        platform
      FROM orders
      WHERE wallet_address = $1${platformFilter}
      GROUP BY platform
    `;

    const result = await db.query<{
      total_orders: string;
      open_orders: string;
      filled_orders: string;
      cancelled_orders: string;
      total_volume: string;
      total_filled: string;
      platform: string;
    }>(query, values);

    const summary = {
      totalOrders: 0,
      openOrders: 0,
      filledOrders: 0,
      cancelledOrders: 0,
      totalVolume: 0,
      totalFilled: 0,
      ordersByPlatform: {} as Record<string, number>
    };

    for (const row of result.rows) {
      summary.totalOrders += parseInt(row.total_orders);
      summary.openOrders += parseInt(row.open_orders);
      summary.filledOrders += parseInt(row.filled_orders);
      summary.cancelledOrders += parseInt(row.cancelled_orders);
      summary.totalVolume += parseFloat(row.total_volume) || 0;
      summary.totalFilled += parseFloat(row.total_filled) || 0;
      summary.ordersByPlatform[row.platform] = parseInt(row.total_orders);
    }

    return summary;
  }

  /**
   * Get recent filled orders for a wallet
   */
  static async getRecentFilledOrders(
    walletAddress: string,
    hoursAgo: number = 24,
    limit: number = 50
  ): Promise<OrderEntity[]> {
    const cutoffTime = Date.now() - (hoursAgo * 60 * 60 * 1000);
    const query = `
      SELECT * FROM orders
      WHERE wallet_address = $1 AND status = 'filled' AND filled_at > $2
      ORDER BY filled_at DESC
      LIMIT $3
    `;

    const result = await db.query(query, [walletAddress, cutoffTime, limit]);
    return result.rows.map(row => this.mapRowToOrder(row));
  }

  /**
   * Update multiple orders (batch operation)
   */
  static async updateOrdersBatch(
    updates: Array<{
      orderId: string;
      platform: string;
      data: Partial<OrderEntity>;
    }>
  ): Promise<OrderEntity[]> {
    const results: OrderEntity[] = [];

    for (const update of updates) {
      const order = await this.updateOrder(update.orderId, update.platform, {
        status: update.data.status,
        filledQuantity: update.data.filledQuantity,
        remainingQuantity: update.data.remainingQuantity,
        platformData: update.data.platformData,
        filledAt: update.data.filledAt,
        cancelledAt: update.data.cancelledAt
      });

      if (order) {
        results.push(order);
      }
    }

    return results;
  }

  /**
   * Cancel multiple orders
   */
  static async cancelOrdersBatch(
    orders: Array<{ orderId: string; platform: string }>
  ): Promise<OrderEntity[]> {
    const results: OrderEntity[] = [];

    for (const order of orders) {
      const cancelled = await this.cancelOrder(order.orderId, order.platform);
      if (cancelled) {
        results.push(cancelled);
      }
    }

    return results;
  }

  /**
   * Clean up old closed/cancelled orders (data retention)
   */
  static async cleanupOldOrders(daysOld: number = 90): Promise<number> {
    const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
    const query = `
      DELETE FROM orders
      WHERE status IN ('cancelled', 'rejected', 'filled')
        AND (cancelled_at < $1 OR filled_at < $1 OR updated_at < $1)
    `;

    const result = await db.query(query, [cutoffTime]);
    return result.rowCount || 0;
  }

  /**
   * Map database row to OrderEntity object
   */
  private static mapRowToOrder(row: any): OrderEntity {
    let platformData: Record<string, any> | undefined;

    // Handle both string (needs parsing) and object (already parsed) cases
    if (row.platform_data) {
      if (typeof row.platform_data === 'string') {
        try {
          platformData = JSON.parse(row.platform_data);
        } catch (e) {
          platformData = undefined;
        }
      } else {
        // Already an object (JSONB from PostgreSQL)
        platformData = row.platform_data;
      }
    }

    return {
      id: row.id,
      walletAddress: row.wallet_address,
      platform: row.platform,
      orderId: row.order_id,
      clientOrderId: row.client_order_id,
      symbol: row.symbol,
      side: row.side,
      type: row.type,
      status: row.status,
      price: row.price,
      quantity: row.quantity,
      filledQuantity: row.filled_quantity,
      remainingQuantity: row.remaining_quantity,
      timeInForce: row.time_in_force,
      reduceOnly: row.reduce_only,
      platformData: platformData,
      timestamp: parseInt(row.timestamp),
      createdAt: row.created_at ? parseInt(row.created_at) : undefined,
      updatedAt: row.updated_at ? parseInt(row.updated_at) : undefined,
      filledAt: row.filled_at ? parseInt(row.filled_at) : undefined,
      cancelledAt: row.cancelled_at ? parseInt(row.cancelled_at) : undefined
    };
  }
}
