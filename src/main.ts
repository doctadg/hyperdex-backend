import dotenv from 'dotenv';
import { app } from './api/server';
import { HyperliquidClient } from '@/services/exchanges/hyperliquid';
import { AsterClient } from '@/services/exchanges/aster';
import { AvantisClient } from '@/services/exchanges/avantis';
import { orderbookProcessor } from '@/services/processors/orderbook';
import { tradeProcessor } from '@/services/processors/trades';
import { chartProcessor } from '@/services/processors/charts';
import { aggregationProcessor } from '@/services/processors/aggregation';
import { aggregatedChartProcessor } from '@/services/processors/aggregated-charts';
import { redisClient } from '@/config/redis';
import { database } from '@/config/database';
import { logger } from '@/utils/logger';
import { supportedSymbols } from '@/config/exchanges';
import { config } from '@/config';

// Load environment variables
dotenv.config();

class HyperdexBackend {
  private hyperliquidClient: HyperliquidClient;
  private asterClient: AsterClient;
  private avantisClient: AvantisClient;
  private isShuttingDown = false;
  private httpServer: any;

  constructor() {
    this.hyperliquidClient = new HyperliquidClient();
    this.asterClient = new AsterClient();
    this.avantisClient = new AvantisClient();
  }

  async start(): Promise<void> {
    try {
      logger.info('Starting Hyperdex Trading Data Backend...');

      // Initialize database (optional - skip if not available)
      try {
        await this.initializeDatabase();
      } catch (error) {
        logger.warn('Database not available - continuing without it:', error);
      }

      // Initialize Redis
      await this.initializeRedis();

      // Connect to exchanges
      await this.connectToExchanges();

      // Setup event handlers
      this.setupEventHandlers();

      // Start cleanup intervals
      this.startCleanupIntervals();

      // Start HTTP API server
      await this.startApiServer();

      logger.info('Backend started successfully');
    } catch (error) {
      logger.error('Failed to start backend:', error);
      process.exit(1);
    }
  }

  private async initializeDatabase(): Promise<void> {
    logger.info('Initializing database connection...');

    const isHealthy = await database.healthCheck();
    if (!isHealthy) {
      throw new Error('Database health check failed');
    }

    logger.info('Database connection established');
  }

  private async initializeRedis(): Promise<void> {
    logger.info('Initializing Redis connection...');

    await redisClient.connect();

    const isHealthy = await redisClient.healthCheck();
    if (!isHealthy) {
      throw new Error('Redis health check failed');
    }

    logger.info('Redis connection established');
  }

  private async connectToExchanges(): Promise<void> {
    logger.info('Connecting to exchanges...');

    // Connect to Hyperliquid
    await this.hyperliquidClient.connect();
    await this.hyperliquidClient.subscribe(supportedSymbols);
    logger.info('Connected to Hyperliquid');

    // Connect to Aster
    await this.asterClient.connect();
    await this.asterClient.subscribe(supportedSymbols);
    logger.info('Connected to Aster');

    // Connect to Avantis
    await this.avantisClient.connect();
    await this.avantisClient.subscribe(supportedSymbols);
    logger.info('Connected to Avantis');
  }

