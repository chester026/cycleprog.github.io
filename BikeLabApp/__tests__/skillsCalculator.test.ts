/**
 * @format
 */
// T-1.7 (docs/audit/00-AUDIT-AND-PLAN.md): replaces the previous
// `__tests__/App.test.tsx`, which rendered <App/> under jest and failed —
// App.tsx pulls in real React Native native modules (navigation, storage,
// etc.) that don't exist in a plain jest/node test environment. These are
// pure-function tests instead: skillsCalculator.ts (src/utils/) does no RN
// imports at all — only `../types/activity`'s (type-only) Activity shape —
// so it's safely testable without any native module mocking.
import {calculateAllSkills, determineRiderProfile} from '../src/utils/skillsCalculator';
import type {Activity} from '../src/types/activity';

function makeActivity(overrides: Partial<Activity>): Activity {
  return {
    id: 1,
    name: 'Ride',
    distance: 20000,
    moving_time: 3600,
    elapsed_time: 3700,
    start_date: new Date().toISOString(),
    type: 'Ride',
    total_elevation_gain: 0,
    average_speed: 6,
    max_speed: 10,
    ...overrides,
  };
}

describe('calculateAllSkills', () => {
  it('returns all-zero skills for an empty activities list', () => {
    const skills = calculateAllSkills([], null, null);
    expect(skills).toEqual({
      climbing: 0,
      sprint: 0,
      endurance: 0,
      tempo: 0,
      power: 0,
      consistency: 0,
    });
  });

  it('returns every skill within 0-100 for a small set of recent activities', () => {
    const now = Date.now();
    const activities: Activity[] = [
      makeActivity({id: 1, start_date: new Date(now - 1 * 86400000).toISOString(), total_elevation_gain: 400, distance: 30000, moving_time: 5400}),
      makeActivity({id: 2, start_date: new Date(now - 5 * 86400000).toISOString(), total_elevation_gain: 800, distance: 60000, moving_time: 9000}),
      makeActivity({id: 3, start_date: new Date(now - 10 * 86400000).toISOString(), total_elevation_gain: 0, distance: 15000, moving_time: 2700, max_speed: 15}),
    ];
    const powerStats = {avgPower: 180, maxPower: 400, totalActivities: 3};
    const summary = {vo2max: 45, lthr: 160, totalDistance: 105000};

    const skills = calculateAllSkills(activities, powerStats, summary);

    for (const value of Object.values(skills)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
  });

  it('ignores activities outside the given period window', () => {
    const insideWindow = makeActivity({id: 1, start_date: '2026-06-15T00:00:00.000Z', total_elevation_gain: 500});
    const outsideWindow = makeActivity({id: 2, start_date: '2020-01-01T00:00:00.000Z', total_elevation_gain: 5000});

    const withBoth = calculateAllSkills(
      [insideWindow, outsideWindow],
      {avgPower: 150},
      null,
      new Date('2026-06-01T00:00:00.000Z'),
      new Date('2026-06-30T00:00:00.000Z'),
    );
    const withOnlyInside = calculateAllSkills(
      [insideWindow],
      {avgPower: 150},
      null,
      new Date('2026-06-01T00:00:00.000Z'),
      new Date('2026-06-30T00:00:00.000Z'),
    );

    // The out-of-window activity must not move the result at all.
    expect(withBoth).toEqual(withOnlyInside);
  });
});

describe('determineRiderProfile', () => {
  it('calls a low-average rider "Developing Rider"', () => {
    const profile = determineRiderProfile({
      climbing: 10,
      sprint: 15,
      endurance: 20,
      tempo: 10,
      power: 15,
      consistency: 10,
    });
    expect(profile.profile).toBe('Developing Rider');
  });

  it('calls a balanced, high-scoring rider "All-Rounder"', () => {
    const profile = determineRiderProfile({
      climbing: 60,
      sprint: 60,
      endurance: 65,
      tempo: 60,
      power: 60,
      consistency: 65,
    });
    expect(profile.profile).toBe('All-Rounder');
  });

  it('calls a rider with one clearly dominant skill "Climber"', () => {
    const profile = determineRiderProfile({
      climbing: 90,
      sprint: 40,
      endurance: 45,
      tempo: 40,
      power: 40,
      consistency: 45,
    });
    expect(profile.profile).toBe('Climber');
  });
});
