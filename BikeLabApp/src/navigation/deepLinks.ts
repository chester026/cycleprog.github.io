// Parses and handles the app's OAuth-callback deep links (A-09) — moved out
// of App.tsx's inline `handleDeepLink`, kept behaviorally identical:
//   - `bikelab://oura` is bailed out on immediately. OuraIntegrationScreen
//     owns refreshing its own connection status (see its own
//     Linking.addEventListener) — this just has to not fall into the
//     auth-code branch below and log a spurious "code not found" error.
//   - `bikelab://strava-linked?ok=1|0&error=...` never carries a token —
//     linking Strava to an existing account doesn't touch the session at
//     all — so this just re-emits STRAVA_LINKED_EVENT for
//     StravaIntegrationScreen to pick up.
//   - `bikelab://auth?code=...` / `bikelab.app/auth?code=...` is the LOGIN
//     flow's one-time auth code (see GET /exchange_token on the server —
//     the JWT itself never travels through the URL, see
//     docs/audit/layers/01-server.md S-07), exchanged for a real JWT via
//     POST /api/auth/exchange.
// The same URL can be delivered twice — Linking's 'url' event AND
// getInitialURL() both fire on a cold start opened via deep link —
// `handledDeepLinks` is the exact one-time guard App.tsx used to keep
// module-scoped for this reason; a one-time auth code is single-use
// server-side, so a duplicate delivery must be a no-op, not a second,
// failing exchange call.
//
// RN's own `URL` polyfill (react-native/Libraries/Blob/URL.js) only
// recognizes `https?://` — its `.protocol`/`.hostname`/`.pathname` getters
// all hardcode `https?:` in their regexes and return `''` for a custom
// scheme like `bikelab://...` (verified against the polyfill source in
// node_modules; `new URL(...)` itself doesn't throw, and `.search` /
// `.searchParams` do still work since those getters just look for `?`).
// Since every deep link here uses the custom `bikelab://` scheme, this uses
// a small hand-rolled parser instead — simple enough to unit-test directly
// rather than trust getter-by-getter against a scheme WHATWG URL wasn't
// built for.
import {TokenStorage} from '../utils/api';
import {api, auth, userProfile} from '../data/api';
import {emitStravaLinked} from '../auth/strava';
import {logger} from '../lib/logger';
import {resolvePostAuthRoute} from './resolvePostAuthRoute';
import type {PostAuthRoute} from './resolvePostAuthRoute';

export interface ParsedDeepLink {
  /** Everything before the first `?`, e.g. "bikelab://strava-linked". */
  base: string;
  params: Record<string, string>;
}

export function parseDeepLink(url: string): ParsedDeepLink {
  // Drop a `#fragment` first: iOS has delivered `bikelab://auth?code=…#`
  // style links, and the fragment would otherwise end up glued onto the
  // last param's value (a 65-char auth code the server can't find).
  const hashIndex = url.indexOf('#');
  const withoutFragment = hashIndex === -1 ? url : url.slice(0, hashIndex);
  const qIndex = withoutFragment.indexOf('?');
  const base = qIndex === -1 ? withoutFragment : withoutFragment.slice(0, qIndex);
  const query = qIndex === -1 ? '' : withoutFragment.slice(qIndex + 1);
  const params: Record<string, string> = {};

  if (query) {
    for (const pair of query.split('&')) {
      if (!pair) continue;
      const eqIndex = pair.indexOf('=');
      const rawKey = eqIndex === -1 ? pair : pair.slice(0, eqIndex);
      const rawValue = eqIndex === -1 ? '' : pair.slice(eqIndex + 1);
      if (!rawKey) continue;

      let key = rawKey;
      let value = rawValue;
      try {
        key = decodeURIComponent(rawKey);
      } catch {
        // Malformed % escape in the key — keep the raw text rather than
        // throwing away the whole link over one bad param.
      }
      try {
        value = decodeURIComponent(rawValue);
      } catch {
        // Same for the value.
      }
      params[key] = value.trim();
    }
  }

  return {base, params};
}

export type AuthDeepLinkResult =
  // Same URL already handled once (see `handledDeepLinks` above) — ignore.
  | {type: 'duplicate'}
  // bikelab://oura — OuraIntegrationScreen's own listener owns this.
  | {type: 'oura'}
  // bikelab://strava-linked — STRAVA_LINKED_EVENT already emitted.
  | {type: 'strava-linked'; ok: boolean; error?: string}
  // Auth code exchanged for a session token — caller should reset
  // navigation to `route`.
  | {type: 'auth-success'; route: PostAuthRoute}
  // Looked like an auth deep link but the exchange failed or had no code.
  | {type: 'auth-error'; reason: 'missing-code' | 'exchange-failed'}
  // Not one of the schemes/hosts this app handles.
  | {type: 'ignored'};

const handledDeepLinks = new Set<string>();

export async function handleAuthDeepLink(url: string): Promise<AuthDeepLinkResult> {
  if (handledDeepLinks.has(url)) {
    logger.debug('🔁 [deepLinks] Deep link already handled, skipping:', url);
    return {type: 'duplicate'};
  }
  handledDeepLinks.add(url);
  logger.debug('🔗 [deepLinks] Deep link received:', url);

  if (url.includes('bikelab://oura')) {
    logger.debug('✅ [deepLinks] Oura connect deep link — handled by OuraIntegrationScreen.');
    return {type: 'oura'};
  }

  if (url.includes('bikelab://strava-linked')) {
    logger.debug('✅ [deepLinks] Strava link result deep link detected.');
    const {params} = parseDeepLink(url);
    const ok = params.ok === '1';
    const error = params.error;
    emitStravaLinked({ok, error});
    return {type: 'strava-linked', ok, error};
  }

  if (url.includes('bikelab://') || url.includes('bikelab.app/auth')) {
    logger.debug('✅ [deepLinks] Auth deep link detected.');
    const {params} = parseDeepLink(url);
    const code = params.code;

    if (!code) {
      logger.error('❌ [deepLinks] Auth code not found in URL:', url);
      return {type: 'auth-error', reason: 'missing-code'};
    }

    try {
      const {token} = await api.call(auth.exchange, {body: {code}});
      await TokenStorage.setToken(token, true);

      let route: PostAuthRoute = 'Main';
      try {
        const profile = await api.call(userProfile.get);
        route = resolvePostAuthRoute(profile);
      } catch {
        // Profile fetch failed right after a successful token exchange —
        // fall back to Main, same as App.tsx's inline handler used to.
      }
      return {type: 'auth-success', route};
    } catch (error) {
      logger.error('❌ [deepLinks] Error processing deep link:', error);
      return {type: 'auth-error', reason: 'exchange-failed'};
    }
  }

  logger.debug('ℹ️ [deepLinks] Not a recognized deep link, ignoring:', url);
  return {type: 'ignored'};
}
