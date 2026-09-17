/**
 * Unit conversions and formatters shared across server/react-spa/BikeLabApp
 * (T-2.4, docs/audit/layers/04-cross-layer.md §4.9, §6.1).
 */

/** m/s -> km/h. */
export const msToKmh = (v: number): number => v * 3.6;

/** km/h -> m/s. */
export const kmhToMs = (v: number): number => v / 3.6;

/** meters -> kilometers. */
export const metersToKm = (m: number): number => m / 1000;

/** seconds -> hours. */
export const secondsToHours = (s: number): number => s / 3600;

/**
 * meters -> "12.3" km string, `digits` decimal places (default 1).
 */
export function formatDistanceKm(m: number, digits = 1): string {
  return metersToKm(m).toFixed(digits);
}

/**
 * seconds -> "1h 23m" / "45m", the format used by
 * `BikeLabApp/src/components/ShareStudio/templates/TemplateF.tsx` and
 * `TemplateE.tsx` (the dominant variant among the app's/web's local
 * formatDuration copies — see T-2.4 report for the full tally of variants
 * left untouched because their output format differs, e.g.
 * `ActivityCard.tsx` always showing "0h", `TemplateB.tsx`'s `1h05` padded
 * form, `TemplateA.tsx`'s added seconds, and `CalendarScreen.tsx` /
 * `GpxElevationChart.jsx`'s `h:mm` colon form).
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}
