/**
 * Single, server-computed "Skills Radar" implementation (T-3.3,
 * docs/audit/00-AUDIT-AND-PLAN.md T-3.3, docs/audit/layers/04-cross-layer.md
 * §4.1, docs/audit/layers/02-bikelabapp.md A-07,
 * docs/audit/layers/03-react-spa.md W-44).
 *
 * Product decision (see docs/audit/00-AUDIT-AND-PLAN.md, "Принято
 * 16.09.2026"): the canonical formula is BikeLabApp's variant —
 * `BikeLabApp/src/utils/skillsCalculator.ts` — ported here **verbatim in
 * semantics**: a rolling 90-day window ending "now" (or an injectable
 * `asOf`, so historical snapshots can be recomputed as-of their own
 * `created_at`), 6 scales (climbing/sprint/endurance/tempo/power/
 * consistency), each 0-100, with `confidenceFactor = min(1, sqrt(n/20))`
 * applied to every scale except `consistency` (which already encodes
 * training frequency and is not further corrected — same as the app).
 * `determineRiderProfile` picks a rider-profile label from the 6 scores.
 *
 * react-spa's variant (`react-spa/src/utils/skillsCalculator.js`) used the
 * last 3 *calendar* months instead of a rolling 90-day window and had its
 * own confidence handling — NOT ported here; the app's variant won per the
 * product decision above, and both client copies are deleted in favor of
 * reading `GET /api/skills` from the server (T-3.3).
 *
 * Power: the app's original `calculatePower` scores `powerStats.avgPower`,
 * which client-side came from `PowerAnalysis`'s wind-adjusted power
 * *estimate* (not yet ported — that's T-3.5's `calc/power.ts` +
 * `estimated_power`). Until then, the server has no equivalent estimate, so
 * `calculateAllSkills` accepts an optional `opts.powerStats` with the exact
 * same `{avgPower}` shape and, when the caller doesn't pass one, falls back
 * to a raw-activity estimate (mean of each ride's `weighted_average_watts`
 * — falling back to `average_watts` — across the *current* activities
 * pool passed in, which server callers should already have limited to the
 * rolling 90-day window; see `services/skills.js`). This is documented as
 * an interim approximation: it is not wind/rider/bike-weight adjusted like
 * `PowerAnalysis`'s estimate, so a user's `power` scale may shift once
 * T-3.5 lands a real `estimated_power` column server-side.
 */
import { z } from 'zod';
import { median } from './dates.js';
import type { StravaActivity } from '../types/activity.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SkillsPowerStats {
  avgPower: number;
  maxPower?: number;
  minPower?: number;
  totalActivities?: number;
}

export interface SkillsSummaryInput {
  vo2max?: number | null;
  lthr?: number | null;
}

export interface Skills {
  climbing: number;
  sprint: number;
  endurance: number;
  tempo: number;
  power: number;
  consistency: number;
}

export const SkillsSchema = z.object({
  climbing: z.number().min(0).max(100),
  sprint: z.number().min(0).max(100),
  endurance: z.number().min(0).max(100),
  tempo: z.number().min(0).max(100),
  power: z.number().min(0).max(100),
  consistency: z.number().min(0).max(100),
});

export interface RiderProfile {
  profile: string;
  description: string;
  emoji: string;
}

export const RiderProfileSchema = z.object({
  profile: z.string(),
  description: z.string(),
  emoji: z.string(),
});

export interface CalculateAllSkillsOptions {
  /** "Today", for a rolling 90-day window. Default: `new Date()`. Passing
   * the snapshot's own `created_at` is what lets historical `skills_history`
   * rows be recomputed with this formula without their trend jumping (see
   * `server/scripts/recompute-skills-history.js`). */
  asOf?: Date;
  /** Rolling-window length in days, ending at `asOf`. Default: 90 (the
   * product decision above) — the app's original hard-coded "3 months". */
  windowDays?: number;
  /** Optional pre-computed power stats (see module doc). When omitted, a
   * raw-activity fallback estimate is used instead of returning 0. */
  powerStats?: SkillsPowerStats | null;
  summary?: SkillsSummaryInput | null;
}

