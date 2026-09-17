import { createApiClient, isApiError as sharedIsApiError } from '@bikelab/shared/api';

// Thin adapter over the shared client (T-2.3, docs/audit/layers/04-cross-layer.md
// §5.7, §5.8, §6.1 row `api/client.ts`). Public surface (`apiFetch`,
// `isApiError`) is unchanged so every existing call site keeps working
// untouched — only the token source (localStorage/sessionStorage) and the
// 401 handling (redirect to /login?session_expired=true) are wired in here.

// True for an Error thrown by apiFetch below (either a real ApiError-shaped
// server response, or the synthetic 401 "session expired" one) — i.e.
// something with a numeric `status` and, usually, a `code`. Lets callers
// branch on `err.status` / `err.code` instead of guessing from `err.message`
// text (see T-1.5, docs/audit/layers/04-cross-layer.md §5.6).
export const isApiError = sharedIsApiError;

function getToken() {
  return localStorage.getItem('token') || sessionStorage.getItem('token');
}

function onUnauthorized() {
  console.warn('🔒 Token expired or invalid. Logging out...');

  // Очищаем токены
  localStorage.removeItem('token');
  sessionStorage.removeItem('token');

  // Редирект на страницу логина
  window.location.href = '/login?session_expired=true';
}

const client = createApiClient({
  // Relative base URL: requests go through the Vite dev proxy (or, in prod,
  // hit the same origin the SPA is served from) — see §5.8.
  baseUrl: '',
  getToken,
  onUnauthorized,
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
