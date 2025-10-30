/**
 * Main Application Entry Point
 * - Initializes Express server
 * - Configures middleware
 * - Registers routes
 * - Starts server
 */

import express from 'express';
import { config } from './config/env.config';
import { corsMiddleware } from './middleware/cors.middleware';
import { loggerMiddleware } from './middleware/logger.middleware';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { jsonWithRawBody } from './middleware/raw-body.middleware';
import routes from './routes';

const app = express();

app.use(corsMiddleware);
app.use(jsonWithRawBody);
app.use(loggerMiddleware);

app.use(routes);

app.use(errorHandler);
app.use(notFoundHandler);

app.listen(config.port, () => {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║       🚀 Dynamic.xyz MPC Wallet Backend 🚀            ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`✅ Server running on port ${config.port}`);
  console.log(`🌍 Environment ID: ${config.dynamicEnvId}`);
  console.log(`🔗 Frontend URL: ${config.frontendUrl}`);
  console.log(`📡 API ready at http://localhost:${config.port}`);
  console.log('');
  console.log('Available endpoints:');
  console.log(`  GET  /health`);
  console.log(`  GET  /api/wallet/:userId`);
  console.log(`  GET  /api/user/:userId`);
  console.log(`  POST /api/wallet/create`);
  console.log(`  GET  /api/environments`);
  console.log('');
  console.log('════════════════════════════════════════════════════════');
  console.log('');
  console.log('💡 TIP: If you see "Unauthorized" errors, check your API key at:');
  console.log('   https://app.dynamic.xyz/dashboard/api');
  console.log('');
});
