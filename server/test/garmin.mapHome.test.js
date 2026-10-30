// Pure mapper for the Connect IQ `home` payload (services/garmin.js
// mapHome) — the wire format packages/garmin-ciq reads. No DB.
process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
process.env.PGHOST = process.env.PGHOST || 'localhost';

const { mapHome, mapBike } = require('../services/garmin');
const { GarminHomeResponseSchema } = require('@bikelab/shared/api');

const now = new Date('2026-10-22T09:00:00.000Z');

function metaGoal(over = {}) {
  return {
    id: 12,
    title: 'Everest this season',
    status: 'active',
    target_date: '2026-11-29',
    sub_goals: [
      { title: 'Elevation', current_value: 3400, target_value: 8848, unit: 'm', percent: 38, pace: { onTrack: false, percentDelta: -9 } },
      { title: 'Distance', current_value: 500, target_value: 1000, unit: 'km', percent: 50, pace: { onTrack: true, percentDelta: 4 } },
    ],
    ...over,
  };
}

describe('garmin mapHome', () => {
  it('builds a contract-valid payload with goals, last ride and impact', () => {
    const out = mapHome({
      metaGoals: [metaGoal()],
      lastRide: { id: 123, name: 'Morning Ride', start_date_local: '2026-10-21T07:10:00Z', distance: 42310, total_elevation_gain: 850.4, moving_time: 5700 },
      impact: [{ id: 12, title: 'Everest', progress: 41.4, progressGain: 4.2, contributions: [{ type: 'total_elevation_gain', label: 'Elevation', value: '+850 m' }] }],
      now,
    });
    expect(GarminHomeResponseSchema.safeParse(out).success).toBe(true);
    expect(out.goals).toHaveLength(1);
    expect(out.goals[0]).toMatchObject({ id: 12, t: 'Everest this season', pct: 44, days: 38, ok: false });
    expect(out.goals[0].subs[0]).toEqual({ t: 'Elevation', cur: 3400, tgt: 8848, u: 'm', pct: 38, d: -9 });
    expect(out.last).toMatchObject({ id: '123', n: 'Morning Ride', d: '2026-10-21', km: 42.3, m: 850, min: 95 });
    expect(out.last.impact).toEqual([{ id: 12, pct: 41, gain: 4, c: [{ l: 'Elevation', v: '+850 m' }] }]);
  });

  it('drops completed meta-goals, caps lists and trims long titles', () => {
    const many = Array.from({ length: 7 }, (_, i) => metaGoal({ id: i + 1, title: `A very long meta goal title that keeps going number ${i + 1}` }));
    const out = mapHome({ metaGoals: [...many, metaGoal({ id: 99, status: 'completed' })], lastRide: null, impact: [], now });
    expect(out.goals).toHaveLength(5);
    expect(out.goals.every((g) => g.t.length <= 40)).toBe(true);
    expect(out.goals[0].t.endsWith('…')).toBe(true);
    expect(out.last).toBeNull();
  });

  it('handles open-ended goals and sub-goals without pace', () => {
    const out = mapHome({
      metaGoals: [metaGoal({ target_date: null, sub_goals: [{ title: 'Sprint', current_value: 1, target_value: 3, unit: null, percent: 33, pace: null }] })],
      lastRide: null,
      impact: [],
      now,
    });
    expect(out.goals[0].days).toBeNull();
    expect(out.goals[0].ok).toBe(true);
    expect(out.goals[0].subs[0].d).toBeNull();
    expect(out.goals[0].subs[0].u).toBeNull();
    expect(GarminHomeResponseSchema.safeParse(out).success).toBe(true);
  });

  it('keeps impact rows that only have contributions and skips empty ones', () => {
    const out = mapHome({
      metaGoals: [],
      lastRide: { id: 'abc', name: 'R', start_date: '2026-10-20T10:00:00Z', distance: 0, total_elevation_gain: 0, moving_time: 0 },
      impact: [
        { id: 1, progress: 10, progressGain: 0, contributions: [] },
        { id: 2, progress: 10, progressGain: 0, contributions: [{ label: 'Rides', value: '+1' }] },
      ],
      now,
    });
    expect(out.last.d).toBe('2026-10-20');
    expect(out.last.impact.map((r) => r.id)).toEqual([2]);
  });

  it('mapBike: most worn parts first, user labels win, next service mapped', () => {
    const health = {
      overallHealth: 71.4,
      nextService: { component: 'chain', inKm: 420.2 },
      components: [
        { id: 'saddle', healthPercent: 90, remainingKm: 22000, status: 'good' },
        { id: 'chain', healthPercent: 7, remainingKm: 420, status: 'critical' },
        { id: 'tires', healthPercent: 40, remainingKm: 2400, status: 'warning' },
      ],
    };
    const out = mapBike({ name: 'Canyon Aeroad CF SLX 8 Disc Di2', distanceKm: 8420.4, activitiesCount: 214, primary: true }, health, { chain: 'KMC X12' });
    expect(out).toEqual({
      n: 'Canyon Aeroad CF SLX 8 Disc Di2',
      km: 8420,
      r: 214,
      h: 71,
      next: { c: 'KMC X12', km: 420, s: 'critical' },
      // the chain is the next service, so it is not repeated in parts
      parts: [
        { c: 'Tires', pct: 40, km: 2400, s: 'warning' },
        { c: 'Saddle', pct: 90, km: 22000, s: 'good' },
      ],
    });
    expect(mapBike(null, health, {})).toBeNull();
    const home = mapHome({ metaGoals: [], lastRide: null, impact: [], bike: out, now });
    expect(GarminHomeResponseSchema.safeParse(home).success).toBe(true);
    expect(home.bike.parts).toHaveLength(2);
  });
});
