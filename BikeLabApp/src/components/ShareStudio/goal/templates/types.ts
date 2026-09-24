import type {BackgroundType} from '../../types';
import type {GoalRecap} from '../recap';

/** The eight layouts of the "Goal Share Screens v5" design, in its order. */
export type GoalTemplateType =
  | 'report'
  | 'staggered'
  | 'stacked'
  | 'photo'
  | 'finish'
  | 'inset'
  | 'duotone'
  | 'ribbon';

/** Dates, pre-formatted in the app's locale by GoalShareStudioModal. */
export interface GoalShareDates {
  /** "Jul 11 — Sep 21, 2026" */
  range: string;
  /** "Jul 11 — Sep 21" */
  rangeShort: string;
  /** "Jul 11" */
  start: string;
  /** "Sep 21" */
  finish: string;
  /** "09/21/2026" — the completion day, numeric. */
  completedNumeric: string;
}

export interface GoalTemplateProps {
  /** The hero of every card — set as big as the layout allows. */
  goalTitle: string;
  /** meta_goals.tier — 'base' | 'epic' | 'grand' | 'legendary'. */
  tier?: string | null;
  recap: GoalRecap;
  dates: GoalShareDates;
  backgroundType: BackgroundType;
  backgroundImage?: string;
  isGrayscale?: boolean;
}
