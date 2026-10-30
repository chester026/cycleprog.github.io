// Types for the AI Coach chat feature.
// Mirrors the payload shapes produced by POST /api/coach/chat and
// GET /api/coach/conversations(/:id) in server/server.js + server/aiCoach.js.

// The UI/domain types (ToolCall, SuggestionItem, the rendered message, …)
// are shared with the web client; this module re-exports them under the
// names the app's screens use.
export type {
  AnalysisDetailType,
  ChatRole,
  SuggestionAction,
  SuggestionItem,
  ToolCall,
  ToolCallStatus,
} from '@bikelab/shared/types';
export type {CoachChatMessage as ChatMessage} from '@bikelab/shared/types';
import type {ChatRole, SuggestionItem, ToolCall} from '@bikelab/shared/types';

export interface ConversationSummary {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

// Raw message shape as stored/returned by the backend (snake_case, JSON columns)
export interface CoachApiMessage {
  id: string;
  conversation_id: string;
  role: ChatRole;
  content: string;
  tool_calls?: ToolCall[] | null;
  suggestions?: SuggestionItem[] | null;
  token_usage?: Record<string, any> | null;
  created_at: string;
}

export interface CoachConversationDetail {
  conversation: ConversationSummary;
  messages: CoachApiMessage[];
}

// Minimal shape sent to the backend on each turn. `hiddenContext` is an
// optional extra note (e.g. "activity_id: 123") that the app appends only to
// the newest user turn — the server folds it into what the model sees, but
// never persists or echoes it back, so it never shows up as a leaked-looking
// system detail in the chat bubble the user actually reads. See
// useCoachChat.sendMessage and server's /api/coach/chat.
export interface OutgoingChatMessage {
  role: ChatRole;
  content: string;
  hiddenContext?: string;
}
