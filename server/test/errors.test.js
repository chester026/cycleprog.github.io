const express = require('express');
const request = require('supertest');
const { patchAsyncRoutes } = require('../lib/asyncRoutes');
const errorHandler = require('../middleware/errorHandler');

function buildApp() {
  const app = express();
  patchAsyncRoutes(app);
  app.get('/boom', async () => {
    throw new Error('kaboom');
  });
  app.use(errorHandler);
  return app;
}

describe('asyncRoutes + errorHandler', () => {
  it('turns a thrown error in an async route into a 500 JSON response instead of crashing', async () => {
    const app = buildApp();
    const res = await request(app).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error');
  });

  it('does not throw synchronously / kill the process for a rejected async handler', async () => {
    const app = buildApp();
    await expect(request(app).get('/boom')).resolves.toBeDefined();
  });
});