/** Fallback power estimate from raw activities — see module doc's "Power" section. */
function fallbackPowerStats(recentActivities: StravaActivity[]): SkillsPowerStats | null {
  const withPower = recentActivities
    .map((a) => a.weighted_average_watts ?? a.average_watts)
    .filter((w): w is number => typeof w === 'number' && w > 0);
  if (withPower.length === 0) return null;
  const avgPower = withPower.reduce((sum, w) => sum + w, 0) / withPower.length;
  return { avgPower, totalActivities: withPower.length };
}

/**
 * Rolling-90-day, confidence-corrected skills for `activities`. Pure —
 * never mutates its inputs, never reads the clock unless `opts.asOf` is
 * omitted. Returns all-zero scales for an empty (or fully out-of-window)
 * activity list, exactly like the app's original.
 */
export function calculateAllSkills(
  activities: StravaActivity[] | null | undefined,
  opts: CalculateAllSkillsOptions = {},
): Skills {
  const all = activities || [];
  if (all.length === 0) {
    return { climbing: 0, sprint: 0, endurance: 0, tempo: 0, power: 0, consistency: 0 };
  }

  const asOf = opts.asOf ?? new Date();
  const windowDays = opts.windowDays ?? 90;
  const startDate = new Date(asOf.getTime() - windowDays * DAY_MS);
  const endDate = asOf;

  const recentActivities = all.filter((a) => {
    const d = new Date(a.start_date);
    return d >= startDate && d <= endDate;
  });

  // Confidence correction: with few activities, skills are inflated by
  // outliers. sqrt curve: 3 rides -> ~0.39, 10 -> ~0.71, 20+ -> 1.0.
  const confidenceFactor = Math.min(1, Math.sqrt(recentActivities.length / 20));

  const powerStats = opts.powerStats !== undefined ? opts.powerStats : fallbackPowerStats(recentActivities);
  const summary = opts.summary ?? null;

  const rawSkills = {
    climbing: calculateClimbing(recentActivities, summary),
    sprint: calculateSprint(recentActivities),
    endurance: calculateEndurance(recentActivities, summary),
    tempo: calculateTempo(recentActivities),
    power: calculatePower(powerStats ?? null),
    // Consistency looks at the last 8 weeks ending `asOf`, independent of
    // the 90-day window above — same as the app's original (it receives
    // `activities`, not `recentActivities`).
    consistency: calculateConsistency(all, asOf),
  };

  return {
    climbing: Math.round(rawSkills.climbing * confidenceFactor),
    sprint: Math.round(rawSkills.sprint * confidenceFactor),
    endurance: Math.round(rawSkills.endurance * confidenceFactor),
    tempo: Math.round(rawSkills.tempo * confidenceFactor),
    power: Math.round(rawSkills.power * confidenceFactor),
    // Not confidence-corrected (already frequency-based), but rounded like the
    // rest: skills_history columns are INTEGER.
    consistency: Math.round(rawSkills.consistency),
  };
}

