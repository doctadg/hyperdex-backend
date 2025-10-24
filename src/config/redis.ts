import Redis from 'ioredis';
import { logger } from '@/utils/logger';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export class RedisClient {
  private client: Redis;
  private subscriber: Redis;
  private publisher: Redis;

  constructor() {
    // Use Upstash Redis if UPSTASH_REDIS_URL is set, otherwise use local Redis
    const useUpstash = !!process.env.UPSTASH_REDIS_URL;

    const redisConfig = useUpstash
      ? {
          // Upstash Redis configuration
          host: new URL(process.env.UPSTASH_REDIS_URL!).hostname,
          port: parseInt(new URL(process.env.UPSTASH_REDIS_URL!).port || '6379'),
          password: process.env.UPSTASH_REDIS_URL!.split('://')[1].split('@')[0].split(':')[1],
          tls: {
            rejectUnauthorized: true,
          },
          retryDelayOnFailover: 100,
          maxRetriesPerRequest: 3,
          lazyConnect: true,
        }
      : {
          // Local Redis configuration
          host: process.env['REDIS_HOST'] || 'localhost',
          port: parseInt(process.env['REDIS_PORT'] || '6379'),
          password: process.env['REDIS_PASSWORD'],
          retryDelayOnFailover: 100,
          maxRetriesPerRequest: 3,
          lazyConnect: true,
        };

    this.client = new Redis(redisConfig);
    this.subscriber = new Redis(redisConfig);
    this.publisher = new Redis(redisConfig);

    const mode = useUpstash ? 'Upstash' : 'Local';
    logger.info(`Redis configuration: ${mode} mode`);

    this.client.on('error', (error: Error) => {
      logger.error('Redis client error:', error);
    });

    this.subscriber.on('error', (error: Error) => {
      logger.error('Redis subscriber error:', error);
    });

    this.publisher.on('error', (error: Error) => {
      logger.error('Redis publisher error:', error);
    });

    this.client.on('connect', () => {
      logger.info(`Redis client connected (${mode})`);
    });

    this.subscriber.on('connect', () => {
      logger.info(`Redis subscriber connected (${mode})`);
    });

    this.publisher.on('connect', () => {
      logger.info(`Redis publisher connected (${mode})`);
    });
  }

  async connect(): Promise<void> {
    await Promise.all([
      this.client.connect(),
      this.subscriber.connect(),
      this.publisher.connect(),
    ]);
  }

  async disconnect(): Promise<void> {
    await Promise.all([
      this.client.disconnect(),
      this.subscriber.disconnect(),
      this.publisher.disconnect(),
    ]);
    logger.info('Redis connections closed');
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (ttl) {
      await this.client.setex(key, ttl, value);
    } else {
      await this.client.set(key, value);
    }
  }

  async get(key: string): Promise<string | null> {
    return await this.client.get(key);
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }

  async hset(key: string, field: string, value: string): Promise<void> {
    await this.client.hset(key, field, value);
  }

  async hget(key: string, field: string): Promise<string | null> {
    return await this.client.hget(key, field);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return await this.client.hgetall(key);
  }

  async hdel(key: string, field: string): Promise<void> {
    await this.client.hdel(key, field);
  }

  async lpush(key: string, ...values: string[]): Promise<void> {
    await this.client.lpush(key, ...values);
  }

  async rpush(key: string, ...values: string[]): Promise<void> {
    await this.client.rpush(key, ...values);
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    return await this.client.lrange(key, start, stop);
  }

  async ltrim(key: string, start: number, stop: number): Promise<void> {
    await this.client.ltrim(key, start, stop);
  }

  async publish(channel: string, message: string): Promise<void> {
    await this.publisher.publish(channel, message);
  }

  async subscribe(channel: string, callback: (channel: string, message: string) => void): Promise<void> {
    await this.subscriber.subscribe(channel);
    this.subscriber.on('message', callback);
  }

  async unsubscribe(channel: string): Promise<void> {
    await this.subscriber.unsubscribe(channel);
  }

  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      logger.error('Redis health check failed', error);
      return false;
    }
  }

  getClient(): Redis {
    return this.client;
  }

  getSubscriber(): Redis {
    return this.subscriber;
  }

  getPublisher(): Redis {
    return this.publisher;
  }
}

export const redisClient = new RedisClient();