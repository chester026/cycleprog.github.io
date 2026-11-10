// Garmin Connect as a data source on real Postgres (docs/plans/
// garmin-connect-api.md): migrations 1758000000019 and …020, the repository,
// the ride ingest, health days and GET /api/garmin/connect/status. The FIT files are synthetic
// (test/fixtures/fitRide.js) — the same bytes path a real ride takes.
const request = require('supertest');
const { bootstrap } = require('./setup');
const { createUser } = require('./helpers');
const { buildFitRide, steadySamples } = require('../fixtures/fitRide');

// Two users for the whole file (POST /api/login is rate-limited — see
// garmin.test.js for the convention). Tests run in order and build on the
// state the previous one left: connect → ingest → re-ingest → disconnect.
describe('garmin connect: ingest + status', () => {
  let app, pool, user, other, repo, ingest, analyze;

  const status = (who) => request(app).get('/api/garmin/connect/status').set('Authorization', `Bearer ${who.token}`);

  beforeAll(async () => {
    ({ app, pool } = await bootstrap());
    user = await createUser(pool, app, request);
    other = await createUser(pool, app, request);
    repo = require('../../repositories/garminConnect');
    ingest = require('../../services/garminConnect/ingest');
    analyze = require('../../services/garminConnect/analyze');
  }, 30000);

  it('status needs a session and starts out disconnected', async () => {
    expect((await request(app).get('/api/garmin/connect/status')).status).toBe(401);
    const res = await status(user);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      connected: false,
      available: false,
      transport: null,
      connected_at: null,
      last_sync_at: null,
      activities: 0,
      last_activity_at: null,
      health_days: 0,
      last_health_day: null,
      health_latest: null,
    });
  });

  it('a ride cannot be stored for a rider with no connection', async () => {
    const fit = await buildFitRide();
    await expect(ingest.ingestActivityFile(user.id, { garminActivityId: 1001, name: 'Orphan' }, fit)).rejects.toMatchObject({ code: '23503' });
  });

  it('connect → ingest → the row holds the summary, the analysis and the chart', async () => {
    const connection = await repo.upsertConnection(user.id, { garminUserId: 134506845, transport: 'personal' });
    expect(connection).toMatchObject({ user_id: user.id, garmin_user_id: '134506845', transport: 'personal', last_sync_at: null });

    const fit = await buildFitRide({ samples: steadySamples({ seconds: 1500, pauseAt: 700, pauseS: 400, climb: 0.05 }) });
    const result = await ingest.ingestActivityFile(user.id, { garminActivityId: 25008462265, name: 'Germasogeia' }, fit);
    expect(result).toMatchObject({ status: 'ingested', garmin_activity_id: 25008462265, type: 'Ride', device_watts: true });

    const row = await repo.getActivity(user.id, 25008462265);
    expect(row).toMatchObject({
      garmin_activity_id: 25008462265,
      name: 'Germasogeia',
      type: 'Ride',
      sub_sport: 'road',
      utc_offset_s: 7200,
      moving_time: 1500,
      elapsed_time: 1899,
      average_watts: 200,
      weighted_average_watts: 210,
      device_watts: true,
      device_name: 'Garmin Edge 1040',
      analysis_version: analyze.ANALYSIS_VERSION,
    });
    expect(new Date(row.start_date).toISOString()).toBe('2026-06-01T06:00:00.000Z');
    expect(row.provider).toMatchObject({ ftp_w: 250, tss: 12.3, sensors: [{ type: 'bikePower', manufacturer: 'stagesCycling' }, { type: 'heartRate', manufacturer: 'wahooFitness' }] });
    expect(row.analysis.breakdown).toMatchObject({ source: 'meter', avg_w: 200, np_w: 200, moving_s: 1500, if_: null });
    expect(row.analysis.power_histogram).toEqual({ bins: { 200: 1500 }, total_seconds: 1500 });
    // 1498 one-second steps + the 400 s stop, which hrZones caps at 30 s.
    expect(row.analysis.hr_histogram.bins).toEqual({ 140: 1528 });
    // FTP applied on read, from what is stored.
    expect(analyze.breakdownWithFtp(row.analysis, 250)).toMatchObject({ if_: 0.8, tss: 27, zones_s: [0, 0, 1500, 0, 0, 0, 0] });
    const chart = analyze.decodeChart(row.chart);
    expect(chart.watts.data).toHaveLength(analyze.CHART_POINTS);
    expect(chart.latlng.data[0]).toEqual([34.7, 33.05]);
  });

  it('status reports the connection and its rides, per rider', async () => {
    await repo.touchLastSync(user.id);
    const res = await status(user);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ connected: true, available: false, transport: 'personal', activities: 1 });
    expect(new Date(res.body.last_activity_at).toISOString()).toBe('2026-06-01T06:00:00.000Z');
    expect(Date.parse(res.body.connected_at)).not.toBeNaN();
    expect(Date.parse(res.body.last_sync_at)).not.toBeNaN();

    expect((await status(other)).body).toMatchObject({ connected: false, activities: 0 });
  });

  it('the same ride again replaces its row; a second ride adds one; a run adds none', async () => {
    const renamed = await buildFitRide({ samples: steadySamples({ seconds: 1500, watts: 180 }) });
    await ingest.ingestActivityFile(user.id, { garminActivityId: 25008462265, name: 'Germasogeia — FTP up' }, renamed);
    const row = await repo.getActivity(user.id, 25008462265);
    expect(row.name).toBe('Germasogeia — FTP up');
    expect(row.analysis.breakdown.avg_w).toBe(180);

    const later = await buildFitRide({ start: new Date('2026-06-03T05:30:00Z'), samples: steadySamples({ seconds: 300 }).map(({ power: _power, ...rest }) => rest) });
    await ingest.ingestActivityFile(user.id, { garminActivityId: 25008462266, name: 'No meter' }, later);
    const run = await ingest.ingestActivityFile(user.id, { garminActivityId: 25008462267, name: 'Run' }, await buildFitRide({ sport: 'running', subSport: 'generic' }));
    expect(run).toEqual({ status: 'skipped', reason: 'not_a_ride', sport: 'running' });

    const noMeter = await repo.getActivity(user.id, 25008462266);
    expect(noMeter).toMatchObject({ device_watts: false, average_watts: null });
    expect(noMeter.analysis.power_histogram).toBeNull();

    expect(await repo.getIngestedVersions(user.id)).toEqual(new Map([[25008462265, analyze.ANALYSIS_VERSION], [25008462266, analyze.ANALYSIS_VERSION]]));
    const stats = await repo.getActivityStats(user.id);
    expect(stats.activities).toBe(2);
    expect(new Date(stats.last_activity_at).toISOString()).toBe('2026-06-03T05:30:00.000Z');
    expect(stats.stored_bytes).toBeGreaterThan(0);
    expect((await status(user)).body.activities).toBe(2);
  });

  it('health days: a batch upserts, a re-sync updates the day without blanking it, and status shows the newest', async () => {
    const { mapPersonalHealth } = require('../../services/garminConnect/personalHealth');
    const summaryOf = (calendarDate, restingValue, bodyBattery) => ({ calendarDate, heartRate: { restingValue, minValue: 44, maxValue: 160 }, stress: { avgLevel: 28, qualifier: 'BALANCED', highStressDurationInMillis: 1800000 }, bodyBattery });
    const rows = mapPersonalHealth({
      summaries: { data: [summaryOf('2026-06-02', 49, { maxValue: 70, minValue: 25 }), summaryOf('2026-06-03', 47, { maxValue: 88, minValue: 40 })] },
      sleep: [{ calendarDate: '2026-06-03', sleepTimeSeconds: 25980, deepSleepSeconds: 5400, sleepScores: { overall: { value: 81 } }, avgHeartRate: 51.2 }],
      hrv: { hrvSummaries: [{ calendarDate: '2026-06-03', lastNightAvg: 48.2, weeklyAvg: 46, status: 'BALANCED' }] },
    });
    expect(await repo.upsertHealthDays(user.id, rows)).toBe(2);
    expect(await repo.upsertHealthDays(user.id, [])).toBe(0);

    const stored = await repo.getHealthDays(user.id, { limit: 5 });
    expect(stored.map((r) => r.day)).toEqual(['2026-06-03', '2026-06-02']);
    // Read back exactly as mapped: numbers, not strings, and the day as a plain date.
    expect(stored[0]).toEqual(rows[1]);
    expect(stored[1]).toEqual(rows[0]);

    // Later the same day: the daytime figures moved on, and this time the
    // sleep and HRV endpoints did not answer. New readings replace the old
    // ones; what is missing from the new payload stays as stored.
    const later = mapPersonalHealth({ summaries: { data: [summaryOf('2026-06-03', 46, { maxValue: 88, minValue: 12 })] } });
    await repo.upsertHealthDays(user.id, later);
    const [today] = await repo.getHealthDays(user.id, { limit: 1 });
    expect(today).toMatchObject({ day: '2026-06-03', resting_hr: 46, body_battery_low: 12, sleep_seconds: 25980, sleep_score: 81, hrv_last_night_ms: 48.2 });
    const healthStats = await repo.getHealthStats(user.id);
    expect(healthStats).toMatchObject({ health_days: 2, last_health_day: '2026-06-03' });
    expect(Date.now() - new Date(healthStats.last_health_sync_at).getTime()).toBeLessThan(60000);

    const res = await status(user);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      connected: true,
      health_days: 2,
      last_health_day: '2026-06-03',
      health_latest: {
        day: '2026-06-03',
        sleep_hours: 7.2,
        sleep_score: 81,
        hrv_ms: 48,
        hrv_status: 'BALANCED',
        resting_hr: 46,
        body_battery_high: 88,
        body_battery_low: 12,
        stress_avg: 28,
      },
    });
    expect((await status(other)).body).toMatchObject({ health_days: 0, last_health_day: null, health_latest: null });
  });

  it('health days need a connection, like rides', async () => {
    await expect(repo.upsertHealthDays(other.id, [{ day: '2026-06-03', resting_hr: 50 }])).rejects.toMatchObject({ code: '23503' });
  });

  it('one Garmin account feeds one rider; reconnecting the same account keeps connected_at', async () => {
    await expect(repo.upsertConnection(other.id, { garminUserId: '134506845', transport: 'oauth' })).rejects.toMatchObject({ code: '23505' });
    expect(await repo.getConnection(other.id)).toBeNull();

    const before = await repo.getConnection(user.id);
    const again = await repo.upsertConnection(user.id, { garminUserId: '134506845', transport: 'oauth' });
    expect(again.transport).toBe('oauth');
    expect(new Date(again.connected_at).getTime()).toBe(new Date(before.connected_at).getTime());
    expect((await status(user)).body.transport).toBe('oauth');

    await expect(repo.upsertConnection(user.id, { garminUserId: '1', transport: 'carrier-pigeon' })).rejects.toMatchObject({ code: '23514' });
  });

  it('disconnecting deletes every ride and health day that came through the connection', async () => {
    expect(await repo.deleteConnection(user.id)).toBe(true);
    expect(await repo.deleteConnection(user.id)).toBe(false);
    const left = await pool.query(
      `SELECT (SELECT COUNT(*)::int FROM garmin_activities WHERE user_id = $1) AS rides,
              (SELECT COUNT(*)::int FROM garmin_health_days WHERE user_id = $1) AS health_days`,
      [user.id]
    );
    expect(left.rows[0]).toEqual({ rides: 0, health_days: 0 });
    expect((await status(user)).body).toMatchObject({ connected: false, activities: 0, last_activity_at: null, health_days: 0, health_latest: null });
  });

  it('deleting the rider takes the connection and the rides with them', async () => {
    const gone = await pool.query(
      `INSERT INTO users (email, password_hash, name, email_verified, created_at) VALUES ($1, 'x', 'Gone', true, NOW()) RETURNING id`,
      [`gone-${Date.now()}@example.com`]
    );
    const goneId = gone.rows[0].id;
    await repo.upsertConnection(goneId, { garminUserId: 'g-777', transport: 'oauth' });
    await ingest.ingestActivityFile(goneId, { garminActivityId: 5, name: 'Last ride' }, await buildFitRide());
    await pool.query('DELETE FROM users WHERE id = $1', [goneId]);
    const rows = await pool.query(
      `SELECT (SELECT COUNT(*)::int FROM garmin_connections WHERE user_id = $1) AS connections,
              (SELECT COUNT(*)::int FROM garmin_activities WHERE user_id = $1) AS activities`,
      [goneId]
    );
    expect(rows.rows[0]).toEqual({ connections: 0, activities: 0 });
  });
});
