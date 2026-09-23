// Pure logic extracted from RideAnalyticsScreen.tsx (T-5.1/T-5.4 screen
// decomposition). No React/React Native imports here on purpose — this is
// what lib.test.ts exercises directly. Behaviour copied 1:1 from the
// original inline implementation.
import type {Activity} from '../../types/activity';
import type {UserProfile} from '@bikelab/shared/types';
import {computeHrZones, zoneForHr} from '@bikelab/shared/calc';
import type {StreamData} from '../../utils/streamsCache';
import {colors} from '../../theme';

export interface ChartPoint {
  value: number;
  index: number;
  dataPointText: string;
}

export interface HrZoneBucket {
  zone: string;
  minutes: number;
  percent: number;
  color: string;
  rangeMin: number;
  rangeMax: number;
}

export interface RideQuality {
  quality: number;
  label: string;
  advice: string;
}

export interface RideQualityCopy {
  poor: {label: string; advice: string};
  belowAvg: {label: string; advice: string};
  average: {label: string; advice: string};
  good: {label: string; advice: string};
  wellDone: {label: string; advice: string};
  excellent: {label: string; advice: string};
  awesome: {label: string; advice: string};
}

/** `dd.mm.yyyy`, matching the original inline formatter exactly (not
 * locale-formatted — always this fixed layout). */
