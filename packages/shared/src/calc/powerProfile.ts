/**
 * Power-meter profile: best efforts, FTP estimate, Coggan zones, W/kg.
 *
 * Exists so the coach (and clients) never derive power numbers from
 * `average_watts` — averaging ride averages said "158 W" to a tester whose
 * 20-min best was far higher. Everything here works on 1 Hz watt streams from
 * a real power meter; BikeLab's physics estimate (`./power.ts`) is a different
 * thing and must not be fed in.
 */

/** Durations (s) of the standard profile: 5 s, 1 min, 5 min, 20 min, 60 min. */
export const DEFAULT_POWER_DURATIONS = [5, 60, 300, 1200, 3600] as const;

/** FTP as a share of the best 20-min power (Coggan). */
export const FTP_FROM_20MIN_FACTOR = 0.95;

/** A gap between stream samples up to this long is a sensor/recording hold, longer is a real pause. */
const MAX_HOLD_GAP_SEC = 5;

/** Longest ride a stream is expanded for; guards against a corrupt time array allocating gigabytes. */
const MAX_STREAM_SECONDS = 24 * 3600;

/**
 * Highest rolling mean of `watts` over a window of `seconds`; `null` when the
 * stream is shorter than the window. Prefix sums, O(n).
 */
export function bestEffort(watts: number[], seconds: number, sampleRate = 1): number | null {
  const window = Math.round(seconds * sampleRate);
  if (window < 1 || watts.length < window) return null;

  const prefix = new Array<number>(watts.length + 1);
  prefix[0] = 0;
  for (let i = 0; i < watts.length; i += 1) prefix[i + 1] = prefix[i] + watts[i];

  let best = 0;
  for (let end = window; end <= watts.length; end += 1) {
    const sum = prefix[end] - prefix[end - window];
    if (sum > best) best = sum;
  }
  return best / window;
}

/** Best effort per duration for one ride, rounded to whole watts; durations the ride is too short for are omitted. */
export function bestEfforts(
  watts: number[],
  durations: readonly number[] = DEFAULT_POWER_DURATIONS
): Record<number, number> {
  const out: Record<number, number> = {};
  for (const seconds of durations) {
    const best = bestEffort(watts, seconds);
    if (best !== null) out[seconds] = Math.round(best);
  }
  return out;
}

/**
 * Strava streams are keyed by elapsed seconds and skip samples while the
 * device auto-pauses. A rolling window over the raw array would stitch
 * across such a pause, so expand to a gap-free 1 Hz series: short gaps hold
 * the previous reading, longer ones are zero watts (coasting/stopped).
 */
export function toOneHertz(time: number[], watts: number[]): number[] {
  const n = Math.min(time.length, watts.length);
  if (n === 0) return [];
  const length = Math.min(Math.floor(time[n - 1] - time[0]) + 1, MAX_STREAM_SECONDS);
  const out = new Array<number>(Math.max(length, 0)).fill(0);
  for (let i = 0; i < n; i += 1) {
    const start = Math.round(time[i] - time[0]);
    const gap = i + 1 < n ? time[i + 1] - time[i] : 1;
    const hold = gap <= MAX_HOLD_GAP_SEC ? Math.max(1, Math.round(gap)) : 1;
    const value = Number.isFinite(watts[i]) && watts[i] > 0 ? watts[i] : 0;
    for (let s = start; s < start + hold && s < out.length; s += 1) out[s] = value;
  }
  return out;
}

export interface RideBestEfforts {
  activityId: number;
  /** ISO date (YYYY-MM-DD) of the ride. */
  date: string;
  /** Best watts per duration in seconds, as returned by `bestEfforts`. */
  efforts: Record<number, number>;
}

export interface ProfileEffort {
  watts: number;
  activityId: number;
  date: string;
}

export type PowerProfile = Record<number, ProfileEffort>;

/** Best value per duration across rides; durations no ride covers are omitted. */
export function mergeBestEfforts(
  rides: RideBestEfforts[],
  durations: readonly number[] = DEFAULT_POWER_DURATIONS
): PowerProfile {
  const profile: PowerProfile = {};
  for (const ride of rides) {
    for (const seconds of durations) {
      const watts = ride.efforts[seconds];
      if (watts !== undefined && (profile[seconds] === undefined || watts > profile[seconds].watts)) {
        profile[seconds] = { watts, activityId: ride.activityId, date: ride.date };
      }
    }
  }
  return profile;
}

/** Power profile straight from raw 1 Hz watt streams. */
export function powerProfile(
  streams: Array<{ watts: number[]; activityId: number; date: string }>,
  durations: readonly number[] = DEFAULT_POWER_DURATIONS
): PowerProfile {
  return mergeBestEfforts(
    streams.map((s) => ({ activityId: s.activityId, date: s.date, efforts: bestEfforts(s.watts, durations) })),
    durations
  );
}

export type FtpMethod = 'ftp20' | 'ftp60';

export interface FtpEstimate {
  watts: number;
  method: FtpMethod;
  activityId: number;
  date: string;
}

/** 95 % of the best 20 min when there is one, else the best 60 min, else `null`. */
export function estimateFtp(profile: PowerProfile): FtpEstimate | null {
  const twenty = profile[1200];
  if (twenty) {
    return {
      watts: Math.round(twenty.watts * FTP_FROM_20MIN_FACTOR),
      method: 'ftp20',
      activityId: twenty.activityId,
      date: twenty.date,
    };
  }
  const sixty = profile[3600];
  if (sixty) {
    return { watts: Math.round(sixty.watts), method: 'ftp60', activityId: sixty.activityId, date: sixty.date };
  }
  return null;
}

export interface PowerZone {
  zone: number;
  name: string;
  minW: number;
  /** `null` for the open-ended top zone. */
  maxW: number | null;
}

// Upper bound of each zone as a share of FTP (Coggan); Z7 has none.
const COGGAN_ZONES: Array<{ name: string; upperPct: number | null }> = [
  { name: 'Active Recovery', upperPct: 0.55 },
  { name: 'Endurance', upperPct: 0.75 },
  { name: 'Tempo', upperPct: 0.9 },
  { name: 'Threshold', upperPct: 1.05 },
  { name: 'VO2max', upperPct: 1.2 },
  { name: 'Anaerobic Capacity', upperPct: 1.5 },
  { name: 'Neuromuscular Power', upperPct: null },
];

/** Coggan 7 power zones for an FTP; contiguous whole-watt bands starting at 0 W. */
export function powerZones(ftp: number): PowerZone[] {
  let minW = 0;
  return COGGAN_ZONES.map(({ name, upperPct }, i) => {
    const maxW = upperPct === null ? null : Math.round(ftp * upperPct);
    const zone = { zone: i + 1, name, minW, maxW };
    if (maxW !== null) minW = maxW + 1;
    return zone;
  });
}

/** Watts per kilogram to 2 decimals; `null` for a missing/invalid weight. */
export function wPerKg(ftp: number, weightKg: number | null | undefined): number | null {
  if (!weightKg || weightKg <= 0) return null;
  return Math.round((ftp / weightKg) * 100) / 100;
}
