-- Create market statistics table
CREATE TABLE IF NOT EXISTS market_stats (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(50) NOT NULL,
    exchange VARCHAR(20) NOT NULL CHECK (exchange IN ('hyperliquid', 'aster')),
    timestamp BIGINT NOT NULL,
    price VARCHAR(50) NOT NULL,
    volume_24h VARCHAR(50) NOT NULL DEFAULT '0',
    quote_volume_24h VARCHAR(50) NOT NULL DEFAULT '0',
    price_change_24h VARCHAR(50) NOT NULL DEFAULT '0',
    price_change_percent_24h VARCHAR(50) NOT NULL DEFAULT '0',
    high_24h VARCHAR(50),
    low_24h VARCHAR(50),
    open_24h VARCHAR(50),
    vwap_24h VARCHAR(50),
    trades_24h INTEGER NOT NULL DEFAULT 0,
    bid_price VARCHAR(50),
    ask_price VARCHAR(50),
    spread VARCHAR(50),
    spread_percent VARCHAR(50),
    bid_volume VARCHAR(50) DEFAULT '0',
    ask_volume VARCHAR(50) DEFAULT '0',
    total_volume VARCHAR(50) DEFAULT '0',
    open_interest VARCHAR(50),
    funding_rate VARCHAR(50),
    next_funding_time BIGINT,
    mark_price VARCHAR(50),
    index_price VARCHAR(50),
    created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_market_stats_symbol_exchange ON market_stats(symbol, exchange);
CREATE INDEX IF NOT EXISTS idx_market_stats_timestamp ON market_stats(timestamp);
CREATE INDEX IF NOT EXISTS idx_market_stats_symbol_timestamp ON market_stats(symbol, timestamp);
CREATE INDEX IF NOT EXISTS idx_market_stats_exchange_timestamp ON market_stats(exchange, timestamp);

-- Create unique constraint for latest stats per symbol/exchange
CREATE UNIQUE INDEX IF NOT EXISTS idx_market_stats_latest
    ON market_stats(symbol, exchange, timestamp);

-- Create table for historical market data aggregation
CREATE TABLE IF NOT EXISTS market_stats_hourly (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(50) NOT NULL,
    exchange VARCHAR(20) NOT NULL CHECK (exchange IN ('hyperliquid', 'aster')),
    hour_timestamp BIGINT NOT NULL, -- Timestamp at the start of the hour
    open_price VARCHAR(50) NOT NULL,
    high_price VARCHAR(50) NOT NULL,
    low_price VARCHAR(50) NOT NULL,
    close_price VARCHAR(50) NOT NULL,
    volume VARCHAR(50) NOT NULL DEFAULT '0',
    quote_volume VARCHAR(50) NOT NULL DEFAULT '0',
    trades_count INTEGER NOT NULL DEFAULT 0,
    price_change VARCHAR(50) NOT NULL DEFAULT '0',
    price_change_percent VARCHAR(50) NOT NULL DEFAULT '0',
    vwap VARCHAR(50),
    created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000
);

-- Create indexes for hourly stats
CREATE UNIQUE INDEX IF NOT EXISTS idx_market_stats_hourly_unique 
    ON market_stats_hourly(symbol, exchange, hour_timestamp);
CREATE INDEX IF NOT EXISTS idx_market_stats_hourly_timestamp ON market_stats_hourly(hour_timestamp);

-- Create table for daily market data aggregation
CREATE TABLE IF NOT EXISTS market_stats_daily (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(50) NOT NULL,
    exchange VARCHAR(20) NOT NULL CHECK (exchange IN ('hyperliquid', 'aster')),
    day_timestamp BIGINT NOT NULL, -- Timestamp at the start of the day
    open_price VARCHAR(50) NOT NULL,
    high_price VARCHAR(50) NOT NULL,
    low_price VARCHAR(50) NOT NULL,
    close_price VARCHAR(50) NOT NULL,
    volume VARCHAR(50) NOT NULL DEFAULT '0',
    quote_volume VARCHAR(50) NOT NULL DEFAULT '0',
    trades_count INTEGER NOT NULL DEFAULT 0,
    price_change VARCHAR(50) NOT NULL DEFAULT '0',
    price_change_percent VARCHAR(50) NOT NULL DEFAULT '0',
    vwap VARCHAR(50),
    created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000
);

-- Create indexes for daily stats
CREATE UNIQUE INDEX IF NOT EXISTS idx_market_stats_daily_unique 
    ON market_stats_daily(symbol, exchange, day_timestamp);
CREATE INDEX IF NOT EXISTS idx_market_stats_daily_timestamp ON market_stats_daily(day_timestamp);
