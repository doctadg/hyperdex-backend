import type { Request, Response } from 'express';
import { PositionService } from '@/services/database/positionService';
import { positionSyncOrchestrator, Platform } from '@/services/sync/positionSyncOrchestrator';
import { logger } from '@/utils/logger';

/**
 * GET /api/positions/:walletAddress
 * Get all positions for a wallet address
 */
export async function getPositions(req: Request, res: Response): Promise<void> {
  try {
    const { walletAddress } = req.params;
    const platform = req.query.platform as string | undefined;
    const status = req.query.status as 'open' | 'closed' | 'liquidated' | undefined;

    if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      res.status(400).json({
        success: false,
        error: 'Invalid wallet address format',
        timestamp: Date.now(),
      });
      return;
    }

    let positions = await PositionService.getUserPositions(
      walletAddress,
      platform
    );

    // Filter by status if provided
    if (status) {
      positions = positions.filter((p) => p.status === status);
    }

    res.json({
      success: true,
      data: {
        walletAddress,
        platform: platform || 'all',
        positions,
        count: positions.length,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error('Failed to fetch positions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch positions',
      timestamp: Date.now(),
    });
  }
}

/**
 * GET /api/positions/:walletAddress/summary
 * Get position summary for a wallet
 */
export async function getPositionSummary(req: Request, res: Response): Promise<void> {
  try {
    const { walletAddress } = req.params;

    if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      res.status(400).json({
        success: false,
        error: 'Invalid wallet address format',
        timestamp: Date.now(),
      });
      return;
    }

    const summary = await PositionService.getUserPositionsSummary(walletAddress);

    res.json({
      success: true,
      data: {
        walletAddress,
        ...summary,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error('Failed to fetch position summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch position summary',
      timestamp: Date.now(),
    });
  }
}

/**
 * GET /api/positions/:walletAddress/:symbol
 * Get positions for a specific symbol
 */
export async function getPositionsBySymbol(req: Request, res: Response): Promise<void> {
  try {
    const { walletAddress, symbol } = req.params;

    if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      res.status(400).json({
        success: false,
        error: 'Invalid wallet address format',
        timestamp: Date.now(),
      });
      return;
    }

    const positions = await PositionService.getPositionsBySymbol(
      walletAddress,
      symbol.toUpperCase()
    );

    res.json({
      success: true,
      data: {
        walletAddress,
        symbol: symbol.toUpperCase(),
        positions,
        count: positions.length,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error('Failed to fetch positions by symbol:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch positions by symbol',
      timestamp: Date.now(),
    });
  }
}

/**
 * POST /api/positions/:walletAddress/sync
 * Trigger position sync for a wallet
 */
export async function syncPositions(req: Request, res: Response): Promise<void> {
  try {
    const { walletAddress } = req.params;
    const platform = (req.body.platform || req.query.platform || 'all') as Platform;

    if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      res.status(400).json({
        success: false,
        error: 'Invalid wallet address format',
        timestamp: Date.now(),
      });
      return;
    }

    if (!['hyperliquid', 'aster', 'avantis', 'all'].includes(platform)) {
      res.status(400).json({
        success: false,
        error: 'Invalid platform. Must be: hyperliquid, aster, avantis, or all',
        timestamp: Date.now(),
      });
      return;
    }

    logger.info(`Syncing positions for ${walletAddress} on ${platform}`);

    const result = await positionSyncOrchestrator.syncPositions(
      walletAddress,
      platform
    );

    res.json({
      success: result.totalErrors === 0,
      data: result,
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error('Failed to sync positions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to sync positions',
      timestamp: Date.now(),
    });
  }
}

/**
 * POST /api/positions
 * Create or update a position (for manual entry or after order placement)
 */
export async function upsertPosition(req: Request, res: Response): Promise<void> {
  try {
    const positionData = req.body;

    // Validate required fields
    const required = [
      'walletAddress',
      'platform',
      'symbol',
      'side',
      'size',
      'entryPrice',
      'leverage',
      'marginMode',
      'marginUsed',
      'status',
      'openedAt',
    ];

    for (const field of required) {
      if (!positionData[field]) {
        res.status(400).json({
          success: false,
          error: `Missing required field: ${field}`,
          timestamp: Date.now(),
        });
        return;
      }
    }

    // Validate wallet address
    if (!/^0x[a-fA-F0-9]{40}$/.test(positionData.walletAddress)) {
      res.status(400).json({
        success: false,
        error: 'Invalid wallet address format',
        timestamp: Date.now(),
      });
      return;
    }

    const position = await PositionService.upsertPosition(positionData);

    res.json({
      success: true,
      data: position,
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error('Failed to upsert position:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to upsert position',
      timestamp: Date.now(),
    });
  }
}

/**
 * PUT /api/positions/:id
 * Update a position's mark price and unrealized PnL
 */
export async function updatePosition(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (!id || isNaN(parseInt(id))) {
      res.status(400).json({
        success: false,
        error: 'Invalid position ID',
        timestamp: Date.now(),
      });
      return;
    }

    // For now, we need to get the position first to update it
    // This is a limitation of the current PositionService API
    // In production, you might want to add an updatePositionById method

    res.status(501).json({
      success: false,
      error: 'Direct position updates by ID not yet implemented. Use sync endpoint instead.',
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error('Failed to update position:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update position',
      timestamp: Date.now(),
    });
  }
}

/**
 * DELETE /api/positions/:walletAddress/:platform/:symbol
 * Close a position
 */
export async function closePosition(req: Request, res: Response): Promise<void> {
  try {
    const { walletAddress, platform, symbol } = req.params;
    const { realizedPnl } = req.body;

    if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      res.status(400).json({
        success: false,
        error: 'Invalid wallet address format',
        timestamp: Date.now(),
      });
      return;
    }

    const position = await PositionService.closePosition(
      walletAddress,
      platform,
      symbol.toUpperCase(),
      realizedPnl
    );

    if (!position) {
      res.status(404).json({
        success: false,
        error: 'Position not found or already closed',
        timestamp: Date.now(),
      });
      return;
    }

    res.json({
      success: true,
      data: position,
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error('Failed to close position:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to close position',
      timestamp: Date.now(),
    });
  }
}

/**
 * GET /api/positions/status
 * Get status of position sync services
 */
export async function getSyncStatus(req: Request, res: Response): Promise<void> {
  try {
    const status = positionSyncOrchestrator.getStatus();

    res.json({
      success: true,
      data: status,
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error('Failed to get sync status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get sync status',
      timestamp: Date.now(),
    });
  }
}

/**
 * POST /api/positions/reset-circuits
 * Reset all circuit breakers (admin endpoint)
 */
export async function resetCircuitBreakers(req: Request, res: Response): Promise<void> {
  try {
    positionSyncOrchestrator.resetCircuitBreakers();

    res.json({
      success: true,
      data: { message: 'Circuit breakers reset successfully' },
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error('Failed to reset circuit breakers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset circuit breakers',
      timestamp: Date.now(),
    });
  }
}
