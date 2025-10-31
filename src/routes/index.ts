import { Router } from "express";
import healthRoutes from "./health.routes";
import asterRoutes from "./dynamic.webhook.routes";
import asterBrokerRoutes from "./aster-broker.routes";
import asterDepositRoutes from "./aster-deposit.route";
import asterMarketRoutes from "./aster-market.routes";
import asterWalletRoutes from "./aster-broker-wallet.routes";
const router = Router();

router.use("/", healthRoutes);
router.use("/api/aster", asterRoutes);
router.use("/api/aster/broker", asterBrokerRoutes);
router.use("/api/aster", asterDepositRoutes);
router.use("/api/aster/market", asterMarketRoutes);
router.use("/api/aster/wallet", asterWalletRoutes);
export default router;
