const request = require('supertest');
const { bootstrap } = require('./setup');
const { createUser } = require('./helpers');

describe('checklist CRUD, scoped by user', () => {
  let app, pool;

  beforeAll(async () => {
    ({ app, pool } = await bootstrap());
  }, 30000);

  it('401s without a token on every route', async () => {
    const getRes = await request(app).get('/api/checklist');
    expect(getRes.status).toBe(401);
    const postRes = await request(app).post('/api/checklist').send({ section: 'Gear', item: 'Pump' });
    expect(postRes.status).toBe(401);
    const putRes = await request(app).put('/api/checklist/1').send({ checked: true });
    expect(putRes.status).toBe(401);
    const deleteRes = await request(app).delete('/api/checklist/1');
    expect(deleteRes.status).toBe(401);
    const deleteSectionRes = await request(app).delete('/api/checklist/section/Gear');
    expect(deleteSectionRes.status).toBe(401);
  });

  it('A can create/read/update/delete their own item; B is blocked from all of it', async () => {
    const userA = await createUser(pool, app, request);
    const userB = await createUser(pool, app, request);

    const createRes = await request(app)
      .post('/api/checklist')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ section: 'Gear', item: 'Pump', checked: false });
    expect(createRes.status).toBe(200);
    const itemId = createRes.body.id;
    expect(createRes.body.checked).toBe(false);

    const listRes = await request(app)
      .get('/api/checklist')
      .set('Authorization', `Bearer ${userA.token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.some((i) => i.id === itemId)).toBe(true);

    const putRes = await request(app)
      .put(`/api/checklist/${itemId}`)
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ checked: true });
    expect(putRes.status).toBe(200);
    expect(putRes.body.checked).toBe(true);

    // Link-branch of the same PUT route.
    const putLinkRes = await request(app)
      .put(`/api/checklist/${itemId}`)
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ link: 'https://example.com/pump' });
    expect(putLinkRes.status).toBe(200);
    expect(putLinkRes.body.link).toBe('https://example.com/pump');

    // B can't see it in their own listing.
    const bListRes = await request(app)
      .get('/api/checklist')
      .set('Authorization', `Bearer ${userB.token}`);
    expect(bListRes.status).toBe(200);
    expect(bListRes.body.some((i) => i.id === itemId)).toBe(false);

    // B can't update or delete it.
    const bPutRes = await request(app)
      .put(`/api/checklist/${itemId}`)
      .set('Authorization', `Bearer ${userB.token}`)
      .send({ checked: false });
    expect(bPutRes.status).toBe(404);
    expect(bPutRes.body.code).toBe('ITEM_NOT_FOUND');

    const bDeleteRes = await request(app)
      .delete(`/api/checklist/${itemId}`)
      .set('Authorization', `Bearer ${userB.token}`);
    expect(bDeleteRes.status).toBe(404);
    expect(bDeleteRes.body.code).toBe('ITEM_NOT_FOUND');

    // Still there, still A's.
    const stillThere = await pool.query('SELECT user_id FROM checklist WHERE id = $1', [itemId]);
    expect(stillThere.rows[0].user_id).toBe(userA.id);

    // A can delete their own.
    const deleteRes = await request(app)
      .delete(`/api/checklist/${itemId}`)
      .set('Authorization', `Bearer ${userA.token}`);
    expect(deleteRes.status).toBe(200);
  });

  it('deletes a whole section, scoped to the caller, with double-URL-decoding', async () => {
    const userA = await createUser(pool, app, request);
    const userB = await createUser(pool, app, request);

    await request(app)
      .post('/api/checklist')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ section: 'Bike & Gear', item: 'Helmet' });
    await request(app)
      .post('/api/checklist')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ section: 'Bike & Gear', item: 'Gloves' });
    await request(app)
      .post('/api/checklist')
      .set('Authorization', `Bearer ${userB.token}`)
      .send({ section: 'Bike & Gear', item: "B's item" });

    // Section name double-URL-encoded, matching the client's own encoding.
    const encoded = encodeURIComponent(encodeURIComponent('Bike & Gear'));
    const deleteRes = await request(app)
      .delete(`/api/checklist/section/${encoded}`)
      .set('Authorization', `Bearer ${userA.token}`);
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.deletedCount).toBe(2);

    // B's item in the same-named section is untouched.
    const bListRes = await request(app)
      .get('/api/checklist')
      .set('Authorization', `Bearer ${userB.token}`);
    expect(bListRes.body.some((i) => i.item === "B's item")).toBe(true);

    // A deleting again (nothing left) 404s.
    const secondDeleteRes = await request(app)
      .delete(`/api/checklist/section/${encoded}`)
      .set('Authorization', `Bearer ${userA.token}`);
    expect(secondDeleteRes.status).toBe(404);
    expect(secondDeleteRes.body.code).toBe('SECTION_NOT_FOUND');
  });
});
