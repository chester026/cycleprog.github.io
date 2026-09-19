import { describe, expect, it } from 'vitest';
import { CoachConversationSchema, CoachMessageSchema, CoachConversationDetailSchema } from './coach.js';

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