// 1. CLIMBING - elevation density + VAM.
function calculateClimbing(recentActivities: StravaActivity[], summary: SkillsSummaryInput | null): number {
  const ridesWithElevation = recentActivities.filter((a) => (a.total_elevation_gain || 0) > 100);
  if (ridesWithElevation.length === 0) return 15;

  const elevationData = ridesWithElevation.map((a) => {
    const distance = (a.distance || 0) / 1000;
    const elevation = a.total_elevation_gain || 0;
    const per100km = distance > 0 ? (elevation / distance) * 100 : 0;
    return per100km;
  });
  const avgElevationPer100km = elevationData.reduce((sum, v) => sum + v, 0) / ridesWithElevation.length;

  let densityScore = 0;
  if (avgElevationPer100km < 200) densityScore = (avgElevationPer100km / 200) * 20;
  else if (avgElevationPer100km < 500) densityScore = 20 + ((avgElevationPer100km - 200) / 300) * 20;
  else if (avgElevationPer100km < 1000) densityScore = 40 + ((avgElevationPer100km - 500) / 500) * 20;
  else if (avgElevationPer100km < 1500) densityScore = 60 + ((avgElevationPer100km - 1000) / 500) * 15;
  else if (avgElevationPer100km < 2000) densityScore = 75 + ((avgElevationPer100km - 1500) / 500) * 15;
  else if (avgElevationPer100km < 3000) densityScore = 90 + ((avgElevationPer100km - 2000) / 1000) * 10;
  else densityScore = 100;

  const mountainRides = ridesWithElevation.filter((a) => {
    const elevation = a.total_elevation_gain || 0;
    const distance = (a.distance || 0) / 1000;
    const elevationPerKm = distance > 0 ? elevation / distance : 0;
    return elevation > 350 && elevationPerKm > 15;
  });

  const vamOf = (a: StravaActivity): number => {
    const elevation = a.total_elevation_gain || 0;
    const timeHours = (a.moving_time || 0) / 3600;
    return timeHours > 0 ? elevation / timeHours : 0;
  };

  const vamCurve = (vam: number): number => {
    if (vam < 150) return 0;
    if (vam < 200) return ((vam - 150) / 50) * 20;
    if (vam < 300) return 20 + ((vam - 200) / 100) * 20;
    if (vam < 450) return 40 + ((vam - 300) / 150) * 15;
    if (vam < 600) return 55 + ((vam - 450) / 150) * 10;
    if (vam < 800) return 65 + ((vam - 600) / 200) * 15;
    if (vam < 1200) return 80 + ((vam - 800) / 400) * 20;
    return 100;
  };

  let vamScore = 0;
  if (mountainRides.length > 0) {
    const vamValues = mountainRides.map(vamOf).filter((v) => v > 0);
    if (vamValues.length > 0) vamScore = vamCurve(median(vamValues));
  } else {
    vamScore = densityScore;
  }

  const lthr = summary?.lthr || 165;
  const hrMin = Math.round(lthr * 0.85);
  const hrMax = Math.round(lthr * 0.95);
  const tempoHRMountainRides = mountainRides.filter((a) => {
    const hr = a.average_heartrate || 0;
    return hr >= hrMin && hr <= hrMax;
  });

  let vamHRScore = 0;
  if (tempoHRMountainRides.length > 0) {
    const vamHRValues = tempoHRMountainRides.map(vamOf).filter((v) => v > 0);
    if (vamHRValues.length > 0) vamHRScore = vamCurve(median(vamHRValues));
  } else {
    vamHRScore = vamScore;
  }

  let densityWeight = 0.65;
  let vamWeight = 0.15;
  let vamHRWeight = 0.2;
  if (tempoHRMountainRides.length < 3) {
    vamHRWeight = 0.1;
    vamWeight = 0.25;
  }

  return Math.min(100, densityScore * densityWeight + vamScore * vamWeight + vamHRScore * vamHRWeight);
}

