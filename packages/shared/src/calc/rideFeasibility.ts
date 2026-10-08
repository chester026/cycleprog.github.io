/**
 * "Can I do THIS ride?" — compares a described ride (distance + climbing) with the rider's own
 * synced rides: closest comparable rides, personal bests, 7/28-day load against the 84-day
 * chronic average, and a freshness verdict. Backs the coach tool `assess_ride_feasibility`
 * (the readiness tool only knows Apple Health/Oura and is useless for riders without them).
 * Pure: `now` is a parameter. Day windows are UTC, like Strava's `start_date`.
 */

const DAY_MS = 86_400_000;
const HOUR_S = 3600;
const RECENT_DAYS = 365;
const CHRONIC_DAYS = 84;
const ACUTE_DAYS = 7;
const MONTH_DAYS = 28;
const LONG_RIDE_KM = 100;
const BIG_CLIMB_M = 2000;
const COUNT_WINDOW_DAYS = 90;
const MAX_COMPARABLE_RIDES = 3;
const DONE_FRACTION = 0.95;
const NEAR_RATIO = 1.25;
const FRESH_ACR_BELOW = 0.8;
const LOADED_ACR_ABOVE = 1.3;
const FRESH_MIN_REST_DAYS = 2;
const LOADED_RECENT_DAYS = 3;
const LOADED_RECENT_SHARE = 0.5;

export interface FeasibilityActivity {
  start_date: string | Date;
  distance: number;
  moving_time: number;
  total_elevation_gain: number;
  average_heartrate: number | null;
  average_speed: number;
  name?: string;
}

export interface FeasibilityTarget {
  distanceKm: number;
  elevationM: number;
  /** YYYY-MM-DD of the planned ride; defaults to today. */
  date?: string;
}

export interface ComparableRide {
  date: string;
  name: string | null;
  distanceKm: number;
  elevationM: number;
  movingTimeH: number;
  avgHr: number | null;
  avgSpeedKmh: number;
  /** 0..1, 1 = same distance and climbing as the target. */
  similarity: number;
  daysAgo: number;
}

export interface PersonalBests {
  longestRide: { distanceKm: number; elevationM: number; date: string; daysAgo: number };
  biggestClimb: { elevationM: number; distanceKm: number; date: string; daysAgo: number };
  longestTimeH: number;
}

export type CapabilityLevel = 'done' | 'near' | 'beyond' | 'unknown';

export interface LoadWindow {
  km: number;
  hours: number;
  elevationM: number;
  rides: number;
}

export type Freshness = 'fresh' | 'normal' | 'loaded' | 'unknown';

export interface RideFeasibility {
  target: { distanceKm: number; elevationM: number; date: string };
  comparableRides: ComparableRide[];
  personalBests: PersonalBests | null;
  capability: {
    level: CapabilityLevel;
    /** target / longest ride; null when there is no ride to divide by. */
    ratioDistance: number | null;
    /** target / biggest climb; null when the rider never climbed. */
    ratioElevation: number | null;
    /** Rides of 100+ km in the last 90 days. */
    longRides90d: number;
    /** Rides with 2000+ m of climbing in the last 90 days. */
    bigClimbRides90d: number;
  };
  load: {
    last7d: LoadWindow;
    last28d: LoadWindow;
    chronicWeeklyAvg: { km: number; hours: number; elevationM: number };
    acuteChronicRatio: number | null;
    daysSinceLastLongRide: number | null;
    daysSinceLastRide: number | null;
  };
  freshness: Freshness;
}

interface Ride {
  startMs: number;
  date: string;
  name: string | null;
  km: number;
  elevationM: number;
  hours: number;
  avgHr: number | null;
  avgSpeedKmh: number;
  daysAgo: number;
}

function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/** target / best; nothing asked = 0, something asked of a rider who never did any = Infinity. */
function ratio(target: number, best: number): number {
  if (target <= 0) return 0;
  return best > 0 ? target / best : Infinity;
}

function finiteOrNull(value: number): number | null {
  return Number.isFinite(value) ? round(value, 2) : null;
}

