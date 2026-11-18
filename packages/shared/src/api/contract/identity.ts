/**
 * Sign-in identities contract (docs/plans/auth-providers.md §3.3): sign in
 * with Apple / Google, and the "sign-in methods" of an account. Backs
 * `server/routes/identity.js`.
 *
 * Both providers hand the client a signed ID token; the client posts it here
 * and gets the same session envelope `POST /api/auth/exchange` returns, plus
 * `isNewUser`. No redirect round-trip, on mobile or on web.
 */
import { z } from 'zod';
import { defineEndpoint } from './define.js';
import { ExchangeResponseSchema } from '../../types/auth.js';

export const IdentityProviderSchema = z.enum(['apple', 'google']);
export type IdentityProvider = z.infer<typeof IdentityProviderSchema>;

// Apple puts the rider's name in the client-side response of the FIRST
// authorization only — never in the token — so the client forwards it.
const AppleFullNameSchema = z
  .object({
    givenName: z.string().nullable().optional(),
    familyName: z.string().nullable().optional(),
  })
  .nullable()
  .optional();

const AppleTokenBodySchema = z.object({
  identityToken: z.string().min(1),
  // The value GET /api/auth/nonce returned, as given to the Apple SDK.
  nonce: z.string().min(1),
  // Lets the server obtain a refresh token, which is what an account
  // deletion needs to revoke the grant on Apple's side.
  authorizationCode: z.string().nullable().optional(),
  fullName: AppleFullNameSchema,
});

const GoogleTokenBodySchema = z.object({
  idToken: z.string().min(1),
  // Optional: not every Google SDK can bind a nonce into the token.
  nonce: z.string().nullable().optional(),
});

const SignInResponseSchema = ExchangeResponseSchema.extend({
  refreshToken: z.string(),
  isNewUser: z.boolean(),
});

// `created_at` leaves the handler as a pg `Date` and reaches the client as a
// string (response validation runs before JSON serialisation).
const SignInMethodsResponseSchema = z.object({
  methods: z.array(
    z.object({
      provider: IdentityProviderSchema,
      email: z.string().nullable(),
      created_at: z.union([z.string(), z.date()]),
    })
  ),
  has_password: z.boolean(),
  // True for an account that can only be reached through Strava login: no
  // identity and no password. Clients ask such a rider to add a method.
  needs_sign_in_method: z.boolean(),
});

export type SignInMethodsResponse = z.infer<typeof SignInMethodsResponseSchema>;

export const identity = {
  providers: defineEndpoint({
    method: 'GET',
    path: '/api/auth/providers',
    response: z.object({ apple: z.boolean(), google: z.boolean() }),
    summary: 'Public: which sign-in providers this server is configured for — clients hide the rest.',
  }),

  nonce: defineEndpoint({
    method: 'GET',
    path: '/api/auth/nonce',
    response: z.object({ nonce: z.string() }),
    summary: 'Public: one-time nonce (10 min) to bind into the provider ID token.',
  }),

  apple: defineEndpoint({
    method: 'POST',
    path: '/api/auth/apple',
    body: AppleTokenBodySchema,
    response: SignInResponseSchema,
    summary: 'Sign in (or sign up) with an Apple identity token.',
  }),

  google: defineEndpoint({
    method: 'POST',
    path: '/api/auth/google',
    body: GoogleTokenBodySchema,
    response: SignInResponseSchema,
    summary: 'Sign in (or sign up) with a Google ID token.',
  }),

  list: defineEndpoint({
    method: 'GET',
    path: '/api/auth/identities',
    response: SignInMethodsResponseSchema,
    auth: true,
  }),

  linkApple: defineEndpoint({
    method: 'POST',
    path: '/api/auth/identities/apple',
    body: AppleTokenBodySchema,
    response: SignInMethodsResponseSchema,
    auth: true,
    summary: 'Attaches an Apple identity to the signed-in account; 409 IDENTITY_TAKEN if it belongs to another.',
  }),

  linkGoogle: defineEndpoint({
    method: 'POST',
    path: '/api/auth/identities/google',
    body: GoogleTokenBodySchema,
    response: SignInMethodsResponseSchema,
    auth: true,
    summary: 'Attaches a Google identity to the signed-in account; 409 IDENTITY_TAKEN if it belongs to another.',
  }),

  unlink: defineEndpoint({
    method: 'DELETE',
    path: '/api/auth/identities/:provider',
    params: z.object({ provider: IdentityProviderSchema }),
    response: SignInMethodsResponseSchema,
    auth: true,
    summary: 'Detaches a sign-in method; 409 LAST_SIGN_IN_METHOD if it is the only one.',
  }),
};
