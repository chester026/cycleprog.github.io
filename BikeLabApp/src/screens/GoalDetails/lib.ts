// Pure logic extracted from GoalDetailsScreen.tsx (T-5.4, audit A-27) — no
// React, no i18n singleton, no network. Each function that used to reach
// for `t(...)` directly now takes a `t` (or a translate-key) as a
// parameter, so it stays unit-testable without a rendered i18n provider.
import type {Goal, MetaGoal, TrainingType} from '@bikelab/shared/types';
import {getHealthMetricValue, type HealthContext} from '../../utils/healthService';
import {GOAL_TYPE_I18N_KEYS} from '@bikelab/shared/constants';

export type TFunction = (key: string, opts?: Record<string, unknown>) => string;

// Same shape TrainingDetailsModal/TrainingLibraryModal already expect —
// re-exported from there so this file and both components agree on one
// type instead of three copies of `any`.
export type {TrainingDetails} from '../../components/TrainingDetailsModal';
import type {TrainingDetails} from '../../components/TrainingDetailsModal';

export const SCHEDULE_TYPE_COLORS: Record<string, string> = {
  planned_ride: '#274dd3',
  rest_day: '#6B7280',
  maintenance: '#F59E0B',
  purchase: '#10B981',
  event: '#FC5200',
  note: '#8B5CF6',
};

export function getScheduleTypeColor(type: string): string {
  return SCHEDULE_TYPE_COLORS[type] || SCHEDULE_TYPE_COLORS.planned_ride;
}

// goal_type -> i18next key mapping sourced from @bikelab/shared/constants
// (T-2.4) instead of redeclaring it here; the actual t() translation stays
// a caller concern since @bikelab/shared has no i18n dependency.
export function getGoalTypeLabel(goalType: string, t: TFunction): string {
  const entry = GOAL_TYPE_I18N_KEYS[goalType as keyof typeof GOAL_TYPE_I18N_KEYS];
  return entry ? t(entry.labelKey) : goalType;
}

export function getGoalUnit(goalType: string, t: TFunction): string {
  const entry = GOAL_TYPE_I18N_KEYS[goalType as keyof typeof GOAL_TYPE_I18N_KEYS];
  return entry ? t(entry.unitKey) : '';
}

export type PaceBadge = {label: string; color: string};

// Ahead/behind/on-track badge from the server-computed pace object (only
// present for goals with both start_date/end_date — see
// goalCalculator.js's addPaceData). Legacy sliding-window goals have no
// fixed dates to measure pace against, so goal.pace is null for them.
export function getPaceBadge(goal: Goal, t: TFunction): PaceBadge | null {
  if (!goal.pace) return null;
  if (goal.pace.onTrack) {
    return {label: t('goalDetails.paceOnTrack'), color: '#10b981'};
  }
  return goal.pace.percentDelta < 0
    ? {label: t('goalDetails.paceBehind'), color: '#ef4444'}
    : {label: t('goalDetails.paceAhead'), color: '#10b981'};
}

/** Health-source sub-goals never get a fresh current_value from the server
 * (Apple Health data is client-only) — reads the live value from
 * `healthContext` instead; every other source uses the server value as-is. */
export function currentValueForGoal(goal: Goal, healthContext: HealthContext | undefined): number {
  return goal.source === 'health'
    ? getHealthMetricValue(healthContext, goal.metric?.health_metric, Number(goal.current_value) || 0)
    : Number(goal.current_value) || 0;
}

export function percentageForGoal(goal: Goal, healthContext: HealthContext | undefined): number {
  const current = currentValueForGoal(goal, healthContext);
  const target = Number(goal.target_value) || 1;
  const pct = Math.min((current / target) * 100, 100);
  return isFinite(pct) ? pct : 0;
}

// Same average-of-sub-goal-percentages logic as MetaGoalCard.tsx (ftp_vo2max
// excluded — legacy special case with its own target_value semantics), so
// the "ready to mark complete" gate agrees with what the goals list shows.
export function computeOverallProgress(subGoals: Goal[], healthContext: HealthContext | undefined): number {
  const relevant = subGoals.filter(g => g.goal_type !== 'ftp_vo2max');
  if (relevant.length === 0) return 0;
  const percentages = relevant.map(g => percentageForGoal(g, healthContext));
  return percentages.reduce((sum, p) => sum + p, 0) / percentages.length;
}

