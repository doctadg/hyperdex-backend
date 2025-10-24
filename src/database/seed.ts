import { database } from '@/config/database';
import { logger } from '@/utils/logger';

interface SymbolData {
  name: string;
  baseAsset: string;
  quoteAsset: string;
  exchange: 'hyperliquid' | 'aster' | 'lighter';
  contractType: 'perpetual' | 'quarterly' | 'spot';
  pricePrecision: number;
  sizePrecision: number;
  minQuantity: string;
  maxQuantity: string;
  minNotional: string;
  maxNotional: string;
  tickSize: string;
  stepSize: string;
  makerFee: string;
  takerFee: string;
  leverage: {
    min: number;
    max: number;
    default: number;
  };
  marginType: 'cross' | 'isolated';
}

const symbolsData: SymbolData[] = [
  {
    name: 'BTC',
    baseAsset: 'BTC',
    quoteAsset: 'USD',
    exchange: 'hyperliquid',
    contractType: 'perpetual',
    pricePrecision: 2,
    sizePrecision: 8,
    minQuantity: '0.00001',
    maxQuantity: '1000',
    minNotional: '10',
    maxNotional: '10000000',
    tickSize: '0.01',
    stepSize: '0.00001',
    makerFee: '0.0002',
    takerFee: '0.0004',
    leverage: { min: 1, max: 50, default: 10 },
    marginType: 'cross',
  },
  {
    name: 'ETH',
    baseAsset: 'ETH',
    quoteAsset: 'USD',
    exchange: 'hyperliquid',
    contractType: 'perpetual',
    pricePrecision: 2,
    sizePrecision: 8,
    minQuantity: '0.0001',
    maxQuantity: '10000',
    minNotional: '10',
    maxNotional: '10000000',
    tickSize: '0.01',
    stepSize: '0.0001',
    makerFee: '0.0002',
    takerFee: '0.0004',
    leverage: { min: 1, max: 50, default: 10 },
    marginType: 'cross',
  },
  {
    name: 'BTCUSDT',
    baseAsset: 'BTC',
    quoteAsset: 'USDT',
    exchange: 'aster',
    contractType: 'perpetual',
    pricePrecision: 2,
    sizePrecision: 6,
    minQuantity: '0.001',
    maxQuantity: '1000',
    minNotional: '10',
    maxNotional: '10000000',
    tickSize: '0.01',
    stepSize: '0.001',
    makerFee: '0.0002',
    takerFee: '0.0004',
    leverage: { min: 1, max: 125, default: 20 },
    marginType: 'cross',
  },
  {
    name: 'ETHUSDT',
    baseAsset: 'ETH',
    quoteAsset: 'USDT',
    exchange: 'aster',
    contractType: 'perpetual',
    pricePrecision: 2,
    sizePrecision: 5,
    minQuantity: '0.01',
    maxQuantity: '10000',
    minNotional: '10',
    maxNotional: '10000000',
    tickSize: '0.01',
    stepSize: '0.01',
    makerFee: '0.0002',
    takerFee: '0.0004',
    leverage: { min: 1, max: 100, default: 20 },
    marginType: 'cross',
  },
  {
    name: 'SOL',
    baseAsset: 'SOL',
    quoteAsset: 'USD',
    exchange: 'hyperliquid',
    contractType: 'perpetual',
    pricePrecision: 3,
    sizePrecision: 6,
    minQuantity: '0.01',
    maxQuantity: '100000',
    minNotional: '10',
    maxNotional: '10000000',
    tickSize: '0.001',
    stepSize: '0.01',
    makerFee: '0.0002',
    takerFee: '0.0004',
    leverage: { min: 1, max: 50, default: 10 },
    marginType: 'cross',
  },
  {
    name: 'SOLUSDT',
    baseAsset: 'SOL',
    quoteAsset: 'USDT',
    exchange: 'aster',
    contractType: 'perpetual',
    pricePrecision: 3,
    sizePrecision: 4,
    minQuantity: '0.1',
    maxQuantity: '100000',
    minNotional: '10',
    maxNotional: '10000000',
    tickSize: '0.001',
    stepSize: '0.1',
    makerFee: '0.0002',
    takerFee: '0.0004',
    leverage: { min: 1, max: 50, default: 20 },
    marginType: 'cross',
  },
];

async function seedSymbols(): Promise<void> {
  try {
    logger.info('Seeding symbols data...');
    
    for (const symbolData of symbolsData) {
      await database.query(`
        INSERT INTO symbols (
          name, base_asset, quote_asset, exchange, contract_type,
          price_precision, size_precision, min_quantity, max_quantity,
          min_notional, max_notional, tick_size, step_size,
          maker_fee, taker_fee, leverage_min, leverage_max, leverage_default,
          margin_type, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9,
          $10, $11, $12, $13,
          $14, $15, $16, $17, $18,
          $19, $20, $21
        ) ON CONFLICT (name) DO NOTHING
      `, [
        symbolData.name,
        symbolData.baseAsset,
        symbolData.quoteAsset,
        symbolData.exchange,
        symbolData.contractType,
        symbolData.pricePrecision,
        symbolData.sizePrecision,
        symbolData.minQuantity,
        symbolData.maxQuantity,
        symbolData.minNotional,
        symbolData.maxNotional,
        symbolData.tickSize,
        symbolData.stepSize,
        symbolData.makerFee,
        symbolData.takerFee,
        symbolData.leverage.min,
        symbolData.leverage.max,
        symbolData.leverage.default,
        symbolData.marginType,
        Date.now(),
        Date.now(),
      ]);
    }

    logger.info(`Seeded ${symbolsData.length} symbols`);
  } catch (error) {
    logger.error('Failed to seed symbols:', error);
    throw error;
  }
}

async function seedAll(): Promise<void> {
  try {
    logger.info('Starting database seeding...');
    
    await seedSymbols();
    
    logger.info('Database seeding completed successfully');
  } catch (error) {
    logger.error('Database seeding failed:', error);
    throw error;
  }
}

// Run seeding if this file is executed directly
if (require.main === module) {
  seedAll()
    .then(() => {
      logger.info('Seeding completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Seeding failed:', error);
      process.exit(1);
    });
}

export { seedAll, seedSymbols };