// 2. SPRINT/ATTACK.
function calculateSprint(recentActivities: StravaActivity[]): number {
  const flatRides = recentActivities.filter((a) => {
    const distance = (a.distance || 0) / 1000;
    const elevation = a.total_elevation_gain || 0;
    const elevationRate = distance > 0 ? elevation / distance : 100;
    const avgSpeedKmh = (a.average_speed || 0) * 3.6;
    return elevationRate < 10 && distance > 10 && avgSpeedKmh >= 22;
  });
  if (flatRides.length === 0) return 30;

  const maxSpeedsFlat = flatRides.map((a) => (a.max_speed || 0) * 3.6);
  const medianMaxSpeed = median(maxSpeedsFlat);

  let maxSpeedScore = 0;
  if (medianMaxSpeed < 30) maxSpeedScore = 0;
  else if (medianMaxSpeed < 40) maxSpeedScore = ((medianMaxSpeed - 30) / 10) * 20;
  else if (medianMaxSpeed < 45) maxSpeedScore = 20 + ((medianMaxSpeed - 40) / 5) * 15;
  else if (medianMaxSpeed < 50) maxSpeedScore = 35 + ((medianMaxSpeed - 45) / 5) * 25;
  else if (medianMaxSpeed < 55) maxSpeedScore = 60 + ((medianMaxSpeed - 50) / 5) * 20;
  else if (medianMaxSpeed < 65) maxSpeedScore = 80 + ((medianMaxSpeed - 55) / 10) * 20;
  else maxSpeedScore = 100;

  const variabilities = flatRides
    .filter((a) => a.max_speed && a.average_speed && a.average_speed > 0)
    .map((a) => {
      const maxKmh = (a.max_speed as number) * 3.6;
      const avgKmh = (a.average_speed as number) * 3.6;
      return (maxKmh - avgKmh) / avgKmh;
    });
  const medianVariability = variabilities.length > 0 ? median(variabilities) : 0;

  let variabilityScore = 0;
  if (medianVariability < 0.1) variabilityScore = 0;
  else if (medianVariability < 0.2) variabilityScore = ((medianVariability - 0.1) / 0.1) * 20;
  else if (medianVariability < 0.3) variabilityScore = 20 + ((medianVariability - 0.2) / 0.1) * 20;
  else if (medianVariability < 0.45) variabilityScore = 40 + ((medianVariability - 0.3) / 0.15) * 30;
  else if (medianVariability < 0.6) variabilityScore = 70 + ((medianVariability - 0.45) / 0.15) * 20;
  else if (medianVariability < 0.8) variabilityScore = 90 + ((medianVariability - 0.6) / 0.2) * 10;
  else variabilityScore = 100;

  return Math.min(100, maxSpeedScore * 0.6 + variabilityScore * 0.4);
}

// 3. ENDURANCE - volume + VO2max.
function calculateEndurance(recentActivities: StravaActivity[], summary: SkillsSummaryInput | null): number {
  const totalDistance = recentActivities.reduce((sum, a) => sum + (a.distance || 0) / 1000, 0);
  const avgWeeklyKm = totalDistance / 12; // 12 weeks == 3 months

  let volumeScore = 0;
  if (avgWeeklyKm < 20) volumeScore = 0;
  else if (avgWeeklyKm < 50) volumeScore = 5 + ((avgWeeklyKm - 20) / 30) * 10;
  else if (avgWeeklyKm < 80) volumeScore = 15 + ((avgWeeklyKm - 50) / 30) * 10;
  else if (avgWeeklyKm < 120) volumeScore = 25 + ((avgWeeklyKm - 80) / 40) * 15;
  else if (avgWeeklyKm < 250) volumeScore = 40 + ((avgWeeklyKm - 120) / 130) * 15;
  else if (avgWeeklyKm < 350) volumeScore = 55 + ((avgWeeklyKm - 250) / 100) * 10;
  else if (avgWeeklyKm < 500) volumeScore = 65 + ((avgWeeklyKm - 350) / 150) * 5;
  else volumeScore = 70;

  let vo2maxScore = 0;
  const vo2max = summary?.vo2max;
  if (vo2max) {
    if (vo2max < 20) vo2maxScore = 0;
    else if (vo2max < 30) vo2maxScore = ((vo2max - 20) / 10) * 5;
    else if (vo2max < 40) vo2maxScore = 5 + ((vo2max - 30) / 10) * 5;
    else if (vo2max < 50) vo2maxScore = 10 + ((vo2max - 40) / 10) * 5;
    else if (vo2max < 75) vo2maxScore = 15 + ((vo2max - 50) / 25) * 10;
    else if (vo2max < 85) vo2maxScore = 25 + ((vo2max - 75) / 10) * 5;
    else vo2maxScore = 30;
  }

  return Math.min(100, volumeScore + vo2maxScore);
}

