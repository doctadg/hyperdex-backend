-- Create symbols table
CREATE TABLE IF NOT EXISTS symbols (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    base_asset VARCHAR(20) NOT NULL,
    quote_asset VARCHAR(20) NOT NULL,
    exchange VARCHAR(20) NOT NULL CHECK (exchange IN ('hyperliquid', 'aster')),
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance')),
    contract_type VARCHAR(20) CHECK (contract_type IN ('perpetual', 'quarterly', 'spot')),
    expiration BIGINT,
    contract_size VARCHAR(50),
    price_precision INTEGER NOT NULL DEFAULT 8,
    size_precision INTEGER NOT NULL DEFAULT 8,
    min_quantity VARCHAR(50) NOT NULL DEFAULT '0.001',
    max_quantity VARCHAR(50) NOT NULL DEFAULT '1000000',
    min_notional VARCHAR(50) NOT NULL DEFAULT '10',
    max_notional VARCHAR(50) NOT NULL DEFAULT '10000000',
    tick_size VARCHAR(50) NOT NULL DEFAULT '0.00000001',
    step_size VARCHAR(50) NOT NULL DEFAULT '0.001',
    maker_fee VARCHAR(20) NOT NULL DEFAULT '0.0002',
    taker_fee VARCHAR(20) NOT NULL DEFAULT '0.0004',
    leverage_min INTEGER NOT NULL DEFAULT 1,
    leverage_max INTEGER NOT NULL DEFAULT 100,
    leverage_default INTEGER NOT NULL DEFAULT 10,
    margin_type VARCHAR(20) NOT NULL DEFAULT 'cross' CHECK (margin_type IN ('cross', 'isolated')),
    funding_rate VARCHAR(50),
    next_funding_time BIGINT,
    mark_price VARCHAR(50),
    index_price VARCHAR(50),
    last_price VARCHAR(50),
    volume_24h VARCHAR(50),
    quote_volume_24h VARCHAR(50),
    price_change_24h VARCHAR(50),
    price_change_percent_24h VARCHAR(50),
    high_24h VARCHAR(50),
    low_24h VARCHAR(50),
    open_interest VARCHAR(50),
    created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000,
    updated_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_symbols_exchange ON symbols(exchange);
CREATE INDEX IF NOT EXISTS idx_symbols_status ON symbols(status);
CREATE INDEX IF NOT EXISTS idx_symbols_name_exchange ON symbols(name, exchange);
CREATE INDEX IF NOT EXISTS idx_symbols_updated_at ON symbols(updated_at);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = EXTRACT(EPOCH FROM NOW()) * 1000;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_symbols_updated_at 
    BEFORE UPDATE ON symbols 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();