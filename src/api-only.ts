import { app } from './api/server';
import { config } from '@/config';
import { logger } from '@/utils/logger';

const port = config.server.port;
const host = config.server.host;

app.listen(port, host, () => {
  logger.info(`API server listening on ${host}:${port}`);
  console.log(`API server listening on ${host}:${port}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down...');
  process.exit(0);
});
