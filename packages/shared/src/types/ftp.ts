// FTP / high-intensity-interval analysis settings + result shape — moved
// out of BikeLabApp/src/utils/ftpAnalysis.ts (T-2.2, docs/audit/layers/
// 02-bikelabapp.md A-26, docs/audit/00-AUDIT-AND-PLAN.md). Plain types, not
// zod schemas: this is a purely client-side computation over Strava stream
// data (docs/audit/layers/04-cross-layer.md §4.6), not a wire shape any
// route accepts or returns, so there's nothing here for the server to
// validate.
export interface FTPSettings {
  /** Threshold heart rate (default: 160 bpm) */
  hr_threshold?: number;
  /** Minimum interval duration in seconds (default: 120s) */
  duration_threshold?: number;
}

export interface FTPResult {
  /** Total time in the high-intensity zone (minutes) */
  totalTimeMin: number;
  /** Number of intervals */
  totalIntervals: number;
  /** Number of workouts containing intervals */
  highIntensitySessions: number;
  /** Total activities analyzed */
  activitiesAnalyzed: number;
  /** Activities with precise stream data */
  activitiesWithStreams: number;
  /** Activities with a simplified estimate (no streams available) */
  activitiesEstimated: number;
}
