import { z } from 'zod';

// `coach_conversations` row (server/repositories/coach.js). `message_count`
// is only present on the GET /api/coach/conversations list item (a
// subquery COUNT(*) — pg returns bigint aggregates as a numeric string).
// GET .../by-activity/:activityId selects a narrower column set
// (id/title/created_at/updated_at only), which this same schema still
// covers since every other field is optional.
export const CoachConversationSchema = z
  .object({
    id: z.string(),
    user_id: z.union([z.number(), z.string()]).optional(),
    title: z.string().nullable().optional(),
    activity_id: z.union([z.number(), z.string()]).nullable().optional(),
    // pg returns TIMESTAMPTZ as a Date object (T-7.1 CONTRACT_VALIDATE_RESPONSES).
    created_at: z.union([z.string(), z.date()]),
    updated_at: z.union([z.string(), z.date()]),
    message_count: z.union([z.number(), z.string()]).optional(),
  })
  .passthrough();

export type CoachConversation = z.infer<typeof CoachConversationSchema>;

// `coach_messages` row.
export const CoachMessageSchema = z
  .object({
    id: z.string(),
    conversation_id: z.string().optional(),
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string(),
    tool_calls: z.unknown().nullable().optional(),
    suggestions: z.unknown().nullable().optional(),
    token_usage: z.unknown().nullable().optional(),
    created_at: z.union([z.string(), z.date()]),
  })
  .passthrough();

export type CoachMessage = z.infer<typeof CoachMessageSchema>;

// GET /api/coach/conversations/:id response envelope.
export const CoachConversationDetailSchema = z.object({
  conversation: CoachConversationSchema,
  messages: z.array(CoachMessageSchema),
});

export type CoachConversationDetail = z.infer<typeof CoachConversationDetailSchema>;
