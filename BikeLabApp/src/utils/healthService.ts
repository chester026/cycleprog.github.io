import AsyncStorage from '@react-native-async-storage/async-storage';
import {Platform} from 'react-native';
import {
  isHealthDataAvailable,
  requestAuthorization,
  getMostRecentQuantitySample,
  queryQuantitySamples,
  queryCategorySamples,
  CategoryValueSleepAnalysis,
} from '@kingstinct/react-native-healthkit';

/**
 * Apple Health integration — on-device only (see APPLE_HEALTH_SPEC.md).
 * Health data is fetched here, cached to AsyncStorage, and summarized into
 * a `health_context` object that rides along with coach chat requests. It
 * is never sent anywhere else and never stored in Postgres — see
 * server/aiCoach.js + server/server.js for the pass-through-only handling
 * on the backend side.
 *
 * Library: @kingstinct/react-native-healthkit (JSI/Nitro-native — chosen
 * over the older `react-native-health` bridge module because this repo
 * already runs New Architecture; see APPLE_HEALTH_IMPLEMENTATION_PLAN.md §1
 * for why that ruled out the bridge-based library). Its API is
 * string-identifier + Promise based, NOT the callback-style
 * `AppleHealthKit.Constants.Permissions.*` shape the original spec sketch
 * was written against — the identifiers below are real HealthKit
 * identifier strings per this library's docs, not that other library's
 * shorthand names.
 */

const HEALTH_CACHE_KEY = 'bikelab_health_cache_v1';
const BASELINE_WINDOW_DAYS = 14;
const WEIGHT_TREND_WINDOW_DAYS = 30;

const RESTING_HR = 'HKQuantityTypeIdentifierRestingHeartRate';
const HRV_SDNN = 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN';
const BODY_MASS = 'HKQuantityTypeIdentifierBodyMass';
const VO2_MAX = 'HKQuantityTypeIdentifierVO2Max';
const ACTIVE_ENERGY = 'HKQuantityTypeIdentifierActiveEnergyBurned';
const SLEEP_ANALYSIS = 'HKCategoryTypeIdentifierSleepAnalysis';

const READ_PERMISSIONS = [RESTING_HR, HRV_SDNN, BODY_MASS, VO2_MAX, ACTIVE_ENERGY, SLEEP_ANALYSIS];

export interface HealthSnapshot {
  restingHR: number | null;
  rhrBaseline: number | null;
  hrv: number | null;
  hrvBaseline: number | null;
  sleepHours: number | null;
  deepSleepPct: number | null;
  weightKg: number | null;
  weightTrend30d: number | null;
  vo2max: number | null;
  activeEnergyKcal: number | null;

  recoveryScore: number | null;
  dataFreshness: string | null;

  isAvailable: boolean;
  isConnected: boolean;
}

export const EMPTY_HEALTH_SNAPSHOT: HealthSnapshot = {
  restingHR: null,
  rhrBaseline: null,
  hrv: null,
  hrvBaseline: null,
  sleepHours: null,
  deepSleepPct: null,
  weightKg: null,
  weightTrend30d: null,
  vo2max: null,
  activeEnergyKcal: null,
  recoveryScore: null,
  dataFreshness: null,
  isAvailable: false,
  isConnected: false,
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/**
 * Kick off the HealthKit permission dialog. Resolving `true` only means the
 * request dialog was completed, NOT that every (or any) permission was
 * granted — HealthKit deliberately never tells apps which read permissions
 * were denied, only write permissions. Downstream queries for a denied type
 * just come back empty rather than throwing, so the snapshot degrades
 * gracefully (missing fields stay null) rather than erroring.
 */
export async function initHealthKit(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    const available = await isHealthDataAvailable();
    if (!available) return false;
    await requestAuthorization({toRead: READ_PERMISSIONS as any});
    return true;
  } catch (err) {
    console.log('[Health] init/authorization failed:', err);
    return false;
  }
}

async function latestQuantity(identifier: string, unit?: string): Promise<number | null> {
  try {
    // `unit` is a plain positional arg here, not an options object — confirmed
    // against the installed package's src/utils/getMostRecentQuantitySample.ts.
    const sample = await getMostRecentQuantitySample(identifier as any, unit as any);
    return sample?.quantity ?? null;
  } catch {
    return null;
  }
}

// Plain average over the window — good enough for a same-metric personal
// baseline (never compared across users/metrics), which is all the
// recovery score needs.
async function averageOverDays(identifier: string, days: number, unit?: string): Promise<number | null> {
  try {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    // Cast to `any` — these helpers are deliberately generic across several
    // quantity identifiers, but the library's `queryQuantitySamples` is
    // typed as a strict per-identifier generic (`T extends
    // QuantityTypeIdentifier`) that a plain `string` can't satisfy.
    const samples = await (queryQuantitySamples as any)(identifier, {
      limit: 0, // 0 = no limit — need the full window for an honest average
      ascending: false,
      ...(unit ? {unit} : {}),
      filter: {date: {startDate}},
    });
    if (!samples || samples.length === 0) return null;
    const sum = samples.reduce((s: number, x: any) => s + (x.quantity || 0), 0);
    return sum / samples.length;
  } catch {
    return null;
  }
}

