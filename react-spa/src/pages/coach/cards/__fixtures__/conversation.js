// A persisted coach conversation as `openConversation` maps it: every
// tool_call already `done`, results copied from server/aiCoach.js's
// executors' return shapes (the same fixtures packages/shared's
// cards.test.ts uses). Covers every tool that produces a card plus a few
// read-only ones that must not.
const done = (name, result) => ({ name, args: {}, status: 'done', result });

const message = (id, role, content, toolCalls, extra = {}) => ({
  id,
  role,
  content,
  createdAt: `2026-10-10T08:${id.padStart(2, '0')}:00Z`,
  ...(toolCalls ? { toolCalls } : {}),
  ...extra,
});

export const ANALYSIS_RESULT = {
  activity: { id: 501, name: 'Morning loop', distance_km: 62.4, avg_speed_kmh: 29.3, avg_hr_bpm: 152, avg_watts: 201, avg_cadence_rpm: 88, effort_score: 63 },
  vs_baseline: {
    speed_kmh: { ride: 29.3, avg: 27.1, diff: 2.2 },
    hr_bpm: { ride: 152, avg: 148, diff: 4 },
  },
  similar_ride: { id: 480, name: 'Sunday climb', date: '2026-09-28T07:00:00Z', distance_km: 60.1, avg_speed_kmh: 28.0, avg_hr_bpm: 150 },
  skills_delta: { climbing: { previous: 61, current: 64, diff: 3 }, consistency: { previous: 70, current: 69, diff: -1 } },
};

export const OURA_DAYS = {
  connected: true,
  days: [{ day: '2026-10-15', readiness_score: 82, resting_heart_rate_bpm: 48, average_hrv_ms: 61, total_sleep_hours: 7.3 }],
};

export const CREATED_EVENT = (id, start_date, extra = {}) => ({
  id,
  type: 'planned_ride',
  title: `Session ${id}`,
  start_date,
  start_time: '07:00:00',
  end_time: '08:00:00',
  goal_id: 7,
  goal_title: 'Ride 1000 km',
  ...extra,
});

/** Rides with HR climbing while speed drops, so the trend card has data. */
export const ACTIVITIES = Array.from({ length: 8 }, (_, i) => ({
  id: 100 + i,
  type: 'Ride',
  start_date: `2026-10-${String(i + 1).padStart(2, '0')}T08:00:00Z`,
  average_heartrate: 140 + i * 3,
  average_speed: (30 - i * 0.7) / 3.6,
}));

export const CONVERSATION = [
  message('1', 'user', 'Analyze my last ride'),
  // First analysis: headline score + trend, details withheld.
  message('2', 'assistant', 'A solid tempo ride.', [
    done('get_user_profile', { id: 1, weight: 78 }),
    done('get_activity_analysis', ANALYSIS_RESULT),
  ]),
  message('3', 'user', 'Compare to my average'),
  // Detail chip reply: only the vs-baseline card.
  message('4', 'assistant', 'Faster than usual.', [done('get_activity_analysis', ANALYSIS_RESULT)], { revealDetail: 'vs_baseline' }),
  message('5', 'user', 'And overall?'),
  // Organic second analysis: every available angle.
  message('6', 'assistant', 'Here is the full picture.', [done('get_activity_analysis', ANALYSIS_RESULT)]),
  message('7', 'user', 'How recovered am I?'),
  message('8', 'assistant', 'Well rested.', [done('analyze_readiness', { connected: true, source: 'oura', oura: OURA_DAYS })]),
  message('9', 'user', 'Show my Oura sleep'),
  message('10', 'assistant', 'Seven hours.', [done('get_oura_readiness', OURA_DAYS)]),
  message('11', 'user', 'Set a goal'),
  message('12', 'assistant', 'Goal created.', [
    done('get_goals_progress', { goals: [] }),
    done('create_goal', { created: true, metaGoal: { id: 7, title: 'Ride 1000 km', description: 'By December', tier: 'grand', target_date: '2026-12-31' } }),
  ]),
  message('13', 'user', 'Schedule a ride on Monday'),
  message('14', 'assistant', 'Added.', [done('create_calendar_event', { event: CREATED_EVENT(31, '2026-10-20') })]),
  message('15', 'user', 'Plan my week'),
  message('16', 'assistant', 'Planned.', [
    done('get_calendar', { events: [], activities: [] }),
    done('create_calendar_event', { event: CREATED_EVENT(32, '2026-10-21') }),
    done('create_calendar_event', { event: CREATED_EVENT(33, '2026-10-23') }),
    done('create_calendar_event', { event: CREATED_EVENT(34, '2026-10-25', { type: 'rest_day', start_time: null, end_time: null }) }),
    done('update_calendar_event', { event: { id: 31, title: 'Moved' } }),
    done('delete_calendar_event', { deleted: true, id: 30 }),
  ]),
  message('17', 'user', 'Add bibs and a jersey to my checklist, tick off the helmet, remove the old one'),
  message('18', 'assistant', 'Checklist updated.', [
    done('get_checklist', { sections: [] }),
    done('add_checklist_items', { section: 'Clothes', added: [{ id: 1, section: 'Clothes', item: 'Bibs' }, { id: 2, section: 'Clothes', item: 'Jersey' }] }),
    done('update_checklist_item', { id: 3, section: 'Clothes', item: 'Helmet', checked: true, link: null }),
    done('update_checklist_item', { deleted: true, id: 4 }),
    done('update_checklist_item', { id: 5, section: 'Clothes', item: 'Renamed', checked: false, link: null }),
  ]),
  message('19', 'user', 'Remember I prefer mornings; forget the knee note; I weigh 78 kg and am 182 cm'),
  message('20', 'assistant', 'Noted.', [
    done('get_rider_notes', { notes: [] }),
    done('remember_about_rider', { note: { id: 1, note: 'Prefers morning rides', category: 'preference' } }),
    done('forget_about_rider', { deleted: true, id: 7, note: 'Knee hurts on climbs' }),
    done('update_rider_profile', { weight: 78, height: 182 }),
    done('update_rider_profile', { error: 'invalid' }),
  ]),
  message('21', 'user', 'Mark the goal done'),
  message('22', 'assistant', 'Congratulations.', [
    done('complete_goal', { completed: true, goal: { id: 7, title: 'Ride 1000 km', status: 'completed' }, rides: [{ id: 1 }, { id: 2 }] }),
  ]),
  message('23', 'user', 'Anything else?'),
  // Read-only tools and a failed write: no cards.
  message('24', 'assistant', 'Nothing to add.', [
    done('get_recent_activities', { activities: [] }),
    done('get_activity_totals', {}),
    done('get_analytics_snapshot', {}),
    done('get_skills_radar', {}),
    done('get_power_profile', {}),
    done('get_training_recommendations', {}),
    done('get_bike_health', {}),
    done('log_bike_service', { logged: true }),
    done('set_bike_gear_label', { updated: true }),
    done('get_achievements', {}),
    done('assess_ride_feasibility', {}),
    done('update_goal', { updated: true }),
    done('delete_goal', { deleted: true }),
    done('create_goal', { error: 'no title' }),
    done('suggest_connect_apple_health', {}),
  ]),
];
