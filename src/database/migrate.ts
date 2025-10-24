import 'dotenv/config';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { database } from '@/config/database';
import { logger } from '@/utils/logger';

async function runMigrations(): Promise<void> {
  try {
    logger.info('Starting database migrations...');
    
    // Create migrations table if it doesn't exist
    await database.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        executed_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000
      );
    `);

    // Get all migration files
    const migrationsPath = join(__dirname, 'migrations');
    const migrationFiles = readdirSync(migrationsPath)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    // Get executed migrations
    const executedMigrations = await database.query<{ filename: string }>(
      'SELECT filename FROM migrations ORDER BY filename'
    );
    const executedFilenames = new Set(executedMigrations.rows.map(row => row.filename));

    // Run pending migrations
    for (const filename of migrationFiles) {
      if (executedFilenames.has(filename)) {
        logger.info(`Migration ${filename} already executed, skipping...`);
        continue;
      }

      logger.info(`Running migration: ${filename}`);
      
      const migrationSQL = readFileSync(join(migrationsPath, filename), 'utf8');
      
      await database.transaction(async (client) => {
        // Execute migration
        await client.query(migrationSQL);
        
        // Record migration
        await client.query(
          'INSERT INTO migrations (filename) VALUES ($1)',
          [filename]
        );
      });

      logger.info(`Migration ${filename} completed successfully`);
    }

    logger.info('All migrations completed successfully');
  } catch (error) {
    logger.error('Migration failed:', error);
    throw error;
  }
}

// Run migrations if this file is executed directly
if (require.main === module) {
  runMigrations()
    .then(() => {
      logger.info('Migrations completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Migrations failed:', error);
      process.exit(1);
    });
}

export { runMigrations };
