// findLastRide/computeMapRegion etc don't touch dates, but formatRideDate
// pulls in the real i18n module (react-native-localize/AsyncStorage) via
// getDateLocale() — not relevant to what these tests assert, so it's
// swapped out for a fixed locale (same pattern as ActivityMetricList.test).
jest.mock('../../i18n/dateLocale', () => ({
  getDateLocale: () => 'en-US',
}));

import {
  computeOverallStats,
  findLastRide,
  decodeTrackCoordinates,
  computeMapRegion,
  getGarageImageUrl,
  pickTopAchievements,
  calculateNutrition,
  buildCompletedGoalItems,
} from './lib';
import type {Activity} from '../../types/activity';
import type {Achievement} from '../../components/achievements';
import type {MetaGoal, UserProfile} from '@bikelab/shared/types';

function makeActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: 1,
    type: 'Ride',
    start_date: '2024-01-01T00:00:00Z',
    distance: 10000,
    moving_time: 3600,
    total_elevation_gain: 100,
    average_speed: 2.78,
    ...overrides,
  } as Activity;
}

describe('computeOverallStats', () => {
  it('returns zeros for no activities', () => {
    expect(computeOverallStats([])).toEqual({
      totalDistance: 0,
      totalElevation: 0,
      totalTime: 0,
      avgSpeed: 0,
    });
  });

  it('sums distance/elevation/time and derives avg speed across activities', () => {
    const activities = [
      makeActivity({distance: 10000, moving_time: 3600, total_elevation_gain: 100}),
      makeActivity({distance: 20000, moving_time: 3600, total_elevation_gain: 200}),
    ];
    const stats = computeOverallStats(activities);
    expect(stats.totalDistance).toBe(30); // km
    expect(stats.totalElevation).toBe(300); // m
    expect(stats.totalTime).toBe(2); // hours
    expect(stats.avgSpeed).toBeCloseTo(15, 5); // 30km / 2h
  });
});

describe('findLastRide', () => {
  it('picks the most recent Ride/VirtualRide, ignoring other activity types', () => {
    const older = makeActivity({id: 1, start_date: '2024-01-01T00:00:00Z'});
    const newer = makeActivity({id: 2, start_date: '2024-02-01T00:00:00Z'});
    const run = makeActivity({id: 3, type: 'Run', start_date: '2024-03-01T00:00:00Z'});
    expect(findLastRide([older, newer, run])).toBe(newer);
  });

  it('returns null when there are no rides', () => {
    expect(findLastRide([makeActivity({type: 'Run'})])).toBeNull();
  });
});

describe('decodeTrackCoordinates', () => {
  it('returns [] for missing input', () => {
    expect(decodeTrackCoordinates(undefined)).toEqual([]);
    expect(decodeTrackCoordinates(null)).toEqual([]);
  });

  it('returns [] instead of throwing on a malformed polyline', () => {
    // An odd/garbage string that the mapbox decoder can choke on shouldn't
    // crash the screen — same fallback the old inline try/catch had.
    expect(() => decodeTrackCoordinates('###not-a-polyline###')).not.toThrow();
  });

  it('decodes a valid encoded polyline into lat/lng points', () => {
    // Encodes [[38.5, -120.2], [40.7, -120.95]] (mapbox/polyline's own doc example).
    const encoded = '_p~iF~ps|U_ulLnnqC';
    const points = decodeTrackCoordinates(encoded);
    expect(points.length).toBe(2);
    expect(points[0].latitude).toBeCloseTo(38.5, 1);
    expect(points[0].longitude).toBeCloseTo(-120.2, 1);
  });
});

describe('computeMapRegion', () => {
  it('returns null for no coordinates', () => {
    expect(computeMapRegion([])).toBeNull();
  });

  it('centers on the bounding box and enforces a minimum delta', () => {
    const region = computeMapRegion([
      {latitude: 10, longitude: 20},
      {latitude: 10.001, longitude: 20.001},
    ]);
    expect(region).not.toBeNull();
    expect(region!.latitude).toBeCloseTo(10.0005, 4);
    expect(region!.latitudeDelta).toBeGreaterThanOrEqual(0.005);
    expect(region!.longitudeDelta).toBeGreaterThanOrEqual(0.005);
  });
});

