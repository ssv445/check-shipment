import { CheckShipmentConfig } from '../types/index.js';
import { isValidUrl } from './url.js';

/**
 * Validation error
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Validate the configuration
 * @param config - Configuration to validate
 * @throws ValidationError if configuration is invalid
 */
export function validateConfig(config: CheckShipmentConfig): void {
  // Validate URL
  if (!config.url) {
    throw new ValidationError('URL is required. Use --url=<url> or add url to config file.');
  }

  if (!isValidUrl(config.url)) {
    throw new ValidationError(`Invalid URL: ${config.url}`);
  }

  // Validate concurrency
  if (config.concurrency !== undefined && (config.concurrency < 1 || config.concurrency > 100)) {
    throw new ValidationError('Concurrency must be between 1 and 100');
  }

  // Validate timeout
  if (config.timeout !== undefined && (config.timeout < 1 || config.timeout > 600)) {
    throw new ValidationError('Timeout must be between 1 and 600 seconds');
  }

  // Validate retry count
  if (config.retryCount !== undefined && (config.retryCount < 0 || config.retryCount > 10)) {
    throw new ValidationError('Retry count must be between 0 and 10');
  }

  // Validate URL replacement
  if (config.replaceFrom && !config.replaceTo) {
    throw new ValidationError('--replaceTo is required when --replaceFrom is specified');
  }

  if (config.replaceTo && !config.replaceFrom) {
    throw new ValidationError('--replaceFrom is required when --replaceTo is specified');
  }

  if (config.replaceFrom && !isValidUrl(config.replaceFrom)) {
    throw new ValidationError(`Invalid replaceFrom URL: ${config.replaceFrom}`);
  }

  if (config.replaceTo && !isValidUrl(config.replaceTo)) {
    throw new ValidationError(`Invalid replaceTo URL: ${config.replaceTo}`);
  }
}
