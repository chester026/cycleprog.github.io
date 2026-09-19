/**
 * User-profile domain contract (T-7.1). Backs `server/routes/userProfile.js`
 * — GET/PUT /api/user-profile, POST .../onboarding, POST .../email.
 * Request/response bodies reuse `types/profile.ts`'s existing zod schemas,
 * which already document the T-3.1 `hr_zones` derived-only rule.
 */
import { z } from 'zod';
import { defineEndpoint } from './define.js';
import { UserProfileSchema, UserProfileUpdateSchema, OnboardingBodySchema } from '../../types/profile.js';

export const userProfile = {
  get: defineEndpoint({
    method: 'GET',
    path: '/api/user-profile',
    response: UserProfileSchema,
    auth: true,
  }),

  update: defineEndpoint({
    method: 'PUT',
    path: '/api/user-profile',
    body: UserProfileUpdateSchema,
    response: UserProfileSchema,
    auth: true,
  }),

  onboarding: defineEndpoint({
    method: 'POST',
    path: '/api/user-profile/onboarding',
    body: OnboardingBodySchema,
    response: UserProfileSchema,
    auth: true,
  }),

  changeEmail: defineEndpoint({
    method: 'POST',
    path: '/api/user-profile/email',
    // Tolerant on purpose (T-4.5): the actual format/normalisation/conflict
    // check lives in services/auth.js's changeEmail, which throws
    // InvalidEmailError (→ 400 VALIDATION_ERROR) for anything that isn't a
    // real address, including a missing/empty field — the contract only
    // needs to keep the field's TYPE honest.
    body: z.object({ email: z.union([z.string(), z.null()]).optional() }).passthrough(),
    response: z.object({ success: z.boolean(), message: z.string(), token: z.string() }),
    auth: true,
  }),
};
