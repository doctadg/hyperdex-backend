import { Router } from 'express';
import {
  generateApiKey,
  placeOrder,
  getOrder,
  closePosition,
  cancelOrder,
  getAccountInfo
} from '../controllers/aster-broker.controller';

const router = Router();

// API Key Management
router.post('/generate-api-key', generateApiKey);

// Trading Operations
router.post('/positions/open', placeOrder);
router.post('/positions/close', closePosition);
router.get('/order', getOrder);
router.delete('/order', cancelOrder);
router.get('/info', getAccountInfo)

export default router;
