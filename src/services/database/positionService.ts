import { database } from '@/config/database';

const db = database;

export interface Position {
  id?: number;
  walletAddress: string;
  platform: 'hyperliquid' | 'aster' | 'lighter' | 'avantis';
  symbol: string;
  side: 'long' | 'short';
  size: string;
  entryPrice: string;
  markPrice?: string;
  leverage: number;
  marginMode: 'cross' | 'isolated';
  marginUsed: string;
  unrealizedPnl?: string;
  realizedPnl?: string;
  liquidationPrice?: string;
  stopLossPrice?: string;
  takeProfitPrice?: string;
  platformPositionId?: string;
  platformData?: Record<string, any>;
  status: 'open' | 'closed' | 'liquidated';
  openedAt: number;
  closedAt?: number;
  lastUpdatedAt?: number;
  createdAt?: number;
}

export interface PositionUpdate {
  markPrice?: string;
  unrealizedPnl?: string;
  liquidationPrice?: string;
  marginUsed?: string;
  platformData?: Record<string, any>;
}

/**
 * Database service for position management
 */
export class PositionService {
  /**
   * Create or update a position
   */
  static async upsertPosition(position: Omit<Position, 'id' | 'createdAt' | 'lastUpdatedAt'>): Promise<Position> {
    // Check if position already exists
    const existingQuery = `
      SELECT id FROM positions
      WHERE wallet_address = $1 AND platform = $2 AND symbol = $3 AND status = 'open'
    `;

    const existingResult = await db.query(existingQuery, [
      position.walletAddress,
      position.platform,
      position.symbol
    ]);

    if (existingResult.rows.length > 0) {
      // Update existing position
      const updateQuery = `
        UPDATE positions SET
          side = $4,
          size = $5,
          entry_price = $6,
          mark_price = $7,
          leverage = $8,
          margin_mode = $9,
          margin_used = $10,
          unrealized_pnl = $11,
          realized_pnl = $12,
          liquidation_price = $13,
          stop_loss_price = $14,
          take_profit_price = $15,
          platform_position_id = $16,
          platform_data = $17,
          status = $18,
          opened_at = $19,
          closed_at = $20
        WHERE id = $1
        RETURNING *
      `;

      const updateValues = [
        (existingResult.rows[0] as { id: number }).id,
        position.walletAddress,
        position.platform,
        position.symbol,
        position.side,
        position.size,
        position.entryPrice,
        position.markPrice || null,
        position.leverage,
        position.marginMode,
        position.marginUsed,
        position.unrealizedPnl || '0',
        position.realizedPnl || '0',
        position.liquidationPrice || null,
        position.stopLossPrice || null,
        position.takeProfitPrice || null,
        position.platformPositionId || null,
        position.platformData ? JSON.stringify(position.platformData) : null,
        position.status,
        position.openedAt,
        position.closedAt || null
      ];

      const result = await db.query(updateQuery, updateValues);
      return this.mapRowToPosition(result.rows[0]);
    } else {
      // Insert new position
      const insertQuery = `
        INSERT INTO positions (
          wallet_address, platform, symbol, side, size, entry_price, mark_price,
          leverage, margin_mode, margin_used, unrealized_pnl, realized_pnl,
          liquidation_price, stop_loss_price, take_profit_price,
          platform_position_id, platform_data, status, opened_at, closed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
        RETURNING *
      `;

      const insertValues = [
        position.walletAddress,
        position.platform,
        position.symbol,
        position.side,
        position.size,
        position.entryPrice,
        position.markPrice || null,
        position.leverage,
        position.marginMode,
        position.marginUsed,
        position.unrealizedPnl || '0',
        position.realizedPnl || '0',
        position.liquidationPrice || null,
        position.stopLossPrice || null,
        position.takeProfitPrice || null,
        position.platformPositionId || null,
        position.platformData ? JSON.stringify(position.platformData) : null,
        position.status,
        position.openedAt,
        position.closedAt || null
      ];

      const result = await db.query(insertQuery, insertValues);
      return this.mapRowToPosition(result.rows[0]);
    }
  }

  /**
   * Update position with new market data
   */
  static async updatePosition(
    walletAddress: string,
    platform: string,
    symbol: string,
    updates: PositionUpdate
  ): Promise<Position | null> {
    const query = `
      UPDATE positions SET
        mark_price = COALESCE($4, mark_price),
        unrealized_pnl = COALESCE($5, unrealized_pnl),
        liquidation_price = COALESCE($6, liquidation_price),
        margin_used = COALESCE($7, margin_used),
        platform_data = COALESCE($8, platform_data)
      WHERE wallet_address = $1 AND platform = $2 AND symbol = $3 AND status = 'open'
      RETURNING *
    `;

    const values = [
      walletAddress,
      platform,
      symbol,
      updates.markPrice || null,
      updates.unrealizedPnl || null,
      updates.liquidationPrice || null,
      updates.marginUsed || null,
      updates.platformData ? JSON.stringify(updates.platformData) : null
    ];

    const result = await db.query(query, values);
    return result.rows.length > 0 ? this.mapRowToPosition(result.rows[0]) : null;
  }