// 4. TEMPO - flat-ground pace + efficiency.
function calculateTempo(recentActivities: StravaActivity[]): number {
  const flatRides = recentActivities.filter((a) => {
    const distance = (a.distance || 0) / 1000;
    const elevation = a.total_elevation_gain || 0;
    const elevationRate = distance > 0 ? elevation / distance : 100;
    return elevationRate < 10 && distance > 20;
  });
  if (flatRides.length === 0) return 0;

  const speeds = flatRides.map((a) => (a.average_speed || 0) * 3.6);
  const medianSpeed = median(speeds);

  let speedScore = 0;
  if (medianSpeed < 12) speedScore = 0;
  else if (medianSpeed < 15) speedScore = 5 + ((medianSpeed - 12) / 3) * 10;
  else if (medianSpeed < 18) speedScore = 15 + ((medianSpeed - 15) / 3) * 10;
  else if (medianSpeed < 22) speedScore = 25 + ((medianSpeed - 18) / 4) * 15;
  else if (medianSpeed < 25) speedScore = 40 + ((medianSpeed - 22) / 3) * 15;
  else if (medianSpeed < 28) speedScore = 55 + ((medianSpeed - 25) / 3) * 15;
  else if (medianSpeed < 32) speedScore = 70 + ((medianSpeed - 28) / 4) * 15;
  else if (medianSpeed < 36) speedScore = 85 + ((medianSpeed - 32) / 4) * 10;
  else if (medianSpeed < 40) speedScore = 95 + ((medianSpeed - 36) / 4) * 5;
  else speedScore = 100;

  const tempoHRRides = flatRides.filter((a) => {
    const hr = a.average_heartrate || 0;
    return hr >= 130 && hr <= 160;
  });

  let efficiencyScore = 0;
  if (tempoHRRides.length > 0) {
    const efficiencies = tempoHRRides
      .map((a) => {
        const speed = (a.average_speed || 0) * 3.6;
        const hr = a.average_heartrate || 0;
        return hr > 0 ? speed / hr : 0;
      })
      .filter((e) => e > 0);
    if (efficiencies.length > 0) {
      const medianEfficiency = median(efficiencies);
      if (medianEfficiency < 0.1) efficiencyScore = 0;
      else if (medianEfficiency < 0.13) efficiencyScore = ((medianEfficiency - 0.1) / 0.03) * 20;
      else if (medianEfficiency < 0.15) efficiencyScore = 20 + ((medianEfficiency - 0.13) / 0.02) * 20;
      else if (medianEfficiency < 0.18) efficiencyScore = 40 + ((medianEfficiency - 0.15) / 0.03) * 20;
      else if (medianEfficiency < 0.21) efficiencyScore = 60 + ((medianEfficiency - 0.18) / 0.03) * 20;
      else if (medianEfficiency < 0.25) efficiencyScore = 80 + ((medianEfficiency - 0.21) / 0.04) * 15;
      else efficiencyScore = 95 + Math.min(((medianEfficiency - 0.25) / 0.05) * 5, 5);
    }
  } else {
    efficiencyScore = speedScore;
  }

  return Math.min(100, speedScore * 0.5 + efficiencyScore * 0.5);
}

