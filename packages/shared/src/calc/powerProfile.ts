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

export type FtpMethod = 'ftp20' | 'ftp60' | 'cp';

export interface FtpEstimate {
  watts: number;
  method: FtpMethod;
  /** The ride behind the number: the best 20/60-min ride, or for `cp` the longest effort in the fit. */
  activityId: number;
  date: string;
  /** Present when the critical-power fit was possible, whichever method won. */
  cp?: CriticalPower;
}

export interface CriticalPower {
  /** Critical power, W — the asymptote of the power–duration curve. */
  cp: number;
  /** W′, J — the work available above CP. */
  wPrime: number;
  /** Durations (s) the fit used. */
  durations: number[];
}

/** Efforts shorter than this are too anaerobic for the two-parameter model; longer than the max, too aerobic. */
const CP_MIN_DURATION_S = 180;
const CP_MAX_DURATION_S = 3600;
/** A fit outside these W′ bounds is noise (a 60-min ride stronger than its 20-min best, say), not physiology. */
const CP_WPRIME_MIN_J = 2000;
const CP_WPRIME_MAX_J = 40000;

/**
 * Two-parameter critical-power model (Monod–Scherrer): P(t) = CP + W′/t,
 * fitted by least squares over the profile's efforts between 3 and 60
 * minutes (in practice 5, 20 and 60 min). Needs at least two durations.
 * What a head unit's "auto FTP" does: it reads the rider's threshold off the
 * whole curve instead of waiting for one perfectly paced 20-minute effort,
 * so riders who only ever do 5-minute climbs still get a number. Returns
 * null when the points cannot support a physiological fit.
 */
export function estimateCriticalPower(profile: PowerProfile): CriticalPower | null {
  const durations = Object.keys(profile)
    .map(Number)
    .filter((t) => t >= CP_MIN_DURATION_S && t <= CP_MAX_DURATION_S)
    .sort((a, b) => a - b);
  if (durations.length < 2) return null;
  // Linear regression of P on x = 1/t: slope = W′, intercept = CP.
  const xs = durations.map((t) => 1 / t);
  const ys = durations.map((t) => profile[t].watts);
  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i += 1) {
    sxx += (xs[i] - meanX) ** 2;
    sxy += (xs[i] - meanX) * (ys[i] - meanY);
  }
  const wPrime = sxy / sxx;
  const cp = meanY - wPrime * meanX;
  if (!(wPrime >= CP_WPRIME_MIN_J && wPrime <= CP_WPRIME_MAX_J) || cp <= 0) return null;
  return { cp: Math.round(cp), wPrime: Math.round(wPrime), durations };
}

/**
 * The rider's FTP from the window's best efforts — the higher of two reads:
 * 95 % of the best 20 min (the classic test-based rule) and the
 * critical-power fit over 5–60-min efforts (`estimateCriticalPower`). With
 * no 20-min effort, the best 60 min as-is (which always reads above the
 * fit's CP); failing that, null. The fit travels along as `cp` either way.
 */
export function estimateFtp(profile: PowerProfile): FtpEstimate | null {
  const cpFit = estimateCriticalPower(profile);
  const twenty = profile[1200];
  const sixty = profile[3600];

  let best: FtpEstimate | null = null;
  if (twenty) {
    best = { watts: Math.round(twenty.watts * FTP_FROM_20MIN_FACTOR), method: 'ftp20', activityId: twenty.activityId, date: twenty.date };
  } else if (sixty) {
    best = { watts: Math.round(sixty.watts), method: 'ftp60', activityId: sixty.activityId, date: sixty.date };
  }
  // A fit needs two of {5, 20, 60 min}, so `best` is never null here — and
  // CP always sits below the 60-min power, so the fit can only beat ftp20.
  if (cpFit && best && cpFit.cp > best.watts) {
    const longest = profile[cpFit.durations[cpFit.durations.length - 1]];
    best = { watts: cpFit.cp, method: 'cp', activityId: longest.activityId, date: longest.date };
  }
  if (best && cpFit) best.cp = cpFit;
  return best;
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

export interface PowerZoneShare extends PowerZone {
  /** Share of samples in this zone, whole percent; shares sum to ~100. */
  percent: number;
  /** Samples in this zone. */
  samples: number;
}

/**
 * How a ride's power stream splits across `zones` (from `powerZones(ftp)`),
 * for the vertical-bar "power profile" on the ride screen. Samples are
 * weighted equally — on an evenly bucket-averaged stream (the app asks
 * `GET /api/activities/:id/streams?downsample=400`) that is time-weighted
 * already; bucket averaging does flatten short spikes, so Z6/Z7 read a
 * little low versus the raw second-by-second data. Null/non-finite samples
 * (coasting gaps, dropouts) are skipped; 0 W counts as Z1.
 */
export function powerZoneDistribution(
  watts: ReadonlyArray<number | null | undefined>,
  zones: PowerZone[],
): PowerZoneShare[] {
  const counts = zones.map(() => 0);
  let total = 0;
  for (const w of watts) {
    if (w == null || !Number.isFinite(w) || w < 0) continue;
    const idx = zones.findIndex((z) => w >= z.minW && (z.maxW === null || w <= z.maxW));
    if (idx === -1) continue;
    counts[idx] += 1;
    total += 1;
  }
  return zones.map((z, i) => ({
    ...z,
    samples: counts[i],
    percent: total > 0 ? Math.round((counts[i] / total) * 100) : 0,
  }));
}
