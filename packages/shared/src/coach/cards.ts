/**
 * Tool-call results → chat card view-models. The only place that reads
 * `ToolCall.result` (typed `unknown`): each mapper narrows one tool's
 * payload, whose shape is the executor's return value in server/aiCoach.js
 * (fixtures in the tests are copied from those return statements).
 */
import type {
  ActivityAnalysisResult,
  AddedChecklistItem,
  ChecklistUpdateSummary,
  CoachMemoryUpdate,
  CompletedGoalSummary,
  CreatedCalendarEvent,
  CreatedGoalSummary,
  HealthContext,
  ToolCall,
} from '../types/coachUi.js';

type Payload = Record<string, unknown>;

function asPayload(value: unknown): Payload | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Payload) : null;
}

function doneCalls(toolCalls: readonly ToolCall[] | undefined, name: string): { call: ToolCall; result: Payload }[] {
  return (toolCalls ?? []).flatMap((call) => {
    if (call.name !== name || call.status !== 'done') return [];
    const result = asPayload(call.result);
    return result ? [{ call, result }] : [];
  });
}

// remember_about_rider's result is `{note: {id, note, category}}`
// (aiCoach.js's formatCoachNote); older payloads (or a stubbed test double)
// may hand back the note text directly as a string, so both shapes are
// accepted. A limit-reached call returns `{error: 'limit', notes: [...]}`
// instead of a note — not newsworthy enough for a card, the coach's reply
// already explains it. forget_about_rider returns `{deleted: true, id, note}`.
export function mapMemoryUpdates(toolCalls: readonly ToolCall[] | undefined): CoachMemoryUpdate[] {
  return (toolCalls ?? []).flatMap((call): CoachMemoryUpdate[] => {
    if (call.status !== 'done') return [];
    const result = asPayload(call.result);
    if (!result) return [];
    if (call.name === 'remember_about_rider' && !result.error) {
      const raw = result.note;
      const note = typeof raw === 'string' ? raw : asPayload(raw)?.note;
      return typeof note === 'string' && note ? [{ type: 'remembered', note }] : [];
    }
    if (call.name === 'forget_about_rider' && result.deleted === true) {
      return typeof result.note === 'string' && result.note ? [{ type: 'forgotten', note: result.note }] : [];
    }
    return [];
  });
}

// add_checklist_items → `{section, added: [...]}`; update_checklist_item's
// result is FLAT (`{id, section, item, checked, link}` — not nested under an
// `updated` key, which is the bug this once had) or `{deleted: true, id}`.
// A plain rename/move/link edit (checked false, not a delete) gets no card.
export function mapChecklistUpdates(toolCalls: readonly ToolCall[] | undefined): ChecklistUpdateSummary[] {
  return (toolCalls ?? []).flatMap((call): ChecklistUpdateSummary[] => {
    if (call.status !== 'done') return [];
    const result = asPayload(call.result);
    if (!result) return [];
    if (call.name === 'add_checklist_items' && Array.isArray(result.added) && result.added.length > 0) {
      // `added` is the inserted checklist rows (ChecklistItem shape), which
      // carry the id/item/link the card reads.
      const items = result.added as AddedChecklistItem[];
      return [{ type: 'added', section: String(result.section ?? ''), items }];
    }
    if (call.name === 'update_checklist_item' && result.checked === true) {
      return [{ type: 'checked', item: String(result.item ?? '') }];
    }
    if (call.name === 'update_checklist_item' && result.deleted === true) {
      return [{ type: 'removed' }];
    }
    return [];
  });
}

// Fields update_rider_profile can change, in display order, with the unit
// each client renders after the value (the i18n copy is the client's).
export type ProfileFieldUnit = 'kg' | 'cm' | 'bpm' | 'years';

