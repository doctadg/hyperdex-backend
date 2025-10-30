import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * Get encryption key from environment variable
 */
function getEncryptionKey(): Buffer {
  const secret = process.env.ENCRYPTION_SECRET || process.env.DELEGATION_ENCRYPTION_KEY;

  if (!secret) {
    throw new Error('ENCRYPTION_SECRET or DELEGATION_ENCRYPTION_KEY must be set in environment');
  }

  // Derive a proper 32-byte key from the secret
  return crypto.scryptSync(secret, 'hyperdex-salt', KEY_LENGTH);
}

/**
 * Encrypt a string value
 * Returns base64-encoded format: iv:authTag:ciphertext
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
  ciphertext += cipher.final('base64');

  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:ciphertext (all base64)
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext}`;
}

/**
 * Decrypt a string value
 * Expects format: iv:authTag:ciphertext (all base64)
 */
export function decrypt(encrypted: string): string {
  const key = getEncryptionKey();

  const parts = encrypted.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }

  const iv = Buffer.from(parts[0], 'base64');
  const authTag = Buffer.from(parts[1], 'base64');
  const ciphertext = parts[2];

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let plaintext = decipher.update(ciphertext, 'base64', 'utf8');
  plaintext += decipher.final('utf8');

  return plaintext;
}

/**
 * Decrypt hybrid RSA-AES encrypted data from Dynamic webhook
 *
 * Dynamic sends data encrypted with a hybrid approach:
 * 1. AES key is encrypted with RSA public key
 * 2. Data is encrypted with that AES key using AES-256-GCM
 */
export interface DynamicEncryptedData {
  ct: string;    // Ciphertext (base64)
  tag: string;   // Authentication tag (base64)
  alg: string;   // Algorithm (e.g., "HYBRID-RSA-AES-256")
  iv: string;    // Initialization vector (base64)
  ek: string;    // Encrypted key (base64)
  kid?: string;  // Key ID (optional)
}

export function decryptDynamicHybridEncryption(
  encryptedData: DynamicEncryptedData,
  privateKey: string
): string {
  try {
    // Step 1: Decrypt the AES key using RSA private key
    const encryptedKeyBuffer = Buffer.from(encryptedData.ek, 'base64');
    const aesKey = crypto.privateDecrypt(
      {
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      encryptedKeyBuffer
    );

    // Step 2: Decrypt the ciphertext using AES-256-GCM
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      aesKey,
      Buffer.from(encryptedData.iv, 'base64')
    );

    // Set the authentication tag
    decipher.setAuthTag(Buffer.from(encryptedData.tag, 'base64'));

    // Decrypt the ciphertext
    let decrypted = decipher.update(encryptedData.ct, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('[Encryption] Dynamic decryption error:', error);
    throw new Error(`Failed to decrypt Dynamic data: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Test encryption/decryption roundtrip
 */
export function testEncryption() {
  const testData = 'Hello, World! 🔐';

  try {
    const encrypted = encrypt(testData);
    const decrypted = decrypt(encrypted);

    if (decrypted === testData) {
      console.log('[Encryption] ✅ Test passed');
      return true;
    } else {
      console.error('[Encryption] ❌ Test failed: data mismatch');
      return false;
    }
  } catch (error) {
    console.error('[Encryption] ❌ Test failed:', error);
    return false;
  }
}
