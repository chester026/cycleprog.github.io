/**
 * ShareStudio formatters — distance/speed/elevation/date/duration strings
 * used by the six share templates.
 *
 * T-5.4: consolidated out of near-identical `formatDuration`/`formatDate`
 * closures that used to be redefined inside each `TemplateX.tsx`. Distance
 * and speed conversion reuse `@bikelab/shared/calc`'s `metersToKm`/`msToKmh`
 * (same underlying math as the templates' old inline `/1000` and `*3.6`);
 * duration has THREE genuinely different output formats across templates
 * (see the module doc in `@bikelab/shared/calc`'s `dates.ts`), so only the
 * dominant one is re-exported from there — the other two keep their own
 * name here rather than being silently unified, which would change what
 * gets shared to Instagram.
 */
import {metersToKm, msToKmh, formatDuration as formatDurationShared} from '@bikelab/shared/calc';
import {getDateLocale} from '../../i18n/dateLocale';

/** meters -> "12.3" (km, 1 decimal by default). Used by templates A/B/C/D/E. */
export function formatDistanceKm(meters: number, digits = 1): string {
  return metersToKm(meters).toFixed(digits);
}

/**
 * meters -> "12,34" (km, comma decimal separator, 2 decimals by default).
 * Template F only.
 */
export function formatDistanceKmComma(meters: number, digits = 2): string {
  return metersToKm(meters).toFixed(digits).replace('.', ',');
}

/** m/s -> "27.4" (km/h, 1 decimal). Used by templates A/B/C/D/E. */
export function formatSpeedKmh(metersPerSecond: number): string {
  return msToKmh(metersPerSecond).toFixed(1);
}

/** meters -> rounded whole-number elevation gain. Used by templates A/B/C/E/F. */
export function formatElevationM(meters: number): number {
  return Math.round(meters);
}

/**
 * seconds -> "1h 23m" / "45m", the shared `@bikelab/shared/calc` variant.
 * Used as-is by templates E and F.
 */
export const formatDuration = formatDurationShared;

/**
 * seconds -> "1h 23m" / "45m 12s" (Template A's variant — the only one that
 * shows seconds for a sub-hour ride).
 */
export function formatDurationWithSeconds(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m ${secs}s`;
}

/**
 * seconds -> "1h05" / "45m" (Template B's variant — zero-padded minutes,
 * no space, when there's an hours component).
 */
export function formatDurationPadded(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h${minutes.toString().padStart(2, '0')}`;
  }
  return `${minutes}m`;
}

/**
 * ISO date string -> "Monday, January 1, 2025" (locale-aware long form).
 * Template A only.
 */
export function formatDateLong(dateString: string): string {
  return new Date(dateString).toLocaleDateString(getDateLocale(), {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/** ISO date string -> "MM.DD.YYYY". Template C only. */
export function formatDateShort(dateString: string): string {
  const date = new Date(dateString);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${month}.${day}.${date.getFullYear()}`;
}

/**
 * Downsamples a raw stream array (speed/heartrate/cadence) to at most
 * `maxPoints` values so `react-native-gifted-charts` renders a smooth
 * curve instead of one point per second. Shared by templates D and F,
 * which used to carry byte-identical copies of this function.
 */
export function sampleChartData(
  dataArray: number[] | undefined,
  maxPoints = 60,
): Array<{value: number}> {
  if (!dataArray || dataArray.length === 0) return [];
  const step = Math.max(1, Math.floor(dataArray.length / maxPoints));
  return dataArray.filter((_, index) => index % step === 0).map(value => ({value}));
}
