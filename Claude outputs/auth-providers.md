# Sign-in with Apple / Google; Strava becomes an integration — Transition Plan

**Date:** 2026-11-18 · **Scope:** all three layers. The account stops being "a Strava athlete": a rider signs in with
Apple or Google (email + password stays), and Strava is connected afterwards like Oura and Garmin — offered during
onboarding and under Integrations. **Not** in scope: changing what Strava data is used for, the Strava sync code, or
moving Strava tokens out of `users` (they stay where they are; only their *meaning* changes from identity to
connection).

## 0. Owner decisions

| Date | Topic | Decision |
|---|---|---|
| 2026-10 | Sign in with Apple | Wanted, "later" (audit decisions). |
| 2026-11-18 | Direction | Move authorization off Strava. Apple + Google sign-in; Strava becomes an integration connected after sign-in. |
| 2026-11-18 | Email + password | Stays as the third sign-in option (also the App Review demo login). |
| 2026-11-18 | Strava login for existing riders | ~~Find-only "Signed in with Strava before?" link stays until Strava-only accounts have moved.~~ Superseded the same day for the app: **no Strava link on the app's login screen.** A rider who used Strava signs in with Apple or Google and connects Strava inside; the merge (§3.5) puts him into his old account. The web's login is decided with phase 4. |
| 2026-11-18 | App login screen | Logo, title, Apple and Google buttons (one pill shape and height), then "Sign In with Email" — a button that opens a full-screen form. No email fields on the screen itself. |
| 2026-11-18 | Google library | Chosen among the existing libraries, no custom native module: `@react-native-google-signin/google-signin` free build for the iOS release; revisit before Android. |
| 2026-11-18 | Ride source at onboarding | Offered, skippable. |
| 2026-11-18 | Name and avatar | Taken from the sign-in provider when it has them (Google: name + picture; Apple: name only, no picture). Connecting Strava passes its name/avatar through where the account has none. |
| 2026-11-18 | Order | **App first, web after.** Server + mobile are built and tested locally; the web (both buttons, its empty states, its onboarding step) starts only when the app side is finished. |
| 2026-11-18 | No ride source in the app | Offered in onboarding; for a rider who skipped it, the Garage's last-ride hero card shows a "connect a ride source" banner — same card size, as an empty state. |
| 2026-11-18 | Garage without a ride source | Shows the top card with the banner and nothing else — every other block is hidden until a source is connected. |
| 2026-11-18 | Two accounts that both hold data | No owner preference — the simple behaviour: a clear message, no automatic merge, no chooser screen. Revisit only if it actually happens. |

## Status (2026-11-18)

| Phase | State |
|---|---|
| 0 Owner setup | ✅ for the app. Sign in with Apple entitlement in `BikeLabApp.entitlements`; `server/.env` holds `APPLE_BUNDLE_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, `GOOGLE_CLIENT_IDS`, `IDENTITY_TOKEN_ENC_KEY` — checked: both providers report configured and the `.p8` key signs a client secret. ⏳ for the web and the release (§8). |
| 1 Server identities | ✅ In the working tree, not committed, not deployed. Migration `1758000000024_user-identities.sql`; `lib/secretBox.js`; `lib/oauthState.js` (`createNonce` / `consumeNonce`); `services/identity/{jwks,verify,apple,google,accounts}.js`; `repositories/identities.js`; `routes/identity.js`; contract `packages/shared/src/api/contract/identity.ts`; Apple revoke wired into `DELETE /api/account` and the admin delete. Tests: `test/integration/identity.test.js` (33), unit `test/identity.*.test.js` + `test/secretBox.test.js` (16), contract (5). Verified with locally signed tokens; a real Google token from the simulator passed signature, issuer and audience against Google's live keys (2026-11-18); Apple's keys could not be fetched from the agent's sandbox — the first real Apple sign-in from the app is its test. |
| 2 Strava-less account (server + app) | Server ✅ — smaller than this plan assumed: the list endpoints already answered an account without Strava with empty results. Changed: the per-ride routes (`/api/activities/:id`, `/streams`, `/ftp-analysis`) answer 409 instead of 401; Strava fills name/avatar instead of replacing them (`repositories/users.js`); `GET /api/achievements/me` no longer returns `NaN` for an empty catalogue. `test/integration/noRideSource.test.js` walks every parameterless GET of the contract as such a rider: no 401, no 5xx. App ✅ in the working tree: `Garage/LastRideHero.tsx` takes `onConnectSource` and becomes the "connect your rides" state at the same size; `GarageScreen.tsx` renders nothing below it while the account has no Strava; onboarding has a fourth step, `Onboarding/Step4RideSource.tsx` (always shown — it reads "connected" for a rider who already has Strava, rather than being skipped as first planned). The result of the Strava round-trip is handled in one place for the whole app, `auth/stravaLinkResult.ts` (the per-screen `DeviceEventEmitter` listener is gone). Not seen on a device yet. |
| 3 Mobile sign-in | Sign-in itself ✅ in the working tree: `src/auth/identity.ts`, `src/data/hooks/useAuthProviders.ts`, `src/screens/Login/SocialSignIn.tsx`, `LoginScreen.tsx` (Apple, Google, then a "Sign In with Email" button that opens the full-screen `Login/EmailSignInModal.tsx`; the Strava link and `startStravaLogin()` are gone from the app; the logo is `assets/img/logo/SignLogo.tsx`, drawn from the owner's `signlogo.svg`), Google URL scheme in `Info.plist`, `GIDSignIn` forwarding in `AppDelegate.swift`. Typecheck and jest (513) pass, eslint is clean for the changed files (one older warning in `RideAnalyticsScreen.tsx` keeps `--max-warnings 0` red on `main`); **the iOS build itself has not been run** — owner: `npm install` + `pod install`, then build. Merge on Strava connect (§3.5) ✅: `services/accountMerge.js`, `repositories/accountMerge.js`, `/link_strava` hands the app `bikelab://strava-linked?ok=1&code=…`, `deepLinks.ts` drops the query cache and swaps the session; a refusal carries `reason=another_account` and the Strava screen says so. Offered to the app only — the web keeps the plain refusal until phase 4. A password moves only together with its address and only into an account that has none; otherwise no merge. `test/integration/accountMerge.test.js` (8). ⏳ still: the sheet for existing riders, Sign-in methods in Account settings. |
| 4 Web · 5 Cutover · 6 Cleanup | ⏳ |

