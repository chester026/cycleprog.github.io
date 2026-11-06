/**
 * "How does this ride's power sit against the last 12 weeks?" — the layer
 * the ride screen's Power block is built on (docs/plans/
 * ride-power-insights.md). Deliberately framed to pull the rider forward:
 * ranks and gaps-to-best instead of deficits, a ride type from intensity so
 * an endurance day is never judged against sprint records, and a trend
 * only where there is enough history to call it one.
 */
import type { RideBestEfforts } from './powerProfile.js';
import { DEFAULT_POWER_DURATIONS, estimateFtp, mergeBestEfforts, wPerKg } from './powerProfile.js';

export type RideIntensity = 'recovery' | 'endurance' | 'tempo' | 'threshold' | 'race';

/** Coggan-style bands on intensity factor (NP / FTP). */
export function rideIntensity(intensityFactor: number | null | undefined): RideIntensity | null {
  if (intensityFactor == null || !Number.isFinite(intensityFactor) || intensityFactor <= 0) return null;
  if (intensityFactor < 0.65) return 'recovery';
  if (intensityFactor < 0.8) return 'endurance';
  if (intensityFactor < 0.9) return 'tempo';
  if (intensityFactor < 1.05) return 'threshold';
  return 'race';
}

export interface EffortRow {
  seconds: number;
  /** This ride's best over the duration; null when the ride is too short for it. */
  watts: number | null;
  /** Best over the window (this ride included); null when no ride in the window is long enough. */
  best_watts: number | null;
  best_activity_id: number | null;
  best_date: string | null;
  /** 1 = best in the window. Ties share a rank. Null when `watts` is null. */
  rank: number | null;
  /** Rides in the window long enough for this duration. */
  total: number;
  /** watts / best_watts, whole percent. */
  pct_of_best: number | null;
  /** Watts missing to the window best; 0 on a PR. */
  gap_w: number | null;
  is_pr: boolean;
}

export type RecentReason = 'highlight' | 'intensity';

export interface RecentRideBar {
  activity_id: number;
  date: string;
  watts: number;
}

/**
 * This ride against the rider's recent rides over ONE duration — the one
 * that matters for this ride (see `recentDuration`). The bars are the
 * previous rides' bests over that duration, oldest first; this ride is the
 * last point and is compared with their average (the honest reference —
 * most rides sit near it) and ranked among them.
 */
export interface RecentRides {
  seconds: number;
  /** Why this duration: the ride's top-3 strength in the window, or the ride's intensity band. */
  reason: RecentReason;
  /** Previous rides (this one excluded), oldest first, at most RECENT_RIDES. */
  rides: RecentRideBar[];
  ride_w: number;
  /** Mean of `rides`; null with fewer than MIN_RECENT_RIDES of them. */
  avg_prev_w: number | null;
  /** (ride − avg) / avg, one decimal percent; null without an average. */
  vs_avg_pct: number | null;
  /** 1 = best among this ride + `rides`. */
  rank: number;
  total: number;
}

export type PacingKind = 'even' | 'negative' | 'faded' | 'surgy';

export interface FtpSummary {
  watts: number;
  w_per_kg: number | null;
  /**
   * Change vs the FTP the window supported BEFORE this ride (same estimate
   * on the history without it): positive when this ride moved it, 0 when
   * it did not, null when there was no FTP before (this ride is the first).
   */
  delta_w: number | null;
}

export interface RidePowerInsights {
  intensity: RideIntensity | null;
  /** The rider's FTP over the window, with how this ride changed it; null without one. */
  ftp: FtpSummary | null;
  /** The ride's strongest duration, when it is top-3 in the window. */
  highlight: { seconds: number; rank: number; total: number } | null;
  efforts: EffortRow[];
  /**
   * This ride among the recent rides, one entry per duration the rider can
   * switch between (20 min / 1 h when the ride has them, else whatever
   * `recentDuration` found); `default_seconds` is the one to open on. Null
   * when the ride has no effort at any candidate duration.
   */
  recent: { default_seconds: number; options: RecentRides[] } | null;
  pacing: { vi: number; fade_pct: number; kind: PacingKind } | null;
}

export interface RidePowerInsightsInput {
  activityId: number;
  /** YYYY-MM-DD (or ISO timestamp) of this ride. */
  rideDate: string;
  /** This ride's best efforts, keyed by seconds. */
  efforts: Record<number, number>;
  /** Every power-meter ride in the window, this one included or not. */
  history: RideBestEfforts[];
  intensityFactor?: number | null;
  vi?: number | null;
  fadePct?: number | null;
  /** The profile's FTP over the window (services/powerProfile), when known. */
  ftpWatts?: number | null;
  weightKg?: number | null;
}

/** The durations the recent-rides card offers as a toggle (when the ride has them). */
export const RECENT_OPTION_DURATIONS: readonly number[] = [1200, 3600];
/** How many previous rides the recent-rides comparison draws. */
export const RECENT_RIDES = 8;
/** Fewer previous rides than this and an average is not a reference yet. */
export const MIN_RECENT_RIDES = 3;
/** Highlight a duration only when the ride is this good or better in the window. */
const HIGHLIGHT_MAX_RANK = 3;
/** Fade / negative-split thresholds, percent change of the second half vs the first. */
const FADED_PCT = -8;
const NEGATIVE_PCT = 5;
/** Variability index at or above which a ride read as surgy rather than steady. */
const SURGY_VI = 1.15;

