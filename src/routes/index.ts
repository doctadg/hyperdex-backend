import { Router } from 'express';
import healthRoutes from './health.routes';
import asterRoutes from './dynamic.webhook.routes';
import asterBrokerRoutes from './aster-broker.routes';

const router = Router();

router.use('/', healthRoutes);
router.use('/api/aster', asterRoutes);
router.use('/api/aster/broker', asterBrokerRoutes);

export default router;
