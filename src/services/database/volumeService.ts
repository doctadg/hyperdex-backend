import { database } from '@/config/database';

const db = database;
import type { TradeVolumeData, LeaderboardEntry, UserVolumeStats } from '@/types/volume';

/**
 * Database service for volume tracking
 * Replaces the in-memory storage with persistent PostgreSQL storage
 */

export class VolumeService {
  /**
   * Add volume data to the database
   */
  static async addVolumeData(data: TradeVolumeData): Promise<void> {
    const query = `
      INSERT INTO volume_tracking (
        wallet_address, platform, market_id, side, size, price,
        notional_value, leverage, fees, order_id, timestamp
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `;

    const values = [
      data.userAddress,
      data.platform,
      data.marketId,
      data.side,
      data.size,
      data.price,
      data.notionalValue,
      data.leverage,
      data.fees,
      data.orderId || null,
      data.timestamp
    ];

    await db.query(query, values);
  }

  /**
   * Get leaderboard data
   */
  static async getLeaderboard(
    timeframe: 'daily' | 'weekly' | 'monthly' | 'all-time' = 'all-time',
    platform: string = 'all',
    limit: number = 100
  ): Promise<LeaderboardEntry[]> {
    let timeCondition = '';
    const now = Date.now();

    switch (timeframe) {
      case 'daily':
        timeCondition = `AND timestamp > ${now - 24 * 60 * 60 * 1000}`;
        break;
      case 'weekly':
        timeCondition = `AND timestamp > ${now - 7 * 24 * 60 * 60 * 1000}`;
        break;
      case 'monthly':
        timeCondition = `AND timestamp > ${now - 30 * 24 * 60 * 60 * 1000}`;
        break;
      default:
        timeCondition = '';
    }

    let platformCondition = '';
    if (platform !== 'all') {
      platformCondition = `AND platform = $1`;
    }

    const query = `
      SELECT
        wallet_address as address,
        SUM(notional_value) as total_volume,
        COUNT(*) as trade_count,
        MODE() WITHIN GROUP (ORDER BY platform) as primary_platform,
        MAX(timestamp) as last_trade_time,
        ROW_NUMBER() OVER (ORDER BY SUM(notional_value) DESC) as rank
      FROM volume_tracking
      WHERE 1=1 ${timeCondition} ${platformCondition}
      GROUP BY wallet_address
      ORDER BY total_volume DESC
      LIMIT $${platform !== 'all' ? '2' : '1'}
    `;

    const values = platform !== 'all' ? [platform, limit] : [limit];
    const result = await db.query<{
      address: string;
      total_volume: string;
      trade_count: string;
      primary_platform: 'hyperliquid' | 'aster' | 'lighter' | 'avantis';
      last_trade_time: string;
      rank: string;
    }>(query, values);

    return result.rows.map((row, index) => ({
      rank: index + 1,
      address: row.address,
      totalVolume: parseFloat(row.total_volume),
      tradeCount: parseInt(row.trade_count),
      primaryPlatform: row.primary_platform,
      lastTradeTime: parseInt(row.last_trade_time),
    }));
  }

