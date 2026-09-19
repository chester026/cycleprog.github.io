// AI Coach endpoints (T-7.1) — server/routes/coach.js. The SSE chat stream
// (POST /api/coach/chat) is deliberately left OUT of the contract: it's not
// a single JSON response, it streams `{type: 'token'|'tool_call'|
// 'tool_result'|'suggestions'|'redirect'|'done'|'error', ...}` events over
// text/event-stream — see `uncontracted('SSE stream')` on the route.
import { z } from 'zod';
import { defineEndpoint } from './define.js';
import { CoachConversationSchema, CoachConversationDetailSchema } from '../../types/coach.js';

export const coach = {
  // GET /api/coach/conversations
  conversations: defineEndpoint({
    method: 'GET',
    path: '/api/coach/conversations',
    response: z.array(CoachConversationSchema),
    auth: true,
  }),

  // GET /api/coach/conversations/by-activity/:activityId — `null` (not 404)
  // when the rider hasn't discussed that activity yet.
  conversationByActivity: defineEndpoint({
    method: 'GET',
    path: '/api/coach/conversations/by-activity/:activityId',
    params: z.object({ activityId: z.coerce.number() }),
    response: CoachConversationSchema.nullable(),
    auth: true,
  }),

  // GET /api/coach/conversations/:id — conversation id is a UUID string,
  // never coerced to a number.
  conversationDetail: defineEndpoint({
    method: 'GET',
    path: '/api/coach/conversations/:id',
    params: z.object({ id: z.string() }),
    query: z.object({ limit: z.coerce.number().int().positive().optional() }).optional(),
    response: CoachConversationDetailSchema,
    auth: true,
  }),

  // DELETE /api/coach/conversations/:id — cascades to messages.
  deleteConversation: defineEndpoint({
    method: 'DELETE',
    path: '/api/coach/conversations/:id',
    params: z.object({ id: z.string() }),
    response: z.object({ success: z.boolean() }),
    auth: true,
  }),
};
