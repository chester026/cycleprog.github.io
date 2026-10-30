/**
 * Score → level thresholds for the coach chat's score cards. Product
 * decisions shared by the app and the web client; each client maps a level
 * to its own copy and colours. Lookups: `getEffortLevel`, `getRecoveryLevel`
 * (here) and `getOvertrainingRiskLevel` (`calc/overtraining.ts`).
 */

// Effort score (get_activity_analysis's `effort_score`, 0–100): higher is
// MORE intense. `max` is inclusive — the first bucket whose max the score
// does not exceed wins; anything above the table (or a bad number) is
// 'exhausted'.
export const EFFORT_LEVELS = ['recovery', 'easy', 'moderate', 'tempo', 'hard', 'heavy', 'exhausted'] as const;
export type EffortLevel = (typeof EFFORT_LEVELS)[number];

export const EFFORT_SCORE_BUCKETS: readonly { max: number; level: EffortLevel }[] = [
  { max: 20, level: 'recovery' },
  { max: 40, level: 'easy' },
  { max: 55, level: 'moderate' },
  { max: 70, level: 'tempo' },
  { max: 82, level: 'hard' },
  { max: 90, level: 'heavy' },
  { max: 100, level: 'exhausted' },
];

/** Effort bucket for a 0–100 effort score; scores past the table are 'exhausted'. */
export function getEffortLevel(score: number): EffortLevel {
  return EFFORT_SCORE_BUCKETS.find((b) => score <= b.max)?.level ?? 'exhausted';
}

// Recovery score (Apple Health / Oura readiness, 0–100): higher is BETTER —
// the opposite direction from effort. Mirrors APPLE_HEALTH_SPEC.md §5's
// interpretation table (85–100 Peak … 0–29 Very Low). `min` is inclusive.
export const RECOVERY_LEVELS = ['peak', 'good', 'moderate', 'low', 'veryLow'] as const;
export type RecoveryLevel = (typeof RECOVERY_LEVELS)[number];

export const RECOVERY_SCORE_BUCKETS: readonly { min: number; level: RecoveryLevel }[] = [
  { min: 85, level: 'peak' },
  { min: 70, level: 'good' },
  { min: 55, level: 'moderate' },
  { min: 30, level: 'low' },
  { min: 0, level: 'veryLow' },
];

/** Recovery bucket for a 0–100 recovery score; anything below 0 is 'veryLow'. */
export function getRecoveryLevel(score: number): RecoveryLevel {
  return RECOVERY_SCORE_BUCKETS.find((b) => score >= b.min)?.level ?? 'veryLow';
}

// Overtraining risk (HR-vs-speed divergence rate, 0–100 — see
// `calc/overtraining.ts`). `min` is inclusive.
export const OVERTRAINING_RISK_LEVELS = ['high', 'elevated', 'moderate', 'low'] as const;
export type OvertrainingRiskLevel = (typeof OVERTRAINING_RISK_LEVELS)[number];

export const OVERTRAINING_RISK_BUCKETS: readonly { min: number; level: OvertrainingRiskLevel }[] = [
  { min: 75, level: 'high' },
  { min: 50, level: 'elevated' },
  { min: 25, level: 'moderate' },
  { min: 0, level: 'low' },
];
