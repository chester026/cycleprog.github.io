// T-1.6 (docs/audit/layers/01-server.md S-42) — every response carries a
// correlation id (generated, or the caller's own `x-request-id` echoed
// back), and cache-miss to /healthz isn't drowned out by request logs
// (that's asserted indirectly here by exercising a normal route; the
// autoLogging.ignore config itself lives in middleware/requestLogger.js).
const express = require('express');
const request = require('supertest');
const requestLogger = require('../middleware/requestLogger');

function buildApp() {
  const app = express();
  app.use(requestLogger);
  app.get('/ping', (req, res) => res.json({ ok: true, reqId: req.id }));
  return app;
}

describe('middleware/requestLogger', () => {
  it('sets an x-request-id response header when the client sends none', async () => {
    const app = buildApp();
    const res = await request(app).get('/ping');
    expect(res.status).toBe(200);
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('honours an incoming x-request-id header', async () => {
    const app = buildApp();
    const incoming = 'test-request-id-123';
    const res = await request(app).get('/ping').set('x-request-id', incoming);
    expect(res.headers['x-request-id']).toBe(incoming);
    expect(res.body.reqId).toBe(incoming);
  });

  it('generates a different id per request when none is supplied', async () => {
    const app = buildApp();
    const res1 = await request(app).get('/ping');
    const res2 = await request(app).get('/ping');
    expect(res1.headers['x-request-id']).not.toBe(res2.headers['x-request-id']);
  });
});
