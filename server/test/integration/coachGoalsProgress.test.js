const request = require('supertest');
const { bootstrap } = require('./setup');
const { createUser } = require('./helpers');

// S-35 (docs/audit/00-AUDIT-AND-PLAN.md): the AI Coach's get_goals_progress
// tool used to run one `SELECT * FROM goals WHERE meta_goal_id = $1` per
// meta-goal inside a loop — N+1 round trips for a rider with several active
// meta-goals. It's now a single `= ANY($1::int[])` query grouped in JS
// (aiCoach.js's groupGoalsByMetaGoal — see test/aiCoach.groupGoals.test.js
// for the pure-function unit test). This covers the real thing end-to-end
// against Postgres: multiple meta-goals, each with multiple sub-goals in a
// deliberately-scrambled insert order, calling the tool the same way
// routes/coach.js does — via the shared `coach.executeTool` entry point
// services/coach.js exports (also used by test/integration/coach.test.js).
describe('AI Coach get_goals_progress (server/aiCoach.js, real Postgres)', () => {
  let app, pool;

  beforeAll(async () => {
    ({ app, pool } = await bootstrap());
  }, 30000);

  it('returns every meta-goal with its own sub-goals correctly grouped and ordered by priority', async () => {
    const user = await createUser(pool, app, request);

    const metaA = await pool.query(
      `INSERT INTO meta_goals (user_id, title, status) VALUES ($1, 'Base fitness', 'active') RETURNING id`,
      [user.id]
    );
    const metaB = await pool.query(
      `INSERT INTO meta_goals (user_id, title, status) VALUES ($1, 'Climb better', 'active') RETURNING id`,
      [user.id]
    );
    const metaAId = metaA.rows[0].id;
    const metaBId = metaB.rows[0].id;

    // Inserted out of priority order and interleaved across meta-goals, on
    // purpose — a correct grouping must not depend on insert order.
    await pool.query(
      `INSERT INTO goals (user_id, meta_goal_id, title, goal_type, target_value, current_value, priority)
       VALUES
         ($1, $2, 'A-low-priority', 'distance', 100, 10, 3),
         ($1, $3, 'B-only-goal', 'elevation', 5000, 500, 1),
         ($1, $2, 'A-high-priority', 'distance', 200, 20, 1)`,
      [user.id, metaAId, metaBId]
    );

    const { coach } = require('../../services/coach');
    const result = await coach.executeTool('get_goals_progress', {}, { userId: user.id });

    expect(Array.isArray(result.goals)).toBe(true);
    expect(result.goals).toHaveLength(2);

    const goalA = result.goals.find((g) => g.id === metaAId);
    const goalB = result.goals.find((g) => g.id === metaBId);
    expect(goalA).toBeTruthy();
    expect(goalB).toBeTruthy();

    // meta-goal A's two sub-goals, grouped correctly and ordered by
    // priority ASC (the same ordering the old per-meta-goal query gave).
    expect(goalA.subGoals.map((g) => g.label)).toEqual(['A-high-priority', 'A-low-priority']);
    // meta-goal B only ever had its one sub-goal — never picked up A's rows.
    expect(goalB.subGoals.map((g) => g.label)).toEqual(['B-only-goal']);
  });

  it('a meta-goal with zero sub-goals comes back with an empty subGoals array, not undefined/thrown', async () => {
    const user = await createUser(pool, app, request);
    const meta = await pool.query(
      `INSERT INTO meta_goals (user_id, title, status) VALUES ($1, 'Empty goal', 'active') RETURNING id`,
      [user.id]
    );

    const { coach } = require('../../services/coach');
    const result = await coach.executeTool('get_goals_progress', {}, { userId: user.id });

    const goal = result.goals.find((g) => g.id === meta.rows[0].id);
    expect(goal).toBeTruthy();
    expect(goal.subGoals).toEqual([]);
  });

  // 07.10.2026: the coach couldn't explain a generated "Long Ride
  // Consistency — 40 rides" sub-goal (the tool didn't return how it was
  // measured) and "removed" it by setting target_value to 0, which the
  // progress math read back as target 1. The tool now returns metric /
  // description / reasoning, refuses a zero target and can delete or
  // rename a sub-goal.
  describe('update_goal on sub-goals', () => {
    // Two logins for the whole block — /api/login is rate-limited per IP.
    let rider, other;
    beforeAll(async () => {
      rider = await createUser(pool, app, request);
      other = await createUser(pool, app, request);
    });

    async function seed() {
      const user = rider;
      await pool.query('DELETE FROM meta_goals WHERE user_id = $1', [user.id]);
      await pool.query('DELETE FROM calendar_events WHERE user_id = $1', [user.id]);
      const meta = await pool.query(
        `INSERT INTO meta_goals (user_id, title, status) VALUES ($1, '800 km Weekend Rides', 'active') RETURNING id`,
        [user.id]
      );
      const metaId = meta.rows[0].id;
      const sub = await pool.query(
        `INSERT INTO goals (user_id, meta_goal_id, title, description, reasoning, target_value, current_value, unit, source, metric, priority)
         VALUES ($1, $2, 'Long Ride Consistency', 'Keep the weekend rhythm', 'Two long rides a week', 40, 0, 'rides', 'activity', $3, 2),
                ($1, $2, 'Total Distance', 'Sum of all rides', 'Main target', 800, 0, 'km', 'activity', $4, 1)
         RETURNING id`,
        [
          user.id,
          metaId,
          JSON.stringify({ source: 'activity', aggregate: 'count', filter: { min_distance: 80000 } }),
          JSON.stringify({ source: 'activity', aggregate: 'sum', field: 'distance', transform: 0.001 }),
        ]
      );
      const { coach } = require('../../services/coach');
      return { user, metaId, consistencyId: sub.rows[0].id, distanceId: sub.rows[1].id, coach };
    }

    it('get_goals_progress returns how each sub-goal is measured', async () => {
      const { user, metaId, coach } = await seed();
      const result = await coach.executeTool('get_goals_progress', {}, { userId: user.id });
      const goal = result.goals.find((g) => g.id === metaId);
      const sg = goal.subGoals.find((g) => g.label === 'Long Ride Consistency');
      expect(sg.metric).toEqual({ source: 'activity', aggregate: 'count', filter: { min_distance: 80000 } });
      expect(sg.unit).toBe('rides');
      expect(sg.description).toBe('Keep the weekend rhythm');
      expect(sg.reasoning).toBe('Two long rides a week');
    });

    it('refuses a zero target and points at remove_sub_goal', async () => {
      const { user, metaId, consistencyId, coach } = await seed();
      const res = await coach.executeTool('update_goal', { goal_id: metaId, sub_goal_id: consistencyId, new_target_value: 0 }, { userId: user.id });
      expect(res.error).toBe('invalid_target');
      const row = await pool.query('SELECT target_value FROM goals WHERE id = $1', [consistencyId]);
      expect(Number(row.rows[0].target_value)).toBe(40);
    });

    it('renames and resizes a sub-goal', async () => {
      const { user, metaId, consistencyId, coach } = await seed();
      const res = await coach.executeTool(
        'update_goal',
        { goal_id: metaId, sub_goal_id: consistencyId, new_title: 'Rides over 80 km', new_target_value: 8 },
        { userId: user.id }
      );
      expect(res.subGoal.title).toBe('Rides over 80 km');
      expect(Number(res.subGoal.target_value)).toBe(8);
    });

    it('removes a sub-goal, leaving the meta-goal and its other sub-goals alone', async () => {
      const { user, metaId, consistencyId, distanceId, coach } = await seed();
      const res = await coach.executeTool('update_goal', { goal_id: metaId, sub_goal_id: consistencyId, remove_sub_goal: true }, { userId: user.id });
      expect(res.removedSubGoal).toEqual({ id: consistencyId, title: 'Long Ride Consistency' });
      const left = await pool.query('SELECT id FROM goals WHERE meta_goal_id = $1', [metaId]);
      expect(left.rows.map((r) => r.id)).toEqual([distanceId]);
      const meta = await pool.query('SELECT status FROM meta_goals WHERE id = $1', [metaId]);
      expect(meta.rows[0].status).toBe('active');
    });

    it('delete_goal removes the meta-goal with its sub-goals and unlinks its calendar events', async () => {
      const { user, metaId, coach } = await seed();
      await pool.query(
        `INSERT INTO calendar_events (user_id, goal_id, title, type, start_date) VALUES ($1, $2, 'Long ride', 'planned_ride', '2026-10-11')`,
        [user.id, metaId]
      );
      const res = await coach.executeTool('delete_goal', { goal_id: metaId }, { userId: user.id });
      expect(res.deleted).toBe(true);
      expect(res.goal.title).toBe('800 km Weekend Rides');
      expect((await pool.query('SELECT id FROM meta_goals WHERE id = $1', [metaId])).rows).toHaveLength(0);
      expect((await pool.query('SELECT id FROM goals WHERE meta_goal_id = $1', [metaId])).rows).toHaveLength(0);
      const ev = await pool.query('SELECT goal_id FROM calendar_events WHERE user_id = $1', [user.id]);
      expect(ev.rows).toEqual([{ goal_id: null }]);
    });

    it('delete_goal refuses another rider\'s goal', async () => {
      const { metaId, coach } = await seed();
      const res = await coach.executeTool('delete_goal', { goal_id: metaId }, { userId: other.id });
      expect(res.error).toBe('not_found');
      expect((await pool.query('SELECT id FROM meta_goals WHERE id = $1', [metaId])).rows).toHaveLength(1);
    });

    it('cannot remove another rider\'s sub-goal', async () => {
      const { metaId, consistencyId, coach } = await seed();
      const res = await coach.executeTool('update_goal', { goal_id: metaId, sub_goal_id: consistencyId, remove_sub_goal: true }, { userId: other.id });
      expect(res.error).toBe('not_found');
      const row = await pool.query('SELECT id FROM goals WHERE id = $1', [consistencyId]);
      expect(row.rows).toHaveLength(1);
    });
  });
});