function maxBy(rides: Ride[], key: (r: Ride) => number): Ride {
  return rides.reduce((best, r) => (key(r) > key(best) ? r : best));
}

function toRide(a: FeasibilityActivity, nowMs: number): Ride | null {
  const startMs = new Date(a.start_date).getTime();
  if (!Number.isFinite(startMs) || startMs > nowMs || !(a.distance > 0)) return null;
  return {
    startMs,
    date: new Date(startMs).toISOString().slice(0, 10),
    name: a.name ?? null,
    km: a.distance / 1000,
    elevationM: a.total_elevation_gain || 0,
    hours: (a.moving_time || 0) / HOUR_S,
    avgHr: a.average_heartrate ?? null,
    avgSpeedKmh: (a.average_speed || 0) * 3.6,
    daysAgo: Math.floor((nowMs - startMs) / DAY_MS),
  };
}

function sumWindow(rides: Ride[], days: number): LoadWindow {
  const inWindow = rides.filter((r) => r.daysAgo < days);
  return {
    km: round(inWindow.reduce((s, r) => s + r.km, 0), 1),
    hours: round(inWindow.reduce((s, r) => s + r.hours, 0), 1),
    elevationM: Math.round(inWindow.reduce((s, r) => s + r.elevationM, 0)),
    rides: inWindow.length,
  };
}

function hoursWithin(rides: Ride[], days: number): number {
  return rides.filter((r) => r.daysAgo < days).reduce((s, r) => s + r.hours, 0);
}

function comparable(r: Ride, similarity: number): ComparableRide {
  return {
    date: r.date,
    name: r.name,
    distanceKm: round(r.km, 1),
    elevationM: Math.round(r.elevationM),
    movingTimeH: round(r.hours, 1),
    avgHr: r.avgHr === null ? null : Math.round(r.avgHr),
    avgSpeedKmh: round(r.avgSpeedKmh, 1),
    similarity: round(similarity, 2),
    daysAgo: r.daysAgo,
  };
}

function classifyFreshness(
  acr: number | null,
  daysSinceLastRide: number | null,
  loadRides: Ride[]
): Freshness {
  const hours7 = hoursWithin(loadRides, ACUTE_DAYS);
  // Front-loaded week: more than half of a NORMAL-or-heavier week's hours in
  // the last 3 days. The ACR floor keeps a lone 90-minute spin yesterday
  // after a quiet week from reading as "loaded" — that rider is fresh.
  const recentShare =
    acr !== null &&
    acr >= FRESH_ACR_BELOW &&
    hoursWithin(loadRides, LOADED_RECENT_DAYS) > hours7 * LOADED_RECENT_SHARE;
  // A high ACR with the last ride 3+ days back is one big day followed by
  // rest (a 200 km loop on Saturday, asking on Thursday) — the rider has
  // recovered from the spike, not accumulated load. Only a spike that is
  // still fresh (ridden within the last 2 days) reads as loaded.
  const spikeStillFresh = daysSinceLastRide !== null && daysSinceLastRide < LOADED_RECENT_DAYS;
  if ((acr !== null && acr > LOADED_ACR_ABOVE && spikeStillFresh) || recentShare) return 'loaded';
  if (
    acr !== null &&
    acr < FRESH_ACR_BELOW &&
    daysSinceLastRide !== null &&
    daysSinceLastRide >= FRESH_MIN_REST_DAYS
  ) {
    return 'fresh';
  }
  return 'normal';
}