// 5. POWER - functional power.
function calculatePower(powerStats: SkillsPowerStats | null): number {
  if (!powerStats || !powerStats.avgPower) return 0;
  const avgPower = powerStats.avgPower;
  let score = 0;
  if (avgPower < 60) score = 0;
  else if (avgPower < 80) score = ((avgPower - 60) / 20) * 15;
  else if (avgPower < 100) score = 15 + ((avgPower - 80) / 20) * 15;
  else if (avgPower < 120) score = 30 + ((avgPower - 100) / 20) * 10;
  else if (avgPower < 200) score = 40 + ((avgPower - 120) / 80) * 20;
  else if (avgPower < 280) score = 60 + ((avgPower - 200) / 80) * 20;
  else if (avgPower < 340) score = 80 + ((avgPower - 280) / 60) * 15;
  else if (avgPower < 450) score = 95 + ((avgPower - 340) / 110) * 5;
  else score = 100;
  return Math.min(100, score);
}

// 6. CONSISTENCY - training regularity over the 8 weeks ending `asOf`.
function calculateConsistency(activities: StravaActivity[], asOf: Date): number {
  const now = asOf;
  const eightWeeksAgo = new Date(now.getTime() - 8 * 7 * DAY_MS);

  const last8WeeksActivities = activities.filter((a) => {
    const d = new Date(a.start_date);
    return d >= eightWeeksAgo && d <= now;
  });
  if (last8WeeksActivities.length === 0) return 0;

  const weeksData: Record<string, { count: number; totalDistance: number; isCurrentWeek: boolean }> = {};

  last8WeeksActivities.forEach((a) => {
    const date = new Date(a.start_date);
    const weekNumber = Math.floor((date.getTime() - eightWeeksAgo.getTime()) / (7 * DAY_MS));
    const weekKey = `week-${weekNumber}`;
    if (!weeksData[weekKey]) weeksData[weekKey] = { count: 0, totalDistance: 0, isCurrentWeek: false };
    weeksData[weekKey].count++;
    weeksData[weekKey].totalDistance += (a.distance || 0) / 1000;
  });

  const currentWeekNumber = Math.floor((now.getTime() - eightWeeksAgo.getTime()) / (7 * DAY_MS));
  for (let i = 0; i < 8; i++) {
    const weekKey = `week-${i}`;
    if (!weeksData[weekKey]) {
      weeksData[weekKey] = { count: 0, totalDistance: 0, isCurrentWeek: i === currentWeekNumber };
    } else {
      weeksData[weekKey].isCurrentWeek = i === currentWeekNumber;
    }
  }

  const weeks = Object.values(weeksData);
  const completedWeeks = weeks.filter((w) => !w.isCurrentWeek);
  const currentWeek = weeks.find((w) => w.isCurrentWeek);

  const weeksWithZero = completedWeeks.filter((w) => w.count === 0).length;
  const weeksWithOne = completedWeeks.filter((w) => w.count === 1).length;
  const weeksWithMin2 = completedWeeks.filter((w) => w.count >= 2).length;
  const weeksWithMin3 = completedWeeks.filter((w) => w.count >= 3).length;
  const effectiveWeeksWithZero = Math.max(0, weeksWithZero - 1);

  let coverageScore = 0;
  coverageScore -= effectiveWeeksWithZero * 5;
  coverageScore += weeksWithOne * 2.5;
  coverageScore += weeksWithMin2 * 5;
  coverageScore += weeksWithMin3 * 0.5;
  coverageScore = Math.max(0, Math.min(40, coverageScore));

  if (currentWeek && currentWeek.count >= 1) {
    if (currentWeek.count >= 3) coverageScore += Math.min(5, currentWeek.count * 1.5);
    else coverageScore += Math.min(2, currentWeek.count * 0.5);
  }
  coverageScore = Math.max(0, Math.min(40, coverageScore));

  const weeklyDistances = completedWeeks.map((w) => w.totalDistance);
  const avgWeeklyDistance = weeklyDistances.reduce((sum, d) => sum + d, 0) / weeklyDistances.length;

  let stabilityScore = 0;
  if (avgWeeklyDistance >= 30) {
    const variance = weeklyDistances.reduce((sum, d) => sum + Math.pow(d - avgWeeklyDistance, 2), 0) / weeklyDistances.length;
    const stdDev = Math.sqrt(variance);
    const cv = Math.min(1, stdDev / avgWeeklyDistance);
    stabilityScore = 30 * Math.pow(1 - cv, 1.5);
  }

  const totalScore = coverageScore + stabilityScore;
  const finalScore = (totalScore / 70) * 100;
  return Math.max(0, Math.min(100, finalScore));
}

