import type { Request, Response } from 'express';
import { VolumeService } from '@/services/database/volumeService';
import type { TradeVolumeData } from '@/types/volume';
import { logger } from '@/utils/logger';

export async function trackVolume(req: Request, res: Response): Promise<void> {
  try {
    const payload = req.body as TradeVolumeData;

    if (!payload.userAddress || !payload.platform || !payload.marketId) {
      res.status(400).json({
        success: false,
        error: 'Missing required volume fields',
        timestamp: Date.now(),
      });
      return;
    }

    if (!payload.timestamp) {
      payload.timestamp = Date.now();
    }

    await VolumeService.addVolumeData(payload);

    res.json({
      success: true,
      data: { message: 'Volume tracked' },
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error('Failed to track volume', error);
    res.status(500).json({
      success: false,
      error: 'Failed to track volume',
      timestamp: Date.now(),
    });
  }
}

export async function getLeaderboard(req: Request, res: Response): Promise<void> {
  try {
    const timeframe = (req.query.timeframe as 'daily' | 'weekly' | 'monthly' | 'all-time') || 'all-time';
    const platform = (req.query.platform as string) || 'all';
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;

    const data = await VolumeService.getLeaderboard(timeframe, platform, limit);

    res.json({
      success: true,
      data,
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error('Failed to fetch leaderboard', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch leaderboard',
      timestamp: Date.now(),
    });
  }
}

export async function getUserStats(req: Request, res: Response): Promise<void> {
  try {
    const { address } = req.params;

    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      res.status(400).json({
        success: false,
        error: 'Invalid wallet address format',
        timestamp: Date.now(),
      });
      return;
    }

    const data = await VolumeService.getUserVolumeStats(address);

    if (!data) {
      res.status(404).json({
        success: false,
        error: 'No volume data for address',
        timestamp: Date.now(),
      });
      return;
    }

    res.json({
      success: true,
      data,
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error('Failed to fetch user stats', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user stats',
      timestamp: Date.now(),
    });
  }
}

export async function getUserRecentTrades(req: Request, res: Response): Promise<void> {
  try {
    const { address } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;

    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      res.status(400).json({
        success: false,
        error: 'Invalid wallet address format',
        timestamp: Date.now(),
      });
      return;
    }

    const data = await VolumeService.getUserRecentTrades(address, limit);

    res.json({
      success: true,
      data,
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error('Failed to fetch user recent trades', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user recent trades',
      timestamp: Date.now(),
    });
  }
}

export async function getPlatformStats(req: Request, res: Response): Promise<void> {
  try {
    const { platform } = req.params;

    const data = await VolumeService.getPlatformVolumeStats(platform);

    res.json({
      success: true,
      data,
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error('Failed to fetch platform stats', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch platform stats',
      timestamp: Date.now(),
    });
  }
}

export async function clearVolume(req: Request, res: Response): Promise<void> {
  try {
    await VolumeService.clearVolumeData();
    res.json({
      success: true,
      data: { message: 'Volume data cleared' },
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error('Failed to clear volume data', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear volume data',
      timestamp: Date.now(),
    });
  }
}
