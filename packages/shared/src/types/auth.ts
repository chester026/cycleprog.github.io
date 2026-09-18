import { z } from 'zod';

// Unified error body every server route error path renders (server/
// middleware/errorHandler.js) — { error: <message>, code: <UPPER_SNAKE>,
// [details] }. `details` is only ever present for validation errors (an
// array of per-field problems).
export const ApiErrorBodySchema = z.object({
  error: z.string(),
  code: z.string(),
  details: z.unknown().optional(),
});

export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>;

// POST /api/login response (server/server.js).
export const LoginResponseSchema = z.object({
  token: z.string(),
  user: z
    .object({
      id: z.union([z.number(), z.string()]),
      email: z.string().nullable().optional(),
      created_at: z.string().optional(),
    })
    .passthrough(),
});

export type LoginResponse = z.infer<typeof LoginResponseSchema>;

// POST /api/login request body.
export const LoginBodySchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});

export type LoginBody = z.infer<typeof LoginBodySchema>;

// POST /api/register request body.
export const RegisterBodySchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
  name: z.string().optional(),
});

export type RegisterBody = z.infer<typeof RegisterBodySchema>;

// POST /api/register response (server/server.js).
export const RegisterResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  user: z
    .object({
      id: z.union([z.number(), z.string()]),
      email: z.string(),
      name: z.string().nullable().optional(),
    })
    .passthrough(),
});

export type RegisterResponse = z.infer<typeof RegisterResponseSchema>;

// POST /api/auth/exchange request body — the one-time auth code minted by
// /exchange_token or /link_strava after a Strava OAuth round-trip (T-0.4,
// docs/audit/00-AUDIT-AND-PLAN.md S-07). Never a session JWT.
export const ExchangeBodySchema = z.object({
  code: z.string().min(1),
});

export type ExchangeBody = z.infer<typeof ExchangeBodySchema>;

// POST /api/auth/exchange response (server/server.js).
export const ExchangeResponseSchema = z.object({
  token: z.string(),
  user: z
    .object({
      id: z.union([z.number(), z.string()]),
      name: z.string().nullable().optional(),
      avatar: z.string().nullable().optional(),
      email: z.string().nullable().optional(),
    })
    .passthrough(),
});

export type ExchangeResponse = z.infer<typeof ExchangeResponseSchema>;