/**
 * Determines a rider-profile label from a 6-scale `Skills` object. Ported
 * from `BikeLabApp/src/utils/skillsCalculator.ts`'s `determineRiderProfile`
 * — the app's variant (with `description`) won over `server/server.js`'s
 * own copy (`determineRiderProfile`, ~line 1703), which was otherwise
 * identical logic minus the `description` field; that server copy is
 * replaced by this shared one (see `server/server.js`'s `/api/bikes/:id/
 * health` route). `server.js`'s `computeRidingStyle` is a *different*,
 * simpler 3-scale linear model used only for bike-component wear factors —
 * it does not duplicate this and is left as-is.
 */
export function determineRiderProfile(skills: Skills | null | undefined): RiderProfile {
  if (!skills) {
    return { profile: 'Unknown', description: 'Not enough data', emoji: '❓' };
  }

  const { climbing, sprint, endurance, tempo, power, consistency } = skills;
  const avgSkill = (climbing + sprint + endurance + tempo + power + consistency) / 6;

  const skillsArray = [
    { name: 'climbing', value: climbing },
    { name: 'sprint', value: sprint },
    { name: 'endurance', value: endurance },
    { name: 'tempo', value: tempo },
    { name: 'power', value: power },
    { name: 'consistency', value: consistency },
  ].sort((a, b) => b.value - a.value);

  const topSkill = skillsArray[0];
  const secondSkill = skillsArray[1];
  const dominance = topSkill.value - avgSkill;

  if (avgSkill < 40) {
    return { profile: 'Developing Rider', description: 'Keep training, results will come!', emoji: '🎯' };
  }

  const maxDiff = Math.max(...skillsArray.map((s) => s.value)) - Math.min(...skillsArray.map((s) => s.value));
  if (maxDiff < 20 && avgSkill >= 55) {
    return { profile: 'All-Rounder', description: 'Balanced across all areas', emoji: '🚴' };
  }

  if (consistency > 75 && consistency - avgSkill > 15) {
    return { profile: 'Consistent Trainer', description: 'Discipline is your strength', emoji: '📊' };
  }

  if (tempo >= 60 && power >= 60 && (tempo + power) / 2 > avgSkill + 10) {
    return { profile: 'Time Trialist', description: 'Speed and power combined', emoji: '⏱️' };
  }

  if (dominance > 10) {
    switch (topSkill.name) {
      case 'climbing':
        return { profile: 'Climber', description: 'Mountains are your playground', emoji: '🏔️' };
      case 'sprint':
        return { profile: 'Sprinter', description: 'Explosive power on demand', emoji: '⚡' };
      case 'endurance':
        return { profile: 'Endurance Rider', description: 'Built for long distances', emoji: '💪' };
      case 'tempo':
        return { profile: 'Tempo Specialist', description: 'Sustained speed master', emoji: '🎯' };
      case 'power':
        return { profile: 'Power House', description: 'Watts for days', emoji: '⚡' };
      default:
        return { profile: 'Versatile Rider', description: 'Adapting to any challenge', emoji: '🚴' };
    }
  }

  if (topSkill.name === 'climbing' && secondSkill.name === 'endurance') {
    return { profile: 'Mountain Endurance', description: 'Long climbs specialist', emoji: '🏔️' };
  }
  if (topSkill.name === 'sprint' && secondSkill.name === 'power') {
    return { profile: 'Explosive Sprinter', description: 'Pure acceleration', emoji: '💥' };
  }

  return { profile: 'Versatile Rider', description: 'Growing in all areas', emoji: '🚴' };
}
