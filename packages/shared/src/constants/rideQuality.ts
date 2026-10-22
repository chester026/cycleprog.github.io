/**
 * Ride Quality score bands (0-100) shown on the app's RideAnalytics screen
 * and the web's ride analysis modal. The seven thresholds, colors and
 * default English copy are one set here so both clients grade a ride the
 * same way; `rideQualityFor`/`rideQualityColor` in `../calc/rideAnalysis.ts`
 * read them.
 *
 * `poor` and `awesome` share a color on purpose — the design uses the same
 * violet for both ends of the scale.
 */

export type RideQualityBand =
  | 'poor'
  | 'belowAvg'
  | 'average'
  | 'good'
  | 'wellDone'
  | 'excellent'
  | 'awesome';

/** Inclusive upper bound of each band, in ascending order; the last band is open-ended. */
export const RIDE_QUALITY_BANDS: ReadonlyArray<{ band: RideQualityBand; maxScore: number }> = [
  { band: 'poor', maxScore: 20 },
  { band: 'belowAvg', maxScore: 35 },
  { band: 'average', maxScore: 50 },
  { band: 'good', maxScore: 65 },
  { band: 'wellDone', maxScore: 75 },
  { band: 'excellent', maxScore: 85 },
  { band: 'awesome', maxScore: 100 },
];

export const RIDE_QUALITY_COLORS: Record<RideQualityBand, string> = {
  poor: '#6A4CCF',
  belowAvg: '#EF6C00',
  average: '#F9A825',
  good: '#7CB342',
  wellDone: '#2BB673',
  excellent: '#5B8DEF',
  awesome: '#6A4CCF',
};

export interface RideQualityBandCopy {
  label: string;
  advice: string;
}

export type RideQualityCopy = Record<RideQualityBand, RideQualityBandCopy>;

/**
 * Default English copy — what the web shows; the app passes its own
 * `t('rideAnalytics.quality*')` strings instead (same texts in `en.json`).
 */
export const RIDE_QUALITY_COPY_EN: RideQualityCopy = {
  poor: { label: 'Poor', advice: 'Something went wrong. Sleep more, try yoga.' },
  belowAvg: { label: 'Below Avg', advice: 'Take it easy. Maybe need recovery?' },
  average: { label: 'Average', advice: 'Room for improvement. Check your pacing.' },
  good: { label: 'Good', advice: 'Solid effort. Building consistency.' },
  wellDone: { label: 'Well done', advice: 'Strong ride. Keep pushing!' },
  excellent: { label: 'Excellent', advice: "Great efficiency. You're in form!" },
  awesome: { label: 'Awesome!', advice: 'Peak performance. Machine mode!' },
};
