// Real-Postgres coverage of GET/POST/PUT/DELETE /api/coach/notes (coach
// memory) — CRUD, ownership scoping, the COACH_NOTES_MAX cap, and the
// 160-char note limit. Unit coverage of the coach's own remember_about_
// rider/forget_about_rider/get_rider_notes/update_rider_profile tools
// (which talk to the repo directly, not always through this API — see
// services/coachNotes.js's header) lives in test/aiCoach.memory.test.js.
const request = require('supertest');
const { COACH_NOTES_MAX } = require('@bikelab/shared/types');
const { bootstrap } = require('./setup');
const { createUser } = require('./helpers');

describe('coach notes CRUD, scoped by user', () => {
  let app, pool;

  beforeAll(async () => {
    ({ app, pool } = await bootstrap());
  }, 30000);

  it('401s without a token on every route', async () => {
    const getRes = await request(app).get('/api/coach/notes');
    expect(getRes.status).toBe(401);
    const postRes = await request(app).post('/api/coach/notes').send({ note: 'x' });
    expect(postRes.status).toBe(401);
    const putRes = await request(app).put('/api/coach/notes/1').send({ note: 'x' });
    expect(putRes.status).toBe(401);
    const deleteRes = await request(app).delete('/api/coach/notes/1');
    expect(deleteRes.status).toBe(401);
  });

  it('creates a note defaulting category to "other" and source to "user"', async () => {
    const user = await createUser(pool, app, request);

    const createRes = await request(app)
      .post('/api/coach/notes')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ note: 'Prefers morning rides' });
    expect(createRes.status).toBe(200);
    expect(createRes.body.note).toBe('Prefers morning rides');
    expect(createRes.body.category).toBe('other');
    expect(createRes.body.source).toBe('user');

    const row = await pool.query('SELECT * FROM coach_notes WHERE id = $1', [createRes.body.id]);
    expect(row.rows[0].user_id).toBe(user.id);
  });

  it('rejects a note over 160 characters with 400 VALIDATION_ERROR', async () => {
    const user = await createUser(pool, app, request);
    const res = await request(app)
      .post('/api/coach/notes')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ note: 'x'.repeat(161) });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('lists only the caller\'s own notes and blocks another user from reading/editing/deleting them', async () => {
    const userA = await createUser(pool, app, request);
    const userB = await createUser(pool, app, request);

    const createRes = await request(app)
      .post('/api/coach/notes')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ note: 'Left knee hurts on long climbs', category: 'health' });
    const noteId = createRes.body.id;

    const listA = await request(app).get('/api/coach/notes').set('Authorization', `Bearer ${userA.token}`);
    expect(listA.body.some((n) => n.id === noteId)).toBe(true);

    const listB = await request(app).get('/api/coach/notes').set('Authorization', `Bearer ${userB.token}`);
    expect(listB.body.some((n) => n.id === noteId)).toBe(false);

    const bPut = await request(app)
      .put(`/api/coach/notes/${noteId}`)
      .set('Authorization', `Bearer ${userB.token}`)
      .send({ note: 'Hijacked' });
    expect(bPut.status).toBe(404);
    expect(bPut.body.code).toBe('NOTE_NOT_FOUND');

    const bDelete = await request(app).delete(`/api/coach/notes/${noteId}`).set('Authorization', `Bearer ${userB.token}`);
    expect(bDelete.status).toBe(404);
    expect(bDelete.body.code).toBe('NOTE_NOT_FOUND');

    const stillThere = await pool.query('SELECT note FROM coach_notes WHERE id = $1', [noteId]);
    expect(stillThere.rows[0].note).toBe('Left knee hurts on long climbs');

    const aPut = await request(app)
      .put(`/api/coach/notes/${noteId}`)
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ note: 'Left knee hurts on steep climbs only now', category: 'health' });
    expect(aPut.status).toBe(200);
    expect(aPut.body.note).toBe('Left knee hurts on steep climbs only now');

    const aDelete = await request(app).delete(`/api/coach/notes/${noteId}`).set('Authorization', `Bearer ${userA.token}`);
    expect(aDelete.status).toBe(200);
    expect(aDelete.body.success).toBe(true);

    const gone = await pool.query('SELECT id FROM coach_notes WHERE id = $1', [noteId]);
    expect(gone.rows.length).toBe(0);
  });

  it('rejects a PUT with neither note nor category', async () => {
    const user = await createUser(pool, app, request);
    const createRes = await request(app)
      .post('/api/coach/notes')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ note: 'Trains indoors Nov-Mar' });

    const putRes = await request(app)
      .put(`/api/coach/notes/${createRes.body.id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({});
    expect(putRes.status).toBe(400);
  });

  it('404s updating/deleting a note id that does not exist', async () => {
    const user = await createUser(pool, app, request);
    const putRes = await request(app)
      .put('/api/coach/notes/999999999')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ note: 'x' });
    expect(putRes.status).toBe(404);
    expect(putRes.body.code).toBe('NOTE_NOT_FOUND');

    const deleteRes = await request(app).delete('/api/coach/notes/999999999').set('Authorization', `Bearer ${user.token}`);
    expect(deleteRes.status).toBe(404);
    expect(deleteRes.body.code).toBe('NOTE_NOT_FOUND');
  });

  it('rejects creating past COACH_NOTES_MAX with 409 COACH_NOTES_LIMIT', async () => {
    const user = await createUser(pool, app, request);

    for (let i = 0; i < COACH_NOTES_MAX; i++) {
      const res = await request(app)
        .post('/api/coach/notes')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ note: `Fact number ${i}` });
      expect(res.status).toBe(200);
    }

    const overCap = await request(app)
      .post('/api/coach/notes')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ note: 'One too many' });
    expect(overCap.status).toBe(409);
    expect(overCap.body.code).toBe('COACH_NOTES_LIMIT');

    const rows = await pool.query('SELECT id FROM coach_notes WHERE user_id = $1', [user.id]);
    expect(rows.rows.length).toBe(COACH_NOTES_MAX);
  });
});
