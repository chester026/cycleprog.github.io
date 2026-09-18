// SSE streaming client for the AI Coach chat endpoint.
//
// T-4.4 (audit S-31): the server now loads this conversation's history from
// its own DB instead of trusting a client-supplied `messages`/`history`
// array (see server/routes/coach.js's extractLegacyMessage + the route's
// header comment). The request body this client sends is just the new
// turn's text plus its ids/context: `{message, conversation_id,
// hidden_context?, health_context?}`. There is no more "build the history
// array" step here — that's entirely gone, not just unused.
//
// react-native-sse's EventSource supports POST + custom headers/body (unlike
// the browser EventSource), which is why the spec picked it over a plain
// fetch-based reader.

import EventSource from 'react-native-sse';
import {API_BASE_URL, TokenStorage, refreshSession} from './api';
import {SuggestionItem} from '../types/coach';
import {logger} from '../lib/logger';

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

export interface StreamChatOptions {
  /**
   * e.g. a Strava activity id from "Discuss with Coach" — attached to this
   * one outgoing turn only. The server folds it into what the MODEL sees
   * (never into the persisted row or the user's own displayed bubble) — see
   * server/routes/coach.js's `hidden_context` handling.
   */
  hiddenContext?: string;
  /**
   * Rides along transiently on this one request only — never persisted
   * client-side beyond this call, and the server must never log or store it
   * (see server/aiCoach.js + server/routes/coach.js).
   */
  healthContext?: Record<string, any>;
}

type SSEEventPayload =
  | {type: 'token'; content: string}
  | {type: 'tool_call'; name: string; args: Record<string, any>}
  | {type: 'tool_result'; name: string; result: any}
  | {type: 'suggestions'; items: SuggestionItem[]}
  | {type: 'done'; conversation_id: string; message_id: string}
  | {type: 'redirect'; conversation_id: string}
  | {type: 'error'; message: string};

function buildRequestBody(message: string, conversationId: string | null, opts?: StreamChatOptions): string {
  return JSON.stringify({
    message,
    conversation_id: conversationId,
    ...(opts?.hiddenContext ? {hidden_context: opts.hiddenContext} : {}),
    ...(opts?.healthContext ? {health_context: opts.healthContext} : {}),
  });
}

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
  message: string,
  conversationId: string | null,
  callbacks: StreamCallbacks,
  opts?: StreamChatOptions,
): Promise<() => void> {
  let cancelled = false;
  let settled = false;
  // A refresh+retry happens at most once per stream — a second 401 (e.g. the
  // refreshed token itself already invalid) goes straight to onError instead
  // of looping.
  let refreshAttempted = false;
  let es: EventSource<'message'> | null = null;

  const body = buildRequestBody(message, conversationId, opts);

  const cleanup = () => {
    if (settled) return;
    settled = true;
    try {
      es?.removeAllEventListeners();
      es?.close();
    } catch {
      // no-op — connection may already be closed
    }
  };

  // Closes the current connection WITHOUT marking the stream settled, so a
  // fresh `open()` with a rotated token can still fire callbacks — used only
  // by the 401-refresh retry below, never by the caller-facing cancel path.
  const closeForRetry = () => {
    try {
      es?.removeAllEventListeners();
      es?.close();
    } catch {
      // no-op
    }
    es = null;
  };

  function open(token: string | null) {
    logger.debug('[coachSSE] connecting to', `${API_BASE_URL}/api/coach/chat`, 'hasToken:', !!token);

    const source = new EventSource<'message'>(`${API_BASE_URL}/api/coach/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(token ? {Authorization: `Bearer ${token}`} : {}),
      },
      body,
      pollingInterval: 0, // this is a one-shot stream, not a long-lived reconnecting feed
      // Without this, react-native-sse tries to auto-detect the line ending
      // from the first bytes it sees and can fail (logs "Unable to identify
      // the line ending character") when the response starts with just
      // flushed headers and no body yet — which then tears down the
      // connection almost immediately. Our server always writes `\n\n` after
      // each `data: ...` line (see sseSend in server/server.js), so pin it.
      lineEndingCharacter: '\n',
      debug: __DEV__,
    });
    es = source;

    source.addEventListener('open', () => {
      logger.debug('[coachSSE] connection opened');
    });

    source.addEventListener('close', () => {
      logger.debug('[coachSSE] connection closed by server');
    });

    source.addEventListener('message', (event: any) => {
      if (cancelled) return;
      const raw = event?.data;
      if (!raw) return;

      let data: SSEEventPayload;
      try {
        data = JSON.parse(raw);
      } catch {
        logger.debug('[coachSSE] failed to parse event data:', raw);
        return;
      }

      logger.debug('[coachSSE] event:', data.type);

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

    source.addEventListener('error', async (event: any) => {
      logger.debug('[coachSSE] error event:', JSON.stringify(event));
      if (cancelled) return;

      // react-native-sse's ErrorEvent carries the HTTP status as
      // `xhrStatus` (see node_modules/react-native-sse's EventSource.js —
      // `dispatch('error', {..., xhrStatus: xhr.status})`). A 401 here means
      // the access token expired mid-session; refresh it once via the same
      // rotate-and-retry `apiFetch`/`apiClient` use for a plain request (see
      // src/utils/api.ts's `refreshSession`) and reopen the stream — the
      // caller never sees this as an error unless the refresh itself fails.
      if (!refreshAttempted && event?.xhrStatus === 401) {
        refreshAttempted = true;
        closeForRetry();
        const newToken = await refreshSession();
        if (!cancelled && newToken) {
          open(newToken);
          return;
        }
      }

      const errorMessage = event?.message || 'Connection error — check your internet connection.';
      callbacks.onError(errorMessage);
      cleanup();
    });
  }

  let token: string | null = null;
  try {
    token = await TokenStorage.getToken();
  } catch {
    // fall through with no token — the server will reject with 401 and
    // we'll surface that through onError below (or refresh, if a refresh
    // token happens to still be available even without an access token)
  }

  open(token);

  return () => {
    cancelled = true;
    cleanup();
  };
}

// Re-exported for convenience so callers building the outgoing payload don't
// need a separate import just for the suggestion/tool-call shapes.
export type {SuggestionItem, ToolCall} from '../types/coach';
