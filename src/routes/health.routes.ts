/**
 * Health Routes
 * - GET /health - Server health check
 */

import { Router } from 'express';
import { getHealth } from '../controllers/health.controller';

const router = Router();

router.get('/health', getHealth);

export default router;
