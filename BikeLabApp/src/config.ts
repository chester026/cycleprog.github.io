import Config from 'react-native-config';

export const API_BASE_URL: string =
  Config.API_BASE_URL || (__DEV__ ? 'http://localhost:8080' : 'https://bikelab.app');
export const STRAVA_CLIENT_ID: string = Config.STRAVA_CLIENT_ID || '165560';
export const WEB_BASE_URL: string = Config.WEB_BASE_URL || 'https://bikelab.app';
// OAuth client id of the iOS app in Google Cloud (docs/plans/auth-providers.md
// §8). Not a secret: it ships in every build, and its reversed form is the
// URL scheme in Info.plist that brings Google's sign-in back to the app. The
// server lists the same id in GOOGLE_CLIENT_IDS — a token minted for any
// other client is refused there.
export const GOOGLE_IOS_CLIENT_ID: string =
  Config.GOOGLE_IOS_CLIENT_ID || '711589927621-2ooklu3b7d3sccm8vk8lsn0887lc2jag.apps.googleusercontent.com';

// A-30: Sentry DSN for crash/error reporting. Absent in dev/local builds
// and any fork without its own Sentry project — `src/monitoring/sentry.ts`
// treats an empty string as "Sentry disabled" and no-ops entirely, so this
// intentionally has no fallback literal (unlike the URLs above).
export const SENTRY_DSN: string = Config.SENTRY_DSN || '';
