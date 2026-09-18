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
});
