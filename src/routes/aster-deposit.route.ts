import express from "express";
import { asterDepositService } from "../services/asterDepositService";

const router = express.Router();

/**
 * POST /api/aster/deposit
 * Body: { walletId, tokenAddress, amount, broker, network }
 */
router.post("/deposit", async (req, res) => {
  try {
    const { walletId, tokenSymbol, amount, broker = 1000, network } = req.body;
    if (!walletId || !amount || !network) {
      return res.status(400).json({ error: "Missing required parameters" });
    }

    const txHash = await asterDepositService.processDeposit({
      walletId,
      tokenSymbol,
      amount,
      broker,
      network,
    });

    res.json({ success: true, txHash });
  } catch (error: any) {
    console.error("[AsterDeposit] Error:", error);
    res.status(500).json({ error: error.message || "Deposit failed" });
  }
});

export default router;
