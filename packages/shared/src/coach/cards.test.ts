import { describe, expect, it } from 'vitest';
import type { HealthContext, ToolCall } from '../types/coachUi.js';
import {
  describeProfileUpdate,
  findActivityAnalysis,
  findReadinessCalls,
  mapChecklistUpdates,
  mapCompletedGoal,
  mapCreatedCalendarEvents,
  mapCreatedGoal,
  mapMemoryUpdates,
  mapOuraToRecoveryContext,
  mapProfileUpdates,
  pickRecoveryContext,
} from './cards.js';

function done(name: string, result: unknown): ToolCall {
  return { name, args: {}, status: 'done', result };
}

// Fixtures are copied from aiCoach.js's executors' actual return statements
// (and server/test/aiCoach.*.test.js's assertions on them), not guessed —
// the "checked"/profile-update bugs these guard against were plausible but
// wrong nestings the card gating never matched in practice.

// Guards the "[object Object]" bug: remember_about_rider's result is
// `{note: {id, note, category}}`, so the card must read `.note.note`.
describe('mapMemoryUpdates', () => {
  it('extracts the note text from a remember_about_rider object result', () => {
    expect(
      mapMemoryUpdates([
        done('remember_about_rider', { note: { id: 1, note: 'Prefers morning rides', category: 'preference' } }),
      ])
    ).toEqual([{ type: 'remembered', note: 'Prefers morning rides' }]);
  });

  it('accepts a plain string note result for backward compatibility', () => {
    expect(mapMemoryUpdates([done('remember_about_rider', { note: 'Trains indoors Nov-Mar' })])).toEqual([
      { type: 'remembered', note: 'Trains indoors Nov-Mar' },
    ]);
  });

  it('extracts the note text from a forget_about_rider result', () => {
    expect(mapMemoryUpdates([done('forget_about_rider', { deleted: true, id: 7, note: 'Knee hurts on climbs' })])).toEqual(
      [{ type: 'forgotten', note: 'Knee hurts on climbs' }]
    );
  });

  it('keeps the order of a mixed remember/forget turn', () => {
    const updates = mapMemoryUpdates([
      done('forget_about_rider', { deleted: true, id: 7, note: 'Old' }),
      done('remember_about_rider', { note: 'New' }),
    ]);
    expect(updates.map((u) => u.type)).toEqual(['forgotten', 'remembered']);
  });

  it('skips a limit-reached result, an empty note, a not-deleted forget and a pending call', () => {
    expect(mapMemoryUpdates([done('remember_about_rider', { error: 'limit', notes: [] })])).toEqual([]);
    expect(mapMemoryUpdates([done('remember_about_rider', { note: { id: 1, note: '' } })])).toEqual([]);
    expect(mapMemoryUpdates([done('remember_about_rider', { note: 42 })])).toEqual([]);
    expect(mapMemoryUpdates([done('forget_about_rider', { deleted: false, note: 'x' })])).toEqual([]);
    expect(mapMemoryUpdates([done('forget_about_rider', { deleted: true })])).toEqual([]);
    expect(mapMemoryUpdates([{ name: 'remember_about_rider', args: {}, status: 'running' }])).toEqual([]);
    expect(mapMemoryUpdates([done('remember_about_rider', 'not an object')])).toEqual([]);
    expect(mapMemoryUpdates([done('get_user_profile', {})])).toEqual([]);
  });

  it('returns an empty array when there are no tool calls', () => {
    expect(mapMemoryUpdates(undefined)).toEqual([]);
  });
});

describe('mapChecklistUpdates', () => {
  it("builds an 'added' summary from add_checklist_items' result", () => {
    const added = [{ id: 10, section: 'Shopping', item: 'Continental GP5000', link: 'https://x.test/gp5000' }];
    expect(mapChecklistUpdates([done('add_checklist_items', { section: 'Shopping', added })])).toEqual([
      { type: 'added', section: 'Shopping', items: added },
    ]);
  });

  it("builds a 'checked' summary from update_checklist_item's FLAT result (not nested under `updated`)", () => {
    expect(
      mapChecklistUpdates([
        done('update_checklist_item', { id: 5, section: 'Shopping', item: 'Bibs', checked: true, link: null }),
      ])
    ).toEqual([{ type: 'checked', item: 'Bibs' }]);
  });

  it('tolerates a row missing section/item text', () => {
    expect(mapChecklistUpdates([done('add_checklist_items', { added: [{ id: 1, item: 'x' }] })])).toEqual([
      { type: 'added', section: '', items: [{ id: 1, item: 'x' }] },
    ]);
    expect(mapChecklistUpdates([done('update_checklist_item', { id: 5, checked: true })])).toEqual([
      { type: 'checked', item: '' },
    ]);
  });

  it("builds a 'removed' summary from a delete result", () => {
    expect(mapChecklistUpdates([done('update_checklist_item', { deleted: true, id: 5 })])).toEqual([
      { type: 'removed' },
    ]);
  });

  it('skips a plain rename/move/link edit, an empty add, an error, a pending call and an unrelated tool', () => {
    expect(
      mapChecklistUpdates([
        done('update_checklist_item', { id: 5, section: 'Shopping', item: 'Bibs renamed', checked: false, link: null }),
      ])
    ).toEqual([]);
    expect(mapChecklistUpdates([done('add_checklist_items', { section: 'Shopping', added: [] })])).toEqual([]);
    expect(
      mapChecklistUpdates([done('update_checklist_item', { error: 'not_found', message: 'Checklist item not found.' })])
    ).toEqual([]);
    expect(mapChecklistUpdates([{ name: 'update_checklist_item', args: {}, status: 'running' }])).toEqual([]);
    expect(mapChecklistUpdates([done('update_checklist_item', null)])).toEqual([]);
    expect(mapChecklistUpdates([done('get_checklist', { items: [] })])).toEqual([]);
    expect(mapChecklistUpdates(undefined)).toEqual([]);
  });
});

