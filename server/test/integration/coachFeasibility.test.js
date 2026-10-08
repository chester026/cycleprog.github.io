const request = require('supertest');
const { bootstrap } = require('./setup');
const { createUser } = require('./helpers');

// assess_ride_feasibility (server/aiCoach.js): "can I do 160 km / 3000 m tomorrow?" answered from
// the rider's synced Strava rides + the calendar around that day, for a rider with no Apple
// Health/Oura (07.10.2026 bug). Rides are seeded through syncActivitiesToDb like metaGoalRides.test.js.
describe('AI Coach assess_ride_feasibility (real Postgres)', () => {
  let app, pool, coach, rider, newcomer;
  const DAY_MS = 86400000;
  const daysFromNow = (n) => new Date(Date.now() + n * DAY_MS);
  const isoDay = (d) => d.toISOString().slice(0, 10);

  beforeAll(async () => {
    ({ app, pool } = await bootstrap());
    ({ coach } = require('../../services/coach'));
    // Two logins for the whole file — /api/login is rate-limited per IP.
    rider = await createUser(pool, app, request);
    newcomer = await createUser(pool, app, request);
  }, 30000);

  let nextRideId = 9300000;
  async function seedRides(user, rides) {
    const strava = require('../../services/strava/activities');
    await pool.query('DELETE FROM synced_activities WHERE user_id = $1', [user.id]);
    await strava.syncActivitiesToDb(user.id, rides.map((r) => ({
      id: nextRideId++,
      name: r.name,
      type: 'Ride',
      start_date: daysFromNow(-r.daysAgo).toISOString(),
      distance: r.km * 1000,
      moving_time: r.hours * 3600,
      total_elevation_gain: r.elevationM,
      average_speed: (r.km * 1000) / (r.hours * 3600),
      average_heartrate: 138,
    })));
    strava.invalidate(user.id);
  }

  it('compares the described ride with synced rides, load and the calendar around the date', async () => {
    await seedRides(rider, [
      { name: 'Big day', daysAgo: 40, km: 142, elevationM: 2410, hours: 6 },
      { name: 'Hilly 100', daysAgo: 8, km: 100, elevationM: 2000, hours: 4 },
      { name: 'Spin', daysAgo: 3, km: 40, elevationM: 500, hours: 2 },
      { name: 'Commute', daysAgo: 1, km: 30, elevationM: 200, hours: 1 },
    ]);
    const tomorrow = isoDay(daysFromNow(1));
    const insertEvent = (title, date, times = ['NULL', 'NULL']) => pool.query(
      `INSERT INTO calendar_events (user_id, type, title, start_date, start_time, end_time)
       VALUES ($1, 'planned_ride', $2, $3, ${times[0]}, ${times[1]})`,
      [rider.id, title, date]
    );
    await insertEvent('Intervals 4x8', isoDay(daysFromNow(0)), ["'17:00'", "'18:00'"]);
    await insertEvent('Rest', isoDay(daysFromNow(2)));
    await insertEvent('Far away', isoDay(daysFromNow(10)));
    await pool.query(
      `INSERT INTO skills_history (user_id, snapshot_date, climbing, sprint, endurance, tempo, power, consistency, last_activity_id)
       VALUES ($1, NOW(), 41, 60, 52, 47, 50, 63, 1)`,
      [rider.id]
    );

    const result = await coach.executeTool('assess_ride_feasibility', { distance_km: 160, elevation_m: 3000, date: tomorrow }, { userId: rider.id });

    expect(result.target).toEqual({ distanceKm: 160, elevationM: 3000, date: tomorrow });
    expect(result.comparableRides.map((r) => r.name)).toEqual(['Big day', 'Hilly 100', 'Spin']);
    expect(result.comparableRides[0]).toMatchObject({ distanceKm: 142, elevationM: 2410, movingTimeH: 6, avgHr: 138, daysAgo: 40 });
    expect(result.personalBests).toMatchObject({
      longestRide: { distanceKm: 142, daysAgo: 40 },
      biggestClimb: { elevationM: 2410 },
      longestTimeH: 6,
    });
    expect(result.capability).toMatchObject({ level: 'near', ratioDistance: 1.13, ratioElevation: 1.24, longRides90d: 2, bigClimbRides90d: 2 });
    expect(result.load.last7d).toEqual({ km: 70, hours: 3, elevationM: 700, rides: 2 });
    expect(result.load.last28d).toMatchObject({ rides: 3, hours: 7 });
    expect(result.load).toMatchObject({ daysSinceLastRide: 1, daysSinceLastLongRide: 8 });
    expect(result.load.acuteChronicRatio).toBeGreaterThan(1.3);
    expect(result.freshness).toBe('loaded');

    expect(result.calendarAround.map((e) => e.title)).toEqual(['Intervals 4x8', 'Rest']);
    expect(result.calendarAround[0]).toMatchObject({ type: 'planned_ride', start_date: isoDay(daysFromNow(0)), duration_minutes: 60, completed: false });
    expect(result.calendarAround[1].duration_minutes).toBeNull();
    expect(result.skills).toEqual({ climbing: 41, endurance: 52, tempo: 47, consistency: 63 });

    expect(result.summary).toContain('Target 160 km / 3000 m');
    expect(result.summary).toContain('Capability: near (distance 113%, climbing 124% of PBs)');
    expect(result.summary).toContain('Freshness: loaded.');
  });

  it('answers for a rider with no rides, no skills and an unparsable date without throwing', async () => {
    const result = await coach.executeTool('assess_ride_feasibility', { distance_km: 160, date: 'tomorrow' }, { userId: newcomer.id });
    expect(result.capability.level).toBe('unknown');
    expect(result.freshness).toBe('unknown');
    expect(result.target.date).toBe(isoDay(new Date()));
    expect(result.target.elevationM).toBe(0);
    expect(result.calendarAround).toEqual([]);
    expect(result.skills).toBeNull();
    expect(result.summary).toContain('No synced rides');
  });

  it('rejects a missing distance', async () => {
    const result = await coach.executeTool('assess_ride_feasibility', { elevation_m: 500 }, { userId: newcomer.id });
    expect(result.error).toBe('invalid_distance');
  });
});
