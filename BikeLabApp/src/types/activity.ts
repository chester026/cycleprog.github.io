// Re-exported from @bikelab/shared (T-2.2, docs/audit/00-AUDIT-AND-PLAN.md,
// docs/audit/layers/04-cross-layer.md §6.1) — this file used to declare
// `Activity` itself; kept as a thin re-export so the ~30 files across the
// app that `import {Activity} from '../types/activity'` (or `'./activity'`)
// don't all need touching in this task.
export type {StravaActivity as Activity} from '@bikelab/shared/types';