describe('mapProfileUpdates / describeProfileUpdate', () => {
  const updated = {
    weight: 72,
    height: 180,
    birth_date: '1995-06-15',
    age: 30,
    gender: 'male',
    max_hr: 188,
    resting_hr: 52,
    lactate_threshold: 165,
    experience_level: 'advanced',
    bike_weight: 8,
  };

  it('passes through the FLAT update_rider_profile result (not nested under `updated`)', () => {
    expect(mapProfileUpdates([done('update_rider_profile', updated)])).toEqual([updated]);
  });

  it('skips an error result and a pending call', () => {
    expect(mapProfileUpdates([done('update_rider_profile', { error: 'Weight must be between 30 and 200 kg' })])).toEqual(
      []
    );
    expect(mapProfileUpdates([{ name: 'update_rider_profile', args: {}, status: 'running' }])).toEqual([]);
    expect(mapProfileUpdates(undefined)).toEqual([]);
  });

  it('describes the recognised, non-null fields with their units, in spec order', () => {
    expect(describeProfileUpdate({ max_hr: 186, weight: 78, height: null, unknown_field: 'x' })).toEqual([
      { labelKey: 'coach.profileFieldWeight', value: '78', unit: 'kg' },
      { labelKey: 'coach.profileFieldMaxHr', value: '186', unit: 'bpm' },
    ]);
    expect(describeProfileUpdate({ height: 180, birth_date: '1995-06-15' })).toEqual([
      { labelKey: 'coach.profileFieldHeight', value: '180', unit: 'cm' },
      { labelKey: 'coach.profileFieldBirthDate', value: '1995-06-15', unit: undefined },
    ]);
  });
});

describe('mapCompletedGoal', () => {
  it('summarises a completed goal with its attached rides', () => {
    expect(
      mapCompletedGoal([
        done('complete_goal', {
          completed: true,
          goal: { id: 12, title: 'Gran Fondo', status: 'completed', target_date: '2026-10-01' },
          rides: [{ strava_id: 1 }, { strava_id: 2 }],
        }),
      ])
    ).toEqual({ goalId: 12, title: 'Gran Fondo', ridesCount: 2 });
  });

  it('counts zero rides when the result has none', () => {
    expect(mapCompletedGoal([done('complete_goal', { completed: true, goal: { id: 3, title: 'Base' } })])).toEqual({
      goalId: 3,
      title: 'Base',
      ridesCount: 0,
    });
  });

  it('falls back to an empty title when the goal row has none', () => {
    expect(mapCompletedGoal([done('complete_goal', { completed: true, goal: { id: 3 } })])?.title).toBe('');
  });

  it('gives no card for a failed, running, non-object or unrelated call', () => {
    expect(mapCompletedGoal([done('complete_goal', { error: 'not_found' })])).toBeNull();
    expect(mapCompletedGoal([done('complete_goal', 'done')])).toBeNull();
    expect(mapCompletedGoal([done('complete_goal', { completed: true })])).toBeNull();
    expect(mapCompletedGoal([{ name: 'complete_goal', args: {}, status: 'running' }])).toBeNull();
    expect(mapCompletedGoal([done('create_goal', { completed: true, goal: { id: 1 } })])).toBeNull();
    expect(mapCompletedGoal(undefined)).toBeNull();
  });
});

describe('mapCreatedGoal', () => {
  it('keeps the card fields of the created meta goal', () => {
    const metaGoal = {
      id: 5,
      user_id: 1,
      title: 'Ride 1000 km',
      description: 'Base season',
      tier: 'epic',
      target_date: '2026-12-31',
      status: 'active',
    };
    expect(mapCreatedGoal([done('create_goal', { created: true, metaGoal })])).toEqual({
      id: 5,
      title: 'Ride 1000 km',
      description: 'Base season',
      tier: 'epic',
      target_date: '2026-12-31',
    });
  });

  it('gives no card without created/metaGoal/title', () => {
    expect(mapCreatedGoal([done('create_goal', { created: false, metaGoal: { id: 1, title: 'x' } })])).toBeNull();
    expect(mapCreatedGoal([done('create_goal', { created: true })])).toBeNull();
    expect(mapCreatedGoal([done('create_goal', { created: true, metaGoal: { id: 1 } })])).toBeNull();
    expect(mapCreatedGoal(undefined)).toBeNull();
  });
});