export function pacingKind(vi: number, fadePct: number): PacingKind {
  if (fadePct <= FADED_PCT) return 'faded';
  if (fadePct >= NEGATIVE_PCT) return 'negative';
  if (vi >= SURGY_VI) return 'surgy';
  return 'even';
}

/**
 * The one duration the recent-rides comparison is drawn for: the ride's
 * top-3 strength in the window when it has one (that is the story of the
 * day), otherwise the duration the ride's intensity band is about — long
 * steady days are judged on the hour (or 20 min when the ride is shorter),
 * tempo/threshold on 20 min, a race effort on 5 min. Null when the ride
 * has no effort at any candidate duration.
 */
export function recentDuration(
  efforts: Record<number, number>,
  highlight: { seconds: number } | null,
  intensity: RideIntensity | null,
): number | null {
  const has = (t: number): boolean => typeof efforts[t] === 'number';
  if (highlight && has(highlight.seconds)) return highlight.seconds;
  const preferred: number[] =
    intensity === 'race' ? [300, 1200] : intensity === 'recovery' || intensity === 'endurance' ? [3600, 1200, 300] : [1200, 3600, 300];
  for (const t of preferred) if (has(t)) return t;
  return null;
}

export function ridePowerInsights(input: RidePowerInsightsInput, durations: readonly number[] = DEFAULT_POWER_DURATIONS): RidePowerInsights {
  const date = input.rideDate.slice(0, 10);
  const history = input.history.some((r) => r.activityId === input.activityId)
    ? input.history.map((r) => (r.activityId === input.activityId ? { ...r, efforts: input.efforts, date } : r))
    : [...input.history, { activityId: input.activityId, date, efforts: input.efforts }];

  const efforts: EffortRow[] = durations.map((seconds) => {
    const rides = history.filter((r) => typeof r.efforts[seconds] === 'number');
    const mine = input.efforts[seconds];
    const watts = typeof mine === 'number' ? mine : null;
    let best: RideBestEfforts | null = null;
    for (const r of rides) if (best === null || r.efforts[seconds] > best.efforts[seconds]) best = r;
    const bestWatts = best ? best.efforts[seconds] : null;
    const rank = watts === null ? null : rides.filter((r) => r.efforts[seconds] > watts).length + 1;
    return {
      seconds,
      watts,
      best_watts: bestWatts,
      best_activity_id: best ? best.activityId : null,
      best_date: best ? best.date : null,
      rank,
      total: rides.length,
      pct_of_best: watts !== null && bestWatts ? Math.round((watts / bestWatts) * 100) : null,
      gap_w: watts !== null && bestWatts !== null ? Math.max(0, bestWatts - watts) : null,
      is_pr: watts !== null && bestWatts !== null && watts >= bestWatts,
    };
  });

  // Strongest duration: lowest rank, longer duration on a tie (a top 20-min
  // says more about fitness than a top 5-second).
  let highlight: RidePowerInsights['highlight'] = null;
  for (const row of efforts) {
    if (row.rank === null || row.rank > HIGHLIGHT_MAX_RANK) continue;
    if (highlight === null || row.rank <= highlight.rank) highlight = { seconds: row.seconds, rank: row.rank, total: row.total };
  }

  const intensity = rideIntensity(input.intensityFactor);
  const recentFor = (seconds: number): RecentRides => {
    const rideW = input.efforts[seconds];
    const previous = history
      .filter((r) => r.activityId !== input.activityId && typeof r.efforts[seconds] === 'number')
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-RECENT_RIDES)
      .map((r) => ({ activity_id: r.activityId, date: r.date, watts: r.efforts[seconds] }));
    const avg = previous.length >= MIN_RECENT_RIDES ? previous.reduce((s, r) => s + r.watts, 0) / previous.length : null;
    return {
      seconds,
      reason: highlight && highlight.seconds === seconds ? 'highlight' : 'intensity',
      rides: previous,
      ride_w: rideW,
      avg_prev_w: avg === null ? null : Math.round(avg),
      vs_avg_pct: avg === null ? null : Math.round(((rideW - avg) / avg) * 1000) / 10,
      rank: previous.filter((r) => r.watts > rideW).length + 1,
      total: previous.length + 1,
    };
  };
  const optionSeconds = RECENT_OPTION_DURATIONS.filter((t) => typeof input.efforts[t] === 'number');
  const defaultSeconds = recentDuration(input.efforts, highlight, intensity);
  let recent: RidePowerInsights['recent'] = null;
  if (optionSeconds.length > 0 || defaultSeconds !== null) {
    const seconds = optionSeconds.length > 0 ? optionSeconds : [defaultSeconds as number];
    const def = defaultSeconds !== null && seconds.includes(defaultSeconds) ? defaultSeconds : seconds[0];
    recent = { default_seconds: def, options: seconds.map(recentFor) };
  }

  const vi = input.vi ?? null;
  const fade = input.fadePct ?? null;
  const pacing = vi !== null && fade !== null ? { vi, fade_pct: fade, kind: pacingKind(vi, fade) } : null;

  let ftp: FtpSummary | null = null;
  if (input.ftpWatts != null && input.ftpWatts > 0) {
    const before = estimateFtp(mergeBestEfforts(history.filter((r) => r.activityId !== input.activityId)));
    ftp = {
      watts: input.ftpWatts,
      w_per_kg: wPerKg(input.ftpWatts, input.weightKg),
      delta_w: before ? input.ftpWatts - before.watts : null,
    };
  }

  return { intensity, ftp, highlight, efforts, recent, pacing };
}
