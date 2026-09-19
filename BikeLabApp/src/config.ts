import Config from 'react-native-config';

export const API_BASE_URL: string =
  Config.API_BASE_URL || (__DEV__ ? 'http://localhost:8080' : 'https://bikelab.app');
export const STRAVA_CLIENT_ID: string = Config.STRAVA_CLIENT_ID || '165560';
export const WEB_BASE_URL: string = Config.WEB_BASE_URL || 'https://bikelab.app';

// A-30: Sentry DSN for crash/error reporting. Absent in dev/local builds
// and any fork without its own Sentry project — `src/monitoring/sentry.ts`
// treats an empty string as "Sentry disabled" and no-ops entirely, so this
// intentionally has no fallback literal (unlike the URLs above).
export const SENTRY_DSN: string = Config.SENTRY_DSN || '';
