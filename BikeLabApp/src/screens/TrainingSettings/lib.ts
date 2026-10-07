// Client-side mirror of the server's limits for the two weekly-load fields
// (time_available 1–40 h, workouts_per_week 1–14): lets the screen show an
// inline error and disable Save before the request is sent.

export const MIN_WEEKLY_HOURS = 1;
export const MAX_WEEKLY_HOURS = 40;
export const MIN_WORKOUTS_PER_WEEK = 1;
export const MAX_WORKOUTS_PER_WEEK = 14;

/** Parses a typed number ("5", "5,5"); empty = not set (null), garbage = NaN. */
export function parseNumberInput(text: string): number | null {
  const trimmed = text.trim().replace(',', '.');
  if (trimmed === '') return null;
  return Number(trimmed);
}

/** True when `text` is empty (field not set) or a number within [min, max]. */
export function isWithinRange(text: string, min: number, max: number, integerOnly = false): boolean {
  const value = parseNumberInput(text);
  if (value === null) return true;
  if (!Number.isFinite(value) || value < min || value > max) return false;
  return !integerOnly || Number.isInteger(value);
}
