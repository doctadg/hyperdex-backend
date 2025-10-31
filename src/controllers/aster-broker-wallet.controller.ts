import { Request, Response } from 'express';
import { asterBrokerWalletService } from '../services/aster-broker-wallet.service';

/**
 * Transfer funds between Spot ↔ Futures accounts
 * POST /api/aster/broker/wallet/transfer
 *
 * Body:
 * {
 *   walletId: string,
 *   amount: string,
 *   asset: string,
 *   clientTranId: string,
 *   kindType: 'FUTURE_SPOT' | 'SPOT_FUTURE'
 * }
 */
export async function transferPerpSpot(req: Request, res: Response): Promise<void> {
  try {
    const { walletId, address, amount, asset, clientTranId, kindType } = req.body;
    const identifier = walletId || address;

    if (!identifier || !amount || !asset || !clientTranId || !kindType) {
      res.status(400).json({
        success: false,
        error: 'Missing parameters',
        message: 'walletId/address, amount, asset, clientTranId, and kindType are required',
      });
      return;
    }

    const result = await asterBrokerWalletService.transferPerpSpot(identifier, {
      amount,
      asset,
      clientTranId,
      kindType,
    });

    res.status(200).json({
      success: true,
      message: 'Transfer executed successfully',
      data: result,
    });
  } catch (error: any) {
    console.error('[AsterWalletController] Transfer error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to transfer funds',
      message: error.message,
    });
  }
}

/**
 * Internal transfer (user → user)
 * POST /api/aster/broker/wallet/internal-transfer
 *
 * Body:
 * {
 *   walletId: string,
 *   amount: string,
 *   asset: string,
 *   toAddress: string,
 *   clientTranId?: string
 * }
 */
export async function internalTransfer(req: Request, res: Response): Promise<void> {
  try {
    const { walletId, address, amount, asset, toAddress, clientTranId } = req.body;
    const identifier = walletId || address;

    if (!identifier || !amount || !asset || !toAddress) {
      res.status(400).json({
        success: false,
        error: 'Missing parameters',
        message: 'walletId/address, amount, asset, and toAddress are required',
      });
      return;
    }

    const result = await asterBrokerWalletService.internalTransfer(identifier, {
      amount,
      asset,
      toAddress,
      clientTranId,
    });

    res.status(200).json({
      success: true,
      message: 'Internal transfer executed successfully',
      data: result,
    });
  } catch (error: any) {
    console.error('[AsterWalletController] Internal transfer error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process internal transfer',
      message: error.message,
    });
  }
}

/**
 * Get estimated withdrawal fee
 * GET /api/aster/broker/wallet/withdraw-fee?asset=USDT&chainId=56
 */
export async function getWithdrawFee(req: Request, res: Response): Promise<void> {
  try {
    const { asset, chainId } = req.query;

    if (!asset || !chainId) {
      res.status(400).json({
        success: false,
        error: 'Missing parameters',
        message: 'asset and chainId are required',
      });
      return;
    }

    const result = await asterBrokerWalletService.getWithdrawFee(
      asset as string,
      chainId as string
    );

    res.status(200).json({
      success: true,
      message: 'Withdrawal fee retrieved successfully',
      data: result,
    });
  } catch (error: any) {
    console.error('[AsterWalletController] Withdraw fee error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve withdrawal fee',
      message: error.message,
    });
  }
}
