// Types for the AI Coach chat feature.
// Mirrors the payload shapes produced by POST /api/coach/chat and
// GET /api/coach/conversations(/:id) in server/server.js + server/aiCoach.js.

export type ChatRole = 'user' | 'assistant' | 'system';

export type ToolCallStatus = 'pending' | 'running' | 'done' | 'error';

export interface ToolCall {
  name: string;
  args: Record<string, any>;
  result?: any;
  status: ToolCallStatus;
}

// The three "hidden until asked" detail angles get_activity_analysis can
// return alongside the headline numbers — see aiCoach.js. Kept as a closed
// union (not a free string) so the suggestion chip that asks for one and the
// single card that reveals it stay in sync at the type level.
export type AnalysisDetailType = 'vs_baseline' | 'similar_ride' | 'skills_delta';

// A suggestion chip. `detail`, when present, means this chip deterministically
// asks for one specific analysis angle (server-generated with a fixed label
// per language — see server.js) rather than being a free-form LLM suggestion.
export interface SuggestionItem {
  label: string;
  detail?: AnalysisDetailType;
}

// A message as rendered in the UI. `id` is client-generated for the
// optimistic user message and the in-progress assistant message; once the
// stream finishes, the assistant message keeps its client id (the server's
// message_id is stored separately, see useCoachChat).
export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  toolCalls?: ToolCall[];
  suggestions?: SuggestionItem[];
  createdAt: string;
  /** true while this assistant message is still streaming in */
  streaming?: boolean;
  /** true if the request failed and this message represents an error state */
  error?: boolean;
  /**
   * Set client-side (never sent to/from the server) when this assistant
   * reply was triggered by tapping a specific detail suggestion chip — tells
   * ChatMessageBubble to reveal ONLY that one card, instead of every
   * available angle at once. See useCoachChat.sendMessage.
   */
  revealDetail?: AnalysisDetailType;
}

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