// metaGoal.target_date is basically never populated by the redesigned AI
// prompt anymore — deadlines now live per sub-goal as end_date instead of
// one meta-goal-level field (see md/GOALS_REDESIGN_PLAN_FINAL.md), so the
// "Due" pill under the title used to always read "No deadline" even when
// every sub-goal clearly had one. Falls back to the latest sub-goal
// end_date; legacy goals that DO set target_date still take priority.
export function computeDerivedDueDate(metaGoal: MetaGoal, subGoals: Goal[]): string | null {
  if (metaGoal.target_date) return metaGoal.target_date;
  return subGoals.reduce<string | null>((latest, g) => {
    if (!g.end_date) return latest;
    return !latest || g.end_date > latest ? g.end_date : latest;
  }, null);
}

export function formatDate(dateString: string | null | undefined, locale: string, t: TFunction): string {
  if (!dateString) return t('goalDetails.noDeadline');
  const date = new Date(dateString);
  return date.toLocaleDateString(locale, {month: 'short', day: 'numeric', year: 'numeric'});
}

// Same local-time-parse trick CalendarScreen uses — a bare "YYYY-MM-DD"
// parses as UTC midnight per spec, which would then render one day early
// for anyone west of UTC once .toLocaleDateString formats it back in the
// device's local zone. Appending "T00:00:00" (no "Z") forces local parsing
// instead, so a scheduled session shows the same day here as it does in
// the Calendar tab.
export function formatScheduleDate(dateString: string, locale: string): string {
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString(locale, {weekday: 'short', month: 'short', day: 'numeric'});
}

export type GroupedTrainings = {
  mostRecommended: TrainingDetails | null;
  priority: TrainingDetails[];
  all: TrainingDetails[];
};

// AI-generated trainings (metaGoal.trainingTypes), sorted by priority and
// enriched with the matching library entry from GET /api/training-types
// (structure/benefits/tips/etc — the AI payload itself only carries
// type/title/description/priority).
export function groupTrainings(metaGoal: MetaGoal | null | undefined, trainingTypes: TrainingType[]): GroupedTrainings {
  const aiTrainings = metaGoal?.trainingTypes;
  if (!aiTrainings || aiTrainings.length === 0) {
    return {mostRecommended: null, priority: [], all: []};
  }

  const sorted = [...aiTrainings].sort((a, b) => a.priority - b.priority);

  const formatted: TrainingDetails[] = sorted.map(training => {
    const libraryTraining = trainingTypes.find(t => t.key === training.type);

    let structureArray: string[] = [];
    const structure = libraryTraining?.structure;
    if (structure) {
      if (Array.isArray(structure)) {
        structureArray = structure as string[];
      } else if (typeof structure === 'object') {
        const struct = structure as Record<string, unknown>;
        if (struct.warmup) structureArray.push(`Warmup: ${struct.warmup}`);
        if (struct.main) structureArray.push(`Main: ${struct.main}`);
        if (struct.cooldown) structureArray.push(`Cooldown: ${struct.cooldown}`);
      }
    }

    // TrainingTypeSchema is `.passthrough()` (server/recommendations/
    // training-types.json has free-form extra fields per entry, see that
    // schema's own comment) — `tips`/`common_mistakes` exist on some
    // entries but aren't in the pinned-down TS shape, so read them through
    // an index-signature view instead of widening the whole object to `any`.
    const extra = libraryTraining as unknown as {tips?: string[]; common_mistakes?: string[]} | undefined;

    return {
      name: training.title,
      type: libraryTraining?.key || training.type,
      trainingType: libraryTraining?.key || training.type,
      recommendation: training.description,
      details: libraryTraining
        ? {
            intensity: libraryTraining.intensity,
            duration: libraryTraining.duration,
            cadence: libraryTraining.cadence,
            hr_zones: libraryTraining.hr_zones,
            structure: structureArray.length > 0 ? structureArray : undefined,
            benefits: libraryTraining.benefits,
            technical_aspects: libraryTraining.technical_aspects,
            tips: extra?.tips,
            common_mistakes: extra?.common_mistakes,
          }
        : {
            intensity: 'Variable',
            duration: '60-90 min',
          },
    };
  });

  return {
    mostRecommended: formatted[0] || null,
    priority: formatted.slice(1, 4),
    all: formatted,
  };
}
