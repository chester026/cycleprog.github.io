import { describe, expect, it } from 'vitest';
import {
  CoachConversationSchema,
  CoachMessageSchema,
  CoachConversationDetailSchema,
  CoachSseEventSchema,
  SuggestionItemSchema,
  ChatRequestBodySchema,
} from './coach.js';

describe('CoachConversationSchema', () => {
  it('parses a GET /api/coach/conversations list item (with message_count)', () => {
    const parsed = CoachConversationSchema.parse({
      id: 'c1',
      user_id: 42,
      title: "A's conversation",
      activity_id: 555111,
      created_at: new Date('2026-01-01T00:00:00Z'),
      updated_at: new Date('2026-01-01T00:00:00Z'),
      message_count: '3', // COUNT(*) subquery — pg bigint as string
    });
    expect(parsed.message_count).toBe('3');
  });

  it('parses the narrower by-activity row (id/title/created_at/updated_at only)', () => {
    const parsed = CoachConversationSchema.parse({
      id: 'c2',
      title: 'x',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });
    expect(parsed.id).toBe('c2');
  });
});

describe('CoachMessageSchema / CoachConversationDetailSchema', () => {
  it('parses a GET /api/coach/conversations/:id envelope', () => {
    const parsed = CoachConversationDetailSchema.parse({
      conversation: {
        id: 'c1',
        title: 'x',
        created_at: new Date(),
        updated_at: new Date(),
      },
      messages: [
        { id: 'm1', role: 'user', content: 'hello coach', created_at: new Date() },
        {
          id: 'm2',
          role: 'assistant',
          content: 'hi!',
          tool_calls: [{ name: 'get_goals_progress', args: {}, result: {}, status: 'done' }],
          suggestions: [{ label: 'Training tips' }],
          token_usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, model: 'gpt-4o' },
          created_at: new Date(),
        },
      ],
    });
    expect(parsed.messages).toHaveLength(2);
  });

  it('rejects an unknown role', () => {
    const result = CoachMessageSchema.safeParse({
      id: 'm1',
      role: 'system-prompt',
      content: 'x',
      created_at: new Date(),
    });
    expect(result.success).toBe(false);
  });
});

describe('CoachSseEventSchema', () => {
  it('parses every event type the server emits', () => {
    const events = [
      { type: 'token', content: 'Hel' },
      { type: 'tool_call', name: 'get_goals_progress', args: {} },
      { type: 'tool_result', name: 'get_goals_progress', result: { goals: [] } },
      { type: 'suggestions', items: [{ label: 'Compare to average', detail: 'vs_baseline' }, { label: 'Connect Apple Health', action: 'connect_health' }] },
      { type: 'redirect', conversation_id: 'c-old' },
      { type: 'conversation', conversation_id: 'c-new' },
      { type: 'done', conversation_id: 'c-new', message_id: 'm1' },
      { type: 'error', message: 'Coach is temporarily unavailable.' },
    ];
    for (const event of events) {
      expect(CoachSseEventSchema.safeParse(event).success, event.type).toBe(true);
    }
  });

  it('rejects an unknown type and a suggestion with an unknown detail', () => {
    expect(CoachSseEventSchema.safeParse({ type: 'ping' }).success).toBe(false);
    expect(SuggestionItemSchema.safeParse({ label: 'x', detail: 'weather' }).success).toBe(false);
  });
});

describe('ChatRequestBodySchema', () => {
  it('accepts a new-conversation body with client:web and rejects an unknown client', () => {
    expect(ChatRequestBodySchema.safeParse({ message: 'hi', conversation_id: null, client: 'web' }).success).toBe(true);
    expect(ChatRequestBodySchema.safeParse({ message: 'hi', conversation_id: null, client: 'android' }).success).toBe(false);
    expect(ChatRequestBodySchema.safeParse({ message: '', conversation_id: 'c1' }).success).toBe(false);
  });
});
