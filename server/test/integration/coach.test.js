const request = require('supertest');
const { bootstrap } = require('./setup');
const { createUser } = require('./helpers');
const { v4: uuidv4 } = require('uuid');
const { asStream, toolCallEvents, textStream, textResponse } = require('../fakeResponses');

// AI Coach — /api/coach/* (T-4.1). Extracted from server.js into
// routes/services/repositories/coach.js. This suite covers the auth guards,
// conversation CRUD (incl. IDOR) against directly-inserted rows, chat
// validation, and one mocked streaming happy path — see the last `describe`
// block below for why the OpenAI call is mocked rather than real.
describe('coach routes (server/routes/coach.js)', () => {
  let app, pool;
  // One login shared by the chat-streaming blocks and the rename test —
  // /api/login is rate-limited per IP (10 per 15 min) and this file is at
  // that budget.
  let sharedUser;

  beforeAll(async () => {
    ({ app, pool } = await bootstrap());
    sharedUser = await createUser(pool, app, request);
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

  describe('PATCH /api/coach/conversations/:id (rename)', () => {
    it('renames the owner\'s conversation and returns the updated row; 404 for a foreign id; 400 for a bad body or id', async () => {
      const owner = sharedUser;
      const stranger = await createUser(pool, app, request);
      const conversationId = uuidv4();
      await pool.query(`INSERT INTO coach_conversations (id, user_id, title) VALUES ($1, $2, 'How was my last ride?')`, [
        conversationId,
        owner.id,
      ]);

      const renamed = await request(app)
        .patch(`/api/coach/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ title: '  Garda loop debrief  ' });
      expect(renamed.status).toBe(200);
      expect(renamed.body.id).toBe(conversationId);
      expect(renamed.body.title).toBe('Garda loop debrief');
      const stored = await pool.query('SELECT title FROM coach_conversations WHERE id = $1', [conversationId]);
      expect(stored.rows[0].title).toBe('Garda loop debrief');

      const foreign = await request(app)
        .patch(`/api/coach/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${stranger.token}`)
        .send({ title: 'Mine now' });
      expect(foreign.status).toBe(404);
      expect(foreign.body.code).toBe('CONVERSATION_NOT_FOUND');

      const unknown = await request(app)
        .patch(`/api/coach/conversations/${uuidv4()}`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ title: 'Ghost' });
      expect(unknown.status).toBe(404);

      const tooLong = await request(app)
        .patch(`/api/coach/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ title: 'x'.repeat(81) });
      expect(tooLong.status).toBe(400);
      expect(tooLong.body.code).toBe('VALIDATION_ERROR');

      // The id column is UUID — a non-UUID id is a validation error, not a pg cast 500.
      const badId = await request(app)
        .patch('/api/coach/conversations/not-a-uuid')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ title: 'x' });
      expect(badId.status).toBe(400);

      expect((await request(app).patch(`/api/coach/conversations/${conversationId}`).send({ title: 'x' })).status).toBe(401);
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
      // The real OpenAI client is shared via lib/openaiResponses.js and
      // exposed as coach.openai — mock its Responses call so this test never
      // reaches the network. The main tool-calling loop calls it with
      // `stream: true` (needs an async-iterable of events); the follow-up
      // suggestions call is non-streaming (needs a plain response) — branch
      // on that to satisfy both from one spy.
      const { coach } = require('../../services/coach');
      const createSpy = vi
        .spyOn(coach.openai.responses, 'create')
        .mockImplementation(async (params) => {
          if (params.stream) return textStream('Hello from the coach!');
          return textResponse(JSON.stringify({ suggestions: [] }));
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
    async function postChat(app, token, message, conversationId) {
      return request(app)
        .post('/api/coach/chat')
        .set('Authorization', `Bearer ${token}`)
        .send(conversationId ? { message, conversation_id: conversationId } : { message })
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
      const createSpy = vi.spyOn(coach.openai.responses, 'create').mockImplementation(async (params) => {
        if (params.stream) {
          streamCallCount++;
          if (streamCallCount === 1) {
            // Round 1: the model "calls" analyze_readiness.
            return asStream(toolCallEvents({ itemId: 'fc_1', callId: 'call_1', name: 'analyze_readiness' }));
          }
          // Round 2: plain text reply using the tool result.
          return textStream('You look ready to train hard today.');
        }
        return textResponse(JSON.stringify({ suggestions: [] }));
      });

      try {
        const user = sharedUser;
        const res = await postChat(app, user.token, 'Проверь мою готовность к тренировкам');

        expect(res.status).toBe(200);
        const streamCalls = createSpy.mock.calls.filter((c) => c[0].stream);
        expect(streamCalls).toHaveLength(2);
        expect(streamCalls[0][0].tool_choice).toEqual({ type: 'function', name: 'analyze_readiness' });
        expect(streamCalls[1][0].tool_choice).toBe('auto');
        // Round 2 replays the tool round: the call, then its output.
        expect(streamCalls[1][0].input.slice(-2)).toEqual([
          { type: 'function_call', call_id: 'call_1', name: 'analyze_readiness', arguments: '{}' },
          expect.objectContaining({ type: 'function_call_output', call_id: 'call_1' }),
        ]);
      } finally {
        createSpy.mockRestore();
      }
    });

    // 09.10.2026: after one readiness answer, every later reply in the chat
    // (a nutrition plan, a gear question) re-rendered the Recovery card and
    // the HR-vs-speed chart because the model kept calling analyze_readiness.
    // The route now drops that tool from the offered list on non-readiness
    // turns once it has already run in the conversation.
    it('stops offering analyze_readiness on non-readiness turns once it ran in the conversation', async () => {
      const { coach } = require('../../services/coach');
      const user = sharedUser;
      const conversationId = uuidv4();
      await pool.query(`INSERT INTO coach_conversations (id, user_id, title) VALUES ($1, $2, 'Recovery')`, [conversationId, user.id]);
      await pool.query(
        `INSERT INTO coach_messages (id, conversation_id, role, content, tool_calls) VALUES ($1, $2, 'assistant', 'You are recovered.', $3)`,
        [uuidv4(), conversationId, JSON.stringify([{ name: 'analyze_readiness', args: {}, status: 'done' }])]
      );
      const createSpy = vi.spyOn(coach.openai.responses, 'create').mockImplementation(async (params) => {
        if (params.stream) return textStream('Eat 60 g of carbs per hour.');
        return textResponse(JSON.stringify({ suggestions: [] }));
      });
      try {
        const nutrition = await postChat(app, user.token, 'План питания на заезд', conversationId);
        expect(nutrition.status).toBe(200);
        const toolNames = (calls) => calls[0].tools.map((t) => t.name);
        const nutritionCall = createSpy.mock.calls.filter((c) => c[0].stream)[0];
        expect(toolNames(nutritionCall)).not.toContain('analyze_readiness');
        expect(toolNames(nutritionCall)).not.toContain('get_oura_readiness');
        expect(toolNames(nutritionCall)).toContain('get_recent_activities');
        expect(toolNames(nutritionCall)).toContain('assess_ride_feasibility');

        const readiness = await postChat(app, user.token, 'Что у меня по восстановлению?', conversationId);
        expect(readiness.status).toBe(200);
        const readinessCall = createSpy.mock.calls.filter((c) => c[0].stream)[1];
        expect(toolNames(readinessCall)).toContain('analyze_readiness');
        expect(toolNames(readinessCall)).toContain('get_oura_readiness');
      } finally {
        createSpy.mockRestore();
      }
    });

    it('leaves tool_choice as auto for a non-readiness message', async () => {
      const { coach } = require('../../services/coach');
      const createSpy = vi.spyOn(coach.openai.responses, 'create').mockImplementation(async (params) => {
        if (params.stream) return textStream("Sure, let's set that up.");
        return textResponse(JSON.stringify({ suggestions: [] }));
      });

      try {
        const user = sharedUser;
        const res = await postChat(app, user.token, 'Create a goal to ride 200km in 3 months');

        expect(res.status).toBe(200);
        const streamCalls = createSpy.mock.calls.filter((c) => c[0].stream);
        expect(streamCalls[0][0].tool_choice).toBe('auto');
      } finally {
        createSpy.mockRestore();
      }
    });
  });

  // Web-prod plan Phase 0.3 (docs/plans/web-prod-plan.md): the additive SSE
  // changes the web client relies on — an early `conversation` event, `: ping`
  // heartbeats, and the `client` body field that hides Apple Health on web.
  describe('POST /api/coach/chat — stream shape for the web client', () => {
    // Raw SSE text → frames, keeping comment frames so heartbeats are visible.
    function postChatRaw(token, body) {
      return request(app)
        .post('/api/coach/chat')
        .set('Authorization', `Bearer ${token}`)
        .send(body)
        .buffer(true)
        .parse((res, callback) => {
          let raw = '';
          res.on('data', (chunk) => { raw += chunk; });
          res.on('end', () => callback(null, raw));
        });
    }
    const dataEvents = (raw) =>
      raw
        .split('\n\n')
        .filter((frame) => frame.startsWith('data: '))
        .map((frame) => JSON.parse(frame.slice('data: '.length)));

    function mockPlainReply(text) {
      const { coach } = require('../../services/coach');
      return vi.spyOn(coach.openai.responses, 'create').mockImplementation(async (params) => {
        if (params.stream) return textStream(text);
        return textResponse(JSON.stringify({ suggestions: [] }));
      });
    }

    it('emits a `conversation` event for a new conversation before any token, with the same id `done` carries', async () => {
      const createSpy = mockPlainReply('Hello!');
      try {
        const res = await postChatRaw(sharedUser.token, { message: 'Hi coach', conversation_id: null, client: 'web' });
        expect(res.status).toBe(200);
        expect(res.headers['x-accel-buffering']).toBe('no');
        const events = dataEvents(res.body);
        const types = events.map((e) => e.type);
        expect(types[0]).toBe('conversation');
        expect(types.indexOf('conversation')).toBeLessThan(types.indexOf('token'));
        expect(types[types.length - 1]).toBe('done');
        const conversationEvent = events.find((e) => e.type === 'conversation');
        const doneEvent = events.find((e) => e.type === 'done');
        expect(conversationEvent.conversation_id).toBe(doneEvent.conversation_id);
        const row = await pool.query('SELECT id FROM coach_conversations WHERE id = $1', [conversationEvent.conversation_id]);
        expect(row.rows).toHaveLength(1);
      } finally {
        createSpy.mockRestore();
      }
    });

    it('does not emit `conversation` when continuing an existing conversation', async () => {
      const conversationId = uuidv4();
      await pool.query(`INSERT INTO coach_conversations (id, user_id, title) VALUES ($1, $2, 'Existing')`, [conversationId, sharedUser.id]);
      const createSpy = mockPlainReply('Still here.');
      try {
        const res = await postChatRaw(sharedUser.token, { message: 'More please', conversation_id: conversationId });
        expect(res.status).toBe(200);
        const types = dataEvents(res.body).map((e) => e.type);
        expect(types).not.toContain('conversation');
        expect(types).toContain('done');
      } finally {
        createSpy.mockRestore();
      }
    });

    it('writes `: ping` heartbeat comments while a slow model is silent', async () => {
      const coachService = require('../../services/coach');
      const { coach } = coachService;
      // Shorten the interval for the test; the route reads this through the module object.
      const realStartSseHeartbeat = coachService.startSseHeartbeat;
      const heartbeatSpy = vi
        .spyOn(coachService, 'startSseHeartbeat')
        .mockImplementation((res) => realStartSseHeartbeat(res, 20));
      const createSpy = vi.spyOn(coach.openai.responses, 'create').mockImplementation(async (params) => {
        if (params.stream) {
          return {
            [Symbol.asyncIterator]: async function* () {
              await new Promise((resolve) => setTimeout(resolve, 120));
              yield { type: 'response.output_text.delta', delta: 'Finally.' };
            },
          };
        }
        return textResponse(JSON.stringify({ suggestions: [] }));
      });
      try {
        const res = await postChatRaw(sharedUser.token, { message: 'Think hard about this', conversation_id: null });
        expect(res.status).toBe(200);
        const pings = res.body.split('\n\n').filter((frame) => frame === ': ping');
        expect(pings.length).toBeGreaterThanOrEqual(2);
        expect(dataEvents(res.body).map((e) => e.type)).toEqual(expect.arrayContaining(['token', 'done']));
      } finally {
        createSpy.mockRestore();
        heartbeatSpy.mockRestore();
      }
    });

    it("client: 'web' drops suggest_connect_apple_health from the tools and never adds the connect_health chip", async () => {
      const { coach } = require('../../services/coach');
      const connectCall = () =>
        asStream(toolCallEvents({ itemId: 'fc_h', callId: 'call_h', name: 'suggest_connect_apple_health' }));
      let streamCalls = 0;
      const createSpy = vi.spyOn(coach.openai.responses, 'create').mockImplementation(async (params) => {
        if (params.stream) {
          streamCalls++;
          return streamCalls % 2 === 1 ? connectCall() : textStream('Connecting a health source would help.');
        }
        return textResponse(JSON.stringify({ suggestions: ['Training tips'] }));
      });
      try {
        const web = await postChatRaw(sharedUser.token, { message: 'Am I recovered?', conversation_id: null, client: 'web' });
        expect(web.status).toBe(200);
        const webTools = createSpy.mock.calls.filter((c) => c[0].stream)[0][0].tools.map((t) => t.name);
        expect(webTools).not.toContain('suggest_connect_apple_health');
        expect(webTools).toContain('analyze_readiness');
        const webSuggestions = dataEvents(web.body).find((e) => e.type === 'suggestions');
        expect(webSuggestions.items.some((item) => item.action === 'connect_health')).toBe(false);
        expect(createSpy.mock.calls.filter((c) => c[0].stream)[0][0].instructions).toMatch(/phone integrations/);

        // Default (no `client`) keeps the iOS behaviour: tool offered, chip added when the model calls it.
        const ios = await postChatRaw(sharedUser.token, { message: 'Am I recovered?', conversation_id: null });
        expect(ios.status).toBe(200);
        const iosFirstCall = createSpy.mock.calls.filter((c) => c[0].stream)[2][0];
        expect(iosFirstCall.tools.map((t) => t.name)).toContain('suggest_connect_apple_health');
        expect(iosFirstCall.instructions).toMatch(/NOT connected Apple Health or Oura/);
        const iosSuggestions = dataEvents(ios.body).find((e) => e.type === 'suggestions');
        expect(iosSuggestions.items).toContainEqual({ label: 'Connect Apple Health', action: 'connect_health' });
      } finally {
        createSpy.mockRestore();
      }
    });
  });
});
