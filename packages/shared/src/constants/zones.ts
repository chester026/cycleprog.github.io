/**
 * Heart-rate zone coefficient tables (T-2.4, docs/audit/layers/04-cross-layer.md
 * §4.9, §6.1). Constants only — `computeHrZones` itself lives in
 * `../calc/hrZones.ts` (T-3.1), which imports `HR_ZONE_COLORS` from here.
 *
 * Sourced from `react-spa/src/components/HeartRateZonesChart.jsx`, which
 * computes zone boundaries three ways depending on what profile data is
 * available:
 *  - LTHR (lactate-threshold heart rate): boundary coefficients applied to
 *    `lactateThreshold`.
 *  - Karvonen (heart-rate reserve): coefficients applied to
 *    `restingHR + hrReserve * coefficient`.
 *  - %maxHR: coefficients applied directly to `maxHR`.
 *
 * Karvonen and %maxHR happen to share the same five coefficients.
 */

/** LTHR-based zone boundaries: zone1 [0.75,0.85) ... zone5 [1.03, maxHR). */
export const LTHR_ZONE_COEFFICIENTS = [0.75, 0.85, 0.92, 0.97, 1.03] as const;

/** Karvonen (heart-rate-reserve) zone boundary coefficients, applied as `restingHR + hrReserve * c`. */
export const KARVONEN_ZONE_COEFFICIENTS = [0.5, 0.6, 0.7, 0.8, 0.9] as const;

/** %maxHR zone boundary coefficients, applied directly to `maxHR`. */
export const PERCENT_MAX_HR_ZONE_COEFFICIENTS = [0.5, 0.6, 0.7, 0.8, 0.9] as const;

/**
 * Semantic zone colors — identical across
 * `BikeLabApp/src/components/HeartAnalysis.tsx:227-231` and
 * `react-spa/src/components/HeartRateZonesChart.jsx`'s `COLORS`.
 */
export const HR_ZONE_COLORS = {
  zone1: '#22c55e',
  zone2: '#84cc16',
  zone3: '#eab308',
  zone4: '#f97316',
  zone5: '#ef4444',
} as const;
export type HrZoneName = keyof typeof HR_ZONE_COLORS;
