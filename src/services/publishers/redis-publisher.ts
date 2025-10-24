import { redisClient } from '@/config/redis';
import { logger } from '@/utils/logger';

export class RedisPublisher {
  /**
   * Publish candle data to Redis Pub/Sub
   * Channel naming: candles:{exchange}:{symbol}:{interval}
   */
  async publishCandle(data: {
    exchange: string;
    symbol: string;
    interval: string;
    timestamp: number;
    open: string | number;
    high: string | number;
    low: string | number;
    close: string | number;
    volume: string | number;
  }): Promise<void> {
    try {
      const channel = `candles:${data.exchange}:${data.symbol}:${data.interval}`;
      const message = {
        channel,
        data: {
          time: data.timestamp,
          open: Number(data.open),
          high: Number(data.high),
          low: Number(data.low),
          close: Number(data.close),
          volume: Number(data.volume),
        },
      };

      await redisClient.publish(channel, JSON.stringify(message));
      logger.debug(`Published candle to ${channel}`, message.data);
    } catch (error) {
      logger.error('Failed to publish candle to Redis:', error);
    }
  }

  /**
   * Publish orderbook update to Redis Pub/Sub
   * Channel naming: orderbook:{exchange}:{symbol}
   */
  async publishOrderbook(data: {
    exchange: string;
    symbol: string;
    bids: [string, string][];
    asks: [string, string][];
    timestamp: number;
  }): Promise<void> {
    try {
      const channel = `orderbook:${data.exchange}:${data.symbol}`;
      const message = {
        channel,
        data: {
          bids: data.bids.slice(0, 20),
          asks: data.asks.slice(0, 20),
          timestamp: data.timestamp,
        },
      };

      await redisClient.publish(channel, JSON.stringify(message));
      logger.debug(`Published orderbook to ${channel}`);
    } catch (error) {
      logger.error('Failed to publish orderbook to Redis:', error);
    }
  }

  /**
   * Publish trade to Redis Pub/Sub
   * Channel naming: trades:{exchange}:{symbol}
   */
  async publishTrade(data: {
    exchange: string;
    symbol: string;
    price: string | number;
    size: string | number;
    side: string;
    timestamp: number;
    id: string;
  }): Promise<void> {
    try {
      const channel = `trades:${data.exchange}:${data.symbol}`;
      const message = {
        channel,
        data: {
          price: Number(data.price),
          size: Number(data.size),
          side: data.side,
          timestamp: data.timestamp,
          id: data.id,
        },
      };

      await redisClient.publish(channel, JSON.stringify(message));
      logger.debug(`Published trade to ${channel}`);
    } catch (error) {
      logger.error('Failed to publish trade to Redis:', error);
    }
  }
}

export const redisPublisher = new RedisPublisher();
