import * as Sentry from '@sentry/react';

// Error reporting (plan 4.1). Enabled only when the deploy sets
// `VITE_SENTRY_DSN`; local dev and CI builds stay silent. `release` is the
// Vite build hash so events line up with the `build.sourcemap: 'hidden'`
// maps the owner uploads for that deploy. Imported first in `main.jsx` so
// the SDK sees module-evaluation errors too. `sendDefaultPii` stays off:
// the API already knows the user, Sentry doesn't need the IP/cookies.
const dsn = import.meta.env.VITE_SENTRY_DSN;

export const sentryEnabled = Boolean(dsn);

if (sentryEnabled) {
  Sentry.init({
    dsn,
    release: __BUILD_HASH__,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  });
}
