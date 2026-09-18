const express = require('express');
const request = require('supertest');
const multer = require('multer');
const { patchAsyncRoutes } = require('../lib/asyncRoutes');
const errorHandler = require('../middleware/errorHandler');
const { ApiError, badRequest, notFound, conflict } = require('../lib/apiError');

function buildApp(mount) {
  const app = express();
  patchAsyncRoutes(app);
  mount(app);
  app.use(errorHandler);
  return app;
}

describe('errorHandler + ApiError', () => {
  it('renders an ApiError as { error, code } with its own status', async () => {
    const app = buildApp((app) => {
      app.get('/x', () => {
        throw badRequest('VALIDATION_ERROR', 'Title is required');
      });
    });
    const res = await request(app).get('/x');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Title is required', code: 'VALIDATION_ERROR' });
  });

  it('includes details only when the ApiError carries them', async () => {
    const app = buildApp((app) => {
      app.get('/x', () => {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid payload', [
          { field: 'email', message: 'required' },
        ]);
      });
    });
    const res = await request(app).get('/x');
    expect(res.status).toBe(400);
    expect(res.body.details).toEqual([{ field: 'email', message: 'required' }]);
  });

  it('renders notFound() with its status and code', async () => {
    const app = buildApp((app) => {
      app.get('/x', () => {
        throw notFound('GOAL_NOT_FOUND', 'Goal not found');
      });
    });
    const res = await request(app).get('/x');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Goal not found', code: 'GOAL_NOT_FOUND' });
  });

  it('renders conflict() with default message and CONFLICT code', async () => {
    const app = buildApp((app) => {
      app.get('/x', () => {
        throw conflict();
      });
    });
    const res = await request(app).get('/x');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Conflict', code: 'CONFLICT' });
  });

  it('falls back to a generic 500 { error, code: INTERNAL } for a plain unknown error', async () => {
    const app = buildApp((app) => {
      app.get('/x', async () => {
        throw new Error('kaboom');
      });
    });
    const res = await request(app).get('/x');
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL');
    expect(typeof res.body.error).toBe('string');
  });

  it('maps a multer file-size limit error to 413 FILE_TOO_LARGE', async () => {
    const upload = multer({ limits: { fileSize: 10 } });
    const app = buildApp((app) => {
      app.post('/upload', upload.single('file'), (req, res) => res.json({ ok: true }));
    });
    const res = await request(app)
      .post('/upload')
      .attach('file', Buffer.alloc(1000, 'x'), 'big.bin');
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: 'File too large', code: 'FILE_TOO_LARGE' });
  });

  it('maps a multer fileFilter rejection to 400 UNSUPPORTED_FILE_TYPE', async () => {
    const upload = multer({
      fileFilter: (req, file, cb) => cb(new Error('Only JPEG/PNG/WebP allowed')),
    });
    const app = buildApp((app) => {
      app.post('/upload', upload.single('file'), (req, res) => res.json({ ok: true }));
    });
    const res = await request(app)
      .post('/upload')
      .attach('file', Buffer.from('x'), 'file.txt');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Only JPEG/PNG/WebP allowed', code: 'UNSUPPORTED_FILE_TYPE' });
  });

  it('maps a malformed JSON body (express.json parse failure) to 400 INVALID_JSON', async () => {
    const app = buildApp((app) => {
      app.use(express.json());
      app.post('/echo', (req, res) => res.json(req.body));
    });
    const res = await request(app)
      .post('/echo')
      .set('Content-Type', 'application/json')
      .send('{ not valid json');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid JSON', code: 'INVALID_JSON' });
  });
});
