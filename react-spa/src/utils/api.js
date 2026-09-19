import { createApiClient, callEndpoint, isApiError as sharedIsApiError } from '@bikelab/shared/api';

// Thin adapter over the shared client (T-2.3, docs/audit/layers/04-cross-layer.md
// §5.7, §5.8, §6.1 row `api/client.ts`). Public surface (`apiFetch`,
// `isApiError`) is unchanged so every existing call site keeps working
// untouched — only the token source and the 401/refresh handling changed
// (T-6.1, W-03/W-24/W-25): this file no longer knows where tokens live at
// all, `AuthProvider.jsx` does, and wires itself in via `setAuthHandlers`.
export const isApiError = sharedIsApiError;

// Mutable handlers, replaced wholesale by AuthProvider once it mounts.
// Until then (module import time, before any React tree renders) these are
// safe no-ops — there's no token yet, so no request needs them.
let handlers = {
  getToken: () => null,
  getRefreshToken: () => null,
  onTokens: () => {},
  onRefreshFailed: () => {},
  onUnauthorized: () => {},
};

// Called once by AuthProvider (see src/auth/AuthProvider.jsx) to hand this
// module live references to its token storage/refresh/redirect logic. Kept
// as a plain module-level object (not a React context) because `apiFetch`
// itself is called from plain functions outside any component (utils/*.js).
export function setAuthHandlers(next) {
  handlers = { ...handlers, ...next };
}

const client = createApiClient({
  // Relative base URL: requests go through the Vite dev proxy (or, in prod,
  // hit the same origin the SPA is served from) — see §5.8.
  baseUrl: '',
  getToken: () => handlers.getToken(),
  // 401 → one refresh attempt → retry (see packages/shared/src/api/client.ts
  // RefreshOptions). Only reached when there's no refresh token to try, or
  // the refresh call itself fails.
  refresh: {
    getRefreshToken: () => handlers.getRefreshToken(),
    onTokens: (token, refreshToken) => handlers.onTokens(token, refreshToken),
    onRefreshFailed: (err) => handlers.onRefreshFailed(err),
  },
  onUnauthorized: (err) => handlers.onUnauthorized(err),
  // Validate response shapes against shared zod schemas in dev only; a
  // schema drift shouldn't 500 a production page for end users.
  validateResponses: Boolean(import.meta.env && import.meta.env.DEV),
});

export async function apiFetch(url, options = {}) {
  const { silent404, ...rest } = options;
  try {
    return await client.request(url, rest);
  } catch (err) {
    const isSilent404 = silent404 && isApiError(err) && err.status === 404;
    if (!isSilent404) {
      console.error('❌ API Error:', err.message, err.code ? `(${err.code})` : '');
    }
    throw err;
  }
}

// T-7.1: typed entry point for the API contract (`@bikelab/shared/api`'s
// per-domain endpoint maps + `callEndpoint`). Hooks/pages should call
// `call(goals.list, {...})` instead of `apiFetch('/api/goals')` — the path
// string lives once, in the contract def, and the input/response are
// validated against its zod schemas. Re-exported (with the domain maps)
// from `src/data/api.js` so call sites only import one module. `apiFetch`
// stays for the handful of call sites the contract deliberately excludes
// (SSE coach chat stream, the strava-image proxy) — see that file's header.
export function call(def, input, opts = {}) {
  const { silent404, ...rest } = opts;
  return callEndpoint(client, def, input, rest).catch((err) => {
    const isSilent404 = silent404 && isApiError(err) && err.status === 404;
    if (!isSilent404) {
      console.error('❌ API Error:', err.message, err.code ? `(${err.code})` : '');
    }
    throw err;
  });
}
