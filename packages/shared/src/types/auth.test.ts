import { describe, expect, it } from 'vitest';
import {
  ApiErrorBodySchema,
  LoginResponseSchema,
  LoginBodySchema,
  RegisterBodySchema,
  RegisterResponseSchema,
  ExchangeBodySchema,
  ExchangeResponseSchema,
} from './auth.js';

describe('ApiErrorBodySchema', () => {
  it('parses a validation error with details', () => {
    const parsed = ApiErrorBodySchema.parse({
      error: 'Invalid request body',
      code: 'VALIDATION_ERROR',
      details: [{ path: ['max_hr'], message: 'Expected number' }],
    });
    expect(parsed.code).toBe('VALIDATION_ERROR');
  });

  it('parses a plain error with no details', () => {
    const parsed = ApiErrorBodySchema.parse({ error: 'Not found', code: 'GOAL_NOT_FOUND' });
    expect(parsed.details).toBeUndefined();
  });
});

describe('login/register/exchange', () => {
  it('parses a realistic POST /api/login response', () => {
    const parsed = LoginResponseSchema.parse({
      token: 'eyJhbGciOi...',
      user: { id: 42, email: 'd.krikunov@mu.se', created_at: '2026-01-01T00:00:00Z' },
    });
    expect(parsed.user.id).toBe(42);
  });

  it('accepts a valid login body', () => {
    const parsed = LoginBodySchema.parse({ email: 'a@b.com', password: 'x' });
    expect(parsed.email).toBe('a@b.com');
  });

  it('rejects an empty password', () => {
    const result = LoginBodySchema.safeParse({ email: 'a@b.com', password: '' });
    expect(result.success).toBe(false);
  });

  it('parses a realistic POST /api/register response', () => {
    const parsed = RegisterResponseSchema.parse({
      success: true,
      message: 'Registration successful.',
      user: { id: 1, email: 'a@b.com', name: 'A' },
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts a valid register body', () => {
    const parsed = RegisterBodySchema.parse({ email: 'a@b.com', password: 'x', name: 'A' });
    expect(parsed.name).toBe('A');
  });

  it('accepts a valid exchange body and response', () => {
    const body = ExchangeBodySchema.parse({ code: 'one-time-code' });
    expect(body.code).toBe('one-time-code');
    const resp = ExchangeResponseSchema.parse({
      token: 'eyJhbGciOi...',
      user: { id: 1, name: 'A', avatar: null, email: 'a@b.com' },
    });
    expect(resp.token).toBeTruthy();
  });

  it('rejects an empty exchange code', () => {
    const result = ExchangeBodySchema.safeParse({ code: '' });
    expect(result.success).toBe(false);
  });
});
