import { describe, expect, it } from 'vitest';
import { ApiError, isApiError, normalizeErrorBody } from './errors.js';

describe('normalizeErrorBody', () => {
  it('reads the current server shape {error, code}', () => {
    expect(normalizeErrorBody({ error: 'Bad request', code: 'VALIDATION_ERROR' }, 400)).toEqual({
      message: 'Bad request',
      code: 'VALIDATION_ERROR',
    });
  });

  it('reads the legacy shape {error: true, message}', () => {
    expect(normalizeErrorBody({ error: true, message: 'Legacy failure' }, 500)).toEqual({
      message: 'Legacy failure',
      code: null,
    });
  });

  it('reads a plain-text body', () => {
    expect(normalizeErrorBody('Gateway Timeout', 504)).toEqual({
      message: 'Gateway Timeout',
      code: null,
    });
  });

  it('falls back to HTTP <status> for an empty body', () => {
    expect(normalizeErrorBody(undefined, 500)).toEqual({ message: 'HTTP 500', code: null });
    expect(normalizeErrorBody({}, 502)).toEqual({ message: 'HTTP 502', code: null });
    expect(normalizeErrorBody(null, 503)).toEqual({ message: 'HTTP 503', code: null });
  });

  it('falls back to HTTP <status> for whitespace-only text', () => {
    expect(normalizeErrorBody('   ', 500)).toEqual({ message: 'HTTP 500', code: null });
  });
});

describe('ApiError', () => {
  it('carries status/code/details and a readable message', () => {
    const err = new ApiError(422, 'Invalid', 'VALIDATION_ERROR', [{ field: 'x' }]);
    expect(err.message).toBe('Invalid');
    expect(err.status).toBe(422);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.details).toEqual([{ field: 'x' }]);
    expect(err.name).toBe('ApiError');
    expect(err).toBeInstanceOf(Error);
  });

  it('defaults code to null', () => {
    const err = new ApiError(500, 'oops');
    expect(err.code).toBeNull();
  });
});

describe('isApiError', () => {
  it('true for ApiError, false for a plain object or generic Error', () => {
    expect(isApiError(new ApiError(404, 'nf'))).toBe(true);
    expect(isApiError(new Error('plain'))).toBe(false);
    expect(isApiError({ status: 404 })).toBe(false);
    expect(isApiError(null)).toBe(false);
  });
});
