import { describe, expect, it } from 'vitest';
import type { AttachedActivity } from '../types/coachUi.js';
import { MAX_ATTACHED_ACTIVITIES, serializeAttachedActivities, serializeAttachedRoute } from './attachments.js';

const activity: AttachedActivity = {
  id: 42,
  name: 'Sunday Climb',
  type: 'Ride',
  start_date: '2024-03-10T08:00:00Z',
  distance: 40200,
  moving_time: 5400,
  total_elevation_gain: 812.4,
  average_heartrate: 148.6,
  average_watts: 201.2,
};

describe('serializeAttachedActivities', () => {
  it('formats one activity with distance/duration/elevation/HR/power under the fixed header', () => {
    const text = serializeAttachedActivities([activity]);
    const [header, line, ...rest] = text.split('\n');
    expect(header).toBe('The user has attached the following activities for context:');
    expect(line).toMatch(/^\[Activity 42\] Sunday Climb \(Ride\) — \w{3}, Mar 10, 2024, 40\.2km, 1h30m, 812m↑, avg HR 149, avg 201W$/);
    expect(rest).toEqual([]);
  });

  it('omits HR/power when not present on the activity', () => {
    const { average_heartrate: _hr, average_watts: _w, ...rest } = activity;
    const text = serializeAttachedActivities([rest]);
    expect(text).not.toContain('avg HR');
    expect(text).not.toContain('W');
    expect(text).toContain('812m↑');
  });

  it('joins multiple activities with one line each', () => {
    const text = serializeAttachedActivities([activity, { ...activity, id: 43, name: 'Monday Recovery' }]);
    expect(text.split('\n')).toHaveLength(3);
    expect(text).toContain('[Activity 43] Monday Recovery');
  });

  it('caps attachments at 5 (the ~200 tokens/activity budget)', () => {
    expect(MAX_ATTACHED_ACTIVITIES).toBe(5);
  });
});

describe('serializeAttachedRoute', () => {
  const route = {
    course_id: 12,
    name: 'Lefkara Classic',
    distance_km: 92.3,
    elevation_gain_m: 1480,
    climbs: [
      { at_km: 28, length_km: 9.1, grade_pct: 6.4, gain_m: 580 },
      { at_km: 8, length_km: 6.1, grade_pct: 5.3, gain_m: 322 },
    ],
  };

  it('names the route, its size and its climbs in riding order', () => {
    expect(serializeAttachedRoute(route)).toBe(
      'The user has attached a route file:\n[Route 12] Lefkara Classic — 92.3 km, 1480 m↑; climbs: 6.1 km at 5.3% from km 8; 9.1 km at 6.4% from km 28',
    );
  });

  it('keeps the six longest climbs, and says when there are none or no name', () => {
    const many = { ...route, climbs: Array.from({ length: 8 }, (_, i) => ({ at_km: i * 10, length_km: i + 1, grade_pct: 5, gain_m: 50 })) };
    const line = serializeAttachedRoute(many);
    expect(line.match(/ km at /g)).toHaveLength(6);
    expect(line).not.toContain('1 km at 5% from km 0');
    expect(line).toContain('8 km at 5% from km 70');
    expect(serializeAttachedRoute({ ...route, name: null, climbs: [] })).toBe(
      'The user has attached a route file:\n[Route 12] Unnamed route — 92.3 km, 1480 m↑; no climbs to speak of',
    );
  });
});
