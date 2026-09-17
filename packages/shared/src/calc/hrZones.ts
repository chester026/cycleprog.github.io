/**
 * Single, server-computed heart-rate zone implementation (T-3.1,
 * docs/audit/00-AUDIT-AND-PLAN.md T-3.1, docs/audit/layers/04-cross-layer.md
 * §4.4). Replaces the ~9 client-side copies of `calculateHRZones` /
 * `calculateUserHRZones` (react-spa `OnboardingModal.jsx`, `ProfilePage.jsx`,
 * `AnalysisPage.jsx`, `HeartRateZonesChart.jsx`; BikeLabApp `HRZonesScreen.tsx`,
 * `AnalysisScreen.tsx`, `RideAnalyticsScreen.tsx`, `HeartAnalysis.tsx`,
 * `OnboardingScreen.tsx`).
 *
 * Canonical method priority (all copies agreed on this):
 *  1. `lthr` — lactate-threshold HR, when `profile.lactate_threshold` is set.
 *  2. `karvonen` — heart-rate reserve, when both `max_hr` and `resting_hr` are
 *     known (directly or derived).
 *  3. `maxhr` — straight %-of-max-HR, using
 *     `max_hr || 220 - age || 190` as the fallback max HR.
 *
 * All boundaries are rounded to the nearest integer bpm and zones are
 * contiguous: zone N's `max` equals zone N+1's `min`. Zone 5's `max` is
 * `null` (open-ended above `max_hr` — several client copies used `< max` for
 * zones 1-4 but `>= min` only for zone 5, so this makes the "zone 5 has no
 * ceiling" behaviour explicit rather than accidental).
 */
import { HR_ZONE_COLORS } from '../constants/zones.js';

export type HrZoneMethod = 'lthr' | 'karvonen' | 'maxhr';

export interface HrZoneBand {
  id: 1 | 2 | 3 | 4 | 5;
  key: 'z1' | 'z2' | 'z3' | 'z4' | 'z5';
  /** i18n key for the zone name; clients resolve it via their own i18n. */
  nameKey: string;
  /** Default English name, for callers without i18n (react-spa today). */
  name: string;
  min: number;
  max: number | null;
  color: string;
}

export interface HrZones {
  method: HrZoneMethod;
  basis: {
    max_hr: number;
    resting_hr?: number;
    lactate_threshold?: number;
  };
  zones: HrZoneBand[];
}

export interface HrZonesProfile {
  max_hr?: number | null;
  resting_hr?: number | null;
  lactate_threshold?: number | null;
  age?: number | null;
  birth_date?: string | null;
}

const ZONE_META: Array<Pick<HrZoneBand, 'id' | 'key' | 'nameKey' | 'name'>> = [
  { id: 1, key: 'z1', nameKey: 'zones.z1', name: 'Recovery' },
  { id: 2, key: 'z2', nameKey: 'zones.z2', name: 'Endurance' },
  { id: 3, key: 'z3', nameKey: 'zones.z3', name: 'Tempo' },
  { id: 4, key: 'z4', nameKey: 'zones.z4', name: 'Threshold' },
  { id: 5, key: 'z5', nameKey: 'zones.z5', name: 'VO2 Max' },
];

const ZONE_COLORS = [
  HR_ZONE_COLORS.zone1,
  HR_ZONE_COLORS.zone2,
  HR_ZONE_COLORS.zone3,
  HR_ZONE_COLORS.zone4,
  HR_ZONE_COLORS.zone5,
];

function ageFromBirthDate(birthDate: string): number | null {
  const parsed = new Date(birthDate);
  if (Number.isNaN(parsed.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - parsed.getFullYear();
  const monthDiff = now.getMonth() - parsed.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < parsed.getDate())) {
    age -= 1;
  }
  return age;
}

/** Builds 5 contiguous {min,max} bands from a boundary-coefficient list applied to a base+scale. */
function buildBands(
  base: number,
  scale: number,
  coefficients: readonly [number, number, number, number, number],
): Array<{ min: number; max: number | null }> {
  const boundaries = coefficients.map((c) => Math.round(base + scale * c));
  return [
    { min: boundaries[0], max: boundaries[1] },
    { min: boundaries[1], max: boundaries[2] },
    { min: boundaries[2], max: boundaries[3] },
    { min: boundaries[3], max: boundaries[4] },
    { min: boundaries[4], max: null },
  ];
}

function assemble(method: HrZoneMethod, basis: HrZones['basis'], bands: Array<{ min: number; max: number | null }>): HrZones {
  return {
    method,
    basis,
    zones: bands.map((band, i) => ({
      ...ZONE_META[i],
      min: band.min,
      max: band.max,
      color: ZONE_COLORS[i],
    })),
  };
}

/**
 * Computes 5-zone heart-rate zones for a profile using the canonical method
 * priority: LTHR > Karvonen (HRR) > %maxHR. Returns `null` when there isn't
 * enough data (no `max_hr`, `age`/`birth_date` to derive it, or hard-coded
 * fallback).
 */
export function computeHrZones(profile: HrZonesProfile): HrZones {
  const age = profile.age ?? (profile.birth_date ? ageFromBirthDate(profile.birth_date) : null);
  // Known/derivable max HR — `null` when we have neither an explicit value
  // nor an age to estimate it from. Kept separate from the 190bpm fallback
  // below so that fallback doesn't itself count as "known max_hr" for the
  // Karvonen-eligibility check.
  const knownMaxHr = profile.max_hr ?? (age ? 220 - age : null);
  const maxHr = knownMaxHr ?? 190;
  const restingHr = profile.resting_hr ?? undefined;
  const lactateThreshold = profile.lactate_threshold ?? undefined;

  if (lactateThreshold) {
    const bands = buildBands(0, lactateThreshold, [0.75, 0.85, 0.92, 0.97, 1.03]);
    return assemble('lthr', { max_hr: maxHr, resting_hr: restingHr, lactate_threshold: lactateThreshold }, bands);
  }

  if (knownMaxHr && restingHr) {
    const reserve = knownMaxHr - restingHr;
    const bands = buildBands(restingHr, reserve, [0.5, 0.6, 0.7, 0.8, 0.9]);
    return assemble('karvonen', { max_hr: knownMaxHr, resting_hr: restingHr }, bands);
  }

  const bands = buildBands(0, maxHr, [0.5, 0.6, 0.7, 0.8, 0.9]);
  return assemble('maxhr', { max_hr: maxHr }, bands);
}

/**
 * Finds which zone (1-5) a heart rate falls in, or `null` when it is below
 * zone 1's floor. Zone 5 has no ceiling (its `max` is `null`).
 */
export function zoneForHr(zones: HrZones | HrZoneBand[], bpm: number): 1 | 2 | 3 | 4 | 5 | null {
  const bands = Array.isArray(zones) ? zones : zones.zones;
  for (let i = bands.length - 1; i >= 0; i -= 1) {
    if (bpm >= bands[i].min) return bands[i].id;
  }
  return null;
}

/** Default English zone name by 1-based zone id ('Recovery', … 'VO2 Max'). */
export function zoneName(id: 1 | 2 | 3 | 4 | 5): string {
  return ZONE_META[id - 1].name;
}
