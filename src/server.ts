#!/usr/bin/env node
import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";

// Import all components
import {
  HyperliquidClient,
  HyperliquidTradingAdapter,
} from "@/services/exchanges/hyperliquid";
import {
  LighterClient,
  LighterTradingAdapter,
} from "@/services/exchanges/lighter";
import { AsterClient } from "@/services/exchanges/aster";
import { orderbookProcessor } from "@/services/processors/orderbook";
import { tradeProcessor } from "@/services/processors/trades";
import { chartProcessor } from "@/services/processors/charts";
import { aggregationProcessor } from "@/services/processors/aggregation";
import { aggregatedChartProcessor } from "@/services/processors/aggregated-charts";
import { redisClient } from "@/config/redis";
import { database } from "@/config/database";
import { logger } from "@/utils/logger";
import { supportedSymbols } from "@/config/exchanges";
import { config } from "@/config";

// Import route handlers
import {
  getOrderbook,
  getFullOrderbook,
  getOrderbookMetrics,
  getCachedOrderbooks,
} from "@/api/routes/orderbook";

import {
  getRecentTrades,
  getTradeMetrics,
  getCachedTradeSymbols,
  getTradeStats,
  getBalances,
  getTradingPositions,
  getOpenOrders,
  placeOrder,
  cancelOrder,
  getTicker,
} from "@/api/routes/trades";

import {
  getCandles,
  getLatestCandle,
  getCurrentCandles,
  getCachedChartSymbols,
  getChartStats,
} from "@/api/routes/charts";

import {
  getAggregatedBook,
  getAggregatedCandles,
  getAggregatedRouting,
  streamAggregatedBook,
  streamAggregatedCandles,
} from "@/api/routes/aggregated";

import {
  getPositions,
  getPositionSummary,
  getPositionsBySymbol,
  syncPositions,
  upsertPosition,
  updatePosition,
  closePosition,
  getSyncStatus,
  resetCircuitBreakers,
} from "@/api/routes/positions";

import {
  trackVolume,
  getLeaderboard,
  getUserStats,
  getUserRecentTrades,
  getPlatformStats,
  clearVolume,
} from "@/api/routes/volume";

// Create Express app
const app = express();

// Apply middleware
app.use(helmet());
app.use(
  cors({
    origin: config.cors.origins,
    credentials: true,
  })
);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
});
app.use(limiter as any);

// Body parsing middleware
app.use(compression());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Request logging
app.use((req, res, next) => {
  logger.debug(`${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    success: true,
    data: {
      status: "healthy",
      timestamp: Date.now(),
      uptime: process.uptime(),
    },
  });
});

// API info endpoint
app.get("/api", (req, res) => {
  res.json({
    success: true,
    data: {
      name: "Hyperdex Trading Data API",
      version: "1.0.0",
      exchanges: ["hyperliquid", "aster", "lighter"],
      timestamp: Date.now(),
    },
  });
});

// Mount all routes
// Orderbook routes
app.get("/api/orderbook/:symbol", getOrderbook);
app.get("/api/orderbook/:symbol/full", getFullOrderbook);
app.get("/api/orderbook/:symbol/metrics", getOrderbookMetrics);
app.get("/api/orderbook/cached", getCachedOrderbooks);

// Trades routes
app.get("/api/trades/:symbol", getRecentTrades);
app.get("/api/trades/:symbol/metrics", getTradeMetrics);
app.get("/api/trades/cached", getCachedTradeSymbols);
app.get("/api/trades/stats", getTradeStats);

app.get("/api/trading/:exchange/balances", getBalances);
app.get("/api/trading/:exchange/positions", getTradingPositions);
app.get("/api/trading/:exchange/orders", getOpenOrders);
app.post("/api/trading/:exchange/orders", placeOrder);
app.delete("/api/trading/:exchange/orders/:orderId", cancelOrder);
app.get("/api/trading/:exchange/ticker/:symbol", getTicker);

// Charts routes
app.get("/api/charts/:symbol/candles", getCandles);
app.get("/api/charts/:symbol/latest", getLatestCandle);
app.get("/api/charts/current", getCurrentCandles);
app.get("/api/charts/cached", getCachedChartSymbols);
app.get("/api/charts/stats", getChartStats);

// Aggregated data routes
app.get("/api/aggregated/book", getAggregatedBook);
app.get("/api/aggregated/candles", getAggregatedCandles);
app.get("/api/aggregated/routing", getAggregatedRouting);
app.get("/api/aggregated/stream", streamAggregatedBook);
app.get("/api/aggregated/stream/candles", streamAggregatedCandles);

// Position routes
app.get("/api/positions/status", getSyncStatus);
app.post("/api/positions/reset-circuits", resetCircuitBreakers);
app.get("/api/positions/:walletAddress", getPositions);
app.get("/api/positions/:walletAddress/summary", getPositionSummary);
app.get("/api/positions/:walletAddress/:symbol", getPositionsBySymbol);
app.post("/api/positions/:walletAddress/sync", syncPositions);
app.post("/api/positions", upsertPosition);
app.put("/api/positions/:id", updatePosition);
app.delete("/api/positions/:walletAddress/:platform/:symbol", closePosition);

// Volume routes
app.post("/api/volume/track", trackVolume);
app.get("/api/volume/leaderboard", getLeaderboard);
app.get("/api/volume/user/:address", getUserStats);
app.get("/api/volume/user/:address/recent", getUserRecentTrades);
app.get("/api/volume/platform/:platform/stats", getPlatformStats);
app.post("/api/volume/clear", clearVolume);

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.originalUrl} not found`,
    timestamp: Date.now(),
  });
});

