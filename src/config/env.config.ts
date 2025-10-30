import dotenv from 'dotenv';

dotenv.config();

interface EnvConfig {
  port: number;
  dynamicApiKey: string;
  dynamicEnvId: string;
  dynamicServerApiKey: string;
  frontendUrl: string;
  isDevelopment: boolean;
  aster: {
    apiUrl: string;
  };
}

const validateEnvVariables = (): void => {
  const { DYNAMIC_API_KEY, DYNAMIC_ENV_ID, DYNAMIC_SERVER_API_KEY } = process.env;

  if (!DYNAMIC_API_KEY || !DYNAMIC_ENV_ID) {
    console.error('❌ Missing required environment variables!');
    console.error('Please set DYNAMIC_API_KEY and DYNAMIC_ENV_ID in your .env file');
    console.error('');
    console.error('Current values:');
    console.error(`  DYNAMIC_ENV_ID: ${DYNAMIC_ENV_ID || 'NOT SET'}`);
    console.error(`  DYNAMIC_API_KEY: ${DYNAMIC_API_KEY ? `${DYNAMIC_API_KEY.substring(0, 10)}...` : 'NOT SET'}`);
    console.error(`  DYNAMIC_SERVER_API_KEY: ${DYNAMIC_SERVER_API_KEY ? `${DYNAMIC_SERVER_API_KEY.substring(0, 10)}...` : 'NOT SET'}`);
    console.error('');
    console.error('Get your credentials from: https://app.dynamic.xyz/dashboard/api');
    process.exit(1);
  }

  if (!DYNAMIC_SERVER_API_KEY) {
    console.warn('⚠️  DYNAMIC_SERVER_API_KEY not set - MPC signing will not work');
  }

  console.log('🔑 Loaded API Key:', DYNAMIC_API_KEY.substring(0, 10) + '...');
  console.log('🌍 Loaded Env ID:', DYNAMIC_ENV_ID.substring(0, 15) + '...');
  if (DYNAMIC_SERVER_API_KEY) {
    console.log('🔐 Loaded Server API Key:', DYNAMIC_SERVER_API_KEY.substring(0, 10) + '...');
  }
};

validateEnvVariables();

export const config: EnvConfig = {
  port: parseInt(process.env.PORT || '3001', 10),
  dynamicApiKey: process.env.DYNAMIC_API_KEY!,
  dynamicEnvId: process.env.DYNAMIC_ENV_ID!,
  dynamicServerApiKey: process.env.DYNAMIC_SERVER_API_KEY || '',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  isDevelopment: process.env.NODE_ENV !== 'production',
  aster: {
    apiUrl: process.env.ASTER_API_URL || 'https://fapi.asterdex.com',
  }
};
