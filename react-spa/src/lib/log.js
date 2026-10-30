import * as Sentry from '@sentry/react';
import { sentryEnabled } from './sentry';

// The one place web code reports a non-fatal error (plan 4.1). Production
// builds drop every `console.*` call (vite.config.js esbuild `drop`), so a
// bare `console.error` in a catch block is silently lost in prod; this sends
// it to Sentry instead (when `VITE_SENTRY_DSN` is set) and still prints in
// dev so local debugging is unchanged.

function toError(err) {
  if (err instanceof Error) return err;
  return new Error(typeof err === 'string' ? err : JSON.stringify(err));
}

/**
 * Reports `err` with a short label ("Error creating goal") and optional
 * extras ({ activityId }) that land in the Sentry event's `extra` field.
 */
export function logError(err, label, extra) {
  if (sentryEnabled) {
    Sentry.captureException(toError(err), { extra: { label, ...extra } });
  }
  if (import.meta.env.DEV) {
    console.error(label, err, extra ?? '');
  }
}
