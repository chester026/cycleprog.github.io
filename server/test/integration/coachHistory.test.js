const request = require('supertest');
const { bootstrap } = require('./setup');
const { createUser } = require('./helpers');
const { v4: uuidv4 } = require('uuid');

// T-4.4 (audit S-31): POST /api/coach/chat loads conversation history from
// coach_messages instead of trusting the client's own `messages`/`history`
// array, truncates it (COACH_HISTORY_MESSAGES/COACH_HISTORY_MAX_CHARS), and
// persists token_usage on the assistant message from the OpenAI response's
// `usage`. See test/coachHistory.test.js for the pure truncation-helper
// unit tests and test/integration/coach.test.js for the rest of this route.
describe('POST /api/coach/chat — server-side history + token_usage (T-4.4)', () => {
  let app, pool;

  beforeAll(async () => {
    ({ app, pool } = await bootstrap());
  }, 30000);

  async function seedMessages(pool, conversationId, count) {
    for (let i = 1; i <= count; i++) {
      await pool.query(
        `INSERT INTO coach_messages (id, conversation_id, role, content) VALUES ($1, $2, $3, $4)`,
        [uuidv4(), conversationId, i % 2 === 0 ? 'assistant' : 'user', `seeded message ${i}`]
      );
    }
  }

  it('builds messages as system + <=30 history + the new message, and ignores a client-supplied `messages` array', async () => {
    const { coach } = require('../../services/coach');
    const user = await createUser(pool, app, request);

    const conversationId = uuidv4();
    await pool.query(
      `INSERT INTO coach_conversations (id, user_id, title) VALUES ($1, $2, 'History test')`,
      [conversationId, user.id]
    );
    await seedMessages(pool, conversationId, 40);

    let capturedMessages = null;
    const createSpy = vi.spyOn(coach.openai.chat.completions, 'create').mockImplementation(async (params) => {
      if (params.stream) {
        capturedMessages = params.messages;
        return {
          [Symbol.asyncIterator]: async function* () {
            yield { choices: [{ delta: { content: 'Here is my reply.' } }] };
            yield { choices: [], usage: { prompt_tokens: 123, completion_tokens: 45, total_tokens: 168 } };
          },
        };
      }
      return { choices: [{ message: { content: JSON.stringify({ suggestions: [] }) } }] };
    });

    try {
      const res = await request(app)
        .post('/api/coach/chat')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          conversation_id: conversationId,
          message: 'What should I train today?',
          // A legacy client sending its own (forged/irrelevant) history —
          // must be ignored entirely, not consulted for the OpenAI messages
          // array or persisted history.
          messages: [{ role: 'user', content: 'THIS SHOULD NEVER REACH OPENAI' }],
        })
        .buffer(true)
        .parse((res, callback) => {
          let raw = '';
          res.on('data', (chunk) => { raw += chunk; });
          res.on('end', () => callback(null, raw));
        });
      expect(res.status).toBe(200);

      expect(capturedMessages).toBeTruthy();
      expect(capturedMessages[0]).toEqual({ role: 'system', content: expect.any(String) });

      // Everything between the system prompt and the final (new) message is
      // history — at most COACH_HISTORY_MESSAGES (default 30) of it, drawn
      // from the DB, never the forged client-supplied one.
      const historySlice = capturedMessages.slice(1, -1);
      expect(historySlice.length).toBeLessThanOrEqual(30);
      expect(historySlice.length).toBeGreaterThan(0);
      for (const m of historySlice) {
        expect(m.content).toMatch(/^seeded message \d+$/);
      }
      expect(capturedMessages.some((m) => m.content.includes('THIS SHOULD NEVER REACH OPENAI'))).toBe(false);

      // The newest seeded messages (highest numbers) are the ones kept —
      // oldest dropped first.
      expect(historySlice[historySlice.length - 1].content).toBe('seeded message 40');

      // The final message is this turn's own new user message.
      const last = capturedMessages[capturedMessages.length - 1];
      expect(last.role).toBe('user');
      expect(last.content).toBe('What should I train today?');
    } finally {
      createSpy.mockRestore();
    }
  });

  it('persists coach_messages.token_usage from the streamed reply\'s final usage chunk', async () => {
    const { coach } = require('../../services/coach');
    const user = await createUser(pool, app, request);

    const createSpy = vi.spyOn(coach.openai.chat.completions, 'create').mockImplementation(async (params) => {
      if (params.stream) {
        return {
          [Symbol.asyncIterator]: async function* () {
            yield { choices: [{ delta: { content: 'Sure, here you go.' } }] };
            // Final usage-only chunk, exactly as `stream_options: { include_usage: true }` produces.
            yield { choices: [], usage: { prompt_tokens: 200, completion_tokens: 40, total_tokens: 240 } };
          },
        };
      }
      // Suggestions call also reports usage — should be added into the total.
      return {
        choices: [{ message: { content: JSON.stringify({ suggestions: [] }) } }],
        usage: { prompt_tokens: 30, completion_tokens: 10, total_tokens: 40 },
      };
    });

    try {
      const res = await request(app)
        .post('/api/coach/chat')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ message: 'How was my last ride?' })
        .buffer(true)
        .parse((res, callback) => {
          let raw = '';
          res.on('data', (chunk) => { raw += chunk; });
          res.on('end', () => callback(null, raw));
        });
      expect(res.status).toBe(200);

      // Pull conversation_id out of the SSE `done` event.
      const doneEvent = res.body
        .split('\n')
        .filter((l) => l.startsWith('data: '))
        .map((l) => JSON.parse(l.slice('data: '.length)))
        .find((e) => e.type === 'done');
      expect(doneEvent).toBeTruthy();

      const row = await pool.query(
        `SELECT token_usage FROM coach_messages WHERE conversation_id = $1 AND role = 'assistant'`,
        [doneEvent.conversation_id]
      );
      expect(row.rows).toHaveLength(1);
      const usage = row.rows[0].token_usage;
      expect(usage).toBeTruthy();
      // Main-loop usage (200/40/240) + suggestions usage (30/10/40) summed.
      expect(usage.prompt_tokens).toBe(230);
      expect(usage.completion_tokens).toBe(50);
      expect(usage.total_tokens).toBe(280);
      expect(usage.model).toBe(coach.COACH_MODEL);

      // Also counted toward the user's daily budget row.
      const budgetRow = await pool.query(
        `SELECT prompt_tokens, completion_tokens FROM ai_usage_daily WHERE user_id = $1 AND day = CURRENT_DATE`,
        [user.id]
      );
      expect(budgetRow.rows).toHaveLength(1);
      expect(Number(budgetRow.rows[0].prompt_tokens)).toBe(230);
      expect(Number(budgetRow.rows[0].completion_tokens)).toBe(50);
    } finally {
      createSpy.mockRestore();
    }
  });
});
