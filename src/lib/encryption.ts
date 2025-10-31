import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const KEY_LENGTH = 32;

function getEncryptionKey(): Buffer {
  const secret = process.env.ENCRYPTION_SECRET || process.env.DELEGATION_ENCRYPTION_KEY;

  if (!secret) {
    throw new Error('ENCRYPTION_SECRET or DELEGATION_ENCRYPTION_KEY must be set in environment');
  }

  return crypto.scryptSync(secret, 'hyperdex-salt', KEY_LENGTH);
}


export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
  ciphertext += cipher.final('base64');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext}`;
}


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


export interface DynamicEncryptedData {
  ct: string;
  tag: string;
  alg: string;
  iv: string;
  ek: string;
  kid?: string;
}

export function decryptDynamicHybridEncryption(
  encryptedData: DynamicEncryptedData,
  privateKey: string
): string {
  try {
    const encryptedKeyBuffer = Buffer.from(encryptedData.ek, 'base64');
    const aesKey = crypto.privateDecrypt(
      {
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      encryptedKeyBuffer
    );

    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      aesKey,
      Buffer.from(encryptedData.iv, 'base64')
    );

    decipher.setAuthTag(Buffer.from(encryptedData.tag, 'base64'));

    let decrypted = decipher.update(encryptedData.ct, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('[Encryption] Dynamic decryption error:', error);
    throw new Error(`Failed to decrypt Dynamic data: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}


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