// Error handler
app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    logger.error("Unhandled error:", err);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      timestamp: Date.now(),
    });
  }
);

// Main server class
class HyperdexServer {
  private httpServer: any;
  private hyperliquidClient: HyperliquidClient;
  // private asterClient: AsterClient;
  private lighterClient: LighterClient;
  private isShuttingDown = false;
  private tradingAdapters: Map<string, any> = new Map();

  constructor() {
    this.hyperliquidClient = new HyperliquidClient();
    // this.asterClient = new AsterClient();
    this.lighterClient = new LighterClient();
  }

  async start(): Promise<void> {
    try {
      logger.info("🚀 Starting Hyperdex Backend Server...");

      // 1. Initialize connections
      await this.initializeConnections();

      // 2. Initialize trading adapters
      await this.initializeTradingAdapters();

      // 3. Start data aggregation
      await this.startDataAggregation();

      // 4. Start HTTP server
      await this.startHttpServer();

      // 5. Setup cleanup intervals
      this.setupCleanupIntervals();

      logger.info("✅ Hyperdex Backend Server started successfully!");
      logger.info(
        `📡 API server listening on http://${config.server.host}:${config.server.port}`
      );
    } catch (error) {
      logger.error("❌ Failed to start server:", error);
      process.exit(1);
    }
  }

  private async initializeConnections(): Promise<void> {
    // Initialize Redis
    logger.info("Connecting to Redis...");
    await redisClient.connect();
    const redisHealthy = await redisClient.healthCheck();
    if (!redisHealthy) {
      throw new Error("Redis health check failed");
    }
    logger.info("✅ Redis connected");

    // Initialize Database (optional)
    try {
      logger.info("Connecting to database...");
      const dbHealthy = await database.healthCheck();
      if (dbHealthy) {
        logger.info("✅ Database connected");
      }
    } catch (error) {
      logger.warn("⚠️  Database not available, continuing without it");
    }
  }

  private async initializeTradingAdapters(): Promise<void> {
    try {
      logger.info("Initializing trading adapters...");

      const privateKey = process.env.HYPERLIQUID_PRIVATE_KEY;

      if (!privateKey) {
        logger.warn(
          "⚠️  HYPERLIQUID_PRIVATE_KEY not set - trading functionality disabled"
        );
        return;
      }

      // Import the trading adapter
      const { HyperliquidTradingAdapter } = await import(
        "@/services/exchanges/hyperliquid"
      );
      const { setTradingAdapters } = await import("@/api/routes/trades");

      // Initialize Hyperliquid trading
      const hyperliquidTrading = new HyperliquidTradingAdapter({
        privateKey,
        isTestnet: process.env.NODE_ENV !== "production",
      });

      await hyperliquidTrading.initialize();
      this.tradingAdapters.set("hyperliquid", hyperliquidTrading);
      logger.info("✅ Hyperliquid trading adapter initialized");

      const { LighterTradingAdapter } = await import(
        "@/services/exchanges/lighter"
      );
      const lighterApiKeyIndex = parseInt(
        process.env.LIGHTER_API_KEY_INDEX || "2"
      );

      const lighterTrading = new LighterTradingAdapter({
        privateKey, // SAME KEY!
        apiKeyIndex: lighterApiKeyIndex,
        isTestnet: process.env.NODE_ENV !== "production",
      });

      await lighterTrading.initialize();
      this.tradingAdapters.set("lighter", lighterTrading);
      logger.info("✅ Lighter trading adapter initialized");

      logger.info(
        `✅ Trading adapters initialized: ${Array.from(
          this.tradingAdapters.keys()
        ).join(", ")}`
      );

      // Register with API routes
      setTradingAdapters(this.tradingAdapters);
    } catch (error) {
      logger.error("Failed to initialize trading adapters:", error);
      logger.warn("⚠️  Continuing without trading functionality");
    }
  }

