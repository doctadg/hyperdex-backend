import { logger } from './logger';

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  retryableErrors?: Array<new (...args: any[]) => Error>;
  onRetry?: (error: Error, attempt: number) => void;
}

const defaultOptions: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryableErrors: [Error],
  onRetry: () => {},
};

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...defaultOptions, ...options };
  let lastError: Error;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Check if error is retryable
      const isRetryable = opts.retryableErrors.some(
        (ErrorClass) => error instanceof ErrorClass
      );

      if (!isRetryable || attempt === opts.maxRetries) {
        throw error;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        opts.initialDelayMs * Math.pow(opts.backoffMultiplier, attempt),
        opts.maxDelayMs
      );

      logger.warn(
        `Retry attempt ${attempt + 1}/${opts.maxRetries} after ${delay}ms`,
        { error: error instanceof Error ? error.message : String(error) }
      );

      opts.onRetry(error as Error, attempt + 1);

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

/**
 * Circuit breaker states
 */
enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerOptions {
  failureThreshold?: number;
  successThreshold?: number;
  timeout?: number;
  resetTimeoutMs?: number;
}

/**
 * Circuit breaker pattern implementation
 * Prevents cascading failures by stopping calls to failing services
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private nextAttemptTime = 0;

  private readonly options: Required<CircuitBreakerOptions>;

  constructor(
    private readonly name: string,
    options: CircuitBreakerOptions = {}
  ) {
    this.options = {
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 60000,
      resetTimeoutMs: 60000,
      ...options,
    };
  }

  /**
   * Execute a function through the circuit breaker
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttemptTime) {
        throw new Error(
          `Circuit breaker '${this.name}' is OPEN. Next attempt at ${new Date(this.nextAttemptTime).toISOString()}`
        );
      }
      // Try transitioning to half-open
      this.state = CircuitState.HALF_OPEN;
      this.successCount = 0;
      logger.info(`Circuit breaker '${this.name}' transitioning to HALF_OPEN`);
    }

    try {
      const result = await Promise.race([
        fn(),
        this.timeoutPromise(),
      ]);

      this.onSuccess();
      return result as T;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.options.successThreshold) {
        this.state = CircuitState.CLOSED;
        logger.info(`Circuit breaker '${this.name}' CLOSED`);
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.successCount = 0;

    if (this.failureCount >= this.options.failureThreshold) {
      this.state = CircuitState.OPEN;
      this.nextAttemptTime = Date.now() + this.options.resetTimeoutMs;
      logger.error(
        `Circuit breaker '${this.name}' OPEN until ${new Date(this.nextAttemptTime).toISOString()}`
      );
    }
  }

  private timeoutPromise(): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Circuit breaker '${this.name}' timeout after ${this.options.timeout}ms`));
      }, this.options.timeout);
    });
  }

  getState(): CircuitState {
    return this.state;
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttemptTime = 0;
    logger.info(`Circuit breaker '${this.name}' manually reset`);
  }
}

/**
 * Decorator for automatic retry with exponential backoff
 */
export function Retryable(options: RetryOptions = {}) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      return retry(() => originalMethod.apply(this, args), options);
    };

    return descriptor;
  };
}
