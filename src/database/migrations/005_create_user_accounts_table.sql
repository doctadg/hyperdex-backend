-- Create user accounts table
CREATE TABLE IF NOT EXISTS user_accounts (
    id SERIAL PRIMARY KEY,
    wallet_address VARCHAR(42) NOT NULL UNIQUE,
    email VARCHAR(255),
    username VARCHAR(100),

    -- Trading preferences
    default_leverage INTEGER DEFAULT 1 CHECK (default_leverage >= 1 AND default_leverage <= 1001),
    default_margin_mode VARCHAR(20) DEFAULT 'cross' CHECK (default_margin_mode IN ('cross', 'isolated')),
    risk_level VARCHAR(20) DEFAULT 'medium' CHECK (risk_level IN ('low', 'medium', 'high', 'extreme')),

    -- Platform-specific settings
    preferred_platforms JSONB DEFAULT '["hyperliquid", "aster"]'::jsonb,

    -- API credentials (encrypted)
    aster_api_key_encrypted TEXT,
    aster_api_secret_encrypted TEXT,

    -- Account status
    is_active BOOLEAN DEFAULT true,
    is_verified BOOLEAN DEFAULT false,

    -- Timestamps
    created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000,
    updated_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000,
    last_login_at BIGINT
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_accounts_wallet_address ON user_accounts(wallet_address);
CREATE INDEX IF NOT EXISTS idx_user_accounts_email ON user_accounts(email);
CREATE INDEX IF NOT EXISTS idx_user_accounts_is_active ON user_accounts(is_active);
CREATE INDEX IF NOT EXISTS idx_user_accounts_created_at ON user_accounts(created_at);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_accounts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = EXTRACT(EPOCH FROM NOW()) * 1000;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER trigger_user_accounts_updated_at
    BEFORE UPDATE ON user_accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_user_accounts_updated_at();