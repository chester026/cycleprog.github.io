/**
 * Per-ride analysis shared by the app's RideAnalytics screen and the web's
 * ride analysis modal: HR-zone time distribution, the 0-100 "Ride Quality"
 * score with its band copy/color, the mini-chart downsampler and the
 * "Discuss with Coach" prompt. Pure — no React, no i18n; callers pass copy.
 *
 * Zones come from `computeHrZones` (LT-based when available, otherwise
 * Karvonen) so a ride is bucketed with the same boundaries the rest of the
 * product shows.
 */
import { computeHrZones, zoneForHr } from './hrZones.js';
import {
  RIDE_QUALITY_BANDS,
  RIDE_QUALITY_COLORS,
  RIDE_QUALITY_COPY_EN,
} from '../constants/rideQuality.js';
import type { RideQualityBand, RideQualityCopy } from '../constants/rideQuality.js';

/** Strava streams as `GET /api/activities/:id/streams` returns them (keyed by type). */
export interface RideStreams {
  heartrate?: { data: number[] };
  cadence?: { data: number[] };
  watts?: { data: number[] };
  altitude?: { data: number[] };
  velocity_smooth?: { data: number[] };
  time?: { data: number[] };
  distance?: { data: number[] };
  latlng?: { data: [number, number][] };
}

/** The activity fields the analysis reads — a structural subset of `StravaActivity`. */
export interface RideAnalysisActivity {
  distance: number;
  total_elevation_gain: number;
  average_speed?: number | null;
  max_speed?: number | null;
  max_heartrate?: number | null;
}

/** The profile fields the analysis reads — a structural subset of `UserProfile`. */
export interface RideAnalysisProfile {
  max_hr?: number | null;
  resting_hr?: number | null;
  lactate_threshold?: number | null;
  age?: number | null;
}

export interface StreamChartPoint {
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
  band: RideQualityBand;
  label: string;
  advice: string;
}

export interface RideAnalysis {
  hrZoneDistribution: HrZoneBucket[];
  rideQuality: RideQuality | null;
}

const EMPTY_ANALYSIS: RideAnalysis = { hrZoneDistribution: [], rideQuality: null };

/** Fallbacks when neither the profile nor the ride carries the value. */
const DEFAULT_MAX_HR_BPM = 190;
const DEFAULT_RESTING_HR_BPM = 60;

const CHART_MAX_POINTS = 40;

/** Ride Quality formula weights and reference values. */
const CARDIAC_WEIGHT = 0.4;
const CADENCE_WEIGHT = 0.25;
const SPEED_WEIGHT = 0.2;
const ZONE_WEIGHT = 0.15;
const IDEAL_CADENCE_RPM = 87.5;
const CADENCE_PENALTY_PER_RPM = 3;
const REFERENCE_AVG_SPEED_KMH = 35;
const REFERENCE_MAX_SPEED_KMH = 55;
const MAX_SPEED_BONUS_POINTS = 20;
const MPS_TO_KMH = 3.6;

