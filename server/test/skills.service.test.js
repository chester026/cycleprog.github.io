// Unit tests for services/skills.js (T-3.3, docs/audit/00-AUDIT-AND-PLAN.md
// T-3.3) with the activities/profile services stubbed — no real DB
// connection. Following this repo's convention (see
// test/auth.middleware.test.js / test/strava.tokens.test.js): stub a
// property on the already-`require`d dependency module BEFORE requiring
// services/skills.js, rather than `vi.mock` (which those tests' own
// comments note doesn't reliably intercept CJS `require`s here) — Node's
// require cache means every module sees the same object, so overwriting a
// property on it is visible everywhere, as long as the consumer reads it
// via property access (not a destructured copy taken before the override).
//
// Real-Postgres end-to-end coverage (snapshot idempotency, trend, the
// /api/skills route) lives in test/integration/skills.test.js per the "SQL
// changes need real-PG integration tests" rule.
const { pool } = require('../db');
const queryMock = vi.fn();
pool.query = (...args) => queryMock(...args);

const stravaActivities = require('../services/strava/activities');
const getActivitiesMock = vi.fn();
stravaActivities.getActivities = getActivitiesMock;

const { StravaNotLinkedError } = require('../services/strava/tokens');

const recommendations = require('../recommendations');
const getUserProfileMock = vi.fn();
recommendations.getUserProfile = getUserProfileMock;

const skillsService = require('../services/skills');

const NOW = new Date('2026-06-15T00:00:00Z');

function ride(daysAgo, overrides = {}) {
  const start = new Date(NOW.getTime() - daysAgo * 24 * 60 * 60 * 1000);
  return {
    id: 1000 + daysAgo,
    name: 'Ride',
    type: 'Ride',
    start_date: start.toISOString(),
    distance: 40000,
    moving_time: 3600,
    total_elevation_gain: 50,
    average_speed: 8,
    max_speed: 12,
    average_heartrate: 140,
    ...overrides,
  };
}

