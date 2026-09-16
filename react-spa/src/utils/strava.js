// Single place that knows how to send someone to Strava's OAuth screen.
// Previously 5 different pages each built their own
// `strava.com/oauth/authorize` URL with their own scope (some missing
// `profile:read_all`, so name/avatar never came back) — see
// docs/audit/layers/03-react-spa.md W-28. Now the server mints the URL
// (fresh one-time `state`, canonical scope) and these two helpers just ask
// for it and navigate there.
import { apiFetch } from './api';

// LOGIN flow: creates/finds a user by Strava id and, after the redirect back
// through /exchange_token, hands the SPA a one-time code (see
// ExchangeTokenPage.jsx) to exchange for a session JWT.
export async function startStravaLogin() {
  const { url } = await apiFetch('/api/auth/strava/start?client=web');
  window.location.href = url;
}

// LINK flow: attaches Strava to the currently logged-in account without
// creating/switching accounts (requires an existing session token, so
// apiFetch's Authorization header is what ties the mint to `req.userId` on
// the server). `popup: true` opens a popup window instead of a full
// navigation, for OnboardingModal's in-place flow.
export async function startStravaLink({ popup = false } = {}) {
  const { url } = await apiFetch('/api/auth/strava/link-start?client=web');
  if (popup) {
    return window.open(url, 'strava-auth', 'width=600,height=600');
  }
  window.location.href = url;
  return null;
}