export function computeRideFeasibility(
  activities: FeasibilityActivity[],
  target: FeasibilityTarget,
  now: Date
): RideFeasibility {
  const nowMs = now.getTime();
  const date = target.date ?? now.toISOString().slice(0, 10);
  const targetOut = { distanceKm: target.distanceKm, elevationM: target.elevationM, date };
  const rides = activities.flatMap((a) => toRide(a, nowMs) ?? []);

  // Someone asking on Friday about Saturday must not have Saturday's ride (or later syncs) in
  // their own load.
  const targetStartMs = new Date(`${date}T00:00:00Z`).getTime();
  const loadRides = rides.filter((r) => r.startMs < targetStartMs);
  const sumRides = (days: number) => sumWindow(loadRides, days);

  const longRides = loadRides.filter((r) => r.km >= LONG_RIDE_KM);

  const chronic = sumRides(CHRONIC_DAYS);
  const weeks = CHRONIC_DAYS / ACUTE_DAYS;
  const chronicHours = hoursWithin(loadRides, CHRONIC_DAYS) / weeks;
  const hours7 = hoursWithin(loadRides, ACUTE_DAYS);
  const acr = chronicHours > 0 ? round(hours7 / chronicHours, 2) : null;
  const daysSinceLastRide = loadRides.length ? maxBy(loadRides, (r) => r.startMs).daysAgo : null;

  const load = {
    last7d: sumRides(ACUTE_DAYS),
    last28d: sumRides(MONTH_DAYS),
    chronicWeeklyAvg: {
      km: round(chronic.km / weeks, 1),
      hours: round(chronicHours, 1),
      elevationM: Math.round(chronic.elevationM / weeks),
    },
    acuteChronicRatio: acr,
    daysSinceLastLongRide: longRides.length ? maxBy(longRides, (r) => r.startMs).daysAgo : null,
    daysSinceLastRide,
  };

  if (rides.length === 0) {
    return {
      target: targetOut,
      comparableRides: [],
      personalBests: null,
      capability: {
        level: 'unknown',
        ratioDistance: null,
        ratioElevation: null,
        longRides90d: 0,
        bigClimbRides90d: 0,
      },
      load,
      freshness: 'unknown',
    };
  }

  const recent = rides.filter((r) => r.daysAgo < RECENT_DAYS);
  const distanceScale = Math.max(target.distanceKm, 1);
  const elevationScale = Math.max(target.elevationM, 1);
  const scored = recent
    .map((r) => {
      const dd = (r.km - target.distanceKm) / distanceScale;
      const de = target.elevationM > 0 ? (r.elevationM - target.elevationM) / elevationScale : 0;
      return { ride: r, score: Math.sqrt(dd * dd + de * de) };
    })
    .sort((a, b) => a.score - b.score || a.ride.daysAgo - b.ride.daysAgo);
  const comparableRides = scored
    .slice(0, MAX_COMPARABLE_RIDES)
    .map(({ ride, score }) => comparable(ride, 1 - Math.min(score, 1)));

  const longest = maxBy(rides, (r) => r.km);
  const biggest = maxBy(rides, (r) => r.elevationM);
  const personalBests: PersonalBests = {
    longestRide: {
      distanceKm: round(longest.km, 1),
      elevationM: Math.round(longest.elevationM),
      date: longest.date,
      daysAgo: longest.daysAgo,
    },
    biggestClimb: {
      elevationM: Math.round(biggest.elevationM),
      distanceKm: round(biggest.km, 1),
      date: biggest.date,
      daysAgo: biggest.daysAgo,
    },
    longestTimeH: round(maxBy(rides, (r) => r.hours).hours, 1),
  };

  const ratioDistance = ratio(target.distanceKm, longest.km);
  const ratioElevation = ratio(target.elevationM, biggest.elevationM);
  const matchesWithin = (fraction: number) =>
    recent.some(
      (r) => r.km >= target.distanceKm * fraction && r.elevationM >= target.elevationM * fraction
    );
  let level: CapabilityLevel = 'beyond';
  if (matchesWithin(DONE_FRACTION)) level = 'done';
  else if (ratioDistance <= NEAR_RATIO && ratioElevation <= NEAR_RATIO) level = 'near';

  const last90 = rides.filter((r) => r.daysAgo < COUNT_WINDOW_DAYS);
  return {
    target: targetOut,
    comparableRides,
    personalBests,
    capability: {
      level,
      ratioDistance: finiteOrNull(ratioDistance),
      ratioElevation: finiteOrNull(ratioElevation),
      longRides90d: last90.filter((r) => r.km >= LONG_RIDE_KM).length,
      bigClimbRides90d: last90.filter((r) => r.elevationM >= BIG_CLIMB_M).length,
    },
    load,
    freshness: classifyFreshness(acr, daysSinceLastRide, loadRides),
  };
}