  /**
   * Get user volume statistics
   */
  static async getUserVolumeStats(address: string): Promise<UserVolumeStats | null> {
    // Get user's total volume and trade count
    const userQuery = `
      SELECT
        SUM(notional_value) as total_volume,
        COUNT(*) as trade_count,
        SUM(CASE WHEN platform = 'hyperliquid' THEN notional_value ELSE 0 END) as hyperliquid_volume,
        SUM(CASE WHEN platform = 'aster' THEN notional_value ELSE 0 END) as aster_volume
      FROM volume_tracking
      WHERE wallet_address = $1
    `;

    const userResult = await db.query<{
      total_volume: string;
      trade_count: string;
      hyperliquid_volume: string;
      aster_volume: string;
    }>(userQuery, [address]);
    const userData = userResult.rows[0];

    if (!userData || parseFloat(userData.total_volume) === 0) {
      return null;
    }

    // Get user's rank
    const rankQuery = `
      SELECT COUNT(*) + 1 as rank
      FROM (
        SELECT wallet_address, SUM(notional_value) as total_volume
        FROM volume_tracking
        GROUP BY wallet_address
        HAVING SUM(notional_value) > $1
      ) ranked_users
    `;

    const rankResult = await db.query<{ rank: string }>(rankQuery, [userData.total_volume]);
    const rank = parseInt(rankResult.rows[0].rank);

    // Get total number of users for percentile calculation
    const totalUsersQuery = `
      SELECT COUNT(DISTINCT wallet_address) as total_users
      FROM volume_tracking
    `;

    const totalUsersResult = await db.query<{ total_users: string }>(totalUsersQuery);
    const totalUsers = parseInt(totalUsersResult.rows[0].total_users);
    const percentile = totalUsers > 0 ? ((totalUsers - rank + 1) / totalUsers) * 100 : 0;

    // Get timeframe-specific volumes
    const now = Date.now();
    const timeframes = {
      daily: now - 24 * 60 * 60 * 1000,
      weekly: now - 7 * 24 * 60 * 60 * 1000,
      monthly: now - 30 * 24 * 60 * 60 * 1000,
    };

    const timeframeQuery = `
      SELECT
        SUM(CASE WHEN timestamp > $2 THEN notional_value ELSE 0 END) as daily_volume,
        SUM(CASE WHEN timestamp > $3 THEN notional_value ELSE 0 END) as weekly_volume,
        SUM(CASE WHEN timestamp > $4 THEN notional_value ELSE 0 END) as monthly_volume
      FROM volume_tracking
      WHERE wallet_address = $1
    `;

    const timeframeResult = await db.query<{
      daily_volume: string;
      weekly_volume: string;
      monthly_volume: string;
    }>(timeframeQuery, [
      address,
      timeframes.daily,
      timeframes.weekly,
      timeframes.monthly,
    ]);

    const timeframeData = timeframeResult.rows[0];

    return {
      address,
      rank,
      totalVolume: parseFloat(userData.total_volume),
      tradeCount: parseInt(userData.trade_count),
      volumeByPlatform: {
        hyperliquid: parseFloat(userData.hyperliquid_volume) || 0,
        aster: parseFloat(userData.aster_volume) || 0,
      },
      volumeByTimeframe: {
        daily: parseFloat(timeframeData.daily_volume) || 0,
        weekly: parseFloat(timeframeData.weekly_volume) || 0,
        monthly: parseFloat(timeframeData.monthly_volume) || 0,
        allTime: parseFloat(userData.total_volume),
      },
      percentile: Math.round(percentile * 100) / 100,
    };
  }

  /**
   * Get recent volume data for a user
   */
  static async getUserRecentTrades(
    address: string,
    limit: number = 50
  ): Promise<TradeVolumeData[]> {
    const query = `
      SELECT
        wallet_address as userAddress,
        platform,
        market_id as marketId,
        side,
        size,
        price,
        notional_value as notionalValue,
        leverage,
        fees,
        order_id as orderId,
        timestamp
      FROM volume_tracking
      WHERE wallet_address = $1
      ORDER BY timestamp DESC
      LIMIT $2
    `;

    const result = await db.query<TradeVolumeData>(query, [address, limit]);
    return result.rows;
  }

  /**
   * Get platform-specific volume statistics
   */
  static async getPlatformVolumeStats(platform: string): Promise<{
    totalVolume: number;
    totalTrades: number;
    uniqueUsers: number;
    avgTradeSize: number;
  }> {
    const query = `
      SELECT
        SUM(notional_value) as total_volume,
        COUNT(*) as total_trades,
        COUNT(DISTINCT wallet_address) as unique_users,
        AVG(notional_value) as avg_trade_size
      FROM volume_tracking
      WHERE platform = $1
    `;

    const result = await db.query<{
      total_volume: string;
      total_trades: string;
      unique_users: string;
      avg_trade_size: string;
    }>(query, [platform]);
    const data = result.rows[0];

    return {
      totalVolume: parseFloat(data.total_volume) || 0,
      totalTrades: parseInt(data.total_trades) || 0,
      uniqueUsers: parseInt(data.unique_users) || 0,
      avgTradeSize: parseFloat(data.avg_trade_size) || 0,
    };
  }

  /**
   * Clear all volume data (for testing/reset purposes)
   */
  static async clearVolumeData(): Promise<void> {
    await db.query('DELETE FROM volume_tracking');
  }
}

// Export types for use in other files
export type { TradeVolumeData, LeaderboardEntry, UserVolumeStats };