describe('mapCreatedCalendarEvents', () => {
  it('maps one event per successful call, with optional fields normalised', () => {
    const full = {
      id: 1,
      type: 'training',
      title: 'Tempo ride',
      description: '2 x 20',
      start_date: '2026-10-20T07:00:00Z',
      end_date: '2026-10-20T09:00:00Z',
      location: 'Troodos',
      start_time: '07:00:00',
      end_time: '09:00:00',
      goal_id: 5,
      goal_title: 'Ride 1000 km',
    };
    const minimal = { id: 2, title: 'Rest', start_date: '2026-10-21' };
    expect(
      mapCreatedCalendarEvents([done('create_calendar_event', { event: full }), done('create_calendar_event', { event: minimal })])
    ).toEqual([
      full,
      {
        id: 2,
        type: '',
        title: 'Rest',
        description: undefined,
        start_date: '2026-10-21',
        end_date: undefined,
        location: undefined,
        start_time: undefined,
        end_time: undefined,
        goal_id: null,
        goal_title: null,
      },
    ]);
  });

  it('skips a failed call or one without a title/date', () => {
    expect(mapCreatedCalendarEvents([done('create_calendar_event', { error: 'invalid_date' })])).toEqual([]);
    expect(mapCreatedCalendarEvents([done('create_calendar_event', { event: { id: 1, title: 'x' } })])).toEqual([]);
    expect(mapCreatedCalendarEvents(undefined)).toEqual([]);
  });
});

describe('findActivityAnalysis / findReadinessCalls', () => {
  it('returns the first completed analysis that has an activity', () => {
    const analysis = { activity: { effort_score: 61, distance_km: 40 }, vs_baseline: {} };
    expect(
      findActivityAnalysis([
        done('get_activity_analysis', { error: 'not_found' }),
        done('get_activity_analysis', analysis),
      ])
    ).toBe(analysis);
    expect(findActivityAnalysis([{ name: 'get_activity_analysis', args: {}, status: 'running' }])).toBeNull();
    expect(findActivityAnalysis(undefined)).toBeNull();
  });

  it('finds the readiness-shaped calls of a turn regardless of their result', () => {
    const analyze = done('analyze_readiness', { connected: false });
    const oura = done('get_oura_readiness', { days: [] });
    expect(findReadinessCalls([analyze, oura])).toEqual({ analyzeReadiness: analyze, ouraReadiness: oura });
    expect(findReadinessCalls([])).toEqual({ analyzeReadiness: undefined, ouraReadiness: undefined });
  });
});

describe('mapOuraToRecoveryContext', () => {
  it("maps the latest day (get_oura_readiness result shape) onto RecoveryCard's HealthContext", () => {
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
        { day: '2026-09-22', readiness_score: 70, total_sleep_hours: 6.9, average_hrv_ms: 48, resting_heart_rate_bpm: 56 },
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

  it('nulls a day whose numbers are missing or not numeric', () => {
    expect(mapOuraToRecoveryContext({ days: [{ day: 20260923, readiness_score: '78' }] })).toMatchObject({
      recovery_score: null,
      data_freshness: null,
    });
  });

  it("returns null for the tool's empty-state note (no days) or a missing result", () => {
    expect(mapOuraToRecoveryContext({ days: [], note: 'No Oura data available yet...' })).toBeNull();
    expect(mapOuraToRecoveryContext(undefined)).toBeNull();
    expect(mapOuraToRecoveryContext({ connected: true })).toBeNull();
  });
});

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
  const ouraDays = {
    days: [{ day: '2026-09-23', readiness_score: 78, total_sleep_hours: 7.4, average_hrv_ms: 52.3, resting_heart_rate_bpm: 54.1 }],
  };

  it('prefers the on-device healthContext when analyze_readiness fired and one was sent, even with Oura present', () => {
    const analyze = done('analyze_readiness', { connected: true, source: 'apple_health' });
    const oura = done('get_oura_readiness', ouraDays);
    expect(pickRecoveryContext(analyze, oura, appleHealthContext)).toBe(appleHealthContext);
  });

  it("builds from analyze_readiness's own result.oura.days when Oura is connected", () => {
    const analyze = done('analyze_readiness', { connected: true, source: 'oura', oura: ouraDays });
    expect(pickRecoveryContext(analyze, undefined)).toMatchObject({ recovery_score: 78, data_freshness: '2026-09-23' });
  });

  it('falls back to a dedicated get_oura_readiness call when analyze_readiness did not fire', () => {
    expect(pickRecoveryContext(undefined, done('get_oura_readiness', ouraDays))?.recovery_score).toBe(78);
  });

  it('keeps rendering nothing for an OLD persisted analyze_readiness result without `oura`', () => {
    expect(pickRecoveryContext(done('analyze_readiness', { connected: true }), undefined)).toBeNull();
  });

  it('returns null when no readiness-shaped tool fired and no healthContext was sent', () => {
    expect(pickRecoveryContext(undefined, undefined, undefined)).toBeNull();
  });
});
