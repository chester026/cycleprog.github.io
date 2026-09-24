import {mapChecklistUpdates, mapMemoryUpdates, mapOuraToRecoveryContext, mapProfileUpdates, pickRecoveryContext} from './lib';
import {ToolCall} from '../../types/coach';
import {HealthContext} from '../../utils/healthService';

// Guards the "[object Object]" bug: remember_about_rider's result is
// `{note: {id, note, category}}` (aiCoach.js's formatCoachNote), so the card
// must read `.note.note`, not the object itself.
describe('mapMemoryUpdates', () => {
  it('extracts the note text from a remember_about_rider object result', () => {
    const toolCalls: ToolCall[] = [
      {name: 'remember_about_rider', args: {}, status: 'done', result: {note: {id: 1, note: 'Prefers morning rides', category: 'preference'}}},
    ];
    expect(mapMemoryUpdates(toolCalls)).toEqual([{type: 'remembered', note: 'Prefers morning rides'}]);
  });

  it('accepts a plain string note result for backward compatibility', () => {
    const toolCalls: ToolCall[] = [
      {name: 'remember_about_rider', args: {}, status: 'done', result: {note: 'Trains indoors Nov-Mar'}},
    ];
    expect(mapMemoryUpdates(toolCalls)).toEqual([{type: 'remembered', note: 'Trains indoors Nov-Mar'}]);
  });

  it('extracts the note text from a forget_about_rider result', () => {
    const toolCalls: ToolCall[] = [
      {name: 'forget_about_rider', args: {}, status: 'done', result: {deleted: true, id: 7, note: 'Knee hurts on climbs'}},
    ];
    expect(mapMemoryUpdates(toolCalls)).toEqual([{type: 'forgotten', note: 'Knee hurts on climbs'}]);
  });

  it('skips a limit-reached remember_about_rider result (no card, no crash)', () => {
    const toolCalls: ToolCall[] = [
      {name: 'remember_about_rider', args: {}, status: 'done', result: {error: 'limit', notes: []}},
    ];
    expect(mapMemoryUpdates(toolCalls)).toEqual([]);
  });

  it('skips a pending/error tool call', () => {
    const toolCalls: ToolCall[] = [
      {name: 'remember_about_rider', args: {}, status: 'running', result: undefined},
    ];
    expect(mapMemoryUpdates(toolCalls)).toEqual([]);
  });

  it('returns an empty array when there are no tool calls', () => {
    expect(mapMemoryUpdates(undefined)).toEqual([]);
  });
});

// Fixtures below are copied from aiCoach.js's executors' actual return
// statements (and test/aiCoach.checklist.test.js/aiCoach.memory.test.js's
// assertions on them), not guessed shapes — that's what the "checked"/
// profile-update bugs these guard against actually looked like: a plausible
// but wrong nesting the card's gating never matched in practice.
describe('mapChecklistUpdates', () => {
  it('builds an "added" summary from add_checklist_items\' result', () => {
    const toolCalls: ToolCall[] = [
      {
        name: 'add_checklist_items',
        args: {},
        status: 'done',
        result: {section: 'Shopping', added: [{id: 10, section: 'Shopping', item: 'Continental GP5000', link: 'https://x.test/gp5000'}]},
      },
    ];
    expect(mapChecklistUpdates(toolCalls)).toEqual([
      {type: 'added', section: 'Shopping', items: [{id: 10, section: 'Shopping', item: 'Continental GP5000', link: 'https://x.test/gp5000'}]},
    ]);
  });

  it('builds a "checked" summary from update_checklist_item\'s FLAT result (not nested under `updated`)', () => {
    const toolCalls: ToolCall[] = [
      {name: 'update_checklist_item', args: {}, status: 'done', result: {id: 5, section: 'Shopping', item: 'Bibs', checked: true, link: null}},
    ];
    expect(mapChecklistUpdates(toolCalls)).toEqual([{type: 'checked', item: 'Bibs'}]);
  });

  it('builds a "removed" summary from a delete result', () => {
    const toolCalls: ToolCall[] = [
      {name: 'update_checklist_item', args: {}, status: 'done', result: {deleted: true, id: 5}},
    ];
    expect(mapChecklistUpdates(toolCalls)).toEqual([{type: 'removed'}]);
  });

  it('skips a plain rename/move/link edit (checked absent and not a delete)', () => {
    const toolCalls: ToolCall[] = [
      {name: 'update_checklist_item', args: {}, status: 'done', result: {id: 5, section: 'Shopping', item: 'Bibs renamed', checked: false, link: null}},
    ];
    expect(mapChecklistUpdates(toolCalls)).toEqual([]);
  });

  it('skips a not_found error result', () => {
    const toolCalls: ToolCall[] = [
      {name: 'update_checklist_item', args: {}, status: 'done', result: {error: 'not_found', message: 'Checklist item not found.'}},
    ];
    expect(mapChecklistUpdates(toolCalls)).toEqual([]);
  });
});

