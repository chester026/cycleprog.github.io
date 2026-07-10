// SSE streaming client for the AI Coach chat endpoint.
//
// Note on the earlier spec draft: it called `await TokenStorage.getToken()`
// inside a non-async `streamChat` function, which doesn't compile. Here
// `streamChat` is itself async and resolves to the cancel function once the
// auth token has been read and the connection opened — callers just need to
// `await` it before storing the cancel handle (see useCoachChat).
//
// react-native-sse's EventSource supports POST + custom headers/body (unlike
// the browser EventSource), which is why the spec picked it over a plain
// fetch-based reader.

import EventSource from 'react-native-sse';
import {API_BASE_URL, TokenStorage} from './api';
import {ChatRole, OutgoingChatMessage, SuggestionItem, ToolCall} from '../types/coach';

export interface StreamCallbacks {
  onToken: (text: string) => void;
  onToolCall: (name: string, args: Record<string, any>) => void;
  onToolResult: (name: string, result: any) => void;
  onSuggestions: (items: SuggestionItem[]) => void;
  onDone: (conversationId: string, messageId: string) => void;
  onError: (message: string) => void;
  /**
   * Sent instead of `done` when the server discovers, right after its first
   * get_activity_analysis call, that this brand-new conversation is about a
   * ride already discussed elsewhere — the server has already deleted the
   * just-created conversation, so the client's job is to drop its local
   * optimistic messages and load the existing one instead.
   */
  onRedirect: (conversationId: string) => void;
}

type SSEEventPayload =
  | {type: 'token'; content: string}
  | {type: 'tool_call'; name: string; args: Record<string, any>}
  | {type: 'tool_result'; name: string; result: any}
  | {type: 'suggestions'; items: SuggestionItem[]}
  | {type: 'done'; conversation_id: string; message_id: string}
  | {type: 'redirect'; conversation_id: string}
  | {type: 'error'; message: string};

/**
 * Opens a streaming POST connection to /api/coach/chat and forwards parsed
 * SSE events to the given callbacks.
 *
 * Returns a promise that resolves to a cancel function once the connection
 * has been initiated. If the caller cancels before the promise resolves,
 * `streamChat` still finishes opening the connection but closes it
 * immediately — no event listener fires after cancellation.
 */
export async function streamChat(
  messages: OutgoingChatMessage[],
  conversationId: string | null,
  callbacks: StreamCallbacks,
  healthContext?: Record<string, any>,
): Promise<() => void> {
  let token: string | null = null;
  try {
    token = await TokenStorage.getToken();
  } catch (e) {
    // fall through with no token — the server will reject with 401 and
    // we'll surface that through onError below
  }

  let cancelled = false;
  let settled = false;

  console.log('[coachSSE] connecting to', `${API_BASE_URL}/api/coach/chat`, 'hasToken:', !!token);

  const es = new EventSource<'message'>(`${API_BASE_URL}/api/coach/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...(token ? {Authorization: `Bearer ${token}`} : {}),
    },
    // health_context rides along transiently on this one request only — it
    // is never persisted client-side beyond this call and the server must
    // never log or store it (see server/aiCoach.js + server/server.js).
    body: JSON.stringify({
      messages,
      conversation_id: conversationId,
      ...(healthContext ? {health_context: healthContext} : {}),
    }),
    pollingInterval: 0, // this is a one-shot stream, not a long-lived reconnecting feed
    // Without this, react-native-sse tries to auto-detect the line ending
    // from the first bytes it sees and can fail (logs "Unable to identify
    // the line ending character") when the response starts with just
    // flushed headers and no body yet — which then tears down the
    // connection almost immediately. Our server always writes `\n\n` after
    // each `data: ...` line (see sseSend in server/server.js), so pin it.
    lineEndingCharacter: '\n',
    debug: true,
  });

  es.addEventListener('open', () => {
    console.log('[coachSSE] connection opened');
  });

  es.addEventListener('close', () => {
    console.log('[coachSSE] connection closed by server');
  });

  const cleanup = () => {
    if (settled) return;
    settled = true;
    try {
      es.removeAllEventListeners();
      es.close();
    } catch (e) {
      // no-op — connection may already be closed
    }
  };

  es.addEventListener('message', (event: any) => {
    if (cancelled) return;
    const raw = event?.data;
    if (!raw) return;

    let data: SSEEventPayload;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      console.log('[coachSSE] failed to parse event data:', raw);
      return;
    }

    console.log('[coachSSE] event:', data.type);

    switch (data.type) {
      case 'token':
        callbacks.onToken(data.content);
        break;
      case 'tool_call':
        callbacks.onToolCall(data.name, data.args || {});
        break;
      case 'tool_result':
        callbacks.onToolResult(data.name, data.result);
        break;
      case 'suggestions':
        callbacks.onSuggestions(data.items || []);
        break;
      case 'done':
        callbacks.onDone(data.conversation_id, data.message_id);
        cleanup();
        break;
      case 'redirect':
        callbacks.onRedirect(data.conversation_id);
        cleanup();
        break;
      case 'error':
        callbacks.onError(data.message || 'Coach is temporarily unavailable.');
        cleanup();
        break;
    }
  });

  es.addEventListener('error', (event: any) => {
    console.log('[coachSSE] error event:', JSON.stringify(event));
    if (cancelled) return;
    const message = event?.message || 'Connection error — check your internet connection.';
    callbacks.onError(message);
    cleanup();
  });

  return () => {
    cancelled = true;
    cleanup();
  };
}

// Re-exported for convenience so callers building the outgoing payload don't
// need a separate import just for the role union.
export type {ChatRole, OutgoingChatMessage, SuggestionItem, ToolCall};
