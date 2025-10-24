-- Create candles table for OHLCV data
CREATE TABLE IF NOT EXISTS candles (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(50) NOT NULL,
    exchange VARCHAR(20) NOT NULL CHECK (exchange IN ('hyperliquid', 'aster')),
    timeframe VARCHAR(10) NOT NULL CHECK (timeframe IN ('1s', '1m', '5m', '15m', '1h', '4h', '1d')),
    timestamp BIGINT NOT NULL,
    open VARCHAR(50) NOT NULL,
    high VARCHAR(50) NOT NULL,
    low VARCHAR(50) NOT NULL,
    close VARCHAR(50) NOT NULL,
    volume VARCHAR(50) NOT NULL DEFAULT '0',
    quote_volume VARCHAR(50) NOT NULL DEFAULT '0',
    trade_count INTEGER NOT NULL DEFAULT 0,
    vwap VARCHAR(50),
    price_change VARCHAR(50),
    price_change_percent VARCHAR(50),
    created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000
);

-- Create unique constraint to prevent duplicate candles
CREATE UNIQUE INDEX IF NOT EXISTS idx_candles_unique 
    ON candles(symbol, exchange, timeframe, timestamp);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_candles_symbol_exchange_timeframe ON candles(symbol, exchange, timeframe);
CREATE INDEX IF NOT EXISTS idx_candles_timestamp ON candles(timestamp);
CREATE INDEX IF NOT EXISTS idx_candles_symbol_timestamp ON candles(symbol, timestamp);
CREATE INDEX IF NOT EXISTS idx_candles_timeframe_timestamp ON candles(timeframe, timestamp);

-- Create composite index for chart data queries
CREATE INDEX IF NOT EXISTS idx_candles_chart_query 
    ON candles(symbol, exchange, timeframe, timestamp DESC);

-- Create partitioned tables for better performance (optional)
-- This would require PostgreSQL 10+
-- CREATE TABLE candles_1m PARTITION OF candles
--     FOR VALUES IN ('1m');
-- CREATE TABLE candles_5m PARTITION OF candles
--     FOR VALUES IN ('5m');
-- ... and so on for each timeframe

-- Create trigger to ensure data consistency
CREATE OR REPLACE FUNCTION validate_candle_data()
RETURNS TRIGGER AS $$
BEGIN
    -- Validate that high >= low
    IF NEW.high::numeric < NEW.low::numeric THEN
        RAISE EXCEPTION 'High price cannot be less than low price';
    END IF;
    
    -- Validate that open and close are within high/low range
    IF NEW.open::numeric > NEW.high::numeric OR NEW.open::numeric < NEW.low::numeric THEN
        RAISE EXCEPTION 'Open price must be within high/low range';
    END IF;
    
    IF NEW.close::numeric > NEW.high::numeric OR NEW.close::numeric < NEW.low::numeric THEN
        RAISE EXCEPTION 'Close price must be within high/low range';
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER validate_candle_data_trigger
    BEFORE INSERT OR UPDATE ON candles
    FOR EACH ROW
    EXECUTE FUNCTION validate_candle_data();