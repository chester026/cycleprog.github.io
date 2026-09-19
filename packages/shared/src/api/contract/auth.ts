/**
 * Auth domain contract (T-7.1): register/login/verify-email/resend-
 * verification, forgot/reset password, refresh-token rotation, logout(-all),
 * Strava OAuth start/link-start/exchange, and legacy unlink_strava. Backs
 * `server/routes/auth.js`.
 *
 * Response shapes are read off the handlers in server/routes/auth.js
 * directly (see that file) — most already have a shared `types/auth.ts`
 * schema; where a route also returns an additive `refreshToken` (S-14) the
 * existing schema is `.extend()`ed rather than duplicated.
 */
import { z } from 'zod';
import { defineEndpoint } from './define.js';
import {
  LoginBodySchema,
  LoginResponseSchema,
  RegisterBodySchema,
  RegisterResponseSchema,
  ExchangeBodySchema,
  ExchangeResponseSchema,
} from '../../types/auth.js';

// Additive `refreshToken` (S-14) on both /login and /auth/exchange — old
// clients that don't know about it simply ignore the extra field.
const LoginResponseWithRefreshSchema = LoginResponseSchema.extend({ refreshToken: z.string() });
const ExchangeResponseWithRefreshSchema = ExchangeResponseSchema.extend({ refreshToken: z.string() });

const MessageResponseSchema = z.object({ message: z.string() });
const SuccessResponseSchema = z.object({ success: z.boolean() });

// GET /api/auth/strava/start and /api/auth/strava/link-start both take the
// same `client` query flag ('mobile' picks the mobile redirect_uri branch —
// see buildStravaAuthorizeUrl callers in routes/auth.js — anything else,
// including absent, behaves as 'web').
const StravaClientQuerySchema = z.object({ client: z.string().optional() });
const StravaAuthorizeUrlResponseSchema = z.object({ url: z.string() });

export const auth = {
  login: defineEndpoint({
    method: 'POST',
    path: '/api/login',
    body: LoginBodySchema,
    response: LoginResponseWithRefreshSchema,
    summary: 'Email/password login; also mints a refresh token (S-14).',
  }),

  register: defineEndpoint({
    method: 'POST',
    path: '/api/register',
    body: RegisterBodySchema,
    response: RegisterResponseSchema,
  }),

  verifyEmail: defineEndpoint({
    method: 'GET',
    path: '/api/verify-email',
    query: z.object({ token: z.string() }),
    response: MessageResponseSchema,
  }),

  resendVerification: defineEndpoint({
    method: 'POST',
    path: '/api/resend-verification',
    body: z.object({ email: z.string() }),
    response: MessageResponseSchema,
  }),

  forgotPassword: defineEndpoint({
    method: 'POST',
    path: '/api/forgot-password',
    body: z.object({ email: z.string() }),
    response: MessageResponseSchema,
    summary: 'Always 200 — no user enumeration (A-05).',
  }),

  resetPassword: defineEndpoint({
    method: 'POST',
    path: '/api/reset-password',
    body: z.object({ token: z.string(), password: z.string() }),
    response: MessageResponseSchema,
  }),

  stravaStart: defineEndpoint({
    method: 'GET',
    path: '/api/auth/strava/start',
    query: StravaClientQuerySchema,
    response: StravaAuthorizeUrlResponseSchema,
    summary: 'Public: mints a one-time state and returns the Strava authorize URL for login.',
  }),

  stravaLinkStart: defineEndpoint({
    method: 'GET',
    path: '/api/auth/strava/link-start',
    query: StravaClientQuerySchema,
    response: StravaAuthorizeUrlResponseSchema,
    auth: true,
    summary: 'Attaches Strava to the already-logged-in caller without switching accounts.',
  }),

  exchange: defineEndpoint({
    method: 'POST',
    path: '/api/auth/exchange',
    body: ExchangeBodySchema,
    response: ExchangeResponseWithRefreshSchema,
    summary: 'Trades the one-time auth code (S-07) for a session JWT + refresh token.',
  }),

  refresh: defineEndpoint({
    method: 'POST',
    path: '/api/auth/refresh',
    body: z.object({ refreshToken: z.string() }),
    response: z.object({ token: z.string(), refreshToken: z.string() }),
    summary: 'Rotates a refresh token (S-14); no authMiddleware — the refresh token IS the credential.',
  }),

  logout: defineEndpoint({
    method: 'POST',
    path: '/api/auth/logout',
    // Tolerant: the handler reads `req.body || {}` and no-ops on an unknown
    // token rather than rejecting it, so `refreshToken` is optional here too.
    body: z.object({ refreshToken: z.string().optional() }).passthrough(),
    response: SuccessResponseSchema,
  }),

  logoutAll: defineEndpoint({
    method: 'POST',
    path: '/api/auth/logout-all',
    response: SuccessResponseSchema,
    auth: true,
    summary: 'Bumps token_version (S-13) — invalidates every access/refresh token for this user.',
  }),

  unlinkStrava: defineEndpoint({
    method: 'POST',
    path: '/api/unlink_strava',
    response: z.object({ token: z.string() }),
    auth: true,
    summary: 'Legacy snake_case path, kept as-is (see define.ts header — no renames pre-LEGACY_MOBILE_COMPAT removal).',
  }),
};
