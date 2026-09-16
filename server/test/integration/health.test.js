const request = require('supertest');
const { bootstrap } = require('./setup');

describe('GET /healthz', () => {
  let app;

  beforeAll(async () => {
    ({ app } = await bootstrap());
  }, 30000);

  it('returns 200 {ok: true}', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
