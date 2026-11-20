// create_goal sized to the goal, on real Postgres: the event day and the
// plan's hours the coach passes reach the stored goal as its deadline and its
// totals, whatever numbers the goals model sent back.
const request = require('supertest');
const { bootstrap } = require('./setup');
const { createUser } = require('./helpers');
const { textResponse } = require('../fakeResponses');

describe('coach create_goal — targets sized to the goal', () => {
  let app, pool, coach, rider, createSpy;
  const pad = (n) => String(n).padStart(2, '0');
  const localISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const inDays = (n) => localISO(new Date(Date.now() + n * 86400000));
  const createGoal = (args) => coach.executeTool('create_goal', { userGoalDescription: 'Gran fondo in March: 120 km, 2000 m', ...args }, { userId: rider.id });

  // A month's totals and a threshold as the ride average, deadline four weeks out.
  const modelAnswer = () => textResponse(JSON.stringify({
    metaGoal: { title: 'Gran Fondo Preparation', description: 'Build for the gran fondo.', tier: 'grand', target_date: inDays(28), focusTags: ['endurance', 'race_prep'] },
    subGoals: [
      { title: 'Total Distance', description: 'Ride 400 km', metric: { source: 'activity', aggregate: 'sum', field: 'distance', transform: 0.001 }, target_value: 400, unit: 'km', priority: 1, reasoning: 'Volume' },
      { title: 'Climbing Volume', description: 'Climb 6000 m', metric: { source: 'activity', aggregate: 'sum', field: 'total_elevation_gain' }, target_value: 6000, unit: 'm', priority: 1, reasoning: 'Climbing' },
      { title: 'Ride Power', description: 'Hold 230 W', metric: { source: 'activity', aggregate: 'avg', field: 'average_watts' }, target_value: 230, unit: 'W', priority: 2, reasoning: 'Power' },
    ],
    timeline: '18 weeks',
    mainFocus: 'endurance',
  }));

  beforeAll(async () => {
    ({ app, pool } = await bootstrap());
    ({ coach } = require('../../services/coach'));
    rider = await createUser(pool, app, request);
    // Thirteen weeks of riding, one ride a week: 50 km, 600 m, 2 h at 25 km/h.
    for (let week = 0; week < 13; week++) {
      await pool.query(
        `INSERT INTO synced_activities (user_id, strava_id, name, type, start_date, distance, moving_time, total_elevation_gain, average_speed)
         VALUES ($1, $2, 'Ride', 'Ride', NOW() - ($3 || ' days')::interval, 50000, 7200, 600, 6.9444)`,
        [rider.id, 9000 + week, String(week * 7 + 1)]
      );
    }
    const updated = await pool.query(`UPDATE user_profiles SET ftp_manual = 183, experience_level = 'intermediate' WHERE user_id = $1`, [rider.id]);
    if (updated.rowCount === 0) {
      await pool.query(`INSERT INTO user_profiles (user_id, ftp_manual, experience_level) VALUES ($1, 183, 'intermediate')`, [rider.id]);
    }
  }, 30000);

  beforeEach(() => {
    createSpy = vi.spyOn(coach.openai.responses, 'create').mockImplementation(async () => modelAnswer());
  });
  afterEach(() => createSpy.mockRestore());

  it('with the event day and the plan\'s hours: the goal ends on the event day and holds the plan\'s totals', async () => {
    const eventDay = inDays(18 * 7);
    const result = await createGoal({ target_date: eventDay, planned_hours_per_week: 5 });
    expect(result.error).toBeUndefined();
    expect(result.created).toBe(true);
    // 18 weeks × 5 h × 25 km/h; 12 m of climbing per km; 75% of FTP for a ride average.
    expect(result.subGoals.map((g) => [g.title, g.target_value, g.unit])).toEqual([
      ['Total Distance', 2250, 'km'],
      ['Climbing Volume', 27000, 'm'],
      ['Ride Power', 137, 'W'],
    ]);
    expect(result.subGoalsCount).toBe(3);

    const meta = await pool.query(`SELECT to_char(target_date, 'YYYY-MM-DD') AS target_date FROM meta_goals WHERE id = $1`, [result.metaGoal.id]);
    expect(meta.rows[0].target_date).toBe(eventDay);
    const stored = await pool.query('SELECT id, description, target_value FROM goals WHERE meta_goal_id = $1 ORDER BY id', [result.metaGoal.id]);
    expect(stored.rows.map((row) => Number(row.target_value))).toEqual([2250, 27000, 137]);
    expect(stored.rows[0].description).toBe('Ride 2250 km');
    // The ids are the sub_goal_id update_goal takes.
    expect(result.subGoals.map((g) => g.id)).toEqual(stored.rows.map((row) => row.id));

    const prompt = createSpy.mock.calls[0][0].input;
    expect(prompt).toContain(`THE DEADLINE IS GIVEN: metaGoal.target_date is ${eventDay} (18 weeks from today)`);
    expect(prompt).toContain('FTP: 183 W');
  });

  it('without them: sized from the rider\'s recent riding over the model\'s own window', async () => {
    const result = await createGoal({});
    // 4 weeks × 50 km a week × 1.2 = 240 km: the model's 400 km is already above it.
    expect(result.subGoals.map((g) => g.target_value)).toEqual([400, 6000, 137]);
  });

  it('refuses a deadline that is not a date from today on, before asking the model', async () => {
    for (const bad of ['March', inDays(-3), '2031-01-01']) {
      const result = await createGoal({ target_date: bad });
      expect(result.error).toMatch(/target_date must be a date from today on/);
    }
    expect(createSpy).not.toHaveBeenCalled();
  });
});