  /**
   * Close a position
   */
  static async closePosition(
    walletAddress: string,
    platform: string,
    symbol: string,
    realizedPnl?: string
  ): Promise<Position | null> {
    const query = `
      UPDATE positions SET
        status = 'closed',
        closed_at = EXTRACT(EPOCH FROM NOW()) * 1000,
        realized_pnl = COALESCE($4, realized_pnl)
      WHERE wallet_address = $1 AND platform = $2 AND symbol = $3 AND status = 'open'
      RETURNING *
    `;

    const values = [walletAddress, platform, symbol, realizedPnl || null];
    const result = await db.query(query, values);
    return result.rows.length > 0 ? this.mapRowToPosition(result.rows[0]) : null;
  }

  /**
   * Get all open positions for a user
   */
  static async getUserPositions(
    walletAddress: string,
    platform?: string
  ): Promise<Position[]> {
    let query = `
      SELECT * FROM positions
      WHERE wallet_address = $1 AND status = 'open'
    `;
    const values = [walletAddress];

    if (platform) {
      query += ` AND platform = $2`;
      values.push(platform);
    }

    query += ` ORDER BY opened_at DESC`;

    const result = await db.query(query, values);
    return result.rows.map(this.mapRowToPosition);
  }

  /**
   * Get position by platform-specific ID
   */
  static async getPositionByPlatformId(
    platform: string,
    platformPositionId: string
  ): Promise<Position | null> {
    const query = `
      SELECT * FROM positions
      WHERE platform = $1 AND platform_position_id = $2 AND status = 'open'
    `;

    const result = await db.query(query, [platform, platformPositionId]);
    return result.rows.length > 0 ? this.mapRowToPosition(result.rows[0]) : null;
  }

  /**
   * Get all positions for a symbol across platforms
   */
  static async getPositionsBySymbol(
    walletAddress: string,
    symbol: string
  ): Promise<Position[]> {
    const query = `
      SELECT * FROM positions
      WHERE wallet_address = $1 AND symbol = $2 AND status = 'open'
      ORDER BY platform, opened_at DESC
    `;

    const result = await db.query(query, [walletAddress, symbol]);
    return result.rows.map(this.mapRowToPosition);
  }

  /**
   * Get positions summary for a user
   */
  static async getUserPositionsSummary(walletAddress: string): Promise<{
    totalPositions: number;
    totalUnrealizedPnl: number;
    totalMarginUsed: number;
    positionsByPlatform: Record<string, number>;
  }> {
    const query = `
      SELECT
        COUNT(*) as total_positions,
        SUM(CAST(unrealized_pnl AS DECIMAL)) as total_unrealized_pnl,
        SUM(CAST(margin_used AS DECIMAL)) as total_margin_used,
        platform,
        COUNT(*) as platform_count
      FROM positions
      WHERE wallet_address = $1 AND status = 'open'
      GROUP BY platform
    `;

    const result = await db.query<{
      total_positions: string;
      total_unrealized_pnl: string;
      total_margin_used: string;
      platform: string;
      platform_count: string;
    }>(query, [walletAddress]);

    const summary = {
      totalPositions: 0,
      totalUnrealizedPnl: 0,
      totalMarginUsed: 0,
      positionsByPlatform: {} as Record<string, number>
    };

    for (const row of result.rows) {
      summary.totalPositions += parseInt(row.platform_count);
      summary.totalUnrealizedPnl += parseFloat(row.total_unrealized_pnl) || 0;
      summary.totalMarginUsed += parseFloat(row.total_margin_used) || 0;
      summary.positionsByPlatform[row.platform] = parseInt(row.platform_count);
    }

    return summary;
  }

  /**
   * Delete old closed positions (cleanup)
   */
  static async cleanupOldPositions(daysOld: number = 30): Promise<number> {
    const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
    const query = `
      DELETE FROM positions
      WHERE status IN ('closed', 'liquidated') AND closed_at < $1
    `;

    const result = await db.query(query, [cutoffTime]);
    return result.rowCount || 0;
  }

  /**
   * Map database row to Position object
   */
  private static mapRowToPosition(row: any): Position {
    return {
      id: row.id,
      walletAddress: row.wallet_address,
      platform: row.platform,
      symbol: row.symbol,
      side: row.side,
      size: row.size,
      entryPrice: row.entry_price,
      markPrice: row.mark_price,
      leverage: row.leverage,
      marginMode: row.margin_mode,
      marginUsed: row.margin_used,
      unrealizedPnl: row.unrealized_pnl,
      realizedPnl: row.realized_pnl,
      liquidationPrice: row.liquidation_price,
      stopLossPrice: row.stop_loss_price,
      takeProfitPrice: row.take_profit_price,
      platformPositionId: row.platform_position_id,
      platformData: row.platform_data ? JSON.parse(row.platform_data) : undefined,
      status: row.status,
      openedAt: parseInt(row.opened_at),
      closedAt: row.closed_at ? parseInt(row.closed_at) : undefined,
      lastUpdatedAt: parseInt(row.last_updated_at),
      createdAt: parseInt(row.created_at)
    };
  }
}