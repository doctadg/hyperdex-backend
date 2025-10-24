-- Migration: Create aster_credentials table for storing user API keys
-- This table stores encrypted Aster DEX API credentials for each wallet address
-- Each user can have one set of API credentials for trading on Aster

CREATE TABLE IF NOT EXISTS aster_credentials (
  id SERIAL PRIMARY KEY,
  wallet_address VARCHAR(42) NOT NULL UNIQUE,
  api_key VARCHAR(255) NOT NULL,
  api_secret_encrypted TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast lookups by wallet address
CREATE INDEX IF NOT EXISTS idx_aster_credentials_wallet
  ON aster_credentials(wallet_address);

-- Add comment to table
COMMENT ON TABLE aster_credentials IS 'Stores encrypted Aster DEX API credentials for user wallets';
COMMENT ON COLUMN aster_credentials.wallet_address IS 'Ethereum wallet address (lowercase)';
COMMENT ON COLUMN aster_credentials.api_key IS 'Aster API key (public)';
COMMENT ON COLUMN aster_credentials.api_secret_encrypted IS 'Encrypted Aster API secret (base64 encoded, should be upgraded to AES-256)';
