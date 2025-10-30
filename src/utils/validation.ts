export interface PositionParams {
  market: string;
  side: 'long' | 'short';
  size: string;
  leverage: number;
  slippage?: number;
}

export interface DelegatedCredentials {
  walletId: string;
  walletApiKey: string;
  keyShare: string;
}

/**
 * Validate position parameters
 */
export function validatePositionParams(params: PositionParams): string | null {
  const { market, side, size, leverage, slippage } = params;

  if (!market || typeof market !== 'string') {
    return 'Invalid market';
  }

  if (side !== 'long' && side !== 'short') {
    return 'Side must be "long" or "short"';
  }

  const sizeNum = parseFloat(size);
  if (isNaN(sizeNum) || sizeNum <= 0) {
    return 'Size must be a positive number';
  }

  if (!Number.isInteger(leverage) || leverage < 1 || leverage > 100) {
    return 'Leverage must be an integer between 1 and 100';
  }

  if (slippage !== undefined) {
    if (typeof slippage !== 'number' || slippage < 0 || slippage > 1) {
      return 'Slippage must be a number between 0 and 1';
    }
  }

  return null;
}

/**
 * Validate delegated credentials
 */
export function validateDelegatedCredentials(credentials: any): credentials is DelegatedCredentials {
  if (!credentials || typeof credentials !== 'object') {
    return false;
  }

  if (!credentials.walletId || typeof credentials.walletId !== 'string') {
    return false;
  }

  if (!credentials.walletApiKey || typeof credentials.walletApiKey !== 'string') {
    return false;
  }

  if (!credentials.keyShare || typeof credentials.keyShare !== 'string') {
    return false;
  }

  return true;
}

/**
 * Validate wallet address format
 */
export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Sanitize string for logging (remove sensitive data)
 */
export function sanitizeForLog(obj: any): any {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  const sensitiveKeys = ['keyShare', 'privateKey', 'secret', 'password', 'token', 'apiKey'];
  const sanitized: any = Array.isArray(obj) ? [] : {};

  for (const key in obj) {
    if (sensitiveKeys.some(k => key.toLowerCase().includes(k.toLowerCase()))) {
      sanitized[key] = '***REDACTED***';
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      sanitized[key] = sanitizeForLog(obj[key]);
    } else {
      sanitized[key] = obj[key];
    }
  }

  return sanitized;
}