  private async startDataAggregation(): Promise<void> {
    logger.info("Starting data aggregation...");

    // Connect to exchanges
    await this.hyperliquidClient.connect();
    await this.hyperliquidClient.subscribe(supportedSymbols);
    logger.info("✅ Connected to Hyperliquid");

    // // Connect to Aster
    // await this.asterClient.connect();
    // await this.asterClient.subscribe(supportedSymbols);
    // logger.info('✅ Connected to Aster');

    // Connect to Lighter (optional)
    try {
      await this.lighterClient.connect();
      await this.lighterClient.subscribe(supportedSymbols);
      logger.info('✅ Connected to Lighter WebSocket');
    } catch (error) {
      logger.warn('⚠️  Lighter WebSocket not available, continuing without it:', error);
    }

    // Setup all event handlers
    this.setupExchangeHandlers();
    this.setupProcessorHandlers();

    logger.info("✅ Data aggregation started");
  }

  private setupExchangeHandlers(): void {
    const { redisPublisher } = require("@/services/publishers/redis-publisher");

    // Hyperliquid handlers
    this.hyperliquidClient.on("orderbook", async (snapshot) => {
      await orderbookProcessor.processSnapshot(snapshot);

      if (snapshot.bids.length > 0 && snapshot.asks.length > 0) {
        const bestBid = parseFloat(snapshot.bids[0][0]);
        const bestAsk = parseFloat(snapshot.asks[0][0]);
        const midPrice = (bestBid + bestAsk) / 2;

        await chartProcessor.processTickData({
          symbol: snapshot.symbol,
          exchange: snapshot.exchange,
          price: midPrice.toString(),
          size: "0",
          side: "buy",
          timestamp: snapshot.timestamp,
          tradeId: `ob-${snapshot.timestamp}`,
        });
      }

      await redisPublisher.publishOrderbook(snapshot);
    });

    this.hyperliquidClient.on("trades", async (trades) => {
      await tradeProcessor.processTrades(trades);

      for (const trade of trades) {
        await chartProcessor.processTickData({
          symbol: trade.symbol,
          exchange: trade.exchange,
          price: trade.price,
          size: trade.size,
          side: trade.side,
          timestamp: trade.timestamp,
          tradeId: trade.id,
        });

        await redisPublisher.publishTrade(trade);
      }
    });

    // // Aster handlers (similar)
    // this.asterClient.on('orderbook', async (snapshot) => {
    //   await orderbookProcessor.processSnapshot(snapshot);

    //   if (snapshot.bids.length > 0 && snapshot.asks.length > 0) {
    //     const bestBid = parseFloat(snapshot.bids[0][0]);
    //     const bestAsk = parseFloat(snapshot.asks[0][0]);
    //     const midPrice = (bestBid + bestAsk) / 2;

    //     await chartProcessor.processTickData({
    //       symbol: snapshot.symbol,
    //       exchange: snapshot.exchange,
    //       price: midPrice.toString(),
    //       size: '0',
    //       side: 'buy',
    //       timestamp: snapshot.timestamp,
    //       tradeId: `ob-${snapshot.timestamp}`,
    //     });
    //   }

    //   await redisPublisher.publishOrderbook(snapshot);
    // });

    // this.asterClient.on('trades', async (trades) => {
    //   await tradeProcessor.processTrades(trades);

    //   for (const trade of trades) {
    //     await chartProcessor.processTickData({
    //       symbol: trade.symbol,
    //       exchange: trade.exchange,
    //       price: trade.price,
    //       size: trade.size,
    //       side: trade.side,
    //       timestamp: trade.timestamp,
    //       tradeId: trade.id,
    //     });

    //     await redisPublisher.publishTrade(trade);
    //   }
    // });

    // // Lighter handlers
    // this.lighterClient.on('orderbook', async (snapshot) => {
    //   await orderbookProcessor.processSnapshot(snapshot);

    //   if (snapshot.bids.length > 0 && snapshot.asks.length > 0) {
    //     const bestBid = parseFloat(snapshot.bids[0][0]);
    //     const bestAsk = parseFloat(snapshot.asks[0][0]);
    //     const midPrice = (bestBid + bestAsk) / 2;

    //     await chartProcessor.processTickData({
    //       symbol: snapshot.symbol,
    //       exchange: snapshot.exchange,
    //       price: midPrice.toString(),
    //       size: '0',
    //       side: 'buy',
    //       timestamp: snapshot.timestamp,
    //       tradeId: `ob-${snapshot.timestamp}`,
    //     });
    //   }

    //   await redisPublisher.publishOrderbook(snapshot);
    // });

    // this.lighterClient.on('trades', async (trades) => {
    //   await tradeProcessor.processTrades(trades);

    //   for (const trade of trades) {
    //     await chartProcessor.processTickData({
    //       symbol: trade.symbol,
    //       exchange: trade.exchange,
    //       price: trade.price,
    //       size: trade.size,
    //       side: trade.side,
    //       timestamp: trade.timestamp,
    //       tradeId: trade.id,
    //     });

    //     await redisPublisher.publishTrade(trade);
    //   }
    // });
  }