export const PROFILE_FIELD_SPECS: Record<string, { labelKey: string; unit?: ProfileFieldUnit }> = {
  weight: { labelKey: 'coach.profileFieldWeight', unit: 'kg' },
  height: { labelKey: 'coach.profileFieldHeight', unit: 'cm' },
  bike_weight: { labelKey: 'coach.profileFieldBikeWeight', unit: 'kg' },
  max_hr: { labelKey: 'coach.profileFieldMaxHr', unit: 'bpm' },
  resting_hr: { labelKey: 'coach.profileFieldRestingHr', unit: 'bpm' },
  lactate_threshold: { labelKey: 'coach.profileFieldLactateThreshold', unit: 'bpm' },
  age: { labelKey: 'coach.profileFieldAge', unit: 'years' },
  birth_date: { labelKey: 'coach.profileFieldBirthDate' },
  gender: { labelKey: 'coach.profileFieldGender' },
  experience_level: { labelKey: 'coach.profileFieldExperienceLevel' },
};

// update_rider_profile's result is the FLAT updated-fields object itself
// (`{weight?, height?, birth_date?, …}`, not `{updated: {...}}`), one per
// successful call. An error result (`{error}`) is dropped here so a failed
// edit never reaches the card.
export function mapProfileUpdates(toolCalls: readonly ToolCall[] | undefined): Record<string, unknown>[] {
  return doneCalls(toolCalls, 'update_rider_profile')
    .filter(({ result }) => !result.error)
    .map(({ result }) => result);
}

export interface ProfileUpdatePart {
  labelKey: string;
  value: string;
  unit?: ProfileFieldUnit;
}

/** The recognised, non-null fields of one profile update, in PROFILE_FIELD_SPECS order. */
export function describeProfileUpdate(updated: Record<string, unknown>): ProfileUpdatePart[] {
  return Object.entries(PROFILE_FIELD_SPECS).flatMap(([field, spec]) => {
    const value = updated[field];
    if (value === null || value === undefined) return [];
    return [{ labelKey: spec.labelKey, value: String(value), unit: spec.unit }];
  });
}

