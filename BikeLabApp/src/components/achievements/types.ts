/**
 * Achievement types — moved to @bikelab/shared (T-2.2,
 * docs/audit/00-AUDIT-AND-PLAN.md, docs/audit/layers/04-cross-layer.md
 * §6.1). Re-exported here so existing `from './types'` /
 * `from '../achievements/types'` import sites across the app keep working.
 */
export type {Achievement, AchievementTier} from '@bikelab/shared/types';
