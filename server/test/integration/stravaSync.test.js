const request = require('supertest');
const { bootstrap } = require('./setup');
const { createUser } = require('./helpers');

// Regression: the UNNEST upsert once listed 19 target columns but produced 18
// values (missing NOW()), so every sync failed silently and `raw` was never
// written — clients then got activities without map/gear_id. Real-PG test.
describe('services/strava/activities.syncActivitiesToDb (real Postgres)', () => {
  let pool, sync, readBack, userId;

  beforeAll(async () => {
    let app;
    ({ app, pool } = await bootstrap());
    ({ syncActivitiesToDb: sync } = require('../../services/strava/activities'));
    ({ id: userId } = await createUser(pool, app, request, { email: `sync-${Date.now()}@example.com` }));
    readBack = (id) =>
      pool.query(
        `SELECT strava_id, type, raw, raw->>'gear_id' AS gear_id,
                raw->'map'->>'summary_polyline' AS polyline, synced_at
           FROM synced_activities WHERE user_id = $1 AND strava_id = $2`,
        [userId, id]
      );
  }, 30000);

  const activity = (over = {}) => ({
    id: 990001,
    name: 'Ride with "quotes" and \\ backslash',
    type: 'Ride',
    start_date: '2026-09-14T10:00:00Z',
    distance: 24100,
    moving_time: 3500,
    elapsed_time: 3600,
    total_elevation_gain: 36,
    average_speed: 6.9,
    max_speed: 12.1,
    average_heartrate: 140.5,
    gear_id: 'b123',
    map: { summary_polyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@\\abc' },
    ...over,
  });

  it('writes the full raw JSON incl. map polyline and gear_id, and synced_at', async () => {
    await sync(userId, [activity()]);
    const { rows } = await readBack(990001);
    expect(rows).toHaveLength(1);
    expect(rows[0].gear_id).toBe('b123');
    expect(rows[0].polyline).toBe('_p~iF~ps|U_ulLnnqC_mqNvxq`@\\abc');
    expect(rows[0].raw.name).toBe('Ride with "quotes" and \\ backslash');
    expect(rows[0].synced_at).toBeTruthy();
  });

  it('upserts on conflict (same strava_id) instead of duplicating', async () => {
    await sync(userId, [activity({ name: 'renamed', gear_id: 'b999' })]);
    const { rows } = await readBack(990001);
    expect(rows).toHaveLength(1);
    expect(rows[0].raw.name).toBe('renamed');
    expect(rows[0].gear_id).toBe('b999');
  });

  it('handles a batch with nulls in optional numeric fields', async () => {
    await sync(userId, [
      activity({ id: 990002, average_heartrate: undefined, max_heartrate: null, average_watts: undefined }),
      activity({ id: 990003, type: 'VirtualRide', max_watts: null }),
    ]);
    const { rows } = await pool.query(
      'SELECT strava_id FROM synced_activities WHERE user_id = $1 AND strava_id IN (990002, 990003) ORDER BY 1',
      [userId]
    );
    expect(rows.map((r) => Number(r.strava_id))).toEqual([990002, 990003]);
  });

  it('drops non-cycling activities at ingest (only Ride/VirtualRide are mirrored)', async () => {
    await sync(userId, [
      activity({ id: 990010, type: 'Run' }),
      activity({ id: 990011, type: 'Walk' }),
      activity({ id: 990012, type: 'Yoga' }),
      activity({ id: 990013, type: 'Ride' }),
      activity({ id: 990014, type: undefined }),
    ]);
    const { rows } = await pool.query(
      'SELECT strava_id FROM synced_activities WHERE user_id = $1 AND strava_id BETWEEN 990010 AND 990014 ORDER BY 1',
      [userId]
    );
    expect(rows.map((r) => Number(r.strava_id))).toEqual([990013]);
  });

  it('pruneNonRideRows removes legacy non-ride rows and keeps rides', async () => {
    const { pruneNonRideRows } = require('../../services/strava/activities');
    // Legacy rows written before the ingest filter existed.
    await pool.query(
      `INSERT INTO synced_activities (user_id, strava_id, name, type, start_date)
       VALUES ($1, 990020, 'old run', 'Run', NOW()), ($1, 990021, 'old hike', 'Hike', NOW()),
              ($1, 990022, 'untyped', NULL, NOW())`,
      [userId]
    );
    await pruneNonRideRows(userId);
    const { rows } = await pool.query(
      'SELECT strava_id, type FROM synced_activities WHERE user_id = $1 ORDER BY 1',
      [userId]
    );
    const types = new Set(rows.map((r) => r.type));
    expect([...types].sort()).toEqual(['Ride', 'VirtualRide']);
    expect(rows.some((r) => Number(r.strava_id) >= 990020)).toBe(false);
  });
});
