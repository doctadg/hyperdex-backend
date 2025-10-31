-- Migration: Create orders table for tracking trades across all platforms
-- Stores order metadata including fills, cancellations, and platform-specific data
-- Supports hyperliquid, aster, lighter, and avantis platforms

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  wallet_address VARCHAR(255) NOT NULL,
  platform VARCHAR(50) NOT NULL,
  order_id VARCHAR(255) NOT NULL,
  client_order_id VARCHAR(255),
  symbol VARCHAR(50) NOT NULL,
  side VARCHAR(10) NOT NULL,
  type VARCHAR(20) NOT NULL,
  status VARCHAR(50) NOT NULL,
  price DECIMAL(36, 18) NOT NULL,
  quantity DECIMAL(36, 18) NOT NULL,
  filled_quantity DECIMAL(36, 18) NOT NULL DEFAULT 0,
  remaining_quantity DECIMAL(36, 18) NOT NULL,
  time_in_force VARCHAR(10),
  reduce_only BOOLEAN DEFAULT FALSE,
  platform_data JSONB,
  timestamp BIGINT NOT NULL,
  created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000,
  updated_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000,
  filled_at BIGINT,
  cancelled_at BIGINT,
  UNIQUE(platform, order_id)
);

-- Index for fast wallet lookups
CREATE INDEX IF NOT EXISTS idx_orders_wallet_address
  ON orders(wallet_address);

-- Index for fast platform lookups
CREATE INDEX IF NOT EXISTS idx_orders_platform
  ON orders(platform);

-- Index for symbol queries
CREATE INDEX IF NOT EXISTS idx_orders_symbol
  ON orders(symbol);

-- Index for status queries (finding open orders)
CREATE INDEX IF NOT EXISTS idx_orders_status
  ON orders(status);

-- Index for timestamp-based queries
CREATE INDEX IF NOT EXISTS idx_orders_timestamp
  ON orders(timestamp);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_orders_wallet_platform_status
  ON orders(wallet_address, platform, status);

-- Composite index for symbol queries
CREATE INDEX IF NOT EXISTS idx_orders_symbol_status
  ON orders(symbol, status);

-- Add table comments
COMMENT ON TABLE orders IS 'Stores trading orders across all supported DEX platforms (Hyperliquid, Aster, Lighter, Avantis)';
COMMENT ON COLUMN orders.wallet_address IS 'User wallet address';
COMMENT ON COLUMN orders.platform IS 'Trading platform (hyperliquid, aster, lighter, avantis)';
COMMENT ON COLUMN orders.order_id IS 'Platform-specific order ID';
COMMENT ON COLUMN orders.client_order_id IS 'Client-generated order ID for idempotency';
COMMENT ON COLUMN orders.symbol IS 'Trading pair symbol (e.g., ETH, BTC)';
COMMENT ON COLUMN orders.side IS 'Order side: buy or sell';
COMMENT ON COLUMN orders.type IS 'Order type: market or limit';
COMMENT ON COLUMN orders.status IS 'Order status: pending, open, filled, partial, cancelled, rejected';
COMMENT ON COLUMN orders.price IS 'Limit price (18 decimal places for crypto)';
COMMENT ON COLUMN orders.quantity IS 'Order quantity (18 decimal places)';
COMMENT ON COLUMN orders.filled_quantity IS 'Amount filled so far';
COMMENT ON COLUMN orders.remaining_quantity IS 'Amount remaining to fill';
COMMENT ON COLUMN orders.reduce_only IS 'Whether this is a reduce-only order (closes position)';
COMMENT ON COLUMN orders.platform_data IS 'Platform-specific data (JSON)';
COMMENT ON COLUMN orders.timestamp IS 'Order creation timestamp (milliseconds)';
COMMENT ON COLUMN orders.filled_at IS 'When order was fully filled (milliseconds)';
COMMENT ON COLUMN orders.cancelled_at IS 'When order was cancelled (milliseconds)';
