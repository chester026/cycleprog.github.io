# Sentry (A-30)

`@sentry/react-native` (`^6.10.0`) is declared in `package.json` but **not installed** in this
worktree (see GUIDE-5.md — new packages get written into `package.json` and reported; the owner
runs the install). After `npm install`, this native module also needs a pod install on iOS.

## Install

```
npm install
cd ios && pod install && cd ..
```

## Configure

1. Create a Sentry project (React Native platform) and get its DSN.
2. Set `SENTRY_DSN` in the app's `.env` (read via `react-native-config`, same mechanism as
   `API_BASE_URL`/`STRAVA_CLIENT_ID` — see `src/config.ts`). Leaving it unset keeps Sentry fully
   disabled (`src/monitoring/sentry.ts` no-ops both `initSentry()` and the root `Sentry.wrap`).
3. **Never commit the DSN or an auth token to the repo.** `SENTRY_DSN` in `.env` is fine (it's not
   secret — DSNs are public identifiers), but the source-map upload auth token below IS secret.

## Source maps (release builds)

Two ways to wire this up, either is fine — pick one:

- **Recommended: the Sentry wizard.** From `BikeLabApp/`, run `npx @sentry/wizard@latest -i
  reactNative` and follow the prompts (org/project, auth token). It patches `metro.config.js` with
  the Sentry Metro serializer and writes `ios/sentry.properties` / `android/sentry.properties`.
- **Manual:**
  1. Wrap the Metro config's `serializer` with `@sentry/react-native/dist/js/tools/sentryMetroSerializer` (see the Sentry RN docs for the current export path — it moves between major versions).
  2. Add `ios/sentry.properties` and `android/sentry.properties`:
     ```
     defaults.url=https://sentry.io/
     defaults.org=<your-org-slug>
     defaults.project=<your-project-slug>
     ```
  3. Set `SENTRY_AUTH_TOKEN` as an environment variable in CI/local shell (never in a committed
     file) — it's what authenticates the source-map upload during the release build. Generate one
     from Sentry → Settings → Auth Tokens with `project:releases` scope.

## What's wired up already

- `src/config.ts` exports `SENTRY_DSN` (empty string when unset).
- `src/monitoring/sentry.ts`: `initSentry()` (called once at the top of `App.tsx`),
  `wrapRootComponent()` (wraps the default export with `Sentry.wrap` only when enabled),
  `captureException()` (used by `src/components/ErrorBoundary.tsx`'s `componentDidCatch`).
  `tracesSampleRate: 0.1`, `enableAutoSessionTracking: true`, `release`/`dist` from
  `package.json`'s `version`.
- Everything above is a no-op until both `SENTRY_DSN` is set AND `@sentry/react-native` is
  installed — safe to merge before either happens.

## Simulator check (after install + DSN configured)

- Force a crash (e.g. temporarily throw in a screen's render) and confirm it appears in the
  Sentry project's Issues within a minute.
- Confirm the error boundary fallback screen still renders (dark background, "Something went
  wrong" + Try again) and that dismissing it recovers the app.
