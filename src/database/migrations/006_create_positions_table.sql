-- Create positions table
CREATE TABLE IF NOT EXISTS positions (
    id SERIAL PRIMARY KEY,
    wallet_address VARCHAR(42) NOT NULL,
    platform VARCHAR(20) NOT NULL CHECK (platform IN ('hyperliquid', 'aster', 'lighter')),
    symbol VARCHAR(50) NOT NULL,
    side VARCHAR(10) NOT NULL CHECK (side IN ('long', 'short')),
    size VARCHAR(50) NOT NULL,
    entry_price VARCHAR(50) NOT NULL,
    mark_price VARCHAR(50),
    leverage INTEGER NOT NULL CHECK (leverage >= 1 AND leverage <= 1001),
    margin_mode VARCHAR(20) NOT NULL CHECK (margin_mode IN ('cross', 'isolated')),
    margin_used VARCHAR(50) NOT NULL,
    unrealized_pnl VARCHAR(50) DEFAULT '0',
    realized_pnl VARCHAR(50) DEFAULT '0',
    liquidation_price VARCHAR(50),
    stop_loss_price VARCHAR(50),
    take_profit_price VARCHAR(50),
    platform_position_id VARCHAR(100),
    platform_data JSONB,
    status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'liquidated')),
    opened_at BIGINT NOT NULL,
    closed_at BIGINT,
    last_updated_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000,
    created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_positions_wallet_address ON positions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_positions_platform ON positions(platform);
CREATE INDEX IF NOT EXISTS idx_positions_symbol ON positions(symbol);
CREATE INDEX IF NOT EXISTS idx_positions_status ON positions(status);
CREATE INDEX IF NOT EXISTS idx_positions_opened_at ON positions(opened_at);
CREATE INDEX IF NOT EXISTS idx_positions_closed_at ON positions(closed_at);

-- Composite index for most common query pattern
CREATE INDEX IF NOT EXISTS idx_positions_wallet_platform_status
    ON positions(wallet_address, platform, status);

-- Composite index for finding open positions by wallet and symbol
CREATE INDEX IF NOT EXISTS idx_positions_wallet_symbol_status
    ON positions(wallet_address, symbol, status);

-- Index for platform-specific position IDs
CREATE INDEX IF NOT EXISTS idx_positions_platform_position_id
    ON positions(platform, platform_position_id)
    WHERE platform_position_id IS NOT NULL;

-- Ensure previous trigger/function are removed
DROP TRIGGER IF EXISTS trigger_positions_last_updated_at ON positions;
DROP FUNCTION IF EXISTS update_positions_last_updated_at();

-- Create function to update last_updated_at timestamp
CREATE OR REPLACE FUNCTION update_positions_last_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_updated_at = EXTRACT(EPOCH FROM NOW()) * 1000;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update last_updated_at
CREATE TRIGGER trigger_positions_last_updated_at
    BEFORE UPDATE ON positions
    FOR EACH ROW
    EXECUTE FUNCTION update_positions_last_updated_at();

-- Add comment to table for documentation
COMMENT ON TABLE positions IS 'Stores user trading positions across all supported exchanges (Hyperliquid, Aster, Lighter)';
COMMENT ON COLUMN positions.wallet_address IS 'User wallet address (42-character hex format)';
COMMENT ON COLUMN positions.platform IS 'Exchange where position is held';
COMMENT ON COLUMN positions.symbol IS 'Trading pair symbol (e.g., BTC, ETH, BTCUSDT)';
COMMENT ON COLUMN positions.side IS 'Position direction: long (buy) or short (sell)';
COMMENT ON COLUMN positions.size IS 'Position size in base asset';
COMMENT ON COLUMN positions.entry_price IS 'Average entry price';
COMMENT ON COLUMN positions.mark_price IS 'Current mark price for unrealized PnL calculation';
COMMENT ON COLUMN positions.leverage IS 'Position leverage (1-1001x)';
COMMENT ON COLUMN positions.margin_mode IS 'Cross margin (shared) or isolated margin';
COMMENT ON COLUMN positions.margin_used IS 'Amount of margin/collateral used';
COMMENT ON COLUMN positions.unrealized_pnl IS 'Current unrealized profit/loss';
COMMENT ON COLUMN positions.realized_pnl IS 'Realized profit/loss after closing';
COMMENT ON COLUMN positions.liquidation_price IS 'Price at which position will be liquidated';
COMMENT ON COLUMN positions.stop_loss_price IS 'Stop loss trigger price';
COMMENT ON COLUMN positions.take_profit_price IS 'Take profit trigger price';
COMMENT ON COLUMN positions.platform_position_id IS 'Exchange-specific position identifier';
COMMENT ON COLUMN positions.platform_data IS 'Additional exchange-specific data stored as JSON';
COMMENT ON COLUMN positions.status IS 'Position status: open, closed, or liquidated';
COMMENT ON COLUMN positions.opened_at IS 'Timestamp when position was opened (milliseconds)';
COMMENT ON COLUMN positions.closed_at IS 'Timestamp when position was closed (milliseconds)';
COMMENT ON COLUMN positions.last_updated_at IS 'Timestamp of last update (milliseconds)';
COMMENT ON COLUMN positions.created_at IS 'Timestamp when record was created (milliseconds)';
