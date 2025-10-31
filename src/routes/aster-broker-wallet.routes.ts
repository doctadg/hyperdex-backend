import { Router } from 'express';
import {
  transferPerpSpot,
  internalTransfer,
  getWithdrawFee,
} from '../controllers/aster-broker-wallet.controller';

const router = Router();

// Transfer between Spot ↔ Futures
router.post('/transfer', transferPerpSpot);

// Internal transfer between Aster users
router.post('/internal-transfer', internalTransfer);

// Get estimated withdrawal fee
router.get('/withdraw-fee', getWithdrawFee);

export default router;
