import { Router } from 'express';
import { asterBrokerMarketDataService } from '../services/aster-broker-market-data.service';

const router = Router();

router.get(
  '/market/time',
  async (req, res) => {
    try {
      const data = await asterBrokerMarketDataService.getServerTime();
      res.json({ success: true, data });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

router.get('/market/exchange-info', async (req, res) => {
  try {
    const data = await asterBrokerMarketDataService.getExchangeInfo();
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/market/ticker-24h', async (req, res) => {
  try {
    const { symbol } = req.query;
    const data = await asterBrokerMarketDataService.getTicker24h(
      symbol ? (symbol as string) : undefined
    );
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/market/price', async (req, res) => {
  try {
    const { symbol } = req.query;
    const data = await asterBrokerMarketDataService.getTickerPrice(
      symbol ? (symbol as string) : undefined
    );
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/market/book-ticker', async (req, res) => {
  try {
    const { symbol } = req.query;
    const data = await asterBrokerMarketDataService.getBookTicker(
      symbol ? (symbol as string) : undefined
    );
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/market/depth", async (req, res) => {
  try {
    const { symbol, limit } = req.query;
    if (!symbol) {
      res.status(400).json({ success: false, message: "symbol is required" });
      return;
    }
    const data = await asterBrokerMarketDataService.getOrderBook(
      symbol as string,
      limit ? Number(limit) : 100
    );
    res.json({ success: true, data });
  } catch (err: any) {
    res
      .status(500)
      .json({ success: false, message: err.message || "Failed to fetch depth" });
  }
});

router.get("/market/trades", async (req, res) => {
  try {
    const { symbol, limit } = req.query;
    if (!symbol) {
      res.status(400).json({ success: false, message: "symbol is required" });
      return;
    }
    const data = await asterBrokerMarketDataService.getRecentTrades(
      symbol as string,
      limit ? Number(limit) : 500
    );
    res.json({ success: true, data });
  } catch (err: any) {
    res
      .status(500)
      .json({ success: false, message: err.message || "Failed to fetch trades" });
  }
});

router.get("/market/klines", async (req, res) => {
  try {
    const { symbol, interval, startTime, endTime, limit } = req.query;
    if (!symbol || !interval) {
      res
        .status(400)
        .json({ success: false, message: "symbol and interval are required" });
      return;
    }
    const data = await asterBrokerMarketDataService.getKlines(
      symbol as string,
      interval as string,
      {
        startTime: startTime ? Number(startTime) : undefined,
        endTime: endTime ? Number(endTime) : undefined,
        limit: limit ? Number(limit) : undefined,
      }
    );
    res.json({ success: true, data });
  } catch (err: any) {
    res
      .status(500)
      .json({ success: false, message: err.message || "Failed to fetch klines" });
  }
});

export default router;
