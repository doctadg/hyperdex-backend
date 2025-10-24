import { Pool, PoolClient } from 'pg';
import { logger } from '@/utils/logger';

export class Database {
  private pool: Pool;

  constructor() {
    const useConnectionString = Boolean(process.env['DATABASE_URL']);
    const sslMode = process.env['DATABASE_SSL'] ?? 'require';
    const sslConfig = sslMode === 'disable'
      ? undefined
      : { rejectUnauthorized: false };

    this.pool = new Pool({
      connectionString: process.env['DATABASE_URL'],
      host: useConnectionString ? undefined : process.env['DATABASE_HOST'],
      port: useConnectionString ? undefined : parseInt(process.env['DATABASE_PORT'] || '5432'),
      database: useConnectionString ? undefined : process.env['DATABASE_NAME'],
      user: useConnectionString ? undefined : process.env['DATABASE_USER'],
      password: useConnectionString ? undefined : process.env['DATABASE_PASSWORD'],
      ssl: sslConfig,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    this.pool.on('error', (err: Error) => {
      logger.error('Database pool error:', err);
    });
  }

  async query<T = unknown>(text: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number | null }> {
    const start = Date.now();
    try {
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;
      logger.debug('Database query executed', { text, duration, rows: result.rowCount });
      return { rows: result.rows as T[], rowCount: result.rowCount };
    } catch (error) {
      const duration = Date.now() - start;
      logger.error('Database query failed', { text, duration, error });
      throw error;
    }
  }

  async queryOne<T = unknown>(text: string, params?: unknown[]): Promise<T | null> {
    const result = await this.query<T>(text, params);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
    logger.info('Database connection pool closed');
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.query('SELECT 1');
      return true;
    } catch (error) {
      logger.error('Database health check failed', error);
      return false;
    }
  }

  getPool(): Pool {
    return this.pool;
  }
}

export const database = new Database();
