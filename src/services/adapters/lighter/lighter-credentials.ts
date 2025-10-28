import { database } from '@/config/database';
import { logger } from '@/utils/logger';

export interface LighterCredentials {
  walletAddress: string;
  accountIndex: number;
  apiKeyIndex: number;
  apiKeyPrivateEncrypted: string;
  apiKeyPublic: string;
}

/**
 * Get Lighter credentials for a wallet address
 */
export async function getLighterCredentials(walletAddress: string): Promise<LighterCredentials | null> {
  try {
    const query = `
      SELECT 
        wallet_address,
        account_index,
        api_key_index,
        api_key_private_encrypted,
        api_key_public
      FROM lighter_credentials
      WHERE wallet_address = $1
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const result = await database.query<LighterCredentials>(query, [walletAddress.toLowerCase()]);

    if (result.rows.length === 0) {
      logger.debug(`No Lighter credentials found for ${walletAddress}`);
      return null;
    }

    return result.rows[0];
  } catch (error) {
    logger.error(`Failed to fetch Lighter credentials for ${walletAddress}:`, error);
    return null;
  }
}

/**
 * Store or update Lighter credentials for a wallet address
 */
export async function storeLighterCredentials(
  credentials: LighterCredentials
): Promise<void> {
  try {
    const query = `
      INSERT INTO lighter_credentials (
        wallet_address,
        account_index,
        api_key_index,
        api_key_private_encrypted,
        api_key_public,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (wallet_address) 
      DO UPDATE SET
        account_index = EXCLUDED.account_index,
        api_key_index = EXCLUDED.api_key_index,
        api_key_private_encrypted = EXCLUDED.api_key_private_encrypted,
        api_key_public = EXCLUDED.api_key_public,
        updated_at = CURRENT_TIMESTAMP
    `;

    await database.query(query, [
      credentials.walletAddress.toLowerCase(),
      credentials.accountIndex,
      credentials.apiKeyIndex,
      credentials.apiKeyPrivateEncrypted,
      credentials.apiKeyPublic,
    ]);

    logger.info(`Stored Lighter credentials for ${credentials.walletAddress}`);
  } catch (error) {
    logger.error(`Failed to store Lighter credentials:`, error);
    throw error;
  }
}

/**
 * Delete Lighter credentials for a wallet address
 */
export async function deleteLighterCredentials(walletAddress: string): Promise<void> {
  try {
    const query = `
      DELETE FROM lighter_credentials
      WHERE wallet_address = $1
    `;

    const result = await database.query(query, [walletAddress.toLowerCase()]);

    if (result.rowCount && result.rowCount > 0) {
      logger.info(`Deleted Lighter credentials for ${walletAddress}`);
    }
  } catch (error) {
    logger.error(`Failed to delete Lighter credentials for ${walletAddress}:`, error);
    throw error;
  }
}

/**
 * Decrypt credentials (placeholder - implement actual decryption)
 * TODO: Implement proper AES-256 decryption
 */
export function decryptLighterPrivateKey(encryptedKey: string): string {
  // Placeholder - in production, implement proper decryption
  // For now, return as-is if not actually encrypted
  return encryptedKey;
}

/**
 * Encrypt credentials (placeholder - implement actual encryption)
 * TODO: Implement proper AES-256 encryption
 */
export function encryptLighterPrivateKey(privateKey: string): string {
  // Placeholder - in production, implement proper encryption
  // For now, return as-is if not actually encrypting
  return privateKey;
}

