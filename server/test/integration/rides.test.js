const request = require('supertest');
const { bootstrap } = require('./setup');
const { createUser } = require('./helpers');

describe('rides CRUD, scoped by user', () => {
  let app, pool;

  beforeAll(async () => {
    ({ app, pool } = await bootstrap());
  }, 30000);

  it('401s without a token on every route', async () => {
    const getRes = await request(app).get('/api/rides');
    expect(getRes.status).toBe(401);
    const postRes = await request(app)
      .post('/api/rides')
      .send({ title: 'x', location: 'y', start: '2026-01-15T00:00:00Z' });
    expect(postRes.status).toBe(401);
    const putRes = await request(app).put('/api/rides/1').send({ title: 'x' });
    expect(putRes.status).toBe(401);
    const deleteRes = await request(app).delete('/api/rides/1');
    expect(deleteRes.status).toBe(401);
    const importRes = await request(app).post('/api/rides/import').send([]);
    expect(importRes.status).toBe(401);
  });

  it('A can create/read/update/delete their own ride; B is blocked (IDOR)', async () => {
    const userA = await createUser(pool, app, request);
    const userB = await createUser(pool, app, request);

    const createRes = await request(app)
      .post('/api/rides')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({
        title: "A's ride",
        location: 'Somewhere',
        locationLink: 'https://maps.example.com/x',
        details: 'A nice loop',
        start: '2026-01-15T08:00:00Z',
      });
    expect(createRes.status).toBe(200);
    const rideId = createRes.body.id;
    expect(createRes.body.title).toBe("A's ride");

    const listRes = await request(app)
      .get('/api/rides')
      .set('Authorization', `Bearer ${userA.token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.some((r) => r.id === rideId)).toBe(true);

    // B doesn't see A's ride in their own listing.
    const bListRes = await request(app)
      .get('/api/rides')
      .set('Authorization', `Bearer ${userB.token}`);
    expect(bListRes.status).toBe(200);
    expect(bListRes.body.some((r) => r.id === rideId)).toBe(false);

    // B can't update A's ride.
    const bPutRes = await request(app)
      .put(`/api/rides/${rideId}`)
      .set('Authorization', `Bearer ${userB.token}`)
      .send({ title: 'Hijacked', location: 'x', locationLink: null, details: null, start: '2026-01-15T08:00:00Z' });
    expect(bPutRes.status).toBe(404);

    // B can't delete A's ride.
    const bDeleteRes = await request(app)
      .delete(`/api/rides/${rideId}`)
      .set('Authorization', `Bearer ${userB.token}`);
    expect(bDeleteRes.status).toBe(404);

    // A can update their own ride.
    const putRes = await request(app)
      .put(`/api/rides/${rideId}`)
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ title: 'Updated title', location: 'Elsewhere', locationLink: null, details: null, start: '2026-01-16T08:00:00Z' });
    expect(putRes.status).toBe(200);
    expect(putRes.body.title).toBe('Updated title');

    // A can delete their own ride.
    const deleteRes = await request(app)
      .delete(`/api/rides/${rideId}`)
      .set('Authorization', `Bearer ${userA.token}`);
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body).toEqual({ success: true });

    // Deleting again 404s.
    const deleteAgainRes = await request(app)
      .delete(`/api/rides/${rideId}`)
      .set('Authorization', `Bearer ${userA.token}`);
    expect(deleteAgainRes.status).toBe(404);
  });

  it('404s updating/deleting a ride that does not exist', async () => {
    const userA = await createUser(pool, app, request);
    const putRes = await request(app)
      .put('/api/rides/999999')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ title: 'x', location: 'y', locationLink: null, details: null, start: '2026-01-15T08:00:00Z' });
    expect(putRes.status).toBe(404);

    const deleteRes = await request(app)
      .delete('/api/rides/999999')
      .set('Authorization', `Bearer ${userA.token}`);
    expect(deleteRes.status).toBe(404);
  });

  it('imports a batch of rides and triggers goal recompute without a linked Strava account', async () => {
    const userA = await createUser(pool, app, request);

    const importRes = await request(app)
      .post('/api/rides/import')
      .set('Authorization', `Bearer ${userA.token}`)
      .send([
        { title: 'Ride 1', location: 'Park', locationLink: null, details: 'loop', start: '2026-02-01T08:00:00Z' },
        { title: 'Ride 2', location: 'Hills', locationLink: null, details: 'climb', start: '2026-02-02T08:00:00Z' },
      ]);
    expect(importRes.status).toBe(200);
    expect(importRes.body).toEqual({ success: true, imported: 2 });

    const listRes = await request(app)
      .get('/api/rides')
      .set('Authorization', `Bearer ${userA.token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.length).toBe(2);
  });

  it('400s on import with a non-array body', async () => {
    const userA = await createUser(pool, app, request);
    const importRes = await request(app)
      .post('/api/rides/import')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ not: 'an array' });
    expect(importRes.status).toBe(400);
    expect(importRes.body.code).toBe('BAD_REQUEST');
  });

  // S-28: the import used to be N single INSERTs — a bad row in the middle
  // left every earlier row already committed. Now it's one UNNEST insert
  // inside withTransaction, so a malformed row rejects the whole batch.
  it('a malformed row in the middle of the batch imports zero rides', async () => {
    const userA = await createUser(pool, app, request);

    const importRes = await request(app)
      .post('/api/rides/import')
      .set('Authorization', `Bearer ${userA.token}`)
      .send([
        { title: 'Ride 1', location: 'Park', locationLink: null, details: 'loop', start: '2026-02-01T08:00:00Z' },
        { title: 'Bad ride', location: 'Nowhere', locationLink: null, details: 'no start date', start: 'not-a-date' },
        { title: 'Ride 3', location: 'Hills', locationLink: null, details: 'climb', start: '2026-02-03T08:00:00Z' },
      ]);
    expect(importRes.status).toBe(400);
    expect(importRes.body.code).toBe('VALIDATION_ERROR');

    const rows = await pool.query('SELECT * FROM rides WHERE user_id = $1', [userA.id]);
    expect(rows.rows).toHaveLength(0);
  });
});
