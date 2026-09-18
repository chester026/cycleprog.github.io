// Unit test for the pure history-truncation helper extracted out of
// POST /api/coach/chat's server-side conversation history assembly (T-4.4,
// audit S-31): conversation history now comes from coach_messages, capped
// to COACH_HISTORY_MESSAGES and further trimmed to COACH_HISTORY_MAX_CHARS
// (oldest dropped first). No database needed here — the full request path
// (real Postgres history, real OpenAI messages array assembly) is covered
// by test/integration/coach.test.js.
const coachRoute = require('../routes/coach');
const { truncateHistoryForPrompt } = coachRoute;

function msg(role, content) {
  return { role, content };
}

describe('routes/coach truncateHistoryForPrompt', () => {
  it('returns everything unchanged when under both caps', () => {
    const history = [msg('user', 'hi'), msg('assistant', 'hello')];
    expect(truncateHistoryForPrompt(history, { maxMessages: 30, maxChars: 24000 })).toEqual(history);
  });

  it('caps to the most recent maxMessages, dropping the oldest first', () => {
    const history = Array.from({ length: 40 }, (_, i) => msg(i % 2 === 0 ? 'user' : 'assistant', `message ${i}`));
    const result = truncateHistoryForPrompt(history, { maxMessages: 30, maxChars: 100000 });
    expect(result).toHaveLength(30);
    // Last 30 of the original 40 (indices 10..39), oldest (0..9) dropped.
    expect(result[0].content).toBe('message 10');
    expect(result[result.length - 1].content).toBe('message 39');
  });

  it('further trims by character budget, oldest first, even under the message-count cap', () => {
    const history = [
      msg('user', 'a'.repeat(100)),
      msg('assistant', 'b'.repeat(100)),
      msg('user', 'c'.repeat(100)),
    ];
    // Budget only fits the last two messages (200 chars).
    const result = truncateHistoryForPrompt(history, { maxMessages: 30, maxChars: 200 });
    expect(result.map((m) => m.content[0])).toEqual(['b', 'c']);
  });

  it('never returns more than fits the char budget, even if that means dropping everything', () => {
    const history = [msg('user', 'x'.repeat(50))];
    const result = truncateHistoryForPrompt(history, { maxMessages: 30, maxChars: 10 });
    expect(result).toEqual([]);
  });

  it('handles empty/undefined history', () => {
    expect(truncateHistoryForPrompt([], { maxMessages: 30, maxChars: 24000 })).toEqual([]);
    expect(truncateHistoryForPrompt(undefined, { maxMessages: 30, maxChars: 24000 })).toEqual([]);
  });

  it('applies both caps together: count first, then chars on the remaining window', () => {
    const history = [
      msg('user', 'old-message-outside-count-cap'.repeat(5)),
      msg('assistant', 'y'.repeat(50)),
      msg('user', 'z'.repeat(50)),
    ];
    const result = truncateHistoryForPrompt(history, { maxMessages: 2, maxChars: 60 });
    // Count cap first drops the oldest message entirely (down to the last 2),
    // then the char cap trims further within that window.
    expect(result.map((m) => m.content[0])).toEqual(['z']);
  });
});
