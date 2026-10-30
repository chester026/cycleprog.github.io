/**
 * Tool-call pills: the server's tool names (server/aiCoach.js), their i18n
 * label keys, and the grouping that collapses a run of same-name calls into
 * one pill.
 */
import type { ToolCall, ToolCallStatus } from '../types/coachUi.js';

// Every tool the server exposes to the model. A name missing here renders
// with the generic label rather than as a raw function name.
export const COACH_TOOL_LABEL_KEYS = {
  get_user_profile: 'coach.toolProfile',
  get_recent_activities: 'coach.toolActivities',
  get_activity_totals: 'coach.toolTotals',
  get_activity_analysis: 'coach.toolActivityAnalysis',
  get_analytics_snapshot: 'coach.toolAnalytics',
  get_skills_radar: 'coach.toolSkills',
  get_power_profile: 'coach.toolPowerProfile',
  get_goals_progress: 'coach.toolGoalsProgress',
  create_goal: 'coach.toolCreateGoal',
  update_goal: 'coach.toolUpdateGoal',
  complete_goal: 'coach.toolCompleteGoal',
  delete_goal: 'coach.toolDeleteGoal',
  get_training_recommendations: 'coach.toolTraining',
  get_bike_health: 'coach.toolBikeHealth',
  log_bike_service: 'coach.toolLogBikeService',
  set_bike_gear_label: 'coach.toolSetBikeGearLabel',
  get_achievements: 'coach.toolAchievements',
  get_calendar: 'coach.toolCalendar',
  create_calendar_event: 'coach.toolCreateCalendarEvent',
  update_calendar_event: 'coach.toolUpdateCalendarEvent',
  delete_calendar_event: 'coach.toolDeleteCalendarEvent',
  get_checklist: 'coach.toolGetChecklist',
  add_checklist_items: 'coach.toolAddChecklistItems',
  update_checklist_item: 'coach.toolUpdateChecklistItem',
  get_rider_notes: 'coach.toolRiderNotes',
  remember_about_rider: 'coach.toolRemember',
  forget_about_rider: 'coach.toolForget',
  update_rider_profile: 'coach.toolUpdateProfile',
  analyze_readiness: 'coach.toolAnalyzeReadiness',
  assess_ride_feasibility: 'coach.toolRideFeasibility',
  get_oura_readiness: 'coach.toolOuraReadiness',
  suggest_connect_apple_health: 'coach.toolSuggestConnectHealth',
} as const satisfies Record<string, string>;

export type CoachToolName = keyof typeof COACH_TOOL_LABEL_KEYS;

// Object.keys is typed string[] by design; the object literal above is the
// only source of these keys, so the narrowing cannot be wrong.
export const COACH_TOOL_NAMES = Object.keys(COACH_TOOL_LABEL_KEYS) as CoachToolName[];

export const COACH_TOOL_GENERIC_LABEL_KEY = 'coach.toolGeneric';

// Widened view for string lookups; hasOwnProperty keeps a tool named like an
// Object.prototype member ('constructor') from resolving to a function.
const LABEL_KEY_BY_NAME: Record<string, string | undefined> = COACH_TOOL_LABEL_KEYS;

/** i18n key for a tool pill; the generic "Checking your data…" key for an unknown tool. */
export function getToolLabelKey(name: string): string {
  const key = Object.prototype.hasOwnProperty.call(LABEL_KEY_BY_NAME, name)
    ? LABEL_KEY_BY_NAME[name]
    : undefined;
  return key ?? COACH_TOOL_GENERIC_LABEL_KEY;
}

export interface ToolCallGroup {
  name: string;
  status: ToolCallStatus;
  count: number;
  /** Stable render key: `${name}-${index of the first call in the group}`. */
  key: string;
}

/**
 * Collapses ADJACENT same-name tool calls into one entry with a count — a
 * "replan my week" turn fires delete_calendar_event/create_calendar_event a
 * dozen times in a row, and one pill per call flooded the chat. Calls of the
 * same name scattered through the turn stay separate so the pill sequence
 * still reflects the order things happened in. A group is 'done' only when
 * every call in it is.
 */
export function groupToolCalls(toolCalls: readonly ToolCall[]): ToolCallGroup[] {
  const groups: ToolCallGroup[] = [];
  toolCalls.forEach((tc, i) => {
    const last = groups[groups.length - 1];
    if (last && last.name === tc.name) {
      last.count += 1;
      if (tc.status !== 'done') last.status = tc.status;
    } else {
      groups.push({ name: tc.name, status: tc.status, count: 1, key: `${tc.name}-${i}` });
    }
  });
  return groups;
}