Where phase 1 ended up different from the first draft of this plan (the sections below are updated to match):
- **No new dependency.** ID tokens are verified with the existing `jsonwebtoken` plus Node's own JWK import, not `jose`.
- **Nothing on another account is changed at sign-in.** An unverified address held by another row is not released; the new account simply starts without `users.email` (§3.4).
- **Google's nonce is optional** — the free React Native Google library cannot bind one into the token; Apple's is mandatory.
- **`user_identities.client_id`** added: Apple's revoke must name the audience the token was issued for.
- **Apple's server-to-server notifications endpoint is not built yet** — it belongs with the release steps (phase 5).
- **`GET /api/auth/providers`** added so clients hide a button the server is not configured for.

Found on the way, not touched: with `CONTRACT_VALIDATE_RESPONSES=1` two integration tests fail on `main` as it is (`userProfile.test.js` "PUT stores a rider-set FTP…", `ridePowerInsights.test.js` "without a Strava link…") — both pass without the flag, so two responses no longer match their contract.

## 1. Where the code is today (read 2026-11-18, `main` @ 4d283ee)

| Area | State |
|---|---|
| Ways to get a session | (a) Strava OAuth — `GET /api/auth/strava/start` → Strava → `GET /exchange_token` → `findOrCreateStravaUser` → one-time auth code → `POST /api/auth/exchange`. (b) Email + password — `/api/register`, `/api/verify-email`, `/api/login`, forgot/reset. (c) Store build only: state-less `?mobile=true` Strava login behind `LEGACY_MOBILE_COMPAT`. |
| Already an "integration" flow | `GET /api/auth/strava/link-start` → `GET /link_strava` → `linkStravaAccount` attaches Strava to the signed-in user; `POST /api/unlink_strava` deauthorizes and deletes mirrored rides/bikes. Refuses when the athlete belongs to another user (`StravaAlreadyLinkedError`). |
| Identity storage | Columns on `users`: `email` (UNIQUE), `password_hash`, `email_verified`, `strava_id` (live link), `strava_athlete_id` (permanent anchor, survives unlink). No table for external identities. |
| Session | `lib/jwt.js` `issueSessionToken` — claims `userId, email, strava_id, name, avatar, tv`. Refresh tokens with rotation and reuse detection, `token_version` kill switch, one-time `auth_codes`, one-time `oauth_states`. All reusable as is. |
| A rider without Strava | Mostly fine on the server (corrected 2026-11-18 after walking the API as such a rider): lists and aggregates already answer with empty results. Only the per-ride routes answered **401** `STRAVA_NOT_LINKED`, which both clients read as "session dead" (the known follow-up from the web plan) — now 409. What is missing is on the clients: No "connect your rides" step in onboarding; mobile onboarding has 3 steps, web adds a 4th for email/Strava. |
| Name / avatar | Written by Strava login and link (`updateStravaLoginFields`, `linkStravaToUser`); unlink sets `avatar = NULL`. |
| Mobile | `LoginScreen.tsx` = "Connect with Strava" + email form. `auth/strava.ts`, `navigation/deepLinks.ts` (`bikelab://auth?code=`, `bikelab://strava-linked`). iOS bundle `com.bikelab.app`; entitlements have associated domains + HealthKit, **no Sign in with Apple**. Android `com.bikelabapp`, not shipped. RN 0.83.1. No auth SDK installed. |
| Web | `LoginPage.jsx` = "Sign in with Strava" + email form; `RegisterPage`, `ExchangeTokenPage`; `utils/strava.js`; `IntegrationsCard.jsx`. Helmet runs with CSP off, so provider scripts load without header work. |
| Account deletion | `DELETE /api/account` deauthorizes Strava, then cascades. Nothing provider-side to revoke besides Strava. |
| Garmin Edge app | Device tokens are bound to `userId` (`aud: garmin`) — independent of how the rider signed in. Unaffected. |
| Database | One Postgres shared by the owner's local server and production. Every migration here is additive and runs once, deliberately. |

