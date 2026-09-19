// Single place that knows how to send someone to Strava's OAuth screen from
// the app. Previously LoginScreen and StravaIntegrationScreen each built
// their own `strava.com/oauth/authorize` URL — with different scopes and,
// worse, StravaIntegrationScreen's "Connect Strava" used the LOGIN redirect
// (`/exchange_token?mobile=true`), which logs the rider into a *different*
// account instead of attaching Strava to the one they're already in (see
// docs/audit/layers/02-bikelabapp.md A-01, docs/audit/layers/04-cross-layer.md
// §5.8). Both flows also skipped `state` entirely (A-42 — login-CSRF).
//
// Now the server mints the authorize URL (fresh one-time `state`, canonical
// scope) and these two helpers just ask for it and hand it to the OS
// browser via Linking.
import {Linking, DeviceEventEmitter} from 'react-native';
import {api, auth} from '../data/api';
import {logger} from '../lib/logger';

// Event name App.tsx's deep-link handler emits on
// `bikelab://strava-linked?ok=1|0&error=...` — StravaIntegrationScreen
// subscribes to refresh its own profile/status instead of the app touching
// the token or resetting navigation (linking never issues a new session).
export const STRAVA_LINKED_EVENT = 'strava-linked';

export interface StravaLinkedEvent {
  ok: boolean;
  error?: string;
}

export function emitStravaLinked(event: StravaLinkedEvent): void {
  DeviceEventEmitter.emit(STRAVA_LINKED_EVENT, event);
}

// LOGIN flow: creates/finds a user by Strava id. Strava redirects back to
// `bikelab://auth?code=...` (see App.tsx's deep-link handler), which
// exchanges that one-time code for a session JWT via POST /api/auth/exchange.
// Guards against a double tap / double-fired handler: two concurrent
// Linking.openURL calls make the second one fail with "Unable to open URL"
// on iOS, and each call would mint a separate one-time state on the server.
let inFlight: Promise<void> | null = null;

function openOnce(fetchUrl: () => Promise<{url: string}>, label: string): Promise<void> {
  if (inFlight) {
    logger.debug(`🚴 Strava OAuth (${label}) already in progress, ignoring duplicate call`);
    return inFlight;
  }
  inFlight = (async () => {
    try {
      const {url} = await fetchUrl();
      logger.debug(`🚴 Opening Strava OAuth (${label})...`);
      await Linking.openURL(url);
    } finally {
      // Small grace period so a second tap right after the browser opens
      // doesn't start another flow.
      setTimeout(() => {
        inFlight = null;
      }, 1500);
    }
  })();
  return inFlight;
}

export function startStravaLogin(): Promise<void> {
  return openOnce(() => api.call(auth.stravaStart, {query: {client: 'mobile'}}), 'login');
}

// LINK flow: attaches Strava to the currently logged-in account without
// creating/switching accounts. Requires an existing session token — apiFetch
// sends it as Authorization, which is what ties the minted state to
// req.userId on the server. Strava redirects back to
// `bikelab://strava-linked?ok=1|0` (also handled in App.tsx), which does NOT
// touch the token or reset navigation.
export function startStravaLink(): Promise<void> {
  return openOnce(() => api.call(auth.stravaLinkStart, {query: {client: 'mobile'}}), 'link');
}