  private setupEventHandlers(): void {
    // Import Redis publisher
    const { redisPublisher } = require('@/services/publishers/redis-publisher');

    // Hyperliquid event handlers
    this.hyperliquidClient.on('connected', () => {
      logger.info('Hyperliquid WebSocket connected');
    });

    this.hyperliquidClient.on('disconnected', (data) => {
      logger.warn('Hyperliquid WebSocket disconnected:', data);
    });

    this.hyperliquidClient.on('error', (error) => {
      logger.error('Hyperliquid WebSocket error:', error);
    });

    this.hyperliquidClient.on('orderbook', async (snapshot) => {
      try {
        await orderbookProcessor.processSnapshot(snapshot);

        // Calculate mid price and create tick for chart
        if (snapshot.bids.length > 0 && snapshot.asks.length > 0) {
          const bestBid = parseFloat(snapshot.bids[0][0]);
          const bestAsk = parseFloat(snapshot.asks[0][0]);
          const midPrice = (bestBid + bestAsk) / 2;

          // Update chart with orderbook mid-price
          await chartProcessor.processTickData({
            symbol: snapshot.symbol,
            exchange: snapshot.exchange,
            price: midPrice.toString(),
            size: '0',
            side: 'buy',
            timestamp: snapshot.timestamp,
            tradeId: `ob-${snapshot.timestamp}`,
          });
        }

        // Publish to Redis for SSE streaming
        await redisPublisher.publishOrderbook({
          exchange: snapshot.exchange,
          symbol: snapshot.symbol,
          bids: snapshot.bids,
          asks: snapshot.asks,
          timestamp: snapshot.timestamp,
        });
      } catch (error) {
        logger.error('Failed to process Hyperliquid orderbook snapshot:', error);
      }
    });

    this.hyperliquidClient.on('trades', async (trades) => {
      try {
        await tradeProcessor.processTrades(trades);

        // Convert trades to tick data for chart processor
        const tickData = trades.map(trade => ({
          symbol: trade.symbol,
          exchange: trade.exchange,
          price: trade.price,
          size: trade.size,
          side: trade.side,
          timestamp: trade.timestamp,
          tradeId: trade.id,
        }));

        for (const tick of tickData) {
          await chartProcessor.processTickData(tick);
        }

        // Publish to Redis for SSE streaming
        for (const trade of trades) {
          await redisPublisher.publishTrade({
            exchange: trade.exchange,
            symbol: trade.symbol,
            price: trade.price,
            size: trade.size,
            side: trade.side,
            timestamp: trade.timestamp,
            id: trade.id,
          });
        }
      } catch (error) {
        logger.error('Failed to process Hyperliquid trades:', error);
      }
    });

    // Aster event handlers
    this.asterClient.on('connected', () => {
      logger.info('Aster WebSocket connected');
    });

    this.asterClient.on('disconnected', (data) => {
      logger.warn('Aster WebSocket disconnected:', data);
    });

    this.asterClient.on('error', (error) => {
      logger.error('Aster WebSocket error:', error);
    });

    this.asterClient.on('orderbook', async (snapshot) => {
      try {
        await orderbookProcessor.processSnapshot(snapshot);

        // Calculate mid price and create tick for chart
        if (snapshot.bids.length > 0 && snapshot.asks.length > 0) {
          const bestBid = parseFloat(snapshot.bids[0][0]);
          const bestAsk = parseFloat(snapshot.asks[0][0]);
          const midPrice = (bestBid + bestAsk) / 2;

          // Update chart with orderbook mid-price
          await chartProcessor.processTickData({
            symbol: snapshot.symbol,
            exchange: snapshot.exchange,
            price: midPrice.toString(),
            size: '0',
            side: 'buy',
            timestamp: snapshot.timestamp,
            tradeId: `ob-${snapshot.timestamp}`,
          });
        }

        // Publish to Redis for SSE streaming
        await redisPublisher.publishOrderbook({
          exchange: snapshot.exchange,
          symbol: snapshot.symbol,
          bids: snapshot.bids,
          asks: snapshot.asks,
          timestamp: snapshot.timestamp,
        });
      } catch (error) {
        logger.error('Failed to process Aster orderbook snapshot:', error);
      }
    });

    this.asterClient.on('trades', async (trades) => {
      try {
        await tradeProcessor.processTrades(trades);

        // Convert trades to tick data for chart processor
        const tickData = trades.map(trade => ({
          symbol: trade.symbol,
          exchange: trade.exchange,
          price: trade.price,
          size: trade.size,
          side: trade.side,
          timestamp: trade.timestamp,
          tradeId: trade.id,
        }));

        for (const tick of tickData) {
          await chartProcessor.processTickData(tick);
        }

        // Publish to Redis for SSE streaming
        for (const trade of trades) {
          await redisPublisher.publishTrade({
            exchange: trade.exchange,
            symbol: trade.symbol,
            price: trade.price,
            size: trade.size,
            side: trade.side,
            timestamp: trade.timestamp,
            id: trade.id,
          });
        }
      } catch (error) {
        logger.error('Failed to process Aster trades:', error);
      }
    });

    // Avantis event handlers
    this.avantisClient.on('connected', () => {
      logger.info('Avantis WebSocket connected');
    });

    this.avantisClient.on('disconnected', (data) => {
      logger.warn('Avantis WebSocket disconnected:', data);
    });

    this.avantisClient.on('error', (error) => {
      logger.error('Avantis WebSocket error:', error);
    });

    this.avantisClient.on('orderbook', async (snapshot) => {
      try {
        await orderbookProcessor.processSnapshot(snapshot);

        // Calculate mid price and create tick for chart
        if (snapshot.bids.length > 0 && snapshot.asks.length > 0) {
          const bestBid = parseFloat(snapshot.bids[0][0]);
          const bestAsk = parseFloat(snapshot.asks[0][0]);
          const midPrice = (bestBid + bestAsk) / 2;

          // Update chart with orderbook mid-price
          await chartProcessor.processTickData({
            symbol: snapshot.symbol,
            exchange: snapshot.exchange,
            price: midPrice.toString(),
            size: '0',
            side: 'buy',
            timestamp: snapshot.timestamp,
            tradeId: `ob-${snapshot.timestamp}`,
          });
        }

        // Publish to Redis for SSE streaming
        await redisPublisher.publishOrderbook({
          exchange: snapshot.exchange,
          symbol: snapshot.symbol,
          bids: snapshot.bids,
          asks: snapshot.asks,
          timestamp: snapshot.timestamp,
        });
      } catch (error) {
        logger.error('Failed to process Avantis orderbook snapshot:', error);
      }
    });

    this.avantisClient.on('trades', async (trades) => {
      try {
        await tradeProcessor.processTrades(trades);

        // Convert trades to tick data for chart processor
        const tickData = trades.map(trade => ({
          symbol: trade.symbol,
          exchange: trade.exchange,
          price: trade.price,
          size: trade.size,
          side: trade.side,
          timestamp: trade.timestamp,
          tradeId: trade.id,
        }));

        for (const tick of tickData) {
          await chartProcessor.processTickData(tick);
        }

        // Publish to Redis for SSE streaming
        for (const trade of trades) {
          await redisPublisher.publishTrade({
            exchange: trade.exchange,
            symbol: trade.symbol,
            price: trade.price,
            size: trade.size,
            side: trade.side,
            timestamp: trade.timestamp,
            id: trade.id,
          });
        }
      } catch (error) {
        logger.error('Failed to process Avantis trades:', error);
      }
    });

    // Processor event handlers
    orderbookProcessor.on('orderbookUpdated', async (orderbook) => {
      logger.debug(`Orderbook updated: ${orderbook.exchange}:${orderbook.symbol}`);

      // Feed to aggregation processor
      await aggregationProcessor.processOrderbookUpdate(orderbook);
    });

    aggregationProcessor.on('aggregated', (data) => {
      logger.debug(`Aggregated orderbook published: ${data.symbol}`);
    });

    tradeProcessor.on('tradesProcessed', (trades) => {
      logger.debug(`Trades processed: ${trades.length} trades`);
    });

    chartProcessor.on('candleUpdated', async (update) => {
      // Feed to aggregated chart processor
      await aggregatedChartProcessor.processCandleUpdate(update);

      // Publish real-time candle updates to Redis
      try {
        const ex = update.exchange === 'hyperliquid' ? 'hl' : update.exchange;
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
      } catch (error) {
        logger.error('Failed to publish candle update to Redis:', error);
      }
    });

    aggregatedChartProcessor.on('aggregated', (data) => {
      logger.debug(`Aggregated candle published: ${data.symbol}:${data.timeframe}`);
    });

    chartProcessor.on('candleCompleted', async (update) => {
      logger.debug(`Candle completed: ${update.exchange}:${update.symbol}:${update.timeframe}`);
    });
  }

