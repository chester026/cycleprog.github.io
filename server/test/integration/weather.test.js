const request = require('supertest');
const { bootstrap } = require('./setup');
const { createUser } = require('./helpers');

// Regression: /api/weather/forecast referenced cache helpers that had moved
// into services/weather.js → ReferenceError → 500 for every call.
describe('GET /api/weather/forecast', () => {
  let app, pool, token;
  beforeAll(async () => {
    ({ app, pool } = await bootstrap());
    ({ token } = await createUser(pool, app, request, { email: `wx-${Date.now()}@example.com` }));
    // Stub upstream Open-Meteo so tests never hit the network.
    const http = require('../../lib/http');
    http.externalHttp.get = async (url) => ({ data: { daily: { time: ['2026-01-01'], temperature_2m_max: [20] }, url } });
  }, 30000);

  it('requires auth', async () => {
    expect((await request(app).get('/api/weather/forecast?latitude=35&longitude=33')).status).toBe(401);
  });

  it('returns upstream data and caches it', async () => {
    const q = '/api/weather/forecast?latitude=35.1264&longitude=33.4299';
    const r1 = await request(app).get(q).set('Authorization', `Bearer ${token}`);
    expect(r1.status).toBe(200);
    expect(r1.body.daily.temperature_2m_max[0]).toBe(20);
    const http = require('../../lib/http');
    http.externalHttp.get = async () => { throw new Error('should be served from cache'); };
    const r2 = await request(app).get(q).set('Authorization', `Bearer ${token}`);
    expect(r2.status).toBe(200);
  });

  it('validates params', async () => {
    const r = await request(app).get('/api/weather/forecast').set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('VALIDATION_ERROR');
  });
});
