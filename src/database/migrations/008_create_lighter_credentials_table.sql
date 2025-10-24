-- Migration: Create lighter_credentials table for storing user API keys
-- This table stores encrypted Lighter DEX API credentials for each wallet address
-- Lighter uses Ed25519 key pairs for signing transactions
-- Each user can have one API key per wallet address

CREATE TABLE IF NOT EXISTS lighter_credentials (
  id SERIAL PRIMARY KEY,
  wallet_address VARCHAR(42) NOT NULL UNIQUE,
  account_index INTEGER NOT NULL,
  api_key_index INTEGER NOT NULL DEFAULT 2,
  api_key_private_encrypted TEXT NOT NULL,
  api_key_public VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast lookups by wallet address
CREATE INDEX IF NOT EXISTS idx_lighter_credentials_wallet
  ON lighter_credentials(wallet_address);

-- Add comments to table
COMMENT ON TABLE lighter_credentials IS 'Stores encrypted Lighter DEX Ed25519 API credentials for user wallets';
COMMENT ON COLUMN lighter_credentials.wallet_address IS 'Ethereum wallet address (lowercase)';
COMMENT ON COLUMN lighter_credentials.account_index IS 'Lighter account index for this wallet address';
COMMENT ON COLUMN lighter_credentials.api_key_index IS 'API key index (0=desktop, 1=mobile, 2+=web)';
COMMENT ON COLUMN lighter_credentials.api_key_private_encrypted IS 'Encrypted Ed25519 private key (base64 encoded, should be upgraded to AES-256)';
COMMENT ON COLUMN lighter_credentials.api_key_public IS 'Ed25519 public key (hex encoded)';
