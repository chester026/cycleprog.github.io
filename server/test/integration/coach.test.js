const request = require('supertest');
const { bootstrap } = require('./setup');
const { createUser } = require('./helpers');
const { v4: uuidv4 } = require('uuid');

// AI Coach — /api/coach/* (T-4.1). Extracted from server.js into
// routes/services/repositories/coach.js. This suite covers the auth guards,
// conversation CRUD (incl. IDOR) against directly-inserted rows, chat
// validation, and one mocked streaming happy path — see the last `describe`
// block below for why the OpenAI call is mocked rather than real.
describe('coach routes (server/routes/coach.js)', () => {
  let app, pool;

  beforeAll(async () => {
    ({ app, pool } = await bootstrap());
  }, 30000);

  describe('auth guards', () => {
    it('401s without a token on every route', async () => {
      expect((await request(app).get('/api/coach/conversations')).status).toBe(401);
      expect((await request(app).get('/api/coach/conversations/by-activity/123')).status).toBe(401);
      expect((await request(app).get('/api/coach/conversations/some-id')).status).toBe(401);
      expect((await request(app).delete('/api/coach/conversations/some-id')).status).toBe(401);
      expect((await request(app).post('/api/coach/chat').send({ messages: [{ role: 'user', content: 'hi' }] })).status).toBe(401);
    });
  });

  describe('GET /api/coach/conversations', () => {
    it('is empty for a fresh user', async () => {
      const user = await createUser(pool, app, request);
      const res = await request(app)
        .get('/api/coach/conversations')
        .set('Authorization', `Bearer ${user.token}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('conversation CRUD + IDOR, against directly-inserted rows', () => {
    it('A can list/read/find-by-activity/delete their own conversation; B is blocked (404) from all of it', async () => {
      const userA = await createUser(pool, app, request);
      const userB = await createUser(pool, app, request);

      const conversationId = uuidv4();
      const activityId = 555111;
      await pool.query(
        `INSERT INTO coach_conversations (id, user_id, title, activity_id) VALUES ($1, $2, $3, $4)`,
        [conversationId, userA.id, "A's conversation", activityId]
      );
      const messageId = uuidv4();
      await pool.query(
        `INSERT INTO coach_messages (id, conversation_id, role, content) VALUES ($1, $2, 'user', 'hello coach')`,
        [messageId, conversationId]
      );

      // GET /api/coach/conversations — list includes it with a message_count
      const listRes = await request(app)
        .get('/api/coach/conversations')
        .set('Authorization', `Bearer ${userA.token}`);
      expect(listRes.status).toBe(200);
      const listed = listRes.body.find((c) => c.id === conversationId);
      expect(listed).toBeTruthy();
      expect(Number(listed.message_count)).toBe(1);

      // GET /api/coach/conversations/by-activity/:activityId
      const byActivityRes = await request(app)
        .get(`/api/coach/conversations/by-activity/${activityId}`)
        .set('Authorization', `Bearer ${userA.token}`);
      expect(byActivityRes.status).toBe(200);
      expect(byActivityRes.body.id).toBe(conversationId);

      // No match for an activity id nobody tagged — returns null, not 404.
      const noMatchRes = await request(app)
        .get('/api/coach/conversations/by-activity/999999999')
        .set('Authorization', `Bearer ${userA.token}`);
      expect(noMatchRes.status).toBe(200);
      expect(noMatchRes.body).toBeNull();

      // GET /api/coach/conversations/:id — full history
      const getRes = await request(app)
        .get(`/api/coach/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${userA.token}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.conversation.id).toBe(conversationId);
      expect(getRes.body.messages).toHaveLength(1);
      expect(getRes.body.messages[0].content).toBe('hello coach');

      // IDOR: B can't list it, find it by activity, read it, or delete it.
      const bByActivityRes = await request(app)
        .get(`/api/coach/conversations/by-activity/${activityId}`)
        .set('Authorization', `Bearer ${userB.token}`);
      expect(bByActivityRes.status).toBe(200);
      expect(bByActivityRes.body).toBeNull();

      const bGetRes = await request(app)
        .get(`/api/coach/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${userB.token}`);
      expect(bGetRes.status).toBe(404);
      expect(bGetRes.body.code).toBe('CONVERSATION_NOT_FOUND');

      const bDeleteRes = await request(app)
        .delete(`/api/coach/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${userB.token}`);
      expect(bDeleteRes.status).toBe(404);
      expect(bDeleteRes.body.code).toBe('CONVERSATION_NOT_FOUND');

      // Still there, still A's, untouched by B's attempts.
      const stillThere = await pool.query('SELECT user_id FROM coach_conversations WHERE id = $1', [conversationId]);
      expect(stillThere.rows[0].user_id).toBe(userA.id);

      // A deletes it for real; cascades to coach_messages.
      const deleteRes = await request(app)
        .delete(`/api/coach/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${userA.token}`);
      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body).toEqual({ success: true });

      const afterDelete = await pool.query('SELECT id FROM coach_conversations WHERE id = $1', [conversationId]);
      expect(afterDelete.rows).toHaveLength(0);
      const afterDeleteMessages = await pool.query('SELECT id FROM coach_messages WHERE conversation_id = $1', [conversationId]);
      expect(afterDeleteMessages.rows).toHaveLength(0);

      // A deleting again (already gone) is a 404, not a 500.
      const secondDeleteRes = await request(app)
        .delete(`/api/coach/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${userA.token}`);
      expect(secondDeleteRes.status).toBe(404);
    });
  });

  describe('GET /api/coach/conversations/:id message pagination (S-34)', () => {
    it('?limit=2 returns only the last two messages, in chronological order, plus X-Total-Count for the full count', async () => {
      const user = await createUser(pool, app, request);
      const conversationId = uuidv4();
      await pool.query(
        `INSERT INTO coach_conversations (id, user_id, title) VALUES ($1, $2, 'Paged convo')`,
        [conversationId, user.id]
      );
      // 5 seeded messages, inserted in order — created_at defaults to NOW()
      // so insert them one at a time to guarantee strictly increasing
      // timestamps to sort by.
      for (let i = 1; i <= 5; i++) {
        await pool.query(
          `INSERT INTO coach_messages (id, conversation_id, role, content) VALUES ($1, $2, 'user', $3)`,
          [uuidv4(), conversationId, `message ${i}`]
        );
      }

      const fullRes = await request(app)
        .get(`/api/coach/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${user.token}`);
      expect(fullRes.status).toBe(200);
      expect(fullRes.body.messages).toHaveLength(5);
      expect(fullRes.headers['x-total-count']).toBe('5');

      const pagedRes = await request(app)
        .get(`/api/coach/conversations/${conversationId}`)
        .query({ limit: 2 })
        .set('Authorization', `Bearer ${user.token}`);
      expect(pagedRes.status).toBe(200);
      expect(pagedRes.headers['x-total-count']).toBe('5');
      expect(pagedRes.body.messages).toHaveLength(2);
      // Last two messages, in chronological (ascending) order — not reversed.
      expect(pagedRes.body.messages.map((m) => m.content)).toEqual(['message 4', 'message 5']);
    });
  });

  describe('POST /api/coach/chat validation', () => {
    it('400s when messages is missing', async () => {
      const user = await createUser(pool, app, request);
      const res = await request(app)
        .post('/api/coach/chat')
        .set('Authorization', `Bearer ${user.token}`)
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('400s when messages is an empty array', async () => {
      const user = await createUser(pool, app, request);
      const res = await request(app)
        .post('/api/coach/chat')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ messages: [] });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('400s when every message is malformed (wrong role/content type)', async () => {
      const user = await createUser(pool, app, request);
      const res = await request(app)
        .post('/api/coach/chat')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ messages: [{ role: 'system', content: 'nope' }, { role: 'user', content: 42 }] });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/coach/chat streaming happy path (mocked OpenAI)', () => {
    it('streams an SSE response with at least one data: line, backed by a mocked coach.openai call', async () => {
      // The real OpenAI client lives on the singleton coach instance built by
      // services/coach.js — mock its chat-completions call so this test never
      // reaches the network. The main tool-calling loop calls it with
      // `stream: true` (needs an async-iterable of chunks); the follow-up
      // suggestions call omits `stream` (needs a plain non-streaming
      // response) — branch on that to satisfy both from one spy.
      const { coach } = require('../../services/coach');
      const createSpy = vi
        .spyOn(coach.openai.chat.completions, 'create')
        .mockImplementation(async (params) => {
          if (params.stream) {
            return {
              [Symbol.asyncIterator]: async function* () {
                yield { choices: [{ delta: { content: 'Hello from the coach!' } }] };
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
          .send({ messages: [{ role: 'user', content: 'How was my last ride?' }] })
          .buffer(true)
          .parse((res, callback) => {
            let raw = '';
            res.on('data', (chunk) => { raw += chunk; });
            res.on('end', () => callback(null, raw));
          });

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('text/event-stream');
        const lines = res.body.split('\n').filter((l) => l.startsWith('data: '));
        expect(lines.length).toBeGreaterThan(0);
        expect(lines.some((l) => l.includes('"type":"token"'))).toBe(true);
        expect(lines.some((l) => l.includes('"type":"done"'))).toBe(true);
        expect(createSpy).toHaveBeenCalled();
      } finally {
        createSpy.mockRestore();
      }
    });
  });

  // Problem A (coach-readiness-budget task): server/lib/coachIntents.js
  // detects a readiness-shaped message and routes/coach.js forces
  // analyze_readiness via tool_choice on the FIRST round only, instead of
  // hoping gpt-4.1-mini picks it from the system prompt alone.
  describe('POST /api/coach/chat — forced analyze_readiness tool_choice on readiness intent', () => {
    async function postChat(app, token, message) {
      return request(app)
        .post('/api/coach/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({ message })
        .buffer(true)
        .parse((res, callback) => {
          let raw = '';
          res.on('data', (chunk) => { raw += chunk; });
          res.on('end', () => callback(null, raw));
        });
    }

    it('forces analyze_readiness on round 1 for a readiness-shaped message, then falls back to auto on round 2', async () => {
      const { coach } = require('../../services/coach');
      let streamCallCount = 0;
      const createSpy = vi.spyOn(coach.openai.chat.completions, 'create').mockImplementation(async (params) => {
        if (params.stream) {
          streamCallCount++;
          if (streamCallCount === 1) {
            // Round 1: the model "calls" analyze_readiness.
            return {
              [Symbol.asyncIterator]: async function* () {
                yield {
                  choices: [{
                    delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'analyze_readiness', arguments: '{}' } }] },
                  }],
                };
              },
            };
          }
          // Round 2: plain text reply using the tool result.
          return {
            [Symbol.asyncIterator]: async function* () {
              yield { choices: [{ delta: { content: 'You look ready to train hard today.' } }] };
            },
          };
        }
        return { choices: [{ message: { content: JSON.stringify({ suggestions: [] }) } }] };
      });

      try {
        const user = await createUser(pool, app, request);
        const res = await postChat(app, user.token, 'Проверь мою готовность к тренировкам');

        expect(res.status).toBe(200);
        const streamCalls = createSpy.mock.calls.filter((c) => c[0].stream);
        expect(streamCalls).toHaveLength(2);
        expect(streamCalls[0][0].tool_choice).toEqual({ type: 'function', function: { name: 'analyze_readiness' } });
        expect(streamCalls[1][0].tool_choice).toBeUndefined();
      } finally {
        createSpy.mockRestore();
      }
    });

    it('leaves tool_choice as auto (undefined) for a non-readiness message', async () => {
      const { coach } = require('../../services/coach');
      const createSpy = vi.spyOn(coach.openai.chat.completions, 'create').mockImplementation(async (params) => {
        if (params.stream) {
          return {
            [Symbol.asyncIterator]: async function* () {
              yield { choices: [{ delta: { content: "Sure, let's set that up." } }] };
            },
          };
        }
        return { choices: [{ message: { content: JSON.stringify({ suggestions: [] }) } }] };
      });

      try {
        const user = await createUser(pool, app, request);
        const res = await postChat(app, user.token, 'Create a goal to ride 200km in 3 months');

        expect(res.status).toBe(200);
        const streamCalls = createSpy.mock.calls.filter((c) => c[0].stream);
        expect(streamCalls[0][0].tool_choice).toBeUndefined();
      } finally {
        createSpy.mockRestore();
      }
    });
  });
});