// complete_goal → `{completed: true, goal: {id, title, status, target_date,
// completed_at}, rides: [...]}`. A failed call (no `completed`) gets no card.
export function mapCompletedGoal(toolCalls: readonly ToolCall[] | undefined): CompletedGoalSummary | null {
  for (const { result } of doneCalls(toolCalls, 'complete_goal')) {
    const goal = asPayload(result.goal);
    if (result.completed !== true || !goal) continue;
    return {
      goalId: Number(goal.id),
      title: String(goal.title ?? ''),
      ridesCount: Array.isArray(result.rides) ? result.rides.length : 0,
    };
  }
  return null;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

// create_goal → `{created: true, metaGoal: <meta_goals row>}`; the first
// successful call. Only the fields GoalCreatedCard shows are kept.
export function mapCreatedGoal(toolCalls: readonly ToolCall[] | undefined): CreatedGoalSummary | null {
  for (const { result } of doneCalls(toolCalls, 'create_goal')) {
    const metaGoal = asPayload(result.metaGoal);
    if (!result.created || !metaGoal || typeof metaGoal.title !== 'string') continue;
    return {
      id: Number(metaGoal.id),
      title: metaGoal.title,
      description: optionalString(metaGoal.description),
      tier: optionalString(metaGoal.tier),
      target_date: optionalString(metaGoal.target_date),
    };
  }
  return null;
}

// create_calendar_event → `{event: <calendar_events row>}`. One entry per
// successful call: a "plan my week" turn fires several, and showing only
// the first silently dropped the rest from the chat.
export function mapCreatedCalendarEvents(toolCalls: readonly ToolCall[] | undefined): CreatedCalendarEvent[] {
  return doneCalls(toolCalls, 'create_calendar_event').flatMap(({ result }): CreatedCalendarEvent[] => {
    const event = asPayload(result.event);
    if (!event || typeof event.title !== 'string' || typeof event.start_date !== 'string') return [];
    return [
      {
        id: Number(event.id),
        type: String(event.type ?? ''),
        title: event.title,
        description: optionalString(event.description),
        start_date: event.start_date,
        end_date: optionalString(event.end_date),
        location: optionalString(event.location),
        // Local HH:MM:SS the server derives from duration_minutes; the
        // web's .ics export turns them into a timed event.
        start_time: optionalString(event.start_time),
        end_time: optionalString(event.end_time),
        goal_id: typeof event.goal_id === 'number' ? event.goal_id : null,
        goal_title: optionalString(event.goal_title) ?? null,
      },
    ];
  });
}

// get_activity_analysis's completed result, if the turn has one with an
// `activity` (the headline numbers every analysis card keys off).
export function findActivityAnalysis(toolCalls: readonly ToolCall[] | undefined): ActivityAnalysisResult | null {
  for (const { result } of doneCalls(toolCalls, 'get_activity_analysis')) {
    // aiCoach.js's executor builds exactly this object; see ActivityAnalysisResult.
    if (asPayload(result.activity)) return result as ActivityAnalysisResult;
  }
  return null;
}

/** The completed analyze_readiness / get_oura_readiness calls of a turn, if any. */
export function findReadinessCalls(toolCalls: readonly ToolCall[] | undefined): {
  analyzeReadiness: ToolCall | undefined;
  ouraReadiness: ToolCall | undefined;
} {
  return {
    analyzeReadiness: doneCalls(toolCalls, 'analyze_readiness')[0]?.call,
    ouraReadiness: doneCalls(toolCalls, 'get_oura_readiness')[0]?.call,
  };
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

// get_oura_readiness's result, OR analyze_readiness's `result.oura` — both
// `{days: [...]}`, newest first, each day already rounded/renamed for
// display (aiCoach.js's fetchRecentOuraDays). Maps the latest day onto the
// RecoveryCard shape, leaving what Oura doesn't provide (baselines, weight,
// VO2max) null. Null when there's no usable day: not connected, the tool's
// empty-state note, or an older persisted analyze_readiness result that
// predates the `oura` field.
export function mapOuraToRecoveryContext(result: unknown): HealthContext | null {
  const days = asPayload(result)?.days;
  const latest = Array.isArray(days) ? asPayload(days[0]) : null;
  if (!latest) return null;
  return {
    recovery_score: numberOrNull(latest.readiness_score),
    resting_hr_bpm: numberOrNull(latest.resting_heart_rate_bpm),
    resting_hr_baseline_bpm: null,
    hrv_ms: numberOrNull(latest.average_hrv_ms),
    hrv_baseline_ms: null,
    sleep_hours: numberOrNull(latest.total_sleep_hours),
    sleep_deep_pct: null,
    weight_kg: null,
    weight_trend_30d_kg: null,
    vo2max: null,
    data_freshness: typeof latest.day === 'string' ? latest.day : null,
  };
}

// Which health-data source RecoveryCard renders from, in priority order:
// 1. The client's own on-device snapshot (Apple Health), when
//    analyze_readiness fired AND the client sent one this turn — richer than
//    Oura, so it wins even if the rider also has Oura connected. Web never
//    has one and passes undefined.
// 2. The Oura rows analyze_readiness fetched itself (`result.oura.days`). An
//    older persisted result is just `{connected: bool}` and falls through.
// 3. get_oura_readiness's own result (`{days: [...]}`), the only source when
//    the rider asked a sleep/HRV history question without a readiness one.
export function pickRecoveryContext(
  analyzeReadinessCall: ToolCall | undefined,
  ouraReadinessCall: ToolCall | undefined,
  healthContext?: HealthContext
): HealthContext | null {
  if (analyzeReadinessCall && healthContext) return healthContext;
  const fromAnalyzeReadiness = analyzeReadinessCall
    ? mapOuraToRecoveryContext(asPayload(analyzeReadinessCall.result)?.oura)
    : null;
  if (fromAnalyzeReadiness) return fromAnalyzeReadiness;
  return ouraReadinessCall ? mapOuraToRecoveryContext(ouraReadinessCall.result) : null;
}
