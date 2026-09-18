const request = require('supertest');
const { bootstrap } = require('./setup');
const { createUser } = require('./helpers');

describe('DELETE /api/account', () => {
  let app, pool;

  beforeAll(async () => {
    ({ app, pool } = await bootstrap());
  }, 30000);

  it('deletes a goal, calendar event and checklist item along with the account', async () => {
    const userA = await createUser(pool, app, request);

    const goalRes = await request(app)
      .post('/api/goals')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ title: 'A goal', target_value: 10, unit: 'km', goal_type: 'distance' });
    expect(goalRes.status).toBe(200);
    const goalId = goalRes.body.id;

    const eventRes = await request(app)
      .post('/api/calendar')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ title: 'A ride', start_date: '2026-02-01' });
    expect(eventRes.status).toBe(200);
    const eventId = eventRes.body.id;

    const checklistRes = await request(app)
      .post('/api/checklist')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ section: 'bike', item: 'Check brakes', checked: false });
    expect(checklistRes.status).toBe(200);
    const checklistId = checklistRes.body.id;

    const deleteRes = await request(app).delete('/api/account').set('Authorization', `Bearer ${userA.token}`);
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.success).toBe(true);

    const [goalRow, eventRow, checklistRow, userRow] = await Promise.all([
      pool.query('SELECT id FROM goals WHERE id = $1', [goalId]),
      pool.query('SELECT id FROM calendar_events WHERE id = $1', [eventId]),
      pool.query('SELECT id FROM checklist WHERE id = $1', [checklistId]),
      pool.query('SELECT id FROM users WHERE id = $1', [userA.id]),
    ]);
    expect(goalRow.rows.length).toBe(0);
    expect(eventRow.rows.length).toBe(0);
    expect(checklistRow.rows.length).toBe(0);
    expect(userRow.rows.length).toBe(0);

    // NOTE on "token now → 401" (T-4.5, S-13/S-27): authMiddleware used to
    // only verify the JWT's signature/expiry (lib/jwt.js) and never re-check
    // that the user row it names still existed — so a deleted account's
    // still-cryptographically-valid token kept authenticating everywhere
    // except /api/account's own re-fetch (which 404d). It now does one
    // indexed SELECT by id on every request specifically so a deleted (or
    // token_version-bumped) account's token stops working universally, not
    // just on the one route that happened to re-query `users` itself — so
    // this second call never even reaches the /api/account handler anymore.
    const secondDelete = await request(app).delete('/api/account').set('Authorization', `Bearer ${userA.token}`);
    expect(secondDelete.status).toBe(401);
    expect(secondDelete.body.code).toBe('UNAUTHORIZED');
  });
});
