/**
 * Custom error classes for Lighter adapter
 */

export class LighterAuthenticationError extends Error {
  constructor(message?: string) {
    super(
      message ||
        'Authentication required: This endpoint requires an Ed25519 API key. ' +
          'Initialize the signer with initializeSigner() or generate an API key with: npm run generate-lighter-key'
    );
    this.name = 'LighterAuthenticationError';
    Object.setPrototypeOf(this, LighterAuthenticationError.prototype);
  }
}

export class LighterApiError extends Error {
  public statusCode?: number;
  public responseData?: any;

  constructor(message: string, statusCode?: number, responseData?: any) {
    super(message);
    this.name = 'LighterApiError';
    this.statusCode = statusCode;
    this.responseData = responseData;
    Object.setPrototypeOf(this, LighterApiError.prototype);
  }
}

export class LighterSignerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LighterSignerError';
    Object.setPrototypeOf(this, LighterSignerError.prototype);
  }
}

export class LighterValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LighterValidationError';
    Object.setPrototypeOf(this, LighterValidationError.prototype);
  }
}
