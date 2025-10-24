-- Create trades table
CREATE TABLE IF NOT EXISTS trades (
    id VARCHAR(100) PRIMARY KEY,
    symbol VARCHAR(50) NOT NULL,
    exchange VARCHAR(20) NOT NULL CHECK (exchange IN ('hyperliquid', 'aster')),
    price VARCHAR(50) NOT NULL,
    size VARCHAR(50) NOT NULL,
    side VARCHAR(10) NOT NULL CHECK (side IN ('buy', 'sell')),
    timestamp BIGINT NOT NULL,
    block_time BIGINT,
    created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_trades_symbol_exchange ON trades(symbol, exchange);
CREATE INDEX IF NOT EXISTS idx_trades_timestamp ON trades(timestamp);
CREATE INDEX IF NOT EXISTS idx_trades_symbol_timestamp ON trades(symbol, timestamp);
CREATE INDEX IF NOT EXISTS idx_trades_exchange_timestamp ON trades(exchange, timestamp);
CREATE INDEX IF NOT EXISTS idx_trades_side ON trades(side);

-- Create composite index for recent trades queries
CREATE INDEX IF NOT EXISTS idx_trades_symbol_exchange_timestamp_desc ON trades(symbol, exchange, timestamp DESC);

-- Create partitioned table for better performance (optional, for high volume)
-- This would require PostgreSQL 10+
-- CREATE TABLE trades_y2024m01 PARTITION OF trades
--     FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');