  private setupProcessorHandlers(): void {
    const { redisPublisher } = require("@/services/publishers/redis-publisher");

    orderbookProcessor.on("orderbookUpdated", async (orderbook) => {
      await aggregationProcessor.processOrderbookUpdate(orderbook);
    });

    chartProcessor.on("candleUpdated", async (update) => {
      await aggregatedChartProcessor.processCandleUpdate(update);

      const ex = update.exchange === "hyperliquid" ? "hl" : update.exchange;
      await redisPublisher.publishCandle({
        exchange: ex,
        symbol: update.symbol,
        interval: update.timeframe,
        timestamp: update.candle.timestamp,
        open: update.candle.open,
        high: update.candle.high,
        low: update.candle.low,
        close: update.candle.close,
        volume: update.candle.volume,
      });
    });
  }

  private async startHttpServer(): Promise<void> {
    const port = config.server.port || 3000;
    const host = config.server.host || "0.0.0.0";

    return new Promise((resolve, reject) => {
      this.httpServer = app.listen(port, host, () => {
        logger.info(`Express server started on ${host}:${port}`);
        resolve();
      });

      this.httpServer.on("error", reject);
    });
  }

  private setupCleanupIntervals(): void {
    // Cleanup old data every hour
    setInterval(async () => {
      try {
        await tradeProcessor.cleanupOldData();
        await chartProcessor.cleanupOldData();
        logger.debug("Cleaned up old data");
      } catch (error) {
        logger.error("Cleanup failed:", error);
      }
    }, 60 * 60 * 1000);

    // Log stats every 5 minutes
    setInterval(() => {
      const stats = {
        orderbooks: orderbookProcessor.getStats(),
        trades: tradeProcessor.getStats(),
        charts: chartProcessor.getStats(),
      };
      logger.info("📊 Stats:", stats);
    }, 5 * 60 * 1000);
  }

  async stop(): Promise<void> {
    if (this.isShuttingDown) return;

    this.isShuttingDown = true;
    logger.info("Shutting down server...");

    // Close HTTP server
    if (this.httpServer) {
      await new Promise((resolve) => {
        this.httpServer.close(resolve);
      });
    }

    // Stop processors
    orderbookProcessor.stop();
    tradeProcessor.stop();
    chartProcessor.stop();
    aggregationProcessor.stop();
    aggregatedChartProcessor.stop();

    // Disconnect from exchanges
    await this.hyperliquidClient.disconnect();
    // await this.asterClient.disconnect();
    await this.lighterClient.disconnect();

    for (const [exchange, adapter] of this.tradingAdapters) {
      try {
        await adapter.disconnect();
        logger.info(`Trading adapter disconnected: ${exchange}`);
      } catch (error) {
        logger.error(`Error disconnecting trading adapter ${exchange}:`, error);
      }
    }

    // Close connections
    await database.close();
    await redisClient.disconnect();

    logger.info("✅ Server shutdown complete");
  }
}

// Create and start server
const server = new HyperdexServer();

// Graceful shutdown handlers
process.on("SIGINT", async () => {
  logger.info("Received SIGINT");
  await server.stop();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  logger.info("Received SIGTERM");
  await server.stop();
  process.exit(0);
});

// Start the server
server.start().catch((error) => {
  logger.error("Fatal error:", error);
  process.exit(1);
});
