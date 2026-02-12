/**
 * Achievement types
 */

export interface Achievement {
  id: number;
  key: string;
  category: string;
  tier: string;
  name: string;
  description: string;
  icon: string;
  metric: string;
  threshold: number;
  condition_type: string;
  sort_order: number;
  current_value: number;
  unlocked: boolean;
  unlocked_at: string | null;
  trigger_activity_id: number | null;
  progress_pct: number;
}

export type AchievementTier = 'silver' | 'rare_steel' | 'gold';