  private startCleanupIntervals(): void {
    // Cleanup old data every hour
    setInterval(async () => {
      try {
        await tradeProcessor.cleanupOldData();
        await chartProcessor.cleanupOldData();
      } catch (error) {
        logger.error('Failed to cleanup old data:', error);
      }
    }, 60 * 60 * 1000); // 1 hour

    // Log stats every 5 minutes
    setInterval(() => {
      this.logStats();
    }, 5 * 60 * 1000); // 5 minutes
  }

  private async startApiServer(): Promise<void> {
    const port = config.server.port;
    const host = config.server.host;

    return new Promise((resolve) => {
      this.httpServer = app.listen(port, host, () => {
        logger.info(`API server listening on ${host}:${port}`);
        console.log(`API server listening on ${host}:${port}`);
        resolve();
      });
    });
  }

  private logStats(): void {
    const orderbookStats = orderbookProcessor.getStats();
    const tradeStats = tradeProcessor.getStats();
    const chartStats = chartProcessor.getStats();

    logger.info('Backend Stats:', {
      orderbooks: orderbookStats,
      trades: tradeStats,
      charts: chartStats,
    });
  }

  async stop(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    logger.info('Shutting down backend...');

    try {
      // Close HTTP server
      if (this.httpServer) {
        this.httpServer.close(() => {
          logger.info('API server closed');
        });
      }

      // Complete all current candles
      await chartProcessor.forceCompleteAllCandles();

      // Stop processors
      orderbookProcessor.stop();
      tradeProcessor.stop();
      chartProcessor.stop();
      aggregationProcessor.stop();
      aggregatedChartProcessor.stop();

      // Disconnect from exchanges
      await this.hyperliquidClient.disconnect();
      await this.asterClient.disconnect();
      await this.avantisClient.disconnect();

      // Close database connection
      await database.close();

      // Close Redis connection
      await redisClient.disconnect();

      logger.info('Backend shutdown completed');
    } catch (error) {
      logger.error('Error during shutdown:', error);
    }
  }

  getStats() {
    return {
      orderbook: orderbookProcessor.getStats(),
      trades: tradeProcessor.getStats(),
      charts: chartProcessor.getStats(),
      aggregation: aggregationProcessor.getStats(),
      aggregatedCharts: aggregatedChartProcessor.getStats(),
      hyperliquid: this.hyperliquidClient.getStatus(),
      aster: this.asterClient.getStatus(),
      avantis: this.avantisClient.getStatus(),
    };
  }
}

// Initialize and start the backend
const backend = new HyperdexBackend();

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  await backend.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  await backend.stop();
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the backend
backend.start().catch((error) => {
  logger.error('Failed to start backend:', error);
  process.exit(1);
});

export default backend;
