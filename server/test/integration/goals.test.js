const request = require('supertest');
const { bootstrap } = require('./setup');
const { createUser } = require('./helpers');

// IDOR coverage for /api/goals + /api/meta-goals (T-1.7,
// docs/audit/00-AUDIT-AND-PLAN.md — "goals IDOR почти везде закрыт AND
// user_id = $N", this suite proves it end to end).
describe('goals IDOR', () => {
  let app, pool;

  beforeAll(async () => {
    ({ app, pool } = await bootstrap());
  }, 30000);

  it("B can't see, edit, or attach to A's goal/meta-goal", async () => {
    const userA = await createUser(pool, app, request);
    const userB = await createUser(pool, app, request);

    const metaGoalResult = await pool.query(
      `INSERT INTO meta_goals (user_id, title, status) VALUES ($1, 'A meta goal', 'active') RETURNING id`,
      [userA.id]
    );
    const metaGoalId = metaGoalResult.rows[0].id;

    const createRes = await request(app)
      .post('/api/goals')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ title: "A's goal", target_value: 100, unit: 'km', goal_type: 'distance', meta_goal_id: metaGoalId });
    expect(createRes.status).toBe(200);
    const goalId = createRes.body.id;

    // B doesn't see A's goal in their own list.
    const listRes = await request(app).get('/api/goals').set('Authorization', `Bearer ${userB.token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.find((g) => g.id === goalId)).toBeUndefined();

    // B can't update A's goal — route returns 404 for a goal not owned by
    // the caller (server.js's PUT /api/goals/:id scopes its SELECT by
    // `AND user_id = $2`).
    const putRes = await request(app)
      .put(`/api/goals/${goalId}`)
      .set('Authorization', `Bearer ${userB.token}`)
      .send({ title: 'hijacked' });
    expect(putRes.status).toBe(404);
    expect(putRes.body.code).toBe('GOAL_NOT_FOUND');

    const unchanged = await pool.query('SELECT title FROM goals WHERE id = $1', [goalId]);
    expect(unchanged.rows[0].title).toBe("A's goal");

    // B can't attach a new goal to A's meta-goal.
    const forbiddenRes = await request(app)
      .post('/api/goals')
      .set('Authorization', `Bearer ${userB.token}`)
      .send({ title: "B's goal", target_value: 50, unit: 'km', goal_type: 'distance', meta_goal_id: metaGoalId });
    expect(forbiddenRes.status).toBe(403);
    expect(forbiddenRes.body.code).toBe('META_GOAL_NOT_FOUND');
  });
});
