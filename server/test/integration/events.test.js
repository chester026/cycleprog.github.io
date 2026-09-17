const request = require('supertest');
const { bootstrap } = require('./setup');
const { createUser } = require('./helpers');

describe('events CRUD, scoped by user', () => {
  let app, pool;

  beforeAll(async () => {
    ({ app, pool } = await bootstrap());
  }, 30000);

  it('401s without a token on every route', async () => {
    const getRes = await request(app).get('/api/events');
    expect(getRes.status).toBe(401);
    const postRes = await request(app).post('/api/events').send({ title: 'x', start_date: '2026-01-15' });
    expect(postRes.status).toBe(401);
    const putRes = await request(app).put('/api/events/1').send({ title: 'x', start_date: '2026-01-15' });
    expect(putRes.status).toBe(401);
    const deleteRes = await request(app).delete('/api/events/1');
    expect(deleteRes.status).toBe(401);
  });

  it('A can create/read/update/delete their own event; B is blocked from all of it', async () => {
    const userA = await createUser(pool, app, request);
    const userB = await createUser(pool, app, request);

    const createRes = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ title: "A's event", start_date: '2026-02-01', background_color: '#123ABC' });
    expect(createRes.status).toBe(201);
    const eventId = createRes.body.id;
    expect(createRes.body.background_color).toBe('#123ABC');

    const listRes = await request(app)
      .get('/api/events')
      .set('Authorization', `Bearer ${userA.token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.some((e) => e.id === eventId)).toBe(true);

    const putRes = await request(app)
      .put(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ title: 'Updated title', start_date: '2026-02-02' });
    expect(putRes.status).toBe(200);
    expect(putRes.body.title).toBe('Updated title');

    // B can't see it in their own listing.
    const bListRes = await request(app)
      .get('/api/events')
      .set('Authorization', `Bearer ${userB.token}`);
    expect(bListRes.status).toBe(200);
    expect(bListRes.body.some((e) => e.id === eventId)).toBe(false);

    // B can't update or delete it.
    const bPutRes = await request(app)
      .put(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${userB.token}`)
      .send({ title: 'hijacked', start_date: '2026-02-02' });
    expect(bPutRes.status).toBe(404);
    expect(bPutRes.body.code).toBe('EVENT_NOT_FOUND');

    const bDeleteRes = await request(app)
      .delete(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${userB.token}`);
    expect(bDeleteRes.status).toBe(404);
    expect(bDeleteRes.body.code).toBe('EVENT_NOT_FOUND');

    // Still there, still A's.
    const stillThere = await pool.query('SELECT user_id FROM events WHERE id = $1', [eventId]);
    expect(stillThere.rows[0].user_id).toBe(userA.id);

    // A can delete their own.
    const deleteRes = await request(app)
      .delete(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${userA.token}`);
    expect(deleteRes.status).toBe(200);
  });

  it('rejects an invalid background_color', async () => {
    const userA = await createUser(pool, app, request);
    const badRes = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ title: 'bad color', start_date: '2026-02-01', background_color: 'not-a-color' });
    expect(badRes.status).toBe(400);
    expect(badRes.body.code).toBe('VALIDATION_ERROR');
  });
});