## 2. Target

```
 Sign in                     Account (users.id)                 Integrations (connected after sign-in)
 ─────────                   ──────────────────                 ───────────────────────────────────────
 Apple   ─┐                                                     Strava   rides, garage      (users.strava_*)
 Google  ─┼─ user_identities ─►  one BikeLab account  ◄──────── Garmin   rides, health      (garmin_connections)
 Email   ─┘  (+ password_hash)                                  Oura     recovery           (users.oura_*)
                                                                Apple Health  recovery      (on device)
 Strava is not a way in on the app's login screen; an old Strava account is reached by connecting Strava (§3.5, §5)
```

Rules that follow from it:

1. A session never depends on Strava. Every Strava-backed endpoint has a defined answer for "not connected" that is
   not 401.
2. A rider can hold several sign-in methods and must always keep at least one.
3. Nobody loses an account: every existing Strava-only rider has a path to attach Apple/Google to the account they
   already have (§5).
4. Additive API only while the store build is alive — no renamed paths or fields (standing rule).

## 3. Server

### 3.1 Storage — migration `1758000000024_user-identities.sql`

```sql
CREATE TABLE IF NOT EXISTS user_identities (
  id               BIGSERIAL PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider         TEXT NOT NULL CHECK (provider IN ('apple', 'google')),
  provider_user_id TEXT NOT NULL,              -- the token's `sub`; never the email
  email            TEXT,                       -- as the provider reported it (may be an Apple relay address)
  email_verified   BOOLEAN NOT NULL DEFAULT FALSE,
  client_id        TEXT,                       -- the token's audience; Apple's revoke must be called with the same one
  refresh_token    TEXT,                       -- Apple only, encrypted; needed to revoke on account deletion
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at    TIMESTAMPTZ,
  UNIQUE (provider, provider_user_id),
  UNIQUE (user_id, provider)                   -- one Apple and one Google per account
);
```

Same migration: `ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_source TEXT`, backfilled to `'strava'` wherever
an avatar exists (Strava was the only writer of the column; see §3.6). `oauth_states` gets rows with purpose
`'idtoken'` (one-time nonce, §3.2) — no schema change. Strava's own columns on `users` are not touched.

### 3.2 Verifying a provider token — `services/identity/{apple,google,verify}.js`

Both providers hand the client a signed ID token (JWT); the client posts it and the server verifies it — no redirect
round-trip, on mobile or on web. No new dependency: `services/identity/jwks.js` fetches and caches the provider's
keys (6 h; an unknown `kid` refetches at most once a minute), Node imports the JWK, and the existing `jsonwebtoken`
verifies RS256, issuer, audience and expiry (`services/identity/verify.js`).

| | Apple | Google |
|---|---|---|
| Keys | `https://appleid.apple.com/auth/keys` | `https://www.googleapis.com/oauth2/v3/certs` |
| `iss` | `https://appleid.apple.com` | `https://accounts.google.com` or `accounts.google.com` |
| `aud` | `APPLE_BUNDLE_ID` (native) or `APPLE_SERVICES_ID` (web) | one of `GOOGLE_CLIENT_IDS` (web, iOS, later Android) |
| Nonce | token carries SHA-256 of the raw nonce | token carries the nonce as sent |
| Email | always verified; may be `…@privaterelay.appleid.com` | trust only when `email_verified` is true |
| Name | **only in the first sign-in's client payload**, never in the token — the client forwards it, the server stores it then | `name`, `picture` claims |

Nonce: `GET /api/auth/nonce` mints a one-time value in `oauth_states` (purpose `idtoken`, 10 min); the client passes
it to the SDK and posts it with the token; the server spends it before looking at the token. **Apple: mandatory**
(the native SDK sends Apple the SHA-256 of it, the web SDK the value itself — both forms match). **Google:
optional** — the free `@react-native-google-signin` build cannot bind ours, and Google's iOS SDK puts a nonce of its
own making into every token (seen on the first real sign-in, 2026-11-18: refusing "a nonce the client did not send"
rejected every real token). So the nonce is compared only when the client sent one; without it the token stands on
signature/`iss`/`aud`/`exp`.

Apple additionally: exchange the `authorizationCode` at `POST https://appleid.apple.com/auth/token` to get a refresh
token (stored AES-256-GCM-sealed in `user_identities.refresh_token`, `lib/secretBox.js`) — it is what
`POST /auth/revoke` needs when the account is deleted. The client secret is an ES256 JWT signed with the `.p8` key.
All of it is best-effort and optional: without the key or `IDENTITY_TOKEN_ENC_KEY` sign-in still works, there is
just nothing to revoke later.

