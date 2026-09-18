const request = require('supertest');
const { bootstrap } = require('./setup');
const { createUser } = require('./helpers');

// AI daily budget (T-4.4, audit S-31) — services/aiBudget.js +
// repositories/aiBudget.js + GET /api/admin/ai-usage (routes/adminAiUsage.js).
// POST /api/coach/chat is the one budget-gated route this task owns
// end-to-end; ai-analysis/meta-goals mount the same requireAiBudget
// middleware but live in files this task doesn't touch (see the final
// report for the exact mount lines).
describe('AI daily budget (services/aiBudget.js, routes/adminAiUsage.js)', () => {
  let app, pool;

  beforeAll(async () => {
    ({ app, pool } = await bootstrap());
  }, 30000);

  describe('POST /api/coach/chat budget gate', () => {
    it('429s with AI_BUDGET_EXCEEDED once today\'s usage is at/over AI_DAILY_TOKEN_BUDGET', async () => {
      const user = await createUser(pool, app, request);

      // Seed today's usage row already over the default 200000-token budget.
      await pool.query(
        `INSERT INTO ai_usage_daily (user_id, day, prompt_tokens, completion_tokens, requests)
         VALUES ($1, CURRENT_DATE, 150000, 100000, 5)`,
        [user.id]
      );

      const res = await request(app)
        .post('/api/coach/chat')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ message: 'How was my last ride?' });

      expect(res.status).toBe(429);
      expect(res.body).toEqual(
        expect.objectContaining({ error: 'Daily AI budget exceeded', code: 'AI_BUDGET_EXCEEDED' })
      );
      expect(typeof res.body.resetAt).toBe('string');
      // resetAt is a real, parseable, future instant.
      expect(new Date(res.body.resetAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('is not gated for a user with no usage yet today', async () => {
      const { coach } = require('../../services/coach');
      const createSpy = vi.spyOn(coach.openai.chat.completions, 'create').mockImplementation(async (params) => {
        if (params.stream) {
          return {
            [Symbol.asyncIterator]: async function* () {
              yield { choices: [{ delta: { content: 'ok' } }] };
            },
          };
        }
        return { choices: [{ message: { content: JSON.stringify({ suggestions: [] }) } }] };
      });
      try {
        const user = await createUser(pool, app, request);
        const res = await request(app)
          .post('/api/coach/chat')
          .set('Authorization', `Bearer ${user.token}`)
          .send({ message: 'hi' });
        expect(res.status).toBe(200);
      } finally {
        createSpy.mockRestore();
      }
    });
  });

  // routes/adminAiUsage.js is a new file this task owns end-to-end, but
  // mounting it into server.js is explicitly the orchestrator's job (see
  // the final report) — this suite's `app` (built by test/integration/
  // setup.js requiring the real server.js) won't have it mounted yet.
  // Exercise the router directly on a minimal express app instead, wired
  // with the same real authMiddleware/requireAdmin it uses in production.
  describe('GET /api/admin/ai-usage (router, mounted standalone — see report for the server.js mount line)', () => {
    let adminApp;

    beforeAll(() => {
      const express = require('express');
      adminApp = express();
      adminApp.use(express.json());
      adminApp.use('/api', require('../../routes/adminAiUsage'));
    });

    it('401s without a token, 403s for a non-admin', async () => {
      expect((await request(adminApp).get('/api/admin/ai-usage')).status).toBe(401);
      const nonAdmin = await createUser(pool, app, request);
      const res = await request(adminApp)
        .get('/api/admin/ai-usage')
        .set('Authorization', `Bearer ${nonAdmin.token}`);
      expect(res.status).toBe(403);
    });

    it('returns per-user totals over the requested day window, admin only', async () => {
      const admin = await createUser(pool, app, request, { isAdmin: true });
      const userA = await createUser(pool, app, request);
      const userB = await createUser(pool, app, request);

      await pool.query(
        `INSERT INTO ai_usage_daily (user_id, day, prompt_tokens, completion_tokens, requests) VALUES
           ($1, CURRENT_DATE, 1000, 500, 2),
           ($2, CURRENT_DATE, 300, 100, 1),
           ($2, CURRENT_DATE - INTERVAL '10 days', 999999, 999999, 99)`,
        [userA.id, userB.id]
      );

      const res = await request(adminApp)
        .get('/api/admin/ai-usage')
        .query({ days: 7 })
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.days).toBe(7);
      const rowA = res.body.users.find((u) => u.user_id === userA.id);
      const rowB = res.body.users.find((u) => u.user_id === userB.id);
      expect(Number(rowA.prompt_tokens)).toBe(1000);
      expect(Number(rowA.completion_tokens)).toBe(500);
      expect(Number(rowA.requests)).toBe(2);
      // Row from 10 days ago is outside the 7-day window and must not count.
      expect(Number(rowB.prompt_tokens)).toBe(300);
      expect(Number(rowB.completion_tokens)).toBe(100);
    });
  });
});