/** `dd.mm.yyyy` in the viewer's local time zone — a fixed layout, not locale-formatted. */
export function formatRideDate(startDate: string | Date): string {
  const d = new Date(startDate);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()}`;
}

/** Downsamples a raw stream to at most ~40 points for a mini chart. */
export function prepareChartData(dataArray: number[] | null | undefined): StreamChartPoint[] {
  if (!dataArray || dataArray.length === 0) return [];
  const step = Math.max(1, Math.floor(dataArray.length / CHART_MAX_POINTS));
  return dataArray
    .filter((_, index) => index % step === 0)
    .map((value, index) => ({ value, index, dataPointText: value.toFixed(0) }));
}

/** Average of a stream, optionally excluding zero readings (cadence while coasting). */
export function averageOf(data: number[], excludeZeros = false): number {
  const filtered = excludeZeros ? data.filter((v) => v > 0) : data;
  if (filtered.length === 0) return 0;
  return filtered.reduce((sum, v) => sum + v, 0) / filtered.length;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Maps a 0-100 score to its band (inclusive upper bounds, see `RIDE_QUALITY_BANDS`). */
export function rideQualityBand(quality: number): RideQualityBand {
  const match = RIDE_QUALITY_BANDS.find((b) => quality <= b.maxScore);
  return match ? match.band : 'awesome';
}

/** Label/advice for a score; `copy` defaults to the English set. */
export function rideQualityFor(quality: number, copy: RideQualityCopy = RIDE_QUALITY_COPY_EN): RideQuality {
  const band = rideQualityBand(quality);
  return { quality, band, label: copy[band].label, advice: copy[band].advice };
}

/** Band color for the dot/label next to the score. */
export function rideQualityColor(quality: number): string {
  return RIDE_QUALITY_COLORS[rideQualityBand(quality)];
}

/**
 * HR-zone time distribution plus the derived Ride Quality score for one
 * ride's streams. Needs heart-rate and time streams; without them (or with
 * a non-positive HR reserve, or no time spent in any zone) both results are
 * empty and the UI hides the blocks.
 */
export function computeRideAnalysis(
  streams: RideStreams | null | undefined,
  userProfile: RideAnalysisProfile | null | undefined,
  activity: RideAnalysisActivity,
  copy: RideQualityCopy = RIDE_QUALITY_COPY_EN,
): RideAnalysis {
  const hrData = streams?.heartrate?.data;
  const timeData = streams?.time?.data;
  if (!hrData || !timeData) return EMPTY_ANALYSIS;

  const maxHR = userProfile?.max_hr || activity.max_heartrate || DEFAULT_MAX_HR_BPM;
  const restHR = userProfile?.resting_hr || DEFAULT_RESTING_HR_BPM;
  const hrReserve = maxHR - restHR;
  if (hrReserve <= 0) return EMPTY_ANALYSIS;

  const hrZones = computeHrZones({
    max_hr: userProfile?.max_hr ?? activity.max_heartrate ?? null,
    resting_hr: userProfile?.resting_hr ?? null,
    lactate_threshold: userProfile?.lactate_threshold ?? null,
    age: userProfile?.age ?? null,
  });

  const zoneTimes = [0, 0, 0, 0, 0];
  for (let i = 1; i < hrData.length; i++) {
    const dt = timeData[i] - timeData[i - 1];
    const zoneId = zoneForHr(hrZones, hrData[i]);
    if (zoneId != null) zoneTimes[zoneId - 1] += dt;
  }

  const totalTime = zoneTimes.reduce((a, b) => a + b, 0);
  if (totalTime === 0) return EMPTY_ANALYSIS;

  const hrZoneDistribution: HrZoneBucket[] = hrZones.zones.map((z, i) => ({
    zone: `Z${z.id}`,
    minutes: Math.round(zoneTimes[i] / 60),
    percent: Math.round((zoneTimes[i] / totalTime) * 100),
    color: z.color,
    rangeMin: Math.round(z.min),
    rangeMax: Math.round(z.max ?? maxHR),
  }));

  const avgHR = hrData.reduce((a, b) => a + b, 0) / hrData.length;
  const intensity = clamp((avgHR - restHR) / hrReserve, 0, 1);

  const speedKmh = (activity.average_speed || 0) * MPS_TO_KMH;
  const maxSpeedKmh = (activity.max_speed || 0) * MPS_TO_KMH;
  const hrIntensity = clamp(intensity, 0.01, 1);

  // A. Cardiac efficiency: speed per unit of HR effort.
  const cardiacScore = clamp((speedKmh / (hrIntensity * 50)) * 80, 0, 100);

  // B. Cadence: peaks at the ideal rpm, linear penalty for deviation;
  // a ride without cadence data gets a neutral 50.
  const avgCadence = averageOf(streams?.cadence?.data ?? [], true);
  const cadenceScore =
    avgCadence > 0 ? clamp(100 - Math.abs(avgCadence - IDEAL_CADENCE_RPM) * CADENCE_PENALTY_PER_RPM, 0, 100) : 50;

  // C. Speed: average vs reference plus a max-speed bonus.
  const avgSpeedScore = clamp((speedKmh / REFERENCE_AVG_SPEED_KMH) * 100, 0, 100);
  const maxSpeedBonus = clamp(maxSpeedKmh / REFERENCE_MAX_SPEED_KMH, 0, 1) * MAX_SPEED_BONUS_POINTS;
  const speedScore = clamp(avgSpeedScore + maxSpeedBonus, 0, 100);

  // D. Zone efficiency: time in the productive Z2-Z3, minus Z5 overload.
  const productiveTime = zoneTimes[1] + zoneTimes[2];
  const overloadTime = zoneTimes[4];
  const zoneEfficiency = clamp((productiveTime / totalTime) * 120 - (overloadTime / totalTime) * 40, 0, 100);

  // Hilly rides get up to +40% — a slow average speed on a climb is not a worse ride.
  const distKm = activity.distance / 1000;
  const gradient = distKm > 0 ? activity.total_elevation_gain / distKm : 0;
  const elevationMultiplier = clamp(1 + gradient * 0.02, 1.0, 1.4);

  const rawQuality =
    (cardiacScore * CARDIAC_WEIGHT +
      cadenceScore * CADENCE_WEIGHT +
      speedScore * SPEED_WEIGHT +
      zoneEfficiency * ZONE_WEIGHT) *
    elevationMultiplier;
  const quality = clamp(Math.round(rawQuality), 0, 100);

  return { hrZoneDistribution, rideQuality: rideQualityFor(quality, copy) };
}

/** The activity fields the coach prompt names. */
export interface RideCoachPromptActivity {
  name: string;
  distance: number;
  total_elevation_gain: number;
  moving_time: number;
}

/**
 * The "Discuss with Coach" opener for a ride. The activity id travels as a
 * separate parameter (hidden model context), never inside this visible text.
 */
export function rideCoachPrompt(activity: RideCoachPromptActivity, rideDate: string): string {
  const distKm = (activity.distance / 1000).toFixed(1);
  const elevM = Math.round(activity.total_elevation_gain);
  const minutes = Math.floor(activity.moving_time / 60);
  return `Analyse my ride "${activity.name}" from ${rideDate}: ${distKm}km, ${elevM}m elevation, ${minutes} min`;
}
