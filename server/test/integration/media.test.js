const request = require('supertest');
const { bootstrap } = require('./setup');
const { createUser } = require('./helpers');

describe('media routes (garage/hero images, Strava image proxy, ImageKit config)', () => {
  let app, pool;

  beforeAll(async () => {
    ({ app, pool } = await bootstrap());
  }, 30000);

  describe('GET /api/garage/positions', () => {
    it('401 without token', async () => {
      const res = await request(app).get('/api/garage/positions');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('happy path: empty for a fresh user', async () => {
      const user = await createUser(pool, app, request);
      const res = await request(app)
        .get('/api/garage/positions')
        .set('Authorization', `Bearer ${user.token}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({});
    });
  });

  describe('POST /api/garage/upload', () => {
    it('401 without token', async () => {
      const res = await request(app).post('/api/garage/upload');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('validates position', async () => {
      const user = await createUser(pool, app, request);
      const res = await request(app)
        .post('/api/garage/upload')
        .set('Authorization', `Bearer ${user.token}`)
        .field('pos', 'not-a-real-position')
        .attach('image', Buffer.from([0xff, 0xd8, 0xff]), { filename: 'x.jpg', contentType: 'image/jpeg' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('requires a file', async () => {
      const user = await createUser(pool, app, request);
      const res = await request(app)
        .post('/api/garage/upload')
        .set('Authorization', `Bearer ${user.token}`)
        .field('pos', 'right');
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('BAD_REQUEST');
    });
  });

  describe('GET /api/hero/images', () => {
    it('401 without token', async () => {
      const res = await request(app).get('/api/hero/images');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('happy path: all positions null for a fresh user', async () => {
      const user = await createUser(pool, app, request);
      const res = await request(app)
        .get('/api/hero/images')
        .set('Authorization', `Bearer ${user.token}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        garage: null,
        plan: null,
        trainings: null,
        checklist: null,
        nutrition: null,
      });
    });
  });

  describe('POST /api/hero/upload (admin only)', () => {
    it('401 without token', async () => {
      const res = await request(app).post('/api/hero/upload');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('403 for a non-admin', async () => {
      const user = await createUser(pool, app, request);
      const res = await request(app)
        .post('/api/hero/upload')
        .set('Authorization', `Bearer ${user.token}`)
        .field('pos', 'plan')
        .attach('image', Buffer.from([0xff, 0xd8, 0xff]), { filename: 'x.jpg', contentType: 'image/jpeg' });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });
  });

  describe('POST /api/hero/assign-all (admin only)', () => {
    it('401 without token', async () => {
      const res = await request(app).post('/api/hero/assign-all');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('403 for a non-admin', async () => {
      const user = await createUser(pool, app, request);
      const res = await request(app)
        .post('/api/hero/assign-all')
        .set('Authorization', `Bearer ${user.token}`)
        .attach('image', Buffer.from([0xff, 0xd8, 0xff]), { filename: 'x.jpg', contentType: 'image/jpeg' });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });
  });

  describe('DELETE /api/garage/images/:name', () => {
    it('401 without token', async () => {
      const res = await request(app).delete('/api/garage/images/does-not-exist.jpg');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });
  });

  describe('DELETE /api/hero/positions/:position (admin only)', () => {
    it('401 without token', async () => {
      const res = await request(app).delete('/api/hero/positions/plan');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('403 for a non-admin', async () => {
      const user = await createUser(pool, app, request);
      const res = await request(app)
        .delete('/api/hero/positions/plan')
        .set('Authorization', `Bearer ${user.token}`);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });

    it('validates the position', async () => {
      const admin = await createUser(pool, app, request, { isAdmin: true });
      const res = await request(app)
        .delete('/api/hero/positions/not-a-real-position')
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/imagekit/config', () => {
    it('401 without token', async () => {
      const res = await request(app).get('/api/imagekit/config');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('404 IMAGEKIT_CONFIG_MISSING when IMAGEKIT_* env is not set', async () => {
      const user = await createUser(pool, app, request);
      const res = await request(app)
        .get('/api/imagekit/config')
        .set('Authorization', `Bearer ${user.token}`);
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('IMAGEKIT_CONFIG_MISSING');
    });

    // Regression for the T-1.1 shadowing bug: with keys configured the route
    // must return the public half of the config, never the private key.
    it('200 with public_key + url_endpoint (and no private key) when configured', async () => {
      const user = await createUser(pool, app, request);
      const media = require('../../services/media');
      const spy = vi.spyOn(media, 'getImageKitConfig').mockReturnValue({
        public_key: 'pk_test', private_key: 'sk_test', url_endpoint: 'https://ik.example/x',
      });
      try {
        const res = await request(app)
          .get('/api/imagekit/config')
          .set('Authorization', `Bearer ${user.token}`);
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ public_key: 'pk_test', url_endpoint: 'https://ik.example/x' });
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe('GET /api/proxy/strava-image', () => {
    it('is unauthenticated (no 401) but rejects a missing url', async () => {
      const res = await request(app).get('/api/proxy/strava-image');
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('rejects a non-Strava/non-allowlisted URL (SSRF guard)', async () => {
      const res = await request(app).get('/api/proxy/strava-image').query({ url: 'https://evil.example.com/x.jpg' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('rejects a non-https URL', async () => {
      const res = await request(app).get('/api/proxy/strava-image').query({ url: 'http://dgtzuqphqg23d.cloudfront.net/x.jpg' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('fetches an allowlisted URL through the mocked http client', async () => {
      const http = require('../../lib/http');
      const { Readable } = require('stream');
      const stream = Readable.from([Buffer.from('fake-image-bytes')]);
      const spy = vi.spyOn(http.externalHttp, 'get').mockResolvedValue({
        headers: { 'content-type': 'image/jpeg' },
        data: stream,
      });

      const res = await request(app)
        .get('/api/proxy/strava-image')
        .query({ url: 'https://dgtzuqphqg23d.cloudfront.net/x.jpg' });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('image/jpeg');
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });
});
