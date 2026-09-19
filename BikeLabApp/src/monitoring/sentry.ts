// A-30 (docs/audit): Sentry crash/error reporting for the RN app.
//
// `@sentry/react-native` is NOT installed in this worktree (see
// BikeLabApp/package.json — GUIDE-5.md: new packages get written into
// package.json and reported, the owner runs `npm install`/`pod install`).
// To keep `npx tsc --noEmit` and `npx jest` green without the package
// present, the import goes through a plain `require()` inside a
// try/catch, typed against a minimal `SentryLike` shape instead of the
// real (absent) module's types — once the package is installed this
// picks it up automatically, no code change needed.
//
// Everything here is also a no-op whenever `SENTRY_DSN` is unset (local
// dev, forks without their own Sentry project) — see src/config.ts.
import {SENTRY_DSN} from '../config';

const appVersion = (require('../../package.json') as {version: string}).version;

/** The slice of the real `@sentry/react-native` API this module uses. */
type SentryInitOptions = {
  dsn: string;
  tracesSampleRate: number;
  enableAutoSessionTracking: boolean;
  release: string;
  dist: string;
};

type SentryLike = {
  init: (options: SentryInitOptions) => void;
  wrap: <T>(rootComponent: T) => T;
  captureException: (error: unknown, hint?: unknown) => string;
};

let cachedModule: SentryLike | null | undefined;

/** Loads `@sentry/react-native` if it's installed; caches the result
 * (including the "not installed" case) so later calls don't keep paying
 * for a failed `require`. */
function loadSentry(): SentryLike | null {
  if (cachedModule !== undefined) {
    return cachedModule;
  }
  try {
    cachedModule = require('@sentry/react-native') as SentryLike;
  } catch {
    cachedModule = null;
  }
  return cachedModule;
}

/** True once both a DSN is configured AND the package is installed —
 * i.e. Sentry will actually do something. Exported so App.tsx can decide
 * whether to reach for `Sentry.wrap`. */
export function isSentryEnabled(): boolean {
  return !!SENTRY_DSN && loadSentry() !== null;
}

/** Call once at app start (before rendering). No-op when `SENTRY_DSN` is
 * absent or the package isn't installed yet. */
export function initSentry(): void {
  if (!SENTRY_DSN) {
    return;
  }
  const Sentry = loadSentry();
  if (!Sentry) {
    return;
  }
  Sentry.init({
    dsn: SENTRY_DSN,
    // Low sample rate — this is a crash/error reporting integration, not
    // full performance tracing (A-30 asked for "low").
    tracesSampleRate: 0.1,
    enableAutoSessionTracking: true,
    release: `bikelabapp@${appVersion}`,
    dist: appVersion,
  });
}

/** Wraps the root component with `Sentry.wrap` (touch-latency + app-start
 * tracing) only when Sentry is actually enabled — returns the component
 * unchanged otherwise, so App.tsx doesn't need its own DSN check. */
export function wrapRootComponent<T>(rootComponent: T): T {
  if (!isSentryEnabled()) {
    return rootComponent;
  }
  return loadSentry()!.wrap(rootComponent);
}

/** Reports a caught error to Sentry; no-op when disabled. Used by
 * `ErrorBoundary`'s `componentDidCatch`. */
export function captureException(error: unknown): void {
  const Sentry = loadSentry();
  if (SENTRY_DSN && Sentry) {
    Sentry.captureException(error);
  }
}
