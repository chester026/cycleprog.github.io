// Single place that knows how to send someone to Strava's OAuth screen from
// the app. The server mints the authorize URL (fresh one-time `state`,
// canonical scope) and the helper here just asks for it and hands it to the
// OS browser via Linking — the app never builds a `strava.com/oauth/authorize`
// URL itself (docs/audit/layers/02-bikelabapp.md A-01, A-42).
//
// Only the LINK flow is left: signing in with Strava left the app's login
// screen (owner, 18.11.2026) — riders sign in with Apple, Google or email
// and connect Strava inside (docs/plans/auth-providers.md).
import {Linking} from 'react-native';
import {api, auth} from '../data/api';
import {logger} from '../lib/logger';

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

// LINK flow: attaches Strava to the currently logged-in account without
// creating/switching accounts. Requires an existing session token — apiFetch
// sends it as Authorization, which is what ties the minted state to
// req.userId on the server. Strava redirects back to
// `bikelab://strava-linked?ok=1|0` (navigation/deepLinks.ts →
// ./stravaLinkResult.ts), which does NOT touch the token or reset navigation
// — unless the server merged this account into the athlete's existing one.
export function startStravaLink(): Promise<void> {
  return openOnce(() => api.call(auth.stravaLinkStart, {query: {client: 'mobile'}}), 'link');
}