### 3.3 Endpoints (contract in `packages/shared/src/api/contract/identity.ts`, all additive)

| Endpoint | Auth | Does |
|---|---|---|
| `GET /api/auth/providers` | public | `{apple, google}` — which providers this server is configured for |
| `GET /api/auth/nonce` | public | `{nonce}` |
| `POST /api/auth/apple` `{identityToken, nonce, authorizationCode?, fullName?}` | public, `authLimiter` | verify → resolve account (§3.4) → `{token, refreshToken, user, isNewUser}` — the `/api/auth/exchange` envelope plus `isNewUser` |
| `POST /api/auth/google` `{idToken, nonce?}` | public, `authLimiter` | same |
| `GET /api/auth/identities` | session | `{methods: [{provider, email, created_at}], has_password, needs_sign_in_method}`. `has_password` means "can sign in with a password" (hash **and** a verified address); `needs_sign_in_method` is true for an account reachable only through Strava login |
| `POST /api/auth/identities/apple` · `/google` | session | attach to the current account (idempotent); 409 `IDENTITY_TAKEN` if it belongs to another account, 409 `PROVIDER_ALREADY_LINKED` if the account already has a different identity of that provider. Fills a missing name and a missing address |
| `DELETE /api/auth/identities/:provider` | session | detach; 409 `LAST_SIGN_IN_METHOD` if nothing else is left (Strava does not count as a method); revokes the Apple grant |
| `POST /api/auth/apple/notifications` | Apple-signed JWT | **Not built yet (phase 5).** Server-to-server events: `consent-revoked` / `account-delete` → drop the identity; `email-disabled/enabled` → flag |

Errors: 401 `INVALID_NONCE`, 401 `INVALID_ID_TOKEN`, 503 `PROVIDER_NOT_CONFIGURED`, 503 `UPSTREAM_ERROR` (provider keys unreachable).

`POST /api/unlink_strava` gets the same guard — a Strava-only account (no identity, no password) cannot disconnect
Strava until it adds a sign-in method — but **only in Phase 6**, together with the removal of the Strava "restore"
link. Until then a rider who disconnects can still come back through Strava (`strava_athlete_id` reunites him, as
today), and the store build, which has no way to add a sign-in method, must keep its Disconnect button working.

### 3.4 Which account a verified token resolves to

In order; the first match wins.

1. `(provider, sub)` exists in `user_identities` → that user.
2. The token's email is provider-verified **and** equals a `users.email` that is itself `email_verified` → attach the
   identity to that user. Both sides verified, or no match: an address someone merely typed into a profile is not
   proof of anything.
