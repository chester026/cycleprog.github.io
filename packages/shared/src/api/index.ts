/**
 * Shared API contract pieces. Grows as T-2.3/T-7.1 add endpoints/client/errors.
 */
export const API_ERROR_CODES = [
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'VALIDATION_ERROR',
  'RATE_LIMITED',
  'INTERNAL'
] as const;

export * from './errors.js';
export * from './client.js';
export * from './endpoints.js';
export * from './contract/index.js';
