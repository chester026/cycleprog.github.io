import { describe, expect, it } from 'vitest';
import { coach } from './coach.js';

describe('coach contract', () => {
  it('conversations: response accepts a real list item with message_count', () => {
    const r = coach.conversations.response.safeParse([
      {
        id: 'c1',
        user_id: 1,
        title: "A's conversation",
        activity_id: 555111,
        created_at: new Date(),
        updated_at: new Date(),
        message_count: '1',
      },
    ]);
    expect(r.success).toBe(true);
  });

  it('conversationByActivity: response accepts null (no match)', () => {
    expect(coach.conversationByActivity.response.safeParse(null).success).toBe(true);
  });

  it('conversationDetail: response accepts the conversation/messages envelope', () => {
    const r = coach.conversationDetail.response.safeParse({
      conversation: { id: 'c1', title: 'x', created_at: new Date(), updated_at: new Date() },
      messages: [{ id: 'm1', role: 'user', content: 'hello coach', created_at: new Date() }],
    });
    expect(r.success).toBe(true);
  });

  it('deleteConversation: response accepts { success }', () => {
    expect(coach.deleteConversation.response.safeParse({ success: true }).success).toBe(true);
  });
});