describe('services/skills computeSkills', () => {
  beforeEach(() => {
    queryMock.mockReset();
    getActivitiesMock.mockReset();
    getUserProfileMock.mockReset();
  });

  it('returns all-zero skills for a user with no Strava link (StravaNotLinkedError)', async () => {
    getActivitiesMock.mockRejectedValue(new StravaNotLinkedError());
    getUserProfileMock.mockResolvedValue(null);

    const result = await skillsService.computeSkills(1, { asOf: NOW });

    expect(result.skills).toEqual({ climbing: 0, sprint: 0, endurance: 0, tempo: 0, power: 0, consistency: 0 });
    expect(result.riderProfile.profile).toBe('Developing Rider');
    expect(result.sampleSize).toBe(0);
    expect(result.confidence).toBe(0);
    expect(result.lastActivityId).toBeNull();
  });

  it('computes non-zero skills and confidence for a user with activities in the window', async () => {
    const activities = Array.from({ length: 25 }, (_, i) => ride(i * 2)).sort((a, b) => b.id - a.id);
    getActivitiesMock.mockResolvedValue(activities);
    getUserProfileMock.mockResolvedValue({ lactate_threshold: 160 });

    const result = await skillsService.computeSkills(5, { asOf: NOW });

    expect(result.confidence).toBe(1); // 25 >= 20 rides in window
    expect(result.sampleSize).toBe(25);
    expect(result.lastActivityId).toBe(activities[0].id);
    for (const v of Object.values(result.skills)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it('uses estimated_power.avgWatts (T-3.5) instead of raw average_watts for the power scale', async () => {
    // Same rides, but with a persisted estimated_power far below what the
    // raw average_watts fallback (`weighted_average_watts ?? average_watts`)
    // would have used — proves computeSkills is reading estimated_power,
    // not the shared calc's own raw-activity fallback.
    const withEstimate = Array.from({ length: 25 }, (_, i) =>
      ride(i * 2, { average_watts: 300, estimated_power: { avgWatts: 90, method: 'estimated', confidence: 'low' } })
    ).sort((a, b) => b.id - a.id);
    const withoutEstimate = Array.from({ length: 25 }, (_, i) => ride(i * 2, { average_watts: 300 })).sort(
      (a, b) => b.id - a.id
    );

    getActivitiesMock.mockResolvedValueOnce(withEstimate);
    getUserProfileMock.mockResolvedValueOnce(null);
    const resultWithEstimate = await skillsService.computeSkills(1, { asOf: NOW });

    getActivitiesMock.mockResolvedValueOnce(withoutEstimate);
    getUserProfileMock.mockResolvedValueOnce(null);
    const resultWithoutEstimate = await skillsService.computeSkills(1, { asOf: NOW });

    expect(resultWithEstimate.skills.power).toBeLessThan(resultWithoutEstimate.skills.power);
  });

  it('degrades to 0 activities (never throws) for any getActivities failure, warning only for unexpected ones', async () => {
    // Mirrors the existing /api/meta-goals and /api/bikes/:id/health
    // call sites (server.js): any activities-fetch failure degrades to "no
    // activities" rather than failing the whole request — StravaNotLinkedError
    // is the expected case (never logged as a warning), anything else still
    // logs a warning but the request still gets a 200 with all-zero skills.
    getActivitiesMock.mockRejectedValue(new Error('boom'));
    getUserProfileMock.mockResolvedValue(null);

    const result = await skillsService.computeSkills(1, { asOf: NOW });

    expect(result.skills).toEqual({ climbing: 0, sprint: 0, endurance: 0, tempo: 0, power: 0, consistency: 0 });
    expect(result.sampleSize).toBe(0);
  });
});

describe('services/skills saveSnapshot', () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  const skills = { climbing: 50, sprint: 40, endurance: 30, tempo: 20, power: 10, consistency: 60 };

  it('is a no-op when a row with the same last_activity_id already exists', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 1, last_activity_id: '555' }] });

    const result = await skillsService.saveSnapshot(1, skills, { lastActivityId: 555, asOf: NOW });

    expect(result.saved).toBe(false);
    expect(queryMock).toHaveBeenCalledTimes(1); // only the existence check, no INSERT
  });

  it('inserts a new row and prunes to the 2 most recent when last_activity_id is new', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] }) // existence check: none
      .mockResolvedValueOnce({ rows: [{ id: 2, ...skills, last_activity_id: '999' }] }) // INSERT ... RETURNING
      .mockResolvedValueOnce({ rows: [] }); // prune DELETE

    const result = await skillsService.saveSnapshot(1, skills, { lastActivityId: 999, asOf: NOW });

    expect(result.saved).toBe(true);
    expect(result.snapshot.last_activity_id).toBe('999');
    expect(queryMock).toHaveBeenCalledTimes(3);
    expect(queryMock.mock.calls[1][0]).toMatch(/INSERT INTO skills_history/);
    expect(queryMock.mock.calls[2][0]).toMatch(/DELETE FROM skills_history/);
  });

  it('treats a unique-violation on insert (race) the same as the pre-check no-op', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] }) // existence check: none (raced)
      .mockRejectedValueOnce(Object.assign(new Error('duplicate key'), { code: '23505' }))
      .mockResolvedValueOnce({ rows: [{ id: 3, last_activity_id: '999' }] }); // re-check after the race

    const result = await skillsService.saveSnapshot(1, skills, { lastActivityId: 999, asOf: NOW });

    expect(result.saved).toBe(false);
    expect(result.snapshot.id).toBe(3);
  });
});

describe('services/skills computeTrend', () => {
  it('returns null when there is no previous snapshot', () => {
    expect(skillsService.computeTrend({ climbing: 50 }, null)).toBeNull();
  });

  it('returns a per-scale delta against the previous snapshot', () => {
    const current = { climbing: 60, sprint: 40, endurance: 30, tempo: 20, power: 10, consistency: 70 };
    const previous = { climbing: 50, sprint: 45, endurance: 30, tempo: 20, power: 10, consistency: 60 };
    const trend = skillsService.computeTrend(current, previous);
    expect(trend).toEqual({ climbing: 10, sprint: -5, endurance: 0, tempo: 0, power: 0, consistency: 10 });
  });
});
