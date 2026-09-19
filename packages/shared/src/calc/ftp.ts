// Single, server-computed high-intensity-interval ("FTP workload") analysis
// (T-3.6, docs/audit/00-AUDIT-AND-PLAN.md T-3.6, docs/audit/layers/
// 04-cross-layer.md §4.6). Replaces the two independent copies of
// `analyzeHighIntensityTime` — `react-spa/src/utils/vo2max.js` (worked over
// a list of activities + localStorage-cached streams) and
// `BikeLabApp/src/utils/ftpAnalysis.ts` (worked over a list of activities +
// AsyncStorage-cached streams, the newer/more careful of the two: it
// tracked `activitiesWithStreams`/`activitiesEstimated` instead of silently
// treating a missing stream as "no interval"). Both scanned one activity's
// heart-rate stream for contiguous runs at/above a threshold BPM lasting at
// least a minimum duration.
//
// This version operates on a SINGLE activity's streams (the per-activity
// unit the server now computes and caches — see server/services/
// ftpAnalysis.js and the `activity_analysis` table, migration
// `1758000000004_activity-analysis.sql`); a caller aggregating across many
// activities (the batch `GET /api/analytics/ftp` route) sums each
// activity's `totalMinutes`/`intervals` itself and counts a "session" as
// any activity whose `intervals` is non-empty.
//
// Uses the `time` stream (seconds elapsed, not necessarily 1-per-sample —
// Strava streams are usually but not always 1Hz) to compute each interval's
// real elapsed duration when available, falling back to treating each
// heart-rate sample as one second (both ported implementations effectively
// assumed this, since neither ever received a `time` stream).
export interface FtpStreams {
  /** Heart-rate samples (bpm), one per stream index. */
  heartrate?: number[];
  /** Seconds elapsed at each stream index, aligned 1:1 with `heartrate`. */
  time?: number[];
  /** Power samples (watts) — not used by the interval detection itself
   * (that's heart-rate only, same as both ported copies), but accepted so
   * a caller can pass the whole streams payload through without picking it
   * apart first, and so a future caller can fold power into the result. */
  watts?: number[];
}

export interface FtpAnalysisOptions {
  /** Heart rate (bpm) an interval must reach to count. Default 160 — the
   * value both ported copies hard-coded. A caller with a profile should
   * prefer `computeHrZones(profile).zones` zone 4's `min` instead (see
   * server/services/ftpAnalysis.js), falling back to 160 when the profile
   * has no HR basis. */
  hrThreshold?: number;
  /** Minimum contiguous duration (seconds) at/above `hrThreshold` for a run
   * to count as an interval. Default 120 (2 minutes) — both ported copies'
   * hard-coded value. */
  minIntervalSec?: number;
}

export interface FtpInterval {
  /** Elapsed seconds (from `time[0]`, or index 0 when no `time` stream) at
   * which this interval started. */
  startSec: number;
  /** How long this interval lasted, in seconds. */
  durationSec: number;
  /** Mean heart rate (bpm) over the interval, rounded to the nearest bpm. */
  avgHr: number;
}

export interface FtpAnalysisResult {
  /** Total time across all qualifying intervals, in whole minutes
   * (rounded), the figure both client UIs render as "Minutes at threshold". */
  totalMinutes: number;
  /** Number of qualifying intervals found. */
  totalIntervals: number;
  intervals: FtpInterval[];
}

const DEFAULT_HR_THRESHOLD = 160;
const DEFAULT_MIN_INTERVAL_SEC = 120;

/**
 * Scans a single activity's heart-rate stream for contiguous runs at or
 * above `hrThreshold` lasting at least `minIntervalSec`, the way both
 * ported client implementations did (react-spa's `vo2max.js`, BikeLabApp's
 * `ftpAnalysis.ts` — the latter is reproduced here, being the newer/more
 * complete of the two).
 */
export function analyzeHighIntensityTime(
  streams: FtpStreams,
  opts: FtpAnalysisOptions = {},
): FtpAnalysisResult {
  const hrThreshold = opts.hrThreshold ?? DEFAULT_HR_THRESHOLD;
  const minIntervalSec = opts.minIntervalSec ?? DEFAULT_MIN_INTERVAL_SEC;
  const hr = streams.heartrate ?? [];
  const time = streams.time;

  // Elapsed seconds at stream index `i`. Falls back to treating each
  // sample as one second when no `time` stream was supplied (matches both
  // ported copies, which only ever had the heart-rate array to work with).
  const secAt = (i: number): number => {
    if (time && time[i] != null) return time[i];
    return i;
  };

  const intervals: FtpInterval[] = [];
  let inInterval = false;
  let startIdx = 0;

  const closeInterval = (endIdx: number): void => {
    const durationSec = secAt(endIdx) - secAt(startIdx);
    if (durationSec < minIntervalSec) return;
    let sum = 0;
    let count = 0;
    for (let j = startIdx; j < endIdx; j += 1) {
      sum += hr[j] || 0;
      count += 1;
    }
    intervals.push({
      startSec: secAt(startIdx),
      durationSec,
      // `count` is always >=1 here: `closeInterval` only ever runs with
      // `endIdx > startIdx` (either the loop's current index, always past
      // the iteration that set `startIdx`, or `hr.length`, always past a
      // valid `startIdx`), so the `: 0` fallback is unreachable defensive
      // code — kept for safety, excluded from coverage rather than removed
      // (T-7.2; see report for why this wasn't deleted).
      /* v8 ignore next */
      avgHr: count > 0 ? Math.round(sum / count) : 0,
    });
  };

  for (let i = 0; i < hr.length; i += 1) {
    const h = hr[i] || 0;
    if (h >= hrThreshold) {
      if (!inInterval) {
        inInterval = true;
        startIdx = i;
      }
    } else {
      if (inInterval) closeInterval(i);
      inInterval = false;
    }
  }
  if (inInterval) closeInterval(hr.length);

  const totalSec = intervals.reduce((sum, iv) => sum + iv.durationSec, 0);

  return {
    totalMinutes: Math.round(totalSec / 60),
    totalIntervals: intervals.length,
    intervals,
  };
}

export interface FtpLevel {
  level: string;
  color: string;
  description: string;
}

/**
 * Classifies minutes-at-threshold into a level/color/description band.
 * Reproduces BikeLabApp's `getFTPLevel` (the newer of the two client
 * copies — react-spa's local `getFTPLevel` in `FTPAnalysis.jsx` used
 * different labels/colors for the same bands and is replaced by this one).
 */
export function getFTPLevel(minutes: number): FtpLevel {
  if (minutes < 30) return { level: 'Low', color: '#10b981', description: 'Increase intensity' };
  if (minutes < 60) return { level: 'Normal', color: '#3FE3CA', description: 'Good baseline' };
  if (minutes < 120) return { level: 'Keep going!', color: '#3F50E3', description: 'Strong fitness' };
  if (minutes < 180) return { level: 'Overwhelmed', color: '#3227D3', description: 'Very high fitness' };
  return { level: 'Outstanding', color: '#8b5cf6', description: 'Elite level' };
}