describe('mapProfileUpdates', () => {
  it('passes through the FLAT update_rider_profile result (not nested under `updated`)', () => {
    const toolCalls: ToolCall[] = [
      {
        name: 'update_rider_profile',
        args: {},
        status: 'done',
        result: {weight: 72, height: 180, birth_date: '1995-06-15', age: 30, gender: 'male', max_hr: 188, resting_hr: 52, lactate_threshold: 165, experience_level: 'advanced', bike_weight: 8},
      },
    ];
    expect(mapProfileUpdates(toolCalls)).toEqual([
      {weight: 72, height: 180, birth_date: '1995-06-15', age: 30, gender: 'male', max_hr: 188, resting_hr: 52, lactate_threshold: 165, experience_level: 'advanced', bike_weight: 8},
    ]);
  });

  it('skips an error result instead of rendering a card for a failed edit', () => {
    const toolCalls: ToolCall[] = [
      {name: 'update_rider_profile', args: {}, status: 'done', result: {error: 'Weight must be between 30 and 200 kg'}},
    ];
    expect(mapProfileUpdates(toolCalls)).toEqual([]);
  });

  it('skips a pending tool call', () => {
    const toolCalls: ToolCall[] = [{name: 'update_rider_profile', args: {}, status: 'running', result: undefined}];
    expect(mapProfileUpdates(toolCalls)).toEqual([]);
  });
});

describe('mapOuraToRecoveryContext', () => {
  it('maps the latest day (get_oura_readiness result shape) onto RecoveryCard\'s HealthContext', () => {
    const result = {
      days: [
        {
          day: '2026-09-23',
          readiness_score: 78,
          sleep_score: 82,
          activity_score: 65,
          total_sleep_hours: 7.4,
          average_hrv_ms: 52.3,
          resting_heart_rate_bpm: 54.1,
          min_heart_rate_bpm: 50.2,
        },
        {day: '2026-09-22', readiness_score: 70, total_sleep_hours: 6.9, average_hrv_ms: 48, resting_heart_rate_bpm: 56},
      ],
    };
    expect(mapOuraToRecoveryContext(result)).toEqual({
      recovery_score: 78,
      resting_hr_bpm: 54.1,
      resting_hr_baseline_bpm: null,
      hrv_ms: 52.3,
      hrv_baseline_ms: null,
      sleep_hours: 7.4,
      sleep_deep_pct: null,
      weight_kg: null,
      weight_trend_30d_kg: null,
      vo2max: null,
      data_freshness: '2026-09-23',
    });
  });

  it('returns null for the tool\'s empty-state note (no days)', () => {
    expect(mapOuraToRecoveryContext({days: [], note: 'No Oura data available yet...'})).toBeNull();
  });

  it('returns null when the result itself is missing', () => {
    expect(mapOuraToRecoveryContext(undefined)).toBeNull();
  });
});

// Problem A (coach-readiness-budget task): analyze_readiness is now THE
// readiness tool — when Oura is connected its result carries the Oura rows
// itself (`result.oura`, aiCoach.js's fetchRecentOuraDays), so RecoveryCard
// must also build from that, not only from a dedicated get_oura_readiness
// call, while keeping Apple Health first and never rendering two cards.
describe('pickRecoveryContext', () => {
  const appleHealthContext: HealthContext = {
    recovery_score: 91,
    resting_hr_bpm: 48,
    resting_hr_baseline_bpm: 50,
    hrv_ms: 60,
    hrv_baseline_ms: 55,
    sleep_hours: 8,
    sleep_deep_pct: 20,
    weight_kg: 70,
    weight_trend_30d_kg: -0.5,
    vo2max: 55,
    data_freshness: '2026-09-24',
  };
  const ouraDays = {days: [{day: '2026-09-23', readiness_score: 78, total_sleep_hours: 7.4, average_hrv_ms: 52.3, resting_heart_rate_bpm: 54.1}]};

  it('prefers Apple Health healthContext when analyze_readiness fired and a healthContext was sent, even with Oura also present', () => {
    const analyzeReadinessCall: ToolCall = {name: 'analyze_readiness', args: {}, status: 'done', result: {connected: true, source: 'apple_health'}};
    const ouraReadinessCall: ToolCall = {name: 'get_oura_readiness', args: {}, status: 'done', result: ouraDays};
    expect(pickRecoveryContext(analyzeReadinessCall, ouraReadinessCall, appleHealthContext)).toBe(appleHealthContext);
  });

  it("builds RecoveryCard from analyze_readiness's own result.oura.days when Oura is connected (no dedicated get_oura_readiness call needed)", () => {
    const analyzeReadinessCall: ToolCall = {name: 'analyze_readiness', args: {}, status: 'done', result: {connected: true, source: 'oura', oura: ouraDays}};
    expect(pickRecoveryContext(analyzeReadinessCall, undefined, undefined)).toEqual({
      recovery_score: 78,
      resting_hr_bpm: 54.1,
      resting_hr_baseline_bpm: null,
      hrv_ms: 52.3,
      hrv_baseline_ms: null,
      sleep_hours: 7.4,
      sleep_deep_pct: null,
      weight_kg: null,
      weight_trend_30d_kg: null,
      vo2max: null,
      data_freshness: '2026-09-23',
    });
  });

  it('falls back to a dedicated get_oura_readiness call when analyze_readiness did not fire this turn', () => {
    const ouraReadinessCall: ToolCall = {name: 'get_oura_readiness', args: {}, status: 'done', result: ouraDays};
    const result = pickRecoveryContext(undefined, ouraReadinessCall, undefined);
    expect(result?.recovery_score).toBe(78);
  });

  it('keeps rendering an OLD persisted analyze_readiness result that is just {connected: bool} (no `oura` key)', () => {
    const analyzeReadinessCall: ToolCall = {name: 'analyze_readiness', args: {}, status: 'done', result: {connected: true}};
    expect(pickRecoveryContext(analyzeReadinessCall, undefined, undefined)).toBeNull();
  });

  it('returns null when no readiness-shaped tool fired and no healthContext was sent', () => {
    expect(pickRecoveryContext(undefined, undefined, undefined)).toBeNull();
  });
});
