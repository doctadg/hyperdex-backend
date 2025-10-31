import { Router } from 'express';
import {
  handleDelegationWebhook,
} from '../controllers/delegation-webhook.controller';

const router = Router();
router.post('/webhooks/delegation', handleDelegationWebhook);
export default router;