async function fetchWeightTrend(): Promise<{weightKg: number | null; trend30d: number | null}> {
  try {
    // Force kg explicitly — BodyMass otherwise returns in whatever unit the
    // user's Health app locale prefers (kg vs lb), and the field is named
    // weight_kg downstream.
    const latest = await getMostRecentQuantitySample(BODY_MASS as any, 'kg' as any);
    if (!latest) return {weightKg: null, trend30d: null};
    const weightKg = latest.quantity;

    const startDate = new Date(Date.now() - WEIGHT_TREND_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const samples = await (queryQuantitySamples as any)(BODY_MASS, {
      limit: 0,
      ascending: true,
      unit: 'kg',
      filter: {date: {startDate}},
    });
    if (!samples || samples.length === 0) return {weightKg, trend30d: null};
    const earliest = (samples as any[])[0];
    return {weightKg, trend30d: weightKg - earliest.quantity};
  } catch {
    return {weightKg: null, trend30d: null};
  }
}

async function fetchActiveEnergyYesterday(): Promise<number | null> {
  try {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
    const samples = await (queryQuantitySamples as any)(ACTIVE_ENERGY, {
      limit: 0,
      ascending: true,
      unit: 'kcal',
      filter: {date: {startDate: startOfYesterday, endDate: startOfToday}},
    });
    if (!samples || samples.length === 0) return null;
    return (samples as any[]).reduce((s: number, x: any) => s + (x.quantity || 0), 0);
  } catch {
    return null;
  }
}

// "Last night" = the most recent ~24h of sleep-analysis category samples.
// Duration only counts actual asleep stages (core/deep/REM) — "awake" and
// "inBed" (phone/watch on the nightstand, not actually asleep) samples are
// excluded from the total, matching how Apple's own Sleep app reports it.
async function fetchLastNightSleep(): Promise<{hours: number | null; deepPct: number | null}> {
  try {
    const startDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const samples = await (queryCategorySamples as any)(SLEEP_ANALYSIS, {
      limit: 0,
      ascending: false,
      filter: {date: {startDate}},
    });
    if (!samples || samples.length === 0) return {hours: null, deepPct: null};

    let totalMs = 0;
    let deepMs = 0;
    for (const s of samples as any[]) {
      // `value` is the numeric CategoryValueSleepAnalysis enum, not a
      // string (confirmed against the installed package's
      // generated/healthkit.generated.ts) — awake=2, inBed=0, asleepDeep=4.
      const value: number = s.value;
      if (value === CategoryValueSleepAnalysis.awake || value === CategoryValueSleepAnalysis.inBed) continue;
      const start = new Date(s.startDate).getTime();
      const end = new Date(s.endDate).getTime();
      const dur = Math.max(0, end - start);
      totalMs += dur;
      if (value === CategoryValueSleepAnalysis.asleepDeep) deepMs += dur;
    }
    if (totalMs === 0) return {hours: null, deepPct: null};
    return {
      hours: totalMs / 1000 / 60 / 60,
      deepPct: (deepMs / totalMs) * 100,
    };
  } catch {
    return {hours: null, deepPct: null};
  }
}

// Composite 0-100 recovery score, per APPLE_HEALTH_SPEC.md §5. Unlike the
// spec's reference formula (which assumes every input is present), this
// re-normalizes over whichever signals actually had data — a rider without
// an Apple Watch (no HRV) still gets a meaningful score from sleep + RHR
// alone, instead of the missing metric silently dragging the score toward 0.
function calculateRecoveryScore(input: {
  hrv: number | null;
  hrvBaseline: number | null;
  restingHR: number | null;
  rhrBaseline: number | null;
  sleepHours: number | null;
  deepSleepPct: number | null;
}): number | null {
  const {hrv, hrvBaseline, restingHR, rhrBaseline, sleepHours, deepSleepPct} = input;
  if (sleepHours == null) return null; // sleep is the one signal we always require

  const weights = {hrv: 0.3, restingHR: 0.25, sleep: 0.3, sleepQuality: 0.15};
  let total = 0;
  let usedWeight = 0;

  if (hrv != null && hrvBaseline) {
    const hrvRatio = hrv / hrvBaseline;
    const hrvScore = clamp(((hrvRatio - 0.7) / 0.5) * 100, 0, 100);
    total += hrvScore * weights.hrv;
    usedWeight += weights.hrv;
  }
  if (restingHR != null && rhrBaseline != null) {
    const rhrDiff = restingHR - rhrBaseline;
    const rhrScore = clamp(80 - rhrDiff * 8, 0, 100);
    total += rhrScore * weights.restingHR;
    usedWeight += weights.restingHR;
  }

  const sleepScore = clamp(((sleepHours - 5) / 2) * 100, 0, 100);
  total += sleepScore * weights.sleep;
  usedWeight += weights.sleep;

  if (deepSleepPct != null) {
    const qualityScore =
      deepSleepPct >= 15 ? clamp(60 + (deepSleepPct - 15) * 4, 60, 100) : clamp((deepSleepPct / 15) * 60, 0, 60);
    total += qualityScore * weights.sleepQuality;
    usedWeight += weights.sleepQuality;
  }

  if (usedWeight === 0) return null;
  return Math.round(total / usedWeight);
}

export async function fetchHealthSnapshot(): Promise<HealthSnapshot> {
  const [restingHR, rhrBaseline, hrv, hrvBaseline, sleep, weight, vo2max, activeEnergyKcal] = await Promise.all([
    latestQuantity(RESTING_HR),
    averageOverDays(RESTING_HR, BASELINE_WINDOW_DAYS),
    latestQuantity(HRV_SDNN, 'ms'),
    averageOverDays(HRV_SDNN, BASELINE_WINDOW_DAYS, 'ms'),
    fetchLastNightSleep(),
    fetchWeightTrend(),
    latestQuantity(VO2_MAX),
    fetchActiveEnergyYesterday(),
  ]);

  const recoveryScore = calculateRecoveryScore({
    hrv,
    hrvBaseline,
    restingHR,
    rhrBaseline,
    sleepHours: sleep.hours,
    deepSleepPct: sleep.deepPct,
  });

  const snapshot: HealthSnapshot = {
    restingHR,
    rhrBaseline,
    hrv,
    hrvBaseline,
    sleepHours: sleep.hours,
    deepSleepPct: sleep.deepPct,
    weightKg: weight.weightKg,
    weightTrend30d: weight.trend30d,
    vo2max,
    activeEnergyKcal,
    recoveryScore,
    dataFreshness: new Date().toISOString(),
    isAvailable: true,
    isConnected: true,
  };

  try {
    await AsyncStorage.setItem(HEALTH_CACHE_KEY, JSON.stringify(snapshot));
  } catch (err) {
    console.warn('[Health] Failed to cache snapshot:', err);
  }

  return snapshot;
}

export async function getCachedHealth(): Promise<HealthSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(HEALTH_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function isSnapshotFresh(snapshot: HealthSnapshot | null, maxAgeMs: number): boolean {
  if (!snapshot?.dataFreshness) return false;
  return Date.now() - new Date(snapshot.dataFreshness).getTime() < maxAgeMs;
}

// Disconnecting in-app just clears our local cache/state — HealthKit access
// itself can only be revoked by the user via iOS Settings → Privacy →
// Health → BikeLab (there's no programmatic "revoke" API), matching the
// spec's privacy stance (§9).
export async function disconnectHealth(): Promise<void> {
  try {
    await AsyncStorage.removeItem(HEALTH_CACHE_KEY);
  } catch (err) {
    console.warn('[Health] Failed to clear cache:', err);
  }
}

// Snake_case, server-prompt-shaped view of a snapshot — this exact shape is
// what rides along as `health_context` on each coach chat request (see
// server/aiCoach.js buildSystemPrompt) AND what RecoveryCard/
// OvertrainingTrendCard render from client-side (never from a tool_call
// result — see aiCoach.js's analyze_readiness comment on why).
export interface HealthContext {
  recovery_score: number | null;
  resting_hr_bpm: number | null;
  resting_hr_baseline_bpm: number | null;
  hrv_ms: number | null;
  hrv_baseline_ms: number | null;
  sleep_hours: number | null;
  sleep_deep_pct: number | null;
  weight_kg: number | null;
  weight_trend_30d_kg: number | null;
  vo2max: number | null;
  data_freshness: string | null;
}

// Builds the health_context object sent with each coach chat request (see
// server/aiCoach.js buildSystemPrompt). Returns undefined when not
// connected so the request body simply omits the field.
export function buildHealthContext(snapshot: HealthSnapshot | null | undefined): HealthContext | undefined {
  if (!snapshot || !snapshot.isConnected) return undefined;
  return {
    recovery_score: snapshot.recoveryScore,
    resting_hr_bpm: snapshot.restingHR,
    resting_hr_baseline_bpm: snapshot.rhrBaseline,
    hrv_ms: snapshot.hrv,
    hrv_baseline_ms: snapshot.hrvBaseline,
    sleep_hours: snapshot.sleepHours,
    sleep_deep_pct: snapshot.deepSleepPct,
    weight_kg: snapshot.weightKg,
    weight_trend_30d_kg: snapshot.weightTrend30d,
    vo2max: snapshot.vo2max,
    data_freshness: snapshot.dataFreshness,
  };
}
