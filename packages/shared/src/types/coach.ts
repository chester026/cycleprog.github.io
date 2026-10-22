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

// --- POST /api/coach/chat (SSE) ---------------------------------------------
// The chat endpoint is deliberately outside the REST contract (it streams
// `data: <json>\n\n` frames — see api/contract/coach.ts), so its request body
// and event payloads are typed here instead and read through `readSseJson`.

// Which of the three "hidden until asked" get_activity_analysis angles a
// suggestion chip deterministically asks for (server/routes/coach.js
// DETAIL_LABELS). Closed union so the chip and the card it reveals agree.
export const AnalysisDetailTypeSchema = z.enum(['vs_baseline', 'similar_ride', 'skills_delta']);
export type AnalysisDetailType = z.infer<typeof AnalysisDetailTypeSchema>;

// A suggestion chip. `detail` = ask for one analysis angle; `action` = tapping
// navigates (connect_health opens the app's Apple Health screen) instead of
// sending `label` as a message. The server never sets both; `connect_health`
// is never sent to `client: 'web'` at all.
export const SuggestionItemSchema = z.object({
  label: z.string(),
  detail: AnalysisDetailTypeSchema.optional(),
  action: z.literal('connect_health').optional(),
});
export type SuggestionItem = z.infer<typeof SuggestionItemSchema>;

// Request body. `conversation_id: null` starts a new conversation (the
// server answers with a `conversation` event carrying the new id).
// `hidden_context` is folded into what the model sees but never shown to the
// rider; `health_context` is the on-device Apple Health snapshot (iOS only,
// never persisted server-side). `client` defaults to 'ios' on the server;
// 'web' drops the Apple-Health tool/chip and prompt wording.
export const ChatRequestBodySchema = z.object({
  message: z.string().min(1),
  conversation_id: z.string().nullable(),
  hidden_context: z.string().optional(),
  health_context: z.record(z.unknown()).optional(),
  client: z.enum(['ios', 'web']).optional(),
});
export type ChatRequestBody = z.infer<typeof ChatRequestBodySchema>;

// One `data:` frame of the chat stream. Clients ignore any `type` they don't
// know (both the app's coachSSE switch and the web hook) so new events can be
// added server-side without a lockstep release.
export const CoachSseEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('token'), content: z.string() }),
  z.object({ type: z.literal('tool_call'), name: z.string(), args: z.record(z.unknown()) }),
  z.object({ type: z.literal('tool_result'), name: z.string(), result: z.unknown() }),
  z.object({ type: z.literal('suggestions'), items: z.array(SuggestionItemSchema) }),
  // An earlier conversation already analysed this ride — the client opens it instead.
  z.object({ type: z.literal('redirect'), conversation_id: z.string() }),
  // Sent right after a new conversation row exists, before any model call, so
  // a turn aborted before `done` still leaves the client holding the id.
  z.object({ type: z.literal('conversation'), conversation_id: z.string() }),
  z.object({ type: z.literal('done'), conversation_id: z.string(), message_id: z.string() }),
  z.object({ type: z.literal('error'), message: z.string() }),
]);
export type CoachSseEvent = z.infer<typeof CoachSseEventSchema>;
