/**
 * Tool-call tags: the server's tool names (server/aiCoach.js), their i18n
 * label keys, and the folding of a reply's calls into one tag per tool.
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
  suggest_refresh_garmin_health: 'coach.toolSuggestGarminRefresh',
  search_knowledge: 'coach.toolSearchKnowledge',
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

/**
 * The short form of a tool's label, shown once the step is done ("Calendar"
 * for "Checking your calendar..."): the label key with a `Tag` suffix. Every
 * label key has one in each client's copy.
 */
export function getToolTagKey(name: string): string {
  return `${getToolLabelKey(name)}Tag`;
}

export interface ToolCallTag {
  name: string;
  status: ToolCallStatus;
  /** Stable render key: the tool name — a reply has one tag per tool. */
  key: string;
}

/**
 * One tag per tool, in the order the tools first ran. A reply reads the same
 * few things over several rounds and writes to the calendar dozens of times;
 * the rider needs to see what the coach looked at and touched, not every call
 * (owner, 19.11.2026: a column of pills before each answer). A tag is 'done'
 * only when every call of its tool is; otherwise it carries the status of the
 * latest call that is not.
 */
export function toolCallTags(toolCalls: readonly ToolCall[]): ToolCallTag[] {
  const tags = new Map<string, ToolCallTag>();
  for (const call of toolCalls) {
    const tag = tags.get(call.name);
    if (!tag) {
      tags.set(call.name, { name: call.name, status: call.status, key: call.name });
    } else if (call.status !== 'done') {
      tag.status = call.status;
    }
  }
  return [...tags.values()];
}