export function formatRideDate(startDate: string): string {
  const d = new Date(startDate);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()}`;
}

/** Downsamples a raw stream array to at most ~40 points for a mini chart. */
export function prepareChartData(dataArray: number[]): ChartPoint[] {
  if (!dataArray || dataArray.length === 0) return [];

  const maxPoints = 40;
  const step = Math.max(1, Math.floor(dataArray.length / maxPoints));
  const sampledData = dataArray.filter((_, index) => index % step === 0);

  return sampledData.map((value, index) => ({
    value,
    index,
    dataPointText: value.toFixed(0),
  }));
}

/** Average of a stream, optionally excluding zero readings (cadence, while
 * coasting). */
export function averageOf(data: number[], excludeZeros = false): number {
  const filtered = excludeZeros ? data.filter(v => v > 0) : data;
  if (filtered.length === 0) return 0;
  return filtered.reduce((sum, v) => sum + v, 0) / filtered.length;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * HR-zone time distribution + the derived "Ride Quality" 0-100 score for
 * one activity's heart-rate/cadence streams. Ported verbatim from the
 * original screen's single combined `useEffect` (same formula weights,
 * same clamps) — split out here only so it's unit-testable without
 * mounting the screen.
 */
export function computeRideAnalysis(
  streams: StreamData | null | undefined,
  userProfile: UserProfile | null | undefined,
  activity: Activity,
  copy: RideQualityCopy,
): {hrZoneDistribution: HrZoneBucket[]; rideQuality: RideQuality | null} {
  const hrData = streams?.heartrate?.data;
  const timeData = streams?.time?.data;
  if (!hrData || !timeData) return {hrZoneDistribution: [], rideQuality: null};

  const maxHR = userProfile?.max_hr || activity.max_heartrate || 190;
  const restHR = userProfile?.resting_hr || 60;
  const hrReserve = maxHR - restHR;
  if (hrReserve <= 0) return {hrZoneDistribution: [], rideQuality: null};

  // Single shared HR-zones implementation (T-3.1): LT-based if available,
  // otherwise Karvonen (HRR) — same priority `computeHrZones` uses
  // everywhere else.
  const hrZones = computeHrZones({
    max_hr: userProfile?.max_hr ?? activity.max_heartrate ?? null,
    resting_hr: userProfile?.resting_hr ?? null,
    lactate_threshold: userProfile?.lactate_threshold ?? null,
    age: userProfile?.age ?? null,
  });
  const zones = hrZones.zones.map(z => ({zone: `Z${z.id}`, min: z.min, max: z.max, color: z.color}));

  const zoneTimes = [0, 0, 0, 0, 0];
  for (let i = 1; i < hrData.length; i++) {
    const hr = hrData[i];
    const dt = timeData[i] - timeData[i - 1];
    const zoneId = zoneForHr(hrZones, hr);
    if (zoneId != null) zoneTimes[zoneId - 1] += dt;
  }

  const totalTime = zoneTimes.reduce((a, b) => a + b, 0);
  if (totalTime === 0) return {hrZoneDistribution: [], rideQuality: null};

  const hrZoneDistribution: HrZoneBucket[] = zones.map((z, i) => ({
    zone: z.zone,
    minutes: Math.round(zoneTimes[i] / 60),
    percent: Math.round((zoneTimes[i] / totalTime) * 100),
    color: z.color,
    rangeMin: Math.round(z.min),
    rangeMax: Math.round(z.max ?? maxHR),
  }));

  // Effort Score used to be computed here too (avgHR/duration-based) but
  // moved server-side into get_activity_analysis + the RideScoreCard rich
  // chat card — it no longer has a dashboard presence. `intensity` below
  // is still needed for the Ride Quality cardiac-efficiency term.
  const avgHR = hrData.reduce((a, b) => a + b, 0) / hrData.length;
  const intensity = clamp((avgHR - restHR) / hrReserve, 0, 1);

  // Ride Quality calculation
  const speedKmh = (activity.average_speed || 0) * 3.6;
  const maxSpeedKmh = (activity.max_speed || 0) * 3.6;
  const hrIntensity = clamp(intensity, 0.01, 1);

  // A. Cardiac Efficiency (40%): speed per unit of HR effort
  const efficiencyRaw = speedKmh / (hrIntensity * 50);
  const cardiacScore = clamp(efficiencyRaw * 80, 0, 100);

  // B. Cadence Score (25%): peak at 87.5 rpm, penalty for deviation
  const avgCadence = averageOf(streams?.cadence?.data ?? [], true);
  const cadenceScore = avgCadence > 0 ? clamp(100 - Math.abs(avgCadence - 87.5) * 3, 0, 100) : 50;

  // C. Speed Performance (20%): avg + max speed bonus
  const avgSpeedScore = clamp((speedKmh / 35) * 100, 0, 100);
  const maxSpeedBonus = clamp(maxSpeedKmh / 55, 0, 1) * 20;
  const speedScore = clamp(avgSpeedScore + maxSpeedBonus, 0, 100);

  // D. HR Zone Efficiency (15%): time in productive zones (Z2-Z3)
  const productiveTime = zoneTimes[1] + zoneTimes[2];
  const overloadTime = zoneTimes[4];
  const zoneEfficiency =
    totalTime > 0
      ? clamp((productiveTime / totalTime) * 120 - (overloadTime / totalTime) * 40, 0, 100)
      : 50;

  // Elevation correction multiplier
  const distKm = activity.distance / 1000;
  const gradient = distKm > 0 ? activity.total_elevation_gain / distKm : 0;
  const elevationMultiplier = clamp(1 + gradient * 0.02, 1.0, 1.4);

  const rawQuality =
    (cardiacScore * 0.4 + cadenceScore * 0.25 + speedScore * 0.2 + zoneEfficiency * 0.15) *
    elevationMultiplier;
  const quality = clamp(Math.round(rawQuality), 0, 100);

  return {hrZoneDistribution, rideQuality: rideQualityFor(quality, copy)};
}

/** Maps a 0-100 quality score to its label/advice band (ported verbatim —
 * the 7 bands and their thresholds are unchanged). `copy` is the screen's
 * `t('rideAnalytics.quality*')`-resolved strings — this used to be 7
 * un-translated literal English strings inline in the JSX; the
 * `rideAnalytics.quality*`/`quality*Advice` i18n keys already exist (used
 * by `RideScoreCard`'s identical copy) and are reused here instead of
 * adding new ones, fixing the missing Russian translation as a side
 * effect of the refactor. */
export function rideQualityFor(quality: number, copy: RideQualityCopy): RideQuality {
  if (quality <= 20) return {quality, label: copy.poor.label, advice: copy.poor.advice};
  if (quality <= 35) return {quality, label: copy.belowAvg.label, advice: copy.belowAvg.advice};
  if (quality <= 50) return {quality, label: copy.average.label, advice: copy.average.advice};
  if (quality <= 65) return {quality, label: copy.good.label, advice: copy.good.advice};
  if (quality <= 75) return {quality, label: copy.wellDone.label, advice: copy.wellDone.advice};
  if (quality <= 85) return {quality, label: copy.excellent.label, advice: copy.excellent.advice};
  return {quality, label: copy.awesome.label, advice: copy.awesome.advice};
}

/** Quality-band color, used for the dot + label next to the score (ported
 * verbatim from the original inline IIFE in the JSX). */
export function rideQualityColor(quality: number): string {
  if (quality <= 20) return colors.rideQuality.poor;
  if (quality <= 35) return colors.rideQuality.belowAvg;
  if (quality <= 50) return colors.rideQuality.average;
  if (quality <= 65) return colors.rideQuality.good;
  if (quality <= 75) return colors.rideQuality.wellDone;
  if (quality <= 85) return colors.rideQuality.excellent;
  return colors.rideQuality.awesome;
}
