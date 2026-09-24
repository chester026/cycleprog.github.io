// Pure helpers for ChatMessageBubble's tool-call → card mappings, pulled out
// so they're unit-testable without rendering (see lib.test.ts).
import {ToolCall} from '../../types/coach';
import type {CoachMemoryUpdate} from './CoachMemoryCard';
import type {ChecklistUpdateSummary} from './ChecklistUpdatedCard';
import type {HealthContext} from '../../utils/healthService';

// remember_about_rider/forget_about_rider (coach-memory tools) — maps their
// results to the chat card's props. remember_about_rider's result is
// `{note: {id, note, category}}` (aiCoach.js's formatCoachNote); older
// payloads (or a stubbed test double) may hand back the note text directly
// as a string, so both shapes are accepted. A limit-reached
// remember_about_rider call returns `{error: 'limit', notes: [...]}` instead
// of a note, which isn't newsworthy enough for its own card — the coach's
// reply text already explains it to the rider.
export function mapMemoryUpdates(toolCalls: ToolCall[] | undefined): CoachMemoryUpdate[] {
  return (toolCalls ?? [])
    .map((tc): CoachMemoryUpdate | null => {
      if (tc.status !== 'done') return null;
      if (tc.name === 'remember_about_rider' && tc.result?.note && !tc.result?.error) {
        const note = typeof tc.result.note === 'string' ? tc.result.note : tc.result.note.note;
        return note ? {type: 'remembered', note} : null;
      }
      if (tc.name === 'forget_about_rider' && tc.result?.deleted === true && tc.result?.note) {
        return {type: 'forgotten', note: tc.result.note};
      }
      return null;
    })
    .filter((s): s is CoachMemoryUpdate => s !== null);
}

// add_checklist_items/update_checklist_item (server tools, aiCoach.js) — one
// summary per successful call. update_checklist_item's result is FLAT
// (`{id, section, item, checked, link}` — see aiCoach.js's executor and
// test/aiCoach.checklist.test.js), not nested under an `updated` key; reading
// `tc.result.updated.checked` here used to always be undefined, so a checked-
// off item never got a card even though the checklist itself updated fine.
export function mapChecklistUpdates(toolCalls: ToolCall[] | undefined): ChecklistUpdateSummary[] {
  return (toolCalls ?? [])
    .map((tc): ChecklistUpdateSummary | null => {
      if (tc.status !== 'done') return null;
      if (tc.name === 'add_checklist_items' && tc.result?.added?.length) {
        return {type: 'added', section: tc.result.section, items: tc.result.added};
      }
      if (tc.name === 'update_checklist_item' && tc.result?.checked === true) {
        return {type: 'checked', item: tc.result.item};
      }
      if (tc.name === 'update_checklist_item' && tc.result?.deleted === true) {
        return {type: 'removed'};
      }
      return null;
    })
    .filter((s): s is ChecklistUpdateSummary => s !== null);
}

// update_rider_profile (server tool, aiCoach.js) — result is the FLAT
// updated-fields object itself (`{weight?, height?, birth_date?, age?, ...}`),
// not `{updated: {...}}`; gating on `tc.result?.updated` used to always be
// falsy (the card never rendered) even on a successful profile edit. An
// error result (`{error: '...'}`) is excluded here rather than relying on
// ProfileUpdatedCard's own "no recognized field" empty state, so a failed
// edit never even reaches the card.
export function mapProfileUpdates(toolCalls: ToolCall[] | undefined): Record<string, unknown>[] {
  return (toolCalls ?? [])
    .filter(tc => tc.name === 'update_rider_profile' && tc.status === 'done' && tc.result && !tc.result.error)
    .map(tc => tc.result as Record<string, unknown>);
}

// get_oura_readiness's result, OR analyze_readiness's `result.oura` (aiCoach.js
// — both are `{days: [...]}`, same shape, newest first, each day already
// rounded/renamed for display (readiness_score, total_sleep_hours,
// resting_heart_rate_bpm, average_hrv_ms — see fetchRecentOuraDays in
// aiCoach.js). Maps the latest day onto RecoveryCard's HealthContext shape so
// the same card renders for an Oura rider as for an Apple Health one, with
// whatever Oura doesn't provide (baselines, weight, VO2max) left null.
// Returns null when there's no usable day (not connected, the tool's
// empty-state note, or an older persisted analyze_readiness result that
// predates the `oura` field and is just `{connected: bool}`).
export function mapOuraToRecoveryContext(result: any): HealthContext | null {
  const latest = result?.days?.[0];
  if (!latest) return null;
  return {
    recovery_score: latest.readiness_score ?? null,
    resting_hr_bpm: latest.resting_heart_rate_bpm ?? null,
    resting_hr_baseline_bpm: null,
    hrv_ms: latest.average_hrv_ms ?? null,
    hrv_baseline_ms: null,
    sleep_hours: latest.total_sleep_hours ?? null,
    sleep_deep_pct: null,
    weight_kg: null,
    weight_trend_30d_kg: null,
    vo2max: null,
    data_freshness: typeof latest.day === 'string' ? latest.day : null,
  };
}

// Picks which health-data source RecoveryCard renders from, in priority
// order — extracted from ChatMessageBubble so the priority order is
// unit-testable without rendering:
// 1. Apple Health's healthContext, when analyze_readiness fired AND the
//    client sent one this turn — the richer on-device snapshot, so it wins
//    even if the rider also happens to have Oura connected.
// 2. The Oura data analyze_readiness fetched itself (result.oura.days —
//    aiCoach.js's fetchRecentOuraDays, `{connected, source, oura}` — see
//    that executor). An older persisted message's result is just
//    `{connected: bool}` with no `oura` key, which safely falls through
//    here (mapOuraToRecoveryContext(undefined) is null).
// 3. get_oura_readiness's own result (`{days:[...]}` directly, no `oura`
//    wrapper) — the dedicated multi-day-history tool, still the only
//    source when the rider asked a sleep/HRV history question without a
//    readiness question in the same turn.
export function pickRecoveryContext(
  analyzeReadinessCall: ToolCall | undefined,
  ouraReadinessCall: ToolCall | undefined,
  healthContext: HealthContext | undefined,
): HealthContext | null {
  if (analyzeReadinessCall && healthContext) return healthContext;
  const fromAnalyzeReadiness = analyzeReadinessCall ? mapOuraToRecoveryContext(analyzeReadinessCall.result?.oura) : null;
  if (fromAnalyzeReadiness) return fromAnalyzeReadiness;
  return ouraReadinessCall ? mapOuraToRecoveryContext(ouraReadinessCall.result) : null;
}
