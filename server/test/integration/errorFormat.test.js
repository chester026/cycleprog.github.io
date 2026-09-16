const request = require('supertest');
const { bootstrap } = require('./setup');

// Confirms the unified error-response shape (middleware/errorHandler.js:
// `{ error: string, code: string }`) actually holds for real HTTP
// responses, not just the handler's own unit tests (see
// test/errorFormat.grep.test.js for the static/grep-based check).
describe('error response shape', () => {
  let app;

  beforeAll(async () => {
    ({ app } = await bootstrap());
  }, 30000);

  it('GET /api/goals without a token has string error + code', async () => {
    const res = await request(app).get('/api/goals');
    expect(res.status).toBe(401);
    expect(typeof res.body.error).toBe('string');
    expect(typeof res.body.code).toBe('string');
  });

  it('POST /api/login with missing fields has string error + code', async () => {
    const res = await request(app).post('/api/login').send({});
    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe('string');
    expect(typeof res.body.code).toBe('string');
  });
});