3. Otherwise a new user (`password_hash` NULL, name from the payload, Google's picture as avatar). No existing row
   is ever changed here: if the address is already held by another account — verified or not — the new account
   starts with `users.email` NULL and only the identity row records the address. (An earlier draft released an
   unverified claim; dropped — it could lock out a password account whose owner mistyped an address.)

Apple relay addresses never match in step 2 — expected; §5 path C reunites those riders.

### 3.5 Strava connect: merge instead of refuse

`GET /link_strava` today answers "already linked to another user" when the athlete's `strava_athlete_id` sits on a
different account. After this plan that is the normal case for an existing rider who tapped "Sign in with Apple" on a
new phone and got a fresh, empty account. New behaviour in `services/auth.js` `linkStravaAccount`:

- Conflict + the signed-in account is **empty** (no Strava or Oura ever, and no row in goals, meta_goals,
  coach_conversations, coach_notes, calendar_events, events, rides, checklist, user_images, custom_training_plans,
  race_courses, garmin_connections, garmin_devices — what onboarding itself leaves behind does not count: the
  profile row and the four default goals, `DEFAULT_GOAL_TEMPLATES` in `services/userProfile.js`; counting those
  goals refused the very first real merge, 2026-11-18): move its
  `user_identities` rows (and `email` + `password_hash` if the older account has no address) to the Strava-owning
  account, delete the empty one, mint a one-time auth code for the survivor. No merge when the two accounts hold an
  identity of the same provider, or when a password could not move with its address.
  Mobile: `bikelab://strava-linked?ok=1&code=…`; web: result page posts `{type:'strava-linked', code}`. The client
  exchanges the code and swaps session — the existing `/api/auth/exchange` path.
- Conflict + the signed-in account has data of its own: no automatic merge. Answer `STRAVA_BELONGS_TO_ANOTHER_ACCOUNT`
  with a clear message; resolved by hand until it proves common enough to need a chooser (decision 6).

Why this is safe: completing Strava OAuth proves control of the older account — it is exactly how that account has
been authenticated until now — and the live session proves control of the Apple/Google identity. One transaction,
integration-tested both ways.

### 3.6 Strava-less account becomes first-class

| Endpoint group | Today | Target |
|---|---|---|
| `GET /api/activities` (list) | already 200 `[]` | — |
| `GET /api/activities/:id`, `/streams`, analysis routes | 401 / 404 mix | 409 `STRAVA_NOT_LINKED` (never 401 — 401 means "session dead" to both clients) |
| Bikes / garage, analytics, snapshots, achievements, coach tools that read rides | audit each | empty result, no throw; the coach is told "no ride source connected" the same way it is told about missing health data |
| `GET /api/user-profile` | has `strava_id` | unchanged for now. `ride_sources` waits until the app actually reads Garmin rides — until then "no ride source" and "no Strava" are the same thing to every screen; sign-in methods have their own endpoint (`GET /api/auth/identities`) |

Store build keeps seeing what it expects: it only ever holds Strava-linked sessions, so none of these branches reach
it.

Name and avatar (owner decision 2026-11-18): set at sign-in from the provider — Google gives `name` and `picture`,
Apple gives the name once and never a picture. Connecting Strava passes its name/avatar through for whatever the
account still lacks (`COALESCE(existing, strava)`; same for `email`), so an Apple rider gets his Strava photo and a
Google rider keeps his own. New column `users.avatar_source` (`'google' | 'strava' | 'upload'`): disconnecting Strava
clears the avatar only when it came from Strava (Strava data must go on disconnect), instead of always as today.

### 3.7 Strava login → find-only "restore"

At cutover (Phase 5) `findOrCreateStravaUser` loses its create branch for the new flow: an athlete with no BikeLab
account is redirected with `error=no_account` ("sign in with Apple or Google, then connect Strava in the app"). The
legacy store path keeps creating until `LEGACY_MOBILE_COMPAT` is removed. A restored session of an account with no
identity and no password lands on a blocking "Add a sign-in method" screen.

Since 2026-11-18 this concerns the web only: the app no longer starts a Strava login at all (owner decision, §0).
`GET /api/auth/strava/start` stays on the server for the web's login page and the store build's own path.

### 3.8 Account deletion

`DELETE /api/account` (and the admin delete): before the cascade, for an Apple identity call
`POST https://appleid.apple.com/auth/revoke` with the stored refresh token; failure is logged and does not block the
deletion. `user_identities` goes with the user row (FK cascade). While in this file: Strava's `oauth/deauthorize` is
reported to retire on 2027-06-01 in favour of `POST /oauth/revoke` (Basic auth with client id/secret) — switch
`services/strava/oauth.js` after confirming in Strava's own changelog.

### 3.9 Config (`server/config/index.js`, `.env.example`)

`APPLE_BUNDLE_ID=com.bikelab.app`, `APPLE_SERVICES_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY_FILE`
(path to the `.p8`, local) or `APPLE_PRIVATE_KEY` (its PEM, Render), `GOOGLE_CLIENT_IDS` (comma-separated),
`IDENTITY_TOKEN_ENC_KEY` (`openssl rand -hex 32`). All optional at boot: a provider with no audience configured
answers 503 `PROVIDER_NOT_CONFIGURED` and `GET /api/auth/providers` tells clients to hide its button. A malformed
`IDENTITY_TOKEN_ENC_KEY` stops the server at boot, like every other config error.

## 4. Clients

### 4.1 Mobile (`BikeLabApp`)

| Piece | Work |
|---|---|
| Libraries | Apple: `@invertase/react-native-apple-authentication` (iOS). Google: see decision 4. Owner runs `npm install` + `pod install` on the Mac. |
| iOS project | Sign in with Apple capability → `com.apple.developer.applesignin` in `BikeLabApp.entitlements`; Google's reversed client id as a URL scheme in `Info.plist`. |
| `src/auth/` | `apple.ts`, `google.ts` next to `strava.ts`: get nonce → native sheet → `POST /api/auth/apple|google` → `TokenStorage.setTokens` → `resolvePostAuthRoute`. Apple: forward `fullName` on the first sign-in. |
| `LoginScreen.tsx` | Order: Sign in with Apple, Sign in with Google (`Login/SocialSignIn.tsx` — one pill shape and height, mark and label centred), then "Sign In with Email", which opens the full-screen form `Login/EmailSignInModal.tsx` (address, password, submit). No fields and no Strava link on the screen itself (owner, 2026-11-18). The Google mark on the Google button is Google's own file, copied unchanged from its Sign-In SDK in `ios/Pods` to `assets/img/icons/google-g{,@2x,@3x}.png` (`Login/providerMarks.ts`). |
| Onboarding | New last step "Connect your rides": Strava (connect now), Garmin (when riders can link), Skip. `Onboarding/lib.ts` `TOTAL_STEPS` 3 → 4; skipped when a source is already connected. |
| Existing riders | One-time sheet after update for an account with no identity and no password: "Add a faster way to sign in" → Apple / Google → `POST /api/auth/identities/*`. Dismissible until cutover, blocking after. |
| `AccountSettingsScreen.tsx` | "Sign-in methods" section: list, add, remove (server enforces the last-method rule). |
| `deepLinks.ts` | `bikelab://strava-linked?ok=1&code=…` → exchange, swap session, reset navigation (merge, §3.5). |
| No ride source | One place carries the message (owner, 2026-11-18): the hero card at the top of the Garage — `screens/Garage/LastRideHero.tsx`. When `ride_sources` is empty it keeps its exact size and renders as an empty state: a banner "Connect a ride source" with the connect action (Strava now, Garmin when riders can link) in place of the map, title and stats. As built (owner, 2026-11-18, second pass — the two-tone card "looked bad"): `screens/Garage/ConnectRidesBanner.tsx`, one solid dark card (the last-ride card's ink; the owner chose it over brand blue) with the last-ride card's margins, radius and height, shown by `LastRideHero` in its place. Top: a drawn line climbing to a point, where the map's track would be. Then the very large headline "Connect your rides", the title "No rides yet", a line of text, and one button per ride source — today only Strava's "Connect with Strava" (`components/StravaConnectButton.tsx`: Strava's own artwork from the repo's `assets/img/btn_strava_connect_with_{orange,white}.svg`; here the orange one at its supplied size, centred on a full-width pill of exactly its orange, `theme.colors.strava.connectButtonOrange` — lettering, logo and colours untouched, only the button's outline is the app's pill); other sources get their buttons when riders can link them. Once a source is connected and a ride exists it is the last-ride card again. Activities, Analysis and the rest get no cards of their own — they just show their ordinary empty lists instead of an error. |
| i18n | en + ru for all of the above. |

Android: Google + email only for now; Apple on Android needs the web flow and can wait until Android ships.

### 4.2 Web (`react-spa`)

| Piece | Work |
|---|---|
| Google | Google Identity Services script, rendered button, `nonce` from the server, credential → `POST /api/auth/google`. |
| Apple | Sign in with Apple JS in popup mode, Services ID as client id → `POST /api/auth/apple`. Needs the Services ID + domain/return URL registered (§8). |
| `LoginPage.jsx`, `RegisterPage.jsx` | Same order as mobile; Strava demoted to the "restore" link. |
| `ProfilePage` | Sign-in methods card; `IntegrationsCard.jsx` unchanged in role, handles the merge result (`code` → `ExchangeTokenPage` logic). |
| Onboarding | Step 4 becomes "Connect your rides" for everyone; the email-collection variant disappears once Strava-first signups stop. `components/onboarding/lib.js` stops inferring auth type from `strava_id`. |
| 409 handling | `STRAVA_NOT_LINKED` renders the connect card; only 401 logs out. |

## 5. Existing riders — the three paths

| Path | Situation | What happens |
|---|---|---|
| A | Updates the app, still signed in | One-time sheet → adds Apple/Google to the same account. No Strava round-trip. The main path. |
| B | Signed out / new device, remembers "I used Strava" | App: there is no Strava button — he signs in with Apple or Google and continues as path C. (Web, until phase 4 decides otherwise: Strava login as today.) |
| C | Signed out, taps Apple/Google first | Email match (§3.4 step 2) puts him straight into his account if his BikeLab email was verified. Otherwise a fresh account → onboarding "Connect Strava" → merge (§3.5) → he is in his old account with the new identity attached. |

The gap that removing the app's Strava link leaves: the merge only folds in a **fresh** account. A rider whose old
account has no sign-in method but Strava, and who filled the new account with data of his own before connecting
Strava, is refused (`reason=another_account`) and has no way into the old account from the app — resolved by hand
(decision 6), or through the web's Strava login while it exists.

Before starting, measure the population (read-only, prod):

```sql
SELECT COUNT(*) AS total,
       COUNT(*) FILTER (WHERE strava_athlete_id IS NOT NULL AND password_hash IS NULL)                    AS strava_only,
       COUNT(*) FILTER (WHERE strava_athlete_id IS NOT NULL AND password_hash IS NULL AND email IS NULL)  AS strava_only_no_email,
       COUNT(*) FILTER (WHERE strava_athlete_id IS NULL AND password_hash IS NOT NULL)                    AS email_only,
       COUNT(*) FILTER (WHERE email IS NOT NULL AND email_verified)                                       AS verified_email
FROM users;
```

`strava_only_no_email` is the group that can only be reached in-app (paths A–C); the rest can also get one email
through Brevo at cutover.

## 6. Phases

Each phase is shippable on its own; the store build keeps working throughout. Order per the owner (2026-11-18): the
app side first (phases 1–3), locally; the web (phase 4) after it.

Working locally — what that means here:
- The local server talks to the **production database**. The migration therefore lands in prod the moment it is run
  locally (additive: one table, one nullable column — the deployed server ignores both), and every test sign-in
  creates a real `users` / `user_identities` row. Delete test accounts afterwards.
- While the work is local, nothing is deployed to Render. The first TestFlight build changes that: TestFlight talks
  to the production backend, so the server side of phases 1–3 is deployed then — see "Store build compatibility".
- Native Apple/Google sign-in works against a local server: the app gets the ID token from the OS/SDK, the server
  only verifies it (it needs outbound HTTPS to the providers' key endpoints, nothing inbound). Apple env vars and
  `GOOGLE_CLIENT_IDS` go into `server/.env`, Render gets them at release.
- Sign in with Apple needs the capability in the development provisioning profile and an Apple Account signed in on
  the simulator or device; a real device is the dependable test.
- The Apple web button cannot be tested on localhost at all (registered HTTPS domain only) — one more reason the web
  comes second.

| # | Phase | Contents | Gate |
|---|---|---|---|
| 0 | Owner setup + decisions | §8 portal work, env vars on Render, §9 answers, the count query. | Keys in hand |
| 1 | Server identities (dark) ✅ | §3.1–3.4, 3.8, 3.9. Migration, endpoints, contract, tests with a locally generated JWKS (key resolver injected — no network in tests): signature/iss/aud/exp/nonce failures, the three resolution rules, attach/detach, last-method guard, deletion revoke. | Integration suite green; nothing calls it yet |
| 2 | Strava-less account first-class (server + app) | §3.6 server answers + the app's "Connect your rides" onboarding step and the Garage hero card's empty state (§4.1). Can run in parallel with 1. | An email-only test account uses every tab of the app without an error |
| 3 | Mobile sign-in | §4.1 buttons, native SDKs, sheet for existing riders, Sign-in methods, merge deep link; server §3.5. | TestFlight: new account via Apple and via Google; path A, B, C each walked on a real device |
| 4 | Web (after the app is done) | All of §4.2: both buttons, Sign-in methods card, the web half of §3.6 (409 handling instead of logout, empty states, onboarding step 4), merge result. Apple's web button depends on the Services ID (§8). | e2e: sign in with a stubbed provider token; merge result; email-only account uses every page without a logout |
| 5 | Cutover | New build live in the App Store. Strava login → find-only (§3.7); sheet becomes blocking; one email to riders with an address; landing/onboarding copy says "Sign in, then connect Strava". | Store build adoption; count of accounts with no identity and no password trending to zero |
| 6 | Cleanup | Remove `LEGACY_MOBILE_COMPAT` and `legacyMobile*` (then `ACCESS_TOKEN_TTL=1h`, per the audit follow-up); drop `strava_id`/`name`/`avatar` from JWT claims once no client reads them; remove the Strava "restore" link and `/api/auth/strava/start` when the remaining Strava-only count is zero or the owner calls the date; Strava `/oauth/revoke`. | — |

### Store build compatibility (one backend, one database)

The App Store build and the TestFlight build hit the same server and the same rows. Phases 1–5 must leave the store
build exactly as it is today; only Phase 6 ends it, on purpose, after the new build has replaced it in the store.

| What the store build uses | Phases 1–5 | Why it holds |
|---|---|---|
| Strava login: `/exchange_token?mobile=true` → `/auth/success` → `bikelab://auth?token=` | unchanged, still creates accounts | Behind `LEGACY_MOBILE_COMPAT`; the find-only switch (§3.7) applies to the new `state` flow only. |
| Session JWT with `strava_id`, `name`, `avatar` claims, 7-day TTL | unchanged | Claims and TTL are touched only in Phase 6. |
| `/api/activities*`, bikes, analytics, coach | unchanged for a Strava-connected account | The new 200-empty / 409 answers exist only for accounts with no Strava, which today get a 401 from the same routes. |
| `POST /api/skills-history`, `/api/analytics-snapshot` answering 200 | unchanged | Same flag. |
| Disconnect Strava | unchanged | The last-method guard waits for Phase 6 (§3.3). |
| `GET /api/user-profile` | same fields plus new ones | Additive. |
| Delete account | unchanged | The Apple revoke step runs only for accounts that have an Apple identity. |

Shared rows: a tester who adds Apple/Google in TestFlight keeps signing in with Strava in the store build — same
account. A merge (§3.5) always keeps the older, Strava-owning account, so its store-build session stays valid.

Gate before every deploy that TestFlight needs: `server/test/integration/legacyMobileCompat.test.js` green, plus one
manual sign-in and one ride sync on the store build right after the deploy.

Order that cannot change: 1 before 3/4 (clients need the endpoints); 4 before 5 (the web must offer the new sign-in before Strava login narrows there too); 3 in the store before 5 (otherwise existing
riders have no way to attach an identity before Strava login narrows).

## 7. Risks

| Risk | Mitigation |
|---|---|
| Duplicate accounts (Apple relay email, unverified BikeLab email) | Merge on Strava connect (§3.5); email matching only when both sides are verified. |
| Account takeover through email matching | Never match on an unverified address; never trust a Google email without `email_verified`; a sign-in never changes another account's row. |
| Rider locks himself out | Last-method guard on identity removal and on Strava disconnect; blocking "Add a sign-in method" after a Strava restore. |
| App Review | With Google on the login screen an Apple-equivalent option is mandatory — both ship in the same build. Deleting an account must revoke the Apple token (§3.8). Reviewers need a demo login: an email + password account (one more reason to keep it). |
| Mail to Apple relay addresses bounces | Register the Brevo sending domain under Sign in with Apple → email communication, with SPF, before the first verification/reset mail goes to a relay address. |
| Apple gives the name once | Client forwards `fullName` on first sign-in; server stores it then; onboarding step 1 still asks, so a miss is cosmetic. |
| Strava athlete capacity | Sign-ups stop depending on it. Connecting Strava can still be refused at capacity — show "Strava connections are full right now", keep the account usable. |
| Shared local/prod database | The migration is one additive table plus one nullable column with a one-statement backfill; run once, on purpose. |
| Google's Android stack | Free `@react-native-google-signin` builds use the legacy Android SDK; Credential Manager is in its paid tier or other libraries. Irrelevant for iOS today; decide before Android (decision 4). |

## 8. Owner manual steps (Phase 0)

Needed **now, for the app**: Apple 1–2, Google 1–2 (iOS client only). **With the web phase**: Apple 3, Google Web
client. **Before release**: Apple 4–5, Render env vars, App Store Connect.

Apple Developer portal
1. App ID `com.bikelab.app` → enable **Sign in with Apple**; regenerate the provisioning profile; in Xcode add the capability.
2. Keys → new key with Sign in with Apple → download the `.p8` once → `APPLE_KEY_ID`, `APPLE_TEAM_ID`, `APPLE_PRIVATE_KEY` on Render.
3. Services ID (for the web button) — Certificates, Identifiers & Profiles → Identifiers → "+" → Services IDs; primary App ID = the app; domain `bikelab.app`, return URL as the web flow needs. Apple's own pages disagree on the precondition: the Sign in with Apple documentation says the web service needs "an existing app in the App Store that uses Sign in with Apple", Account Help only asks for a primary App ID with the capability enabled. The store build today does not use Sign in with Apple, so plan for the web Apple button to go live after the new iOS build is approved; creating the Services ID earlier costs nothing and a ten-minute test shows whether it already works.
4. Sign in with Apple for Email Communication → register the sending domain used by Brevo.
5. Server-to-server notification endpoint → `https://bikelab.app/api/auth/apple/notifications`.

Google Cloud console
1. Project + OAuth consent screen (External; scopes `openid email profile` only — no sensitive scopes).
2. OAuth client IDs: **Web** (origins `https://bikelab.app`, local Vite port), **iOS** (bundle `com.bikelab.app`); Android later (`com.bikelabapp` + signing SHA-1).
3. `GOOGLE_CLIENT_IDS` on Render; the iOS client's reversed id goes into `Info.plist`.

App Store Connect: demo email + password account in the review notes; privacy labels reviewed for the new identifiers.

## 9. Decisions

| # | Question | State |
|---|---|---|
| 1 | Email + password | ✅ Keep as the third option. |
| 2 | Strava login for existing riders after cutover | ✅ App: no Strava link at all — Apple/Google, then connect Strava, then the merge (changed 2026-11-18). Web: find-only "restore" link as first planned, unless phase 4 drops it too. |
| 3 | Web timing | ✅ App first; the whole web side after the app is done (§6). Apple's web button still hinges on the Services ID precondition (§8, Apple step 3). |
| 4 | Google library on RN | ✅ An existing library: `@react-native-google-signin/google-signin` (free) for iOS; revisit (its paid tier or `react-native-nitro-google-signin`) before Android. |
| 5 | Ride source at onboarding | ✅ Offered, skippable. |
| 6 | Rider has **two accounts that both hold data** and connects, in one, the Strava that belongs to the other | ✅ Refuse with a clear message ("this Strava belongs to another BikeLab account — sign out and sign in the way you do for that account"), resolve the rare case by hand; no chooser screen. The common case — a fresh, empty Apple/Google account meeting an old Strava account — merges automatically either way (§3.5). |
| 7 | Name and avatar | ✅ From the sign-in provider when available; Strava fills what is missing (§3.6). |

## Sources (rules checked 2026-11-18)

- Apple App Review Guidelines 4.8 Login Services, as summarised at https://newly.app/how-to/add-social-login (the guideline page itself: https://developer.apple.com/app-store/review/guidelines/)
- Apple, Configuring your environment for Sign in with Apple: https://developer.apple.com/documentation/signinwithapple/configuring-your-environment-for-sign-in-with-apple · Account Help, Configure Sign in with Apple for the web: https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web/
- Apple TN3194, account deletion and token revocation: https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple
- Strava API Agreement (effective 2026-06-01): https://www.strava.com/api-agreement — does not address using Strava as a sign-in method
- Strava 2026 changes incl. `oauth/deauthorize` retirement: https://tryterra.co/blog/strava-api-changes-2026 (secondary — confirm in Strava's developer changelog)
- Google Sign-In for React Native, free vs paid: https://react-native-google-signin.github.io/docs/install · https://docs.expo.dev/guides/google-authentication/
