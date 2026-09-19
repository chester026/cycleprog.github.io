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
    const renameSectionRes = await request(app).put('/api/checklist/section/Gear').send({ section: 'Tools' });
    expect(renameSectionRes.status).toBe(401);
  });

  it('stores the optional link on create', async () => {
    const userA = await createUser(pool, app, request);
    const createRes = await request(app)
      .post('/api/checklist')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ section: 'Shopping', item: 'Tires', link: 'https://example.com/tires' });
    expect(createRes.status).toBe(200);
    expect(createRes.body.link).toBe('https://example.com/tires');
  });

  it('rejects a PUT with no fields to update', async () => {
    const userA = await createUser(pool, app, request);
    const createRes = await request(app)
      .post('/api/checklist')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ section: 'Gear', item: 'Pump' });
    const itemId = createRes.body.id;

    const putRes = await request(app)
      .put(`/api/checklist/${itemId}`)
      .set('Authorization', `Bearer ${userA.token}`)
      .send({});
    expect(putRes.status).toBe(400);
    expect(putRes.body.code).toBe('VALIDATION_ERROR');
  });

  it('partially updates item text and section independently', async () => {
    const userA = await createUser(pool, app, request);
    const createRes = await request(app)
      .post('/api/checklist')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ section: 'Gear', item: 'Pump' });
    const itemId = createRes.body.id;

    const renameItemRes = await request(app)
      .put(`/api/checklist/${itemId}`)
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ item: 'Mini pump' });
    expect(renameItemRes.status).toBe(200);
    expect(renameItemRes.body.item).toBe('Mini pump');
    expect(renameItemRes.body.section).toBe('Gear');

    const moveRes = await request(app)
      .put(`/api/checklist/${itemId}`)
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ section: 'Shopping' });
    expect(moveRes.status).toBe(200);
    expect(moveRes.body.section).toBe('Shopping');
    expect(moveRes.body.item).toBe('Mini pump');
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

  it('renames a whole section, scoped to the caller, with double-URL-decoding', async () => {
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

    const encoded = encodeURIComponent(encodeURIComponent('Bike & Gear'));
    const renameRes = await request(app)
      .put(`/api/checklist/section/${encoded}`)
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ section: 'Riding Gear' });
    expect(renameRes.status).toBe(200);
    expect(renameRes.body.updatedCount).toBe(2);

    const listRes = await request(app)
      .get('/api/checklist')
      .set('Authorization', `Bearer ${userA.token}`);
    expect(listRes.body.filter((i) => i.section === 'Riding Gear').length).toBe(2);
    expect(listRes.body.some((i) => i.section === 'Bike & Gear')).toBe(false);

    // B's same-named section is untouched.
    const bListRes = await request(app)
      .get('/api/checklist')
      .set('Authorization', `Bearer ${userB.token}`);
    expect(bListRes.body.some((i) => i.section === 'Bike & Gear' && i.item === "B's item")).toBe(true);

    // Renaming an already-renamed (now empty for A) section 404s.
    const secondRenameRes = await request(app)
      .put(`/api/checklist/section/${encoded}`)
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ section: 'Whatever' });
    expect(secondRenameRes.status).toBe(404);
    expect(secondRenameRes.body.code).toBe('SECTION_NOT_FOUND');
  });
});