describe('getGarageImageUrl', () => {
  it('returns null when the slot is empty', () => {
    expect(getGarageImageUrl({}, 'right')).toBeNull();
  });

  it('strips query params from the ImageKit URL', () => {
    const images = {right: {url: 'https://ik.example/img.jpg?tr=abc', fileId: 'f1', name: 'n'}};
    expect(getGarageImageUrl(images, 'right')).toBe('https://ik.example/img.jpg');
  });
});

function makeAchievement(overrides: Partial<Achievement> = {}): Achievement {
  return {
    id: 1,
    key: 'k',
    category: 'distance',
    tier: 'silver',
    name: 'n',
    description: 'd',
    icon: 'i',
    metric: 'm',
    threshold: 100,
    condition_type: 'gte',
    current_value: 0,
    unlocked: false,
    unlocked_at: null,
    trigger_activity_id: null,
    progress_pct: 0,
    ...overrides,
  } as Achievement;
}

describe('pickTopAchievements', () => {
  it('returns up to 3 most-recently-unlocked + 3 closest-to-unlock, capped at 6', () => {
    const unlockedOld = makeAchievement({id: 1, unlocked: true, unlocked_at: '2024-01-01'});
    const unlockedNew = makeAchievement({id: 2, unlocked: true, unlocked_at: '2024-06-01'});
    const lockedFar = makeAchievement({id: 3, unlocked: false, progress_pct: 10});
    const lockedClose = makeAchievement({id: 4, unlocked: false, progress_pct: 90});

    const result = pickTopAchievements([unlockedOld, unlockedNew, lockedFar, lockedClose]);

    expect(result.map(a => a.id)).toEqual([2, 1, 4, 3]);
    expect(result.length).toBeLessThanOrEqual(6);
  });
});

describe('calculateNutrition', () => {
  const emptyInput = {distance: '', elevation: '', speed: '', temp: ''};

  it('returns null when distance/elevation/speed are missing', () => {
    expect(calculateNutrition(emptyInput, null)).toBeNull();
  });

  it('uses generic (non-personalized) defaults with no profile', () => {
    const result = calculateNutrition(
      {distance: '100', elevation: '1000', speed: '25', temp: '20'},
      null,
    );
    expect(result).not.toBeNull();
    expect(result!.isPersonalized).toBe(false);
    expect(result!.timeH).toBeCloseTo(4, 5);
    expect(result!.gels).toBeGreaterThanOrEqual(1);
  });

  it('personalizes using the rider profile weight/age/gender/experience', () => {
    const profile = {weight: 80, age: 30, gender: 'male', experience_level: 'advanced'} as UserProfile;
    const result = calculateNutrition(
      {distance: '100', elevation: '1000', speed: '25', temp: '20'},
      profile,
    );
    expect(result).not.toBeNull();
    expect(result!.isPersonalized).toBe(true);
    expect(result!.userWeight).toBe(80);
    expect(result!.carbsPerKgPerH).toBe(0.7);
  });
});

describe('buildCompletedGoalItems', () => {
  const goal = (id: number, status: 'active' | 'completed', completed_at?: string): MetaGoal =>
    ({id, title: `g${id}`, status, created_at: '2026-08-01T10:00:00', completed_at} as MetaGoal);

  it('keeps completed goals only, newest completion first, with a recap', () => {
    const items = buildCompletedGoalItems(
      [goal(1, 'completed', '2026-08-20T10:00:00'), goal(2, 'active'), goal(3, 'completed', '2026-09-05T10:00:00')],
      [makeActivity({start_date: '2026-08-10T08:00:00', distance: 50000})],
    );
    expect(items.map(i => i.goal.id)).toEqual([3, 1]);
    expect(items[0].completedAt).toEqual(new Date('2026-09-05T10:00:00'));
    expect(items[1].recap.distanceKm).toBeCloseTo(50);
    expect(items[1].recap.rides).toBe(1);
  });
});
