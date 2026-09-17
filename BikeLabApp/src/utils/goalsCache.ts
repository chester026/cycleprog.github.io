// Goal/MetaGoal/GoalMetric/GoalPace moved to @bikelab/shared (T-2.2,
// docs/audit/00-AUDIT-AND-PLAN.md, docs/audit/layers/04-cross-layer.md
// §6.1) — re-exported below so the existing `from './goalsCache'` import
// sites across the app don't all need touching.
//
// T-3.4 (docs/audit/00-AUDIT-AND-PLAN.md, docs/audit/layers/04-cross-layer.md
// §4.2): this file used to also carry a client-side `calculateGoalProgress`/
// `updateGoalsWithCache`/`getCachedGoals`/`cacheGoals` — a second, drifted
// implementation of goal progress (dead code: nothing in the app called it,
// GET /api/goals and GET /api/meta-goals/:id already computed
// current_value/percent/pace server-side, see §4.2's "App... Не вызывается —
// мёртвый код"). Removed; this file is now just the type re-export.
export type {Goal, MetaGoal, GoalMetric, GoalPace} from '@bikelab/shared/types';
