/**
 * Date helpers shared across server/react-spa/BikeLabApp (T-2.4,
 * docs/audit/layers/04-cross-layer.md §4.9, §6.1, W-14).
 *
 * `getISOWeekNumber`/`getISOYear`/`getDateOfISOWeek` reconcile the copies in
 * `react-spa/src/pages/AnalysisPage.jsx:431-446,558`,
 * `react-spa/src/pages/NutritionPage.jsx`,
 * `react-spa/src/components/{AverageHeartRateTrendChart,
 * AverageCadenceTrendChart,MinMaxHeartRateBarChart}.jsx`,
 * `BikeLabApp/src/screens/AnalysisScreen.tsx:30-55` and
 * `BikeLabApp/src/components/{HeartAnalysis,CadenceAnalysis,
 * SpeedAnalysis}.tsx` — all mathematically the same ISO-8601 week
 * definition, split between a UTC-normalized style and a local-midnight
 * style; this module always normalizes through UTC to avoid DST-related
 * off-by-ones.
 *
 * The web's local `getDateOfISOWeek` mutated its own `simple` date in place
 * (`const ISOweekStart = simple`, same object) — harmless today only because
 * nothing else held a reference to `simple`, but fixed here for good measure
 * to match the app's `new Date(simple)` copy.
 */

function toDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value);
}

/** ISO-8601 week number (1-53) of `date`. */
export function getISOWeekNumber(date: Date | string | number): number {
  const d = toDate(date);
  const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  return Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/**
 * ISO-8601 week-numbering year of `date` — differs from
 * `date.getFullYear()` for the last/first few days of a calendar year that
 * belong to the neighboring year's week 1 / week 52-53 (see the Jan 1 /
 * Dec 31 edge-case tests).
 */
export function getISOYear(date: Date | string | number): number {
  const d = new Date(toDate(date).getTime());
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  return d.getFullYear();
}

/** The Monday that starts ISO week `week` of `year`. Never mutates inputs. */
export function getDateOfISOWeek(week: number, year: number): Date {
  const simple = new Date(year, 0, 1 + (week - 1) * 7);
  const dow = simple.getDay();
  const isoWeekStart = new Date(simple);
  if (dow <= 4) {
    isoWeekStart.setDate(simple.getDate() - simple.getDay() + 1);
  } else {
    isoWeekStart.setDate(simple.getDate() + 8 - simple.getDay());
  }
  return isoWeekStart;
}

/** Midnight (local time) of the day `date` falls on. Never mutates `date`. */
export function startOfDayLocal(date: Date | string | number): Date {
  const d = new Date(toDate(date).getTime());
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * `date` -> "YYYY-MM-DD" in local time (not UTC — see W-14: `toISOString()`
 * shifts the date across the day boundary for any timezone behind UTC).
 */
export function toDateKeyLocal(date: Date | string | number): string {
  const d = toDate(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Median of `values`. Reconciles `BikeLabApp/src/screens/AnalysisScreen.tsx`'s
 * `median`, `BikeLabApp/src/utils/skillsCalculator.ts`'s `calculateMedian`
 * and `react-spa/src/utils/skillsCalculator.js`'s `calculateMedian` — all
 * byte-identical logic. Returns 0 for an empty array (matches every copy).
 */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Whole years between an ISO `YYYY-MM-DD` birth date and `asOf` (default:
 * now). The profile stores `birth_date` and derives `age` from it — a stored
 * age silently goes stale every birthday. Returns null for an empty,
 * unparseable or future date.
 */
export function ageFromBirthDate(birthDate: string | null | undefined, asOf: Date = new Date()): number | null {
  if (!birthDate) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(birthDate);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const birth = new Date(Date.UTC(y, mo, d));
  if (Number.isNaN(birth.getTime()) || birth.getUTCMonth() !== mo || birth.getUTCDate() !== d) return null;
  let age = asOf.getUTCFullYear() - y;
  const beforeBirthday = asOf.getUTCMonth() < mo || (asOf.getUTCMonth() === mo && asOf.getUTCDate() < d);
  if (beforeBirthday) age -= 1;
  return age < 0 ? null : age;
}
