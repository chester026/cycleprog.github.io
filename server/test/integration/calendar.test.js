const request = require('supertest');
const { bootstrap } = require('./setup');
const { createUser } = require('./helpers');

describe('calendar CRUD, scoped by user', () => {
  let app, pool;

  beforeAll(async () => {
    ({ app, pool } = await bootstrap());
  }, 30000);

  it('401s without a token on every route', async () => {
    const getRes = await request(app).get('/api/calendar').query({ from: '2026-01-01', to: '2026-01-31' });
    expect(getRes.status).toBe(401);
    const postRes = await request(app)
      .post('/api/calendar')
      .send({ title: 'x', start_date: '2026-01-15', type: 'planned_ride' });
    expect(postRes.status).toBe(401);
    const putRes = await request(app).put('/api/calendar/1').send({ title: 'x' });
    expect(putRes.status).toBe(401);
    const deleteRes = await request(app).delete('/api/calendar/1');
    expect(deleteRes.status).toBe(401);
  });

  it('A can create/read/update/delete their own event; B is blocked from all of it', async () => {
    const userA = await createUser(pool, app, request);
    const userB = await createUser(pool, app, request);

    const createRes = await request(app)
      .post('/api/calendar')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ title: "A's ride", start_date: '2026-01-15', type: 'planned_ride' });
    expect(createRes.status).toBe(200);
    const eventId = createRes.body.id;

    const listRes = await request(app)
      .get('/api/calendar')
      .set('Authorization', `Bearer ${userA.token}`)
      .query({ from: '2026-01-01', to: '2026-01-31' });
    expect(listRes.status).toBe(200);
    expect(listRes.body.some((e) => e.id === eventId)).toBe(true);

    const putRes = await request(app)
      .put(`/api/calendar/${eventId}`)
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ title: 'Updated title' });
    expect(putRes.status).toBe(200);
    expect(putRes.body.title).toBe('Updated title');

    // B can't see it in a listing scoped to the same window.
    const bListRes = await request(app)
      .get('/api/calendar')
      .set('Authorization', `Bearer ${userB.token}`)
      .query({ from: '2026-01-01', to: '2026-01-31' });
    expect(bListRes.status).toBe(200);
    expect(bListRes.body.some((e) => e.id === eventId)).toBe(false);

    // B can't update or delete it.
    const bPutRes = await request(app)
      .put(`/api/calendar/${eventId}`)
      .set('Authorization', `Bearer ${userB.token}`)
      .send({ title: 'hijacked' });
    expect(bPutRes.status).toBe(404);
    expect(bPutRes.body.code).toBe('EVENT_NOT_FOUND');

    const bDeleteRes = await request(app)
      .delete(`/api/calendar/${eventId}`)
      .set('Authorization', `Bearer ${userB.token}`);
    expect(bDeleteRes.status).toBe(404);
    expect(bDeleteRes.body.code).toBe('EVENT_NOT_FOUND');

    // Still there, still A's.
    const stillThere = await pool.query('SELECT user_id FROM calendar_events WHERE id = $1', [eventId]);
    expect(stillThere.rows[0].user_id).toBe(userA.id);

    // A can delete their own.
    const deleteRes = await request(app)
      .delete(`/api/calendar/${eventId}`)
      .set('Authorization', `Bearer ${userA.token}`);
    expect(deleteRes.status).toBe(200);
  });
});
